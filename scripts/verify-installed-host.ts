import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { createContext, runInContext } from 'node:vm'
import { satisfies } from 'semver'
import type { Manifest } from './lib/extensions.ts'
import { selectExtensions } from './lib/extensions.ts'

const assetsPath =
  'Contents/Frameworks/App.framework/Versions/A/Resources/flutter_assets/assets/extensions'

function appInfo(app: string) {
  const plist = join(app, 'Contents/Info.plist')
  const field = (name: string) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${name}`, plist], {
      encoding: 'utf8',
    }).trim()
  return { app, version: field('CFBundleShortVersionString'), build: field('CFBundleVersion') }
}

async function selectApp(explicitPath?: string) {
  if (explicitPath) return { ...appInfo(explicitPath), selection: 'explicit path' }
  // App updates may retain the old Mac Logger directory while renaming the
  // executable to Power Logger. Check the running bundle path, not its name.
  const running = execFileSync('ps', ['-axo', 'comm='], { encoding: 'utf8' }).split('\n')
  const candidates = []
  for (const name of await readdir('/Applications')) {
    if (!/^Ham2K (?:Mac|Power) Logger(?: \([^)]+\))?\.app$/.test(name)) continue
    const app = join('/Applications', name)
    try {
      await access(join(app, assetsPath, 'kernel.js'))
      candidates.push({
        ...appInfo(app),
        running: running.some((command) => command.startsWith(`${app}/Contents/MacOS/`)),
      })
    } catch {
      // Ignore incomplete app copies; the explicit-path form reports errors.
    }
  }
  candidates.sort(
    (a, b) => Number(b.running) - Number(a.running) || Number(b.build) - Number(a.build),
  )
  const selected = candidates[0]
  if (!selected) {
    throw new Error('No Ham2K Logger app found in /Applications. Pass the installed .app path.')
  }
  return {
    app: selected.app,
    version: selected.version,
    build: selected.build,
    selection: selected.running ? 'running app' : 'latest installed build',
  }
}

export { assetsPath as installedHostAssetsPath, selectApp as selectInstalledHost }

interface HostMessage {
  type: string
  method?: string
  callId: string
  message?: string
}

interface Kernel {
  sharedVersions: Record<string, string>
  registerSocket?: unknown
  socketEvent?: unknown
  hostResponse(callId: string, success: boolean, value: string): void
  defineExtension(extension: {
    key: string
    version: string
    onActivation(context: {
      registerHook(
        category: string,
        definition: {
          key: string
          hook: { probe(args: unknown, context: Record<string, unknown>): Promise<string[]> }
        },
      ): void
    }): void
  }): void
  activateAll(): void | Promise<void>
  invokeLocal(
    category: string,
    method: string,
    args: unknown,
    all: boolean,
    key: string,
  ): Promise<Array<{ value: string[] }>>
  beginBundle(key: string): void
  endBundle(): void
  registeredHooks(): string[]
}

export async function verifyInstalledHost(
  root: string,
  key?: string,
  appPath?: string,
): Promise<void> {
  const installation = await selectApp(appPath)
  const { app } = installation
  const assets = join(app, assetsPath)
  const kernelSource = await readFile(join(assets, 'kernel.js'), 'utf8')
  const extensions = await selectExtensions(root, key)
  const manifests: Manifest[] = extensions.map(({ manifest }) => manifest)
  const messages: HostMessage[] = []
  const context = createContext({
    performance,
    sendMessage(_channel: string, raw: string) {
      const message = JSON.parse(raw) as HostMessage
      messages.push(message)
      if (message.type === 'hostCall') {
        queueMicrotask(() => {
          const value = message.method === 'getSettings' ? { locale: 'en' } : null
          const bridge = context.__polo as Kernel
          bridge.hostResponse(message.callId, true, JSON.stringify(value))
        })
      }
    },
  })
  runInContext(kernelSource, context, { filename: 'installed-kernel.js', timeout: 5000 })
  const kernel = context.__polo as Kernel
  const problems: string[] = []
  for (const manifest of manifests) {
    if (
      Array.isArray(manifest.webSockets) &&
      manifest.webSockets.length &&
      (typeof kernel.registerSocket !== 'function' || typeof kernel.socketEvent !== 'function')
    ) {
      problems.push(
        `${manifest.key}: installed kernel lacks the API-2 WebSocket bridge; use build 171 or newer`,
      )
    }
    for (const [name, range] of Object.entries(manifest.sharedDependencies ?? {})) {
      const actual = kernel.sharedVersions[name]
      if (!actual || !satisfies(actual, range)) {
        problems.push(
          `${manifest.key} ${name}: requires ${range}; installed ${actual ?? 'missing'}`,
        )
      }
    }
  }

  const probeKey = 'n1rwj-host-probe'
  kernel.defineExtension({
    key: probeKey,
    version: '0.0.0',
    onActivation({ registerHook }) {
      registerHook('lookup', {
        key: probeKey,
        hook: { probe: async (_args, ctx) => Object.keys(ctx) },
      })
    },
  })
  await kernel.activateAll()
  const probe = await kernel.invokeLocal('lookup', 'probe', {}, false, probeKey)
  const contextCapabilities = probe[0]?.value ?? []
  if (!contextCapabilities.includes('getHistoryForCall')) {
    problems.push(
      'HookContext.getHistoryForCall is unavailable; cross-operation history cannot run',
    )
  }

  const registeredHooks: string[] = []
  if (problems.length === 0) {
    for (const { dir, manifest } of extensions) {
      const bundle = await readFile(join(dir, 'build/index.js'), 'utf8')
      kernel.beginBundle(manifest.key)
      try {
        runInContext(bundle, context, { filename: 'built-extension.js', timeout: 5000 })
      } finally {
        kernel.endBundle()
      }
      await kernel.activateAll()
      registeredHooks.push(
        ...kernel.registeredHooks().filter((hook) => hook.includes(`(${manifest.key})`)),
      )
    }
    for (const message of messages) {
      if (message.type === 'log' && message.message?.includes('ERROR'))
        problems.push(message.message)
    }
  }

  console.log(
    JSON.stringify(
      {
        ...installation,
        kernelSha256: createHash('sha256').update(kernelSource).digest('hex'),
        sharedVersions: kernel.sharedVersions,
        contextCapabilities,
        registeredHooks,
        compatible: problems.length === 0,
        problems,
        scope: 'Installed JavaScript kernel under Node VM; this does not exercise native app UI.',
      },
      null,
      2,
    ),
  )
  if (problems.length) process.exitCode = 1
}
