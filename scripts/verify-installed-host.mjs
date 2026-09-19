import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { satisfies } from 'semver'

const assetsPath =
  'Contents/Frameworks/App.framework/Versions/A/Resources/flutter_assets/assets/extensions'

function appInfo(app) {
  const plist = join(app, 'Contents/Info.plist')
  const field = (name) =>
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${name}`, plist], {
      encoding: 'utf8',
    }).trim()
  return { app, version: field('CFBundleShortVersionString'), build: field('CFBundleVersion') }
}

async function selectApp(explicitPath) {
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

const installation = await selectApp(process.argv[2])
const { app } = installation
const assets = join(app, assetsPath)
const kernelSource = await readFile(join(assets, 'kernel.js'), 'utf8')
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'))
const messages = []
const context = createContext({
  sendMessage(_channel, raw) {
    const message = JSON.parse(raw)
    messages.push(message)
    if (message.type === 'hostCall') {
      queueMicrotask(() => {
        const value = message.method === 'getSettings' ? { locale: 'en' } : null
        context.__polo.hostResponse(message.callId, true, JSON.stringify(value))
      })
    }
  },
})
runInContext(kernelSource, context, { filename: 'installed-kernel.js', timeout: 5000 })
const kernel = context.__polo
const problems = []
for (const [name, range] of Object.entries(manifest.sharedDependencies)) {
  const actual = kernel.sharedVersions[name]
  if (!actual || !satisfies(actual, range)) {
    problems.push(`${name}: requires ${range}; installed ${actual ?? 'missing'}`)
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
kernel.activateAll()
const probe = await kernel.invokeLocal('lookup', 'probe', {}, false, probeKey)
const contextCapabilities = probe[0]?.value ?? []
if (!contextCapabilities.includes('getHistoryForCall')) {
  problems.push('HookContext.getHistoryForCall is unavailable; cross-operation history cannot run')
}

let registeredHooks = []
if (problems.length === 0) {
  const bundle = await readFile(new URL('../build/index.js', import.meta.url), 'utf8')
  kernel.beginBundle(manifest.key)
  try {
    runInContext(bundle, context, { filename: 'built-extension.js', timeout: 5000 })
  } finally {
    kernel.endBundle()
  }
  kernel.activateAll()
  registeredHooks = kernel.registeredHooks().filter((hook) => hook.includes(`(${manifest.key})`))
  for (const message of messages) {
    if (message.type === 'log' && message.message.includes('ERROR')) problems.push(message.message)
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
