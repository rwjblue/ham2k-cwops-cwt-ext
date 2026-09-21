import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import type { PanelEnvironment, SceneBinding, SvgScene, SvgSceneLayer } from '@ham2k/extension-sdk'
import { satisfies } from 'semver'
import { selectExtensions } from './lib/extensions.ts'
import { installedHostAssetsPath, selectInstalledHost } from './verify-installed-host.ts'

interface PreviewOptions {
  call: string
  grid: string
  minutes: number
  output: string
  app?: string
  width?: number
  height?: number
  theme?: 'light' | 'dark'
  view?: 'both' | 'map' | 'list'
  band?: string
  sort?: 'age' | 'call' | 'snr' | 'distance' | 'frequency' | 'wpm'
  direction?: 'asc' | 'desc'
}

interface HostMessage {
  type: string
  method?: string
  callId: string
  params?: { url?: string; method?: string; timeout?: number }
  message?: string
}

interface HookResult {
  key: string
  ok: boolean
  value?: unknown
  error?: string
}

interface Kernel {
  sharedVersions: Record<string, string>
  hostResponse(callId: string, success: boolean, value: string): void
  activateAll(): void
  invokeLocal(
    category: string,
    method: string,
    args: unknown,
    online: boolean,
    key: string,
  ): Promise<HookResult[]>
  beginBundle(key: string): void
  endBundle(): void
  registeredHooks(): string[]
}

interface FetchRecord {
  url: string
  durationMs: number
  timeoutMs: number
  status?: number
  bodyBytes?: number
  error?: string
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function resultValue(results: HookResult[], method: string): unknown {
  if (results.length !== 1 || !results[0].ok) {
    throw new Error(`${method} failed: ${results[0]?.error ?? 'no single registered RBN panel'}`)
  }
  return results[0].value
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function bindingValue(binding: SceneBinding | undefined, values: SvgScene['values'], fallback = 0) {
  if (!binding) return fallback
  let source = values[binding.value] * (binding.scale ?? 1)
  if (binding.truncate) source = Math.floor(source + 1e-7)
  if (binding.modulo !== undefined)
    source = ((source % binding.modulo) + binding.modulo) % binding.modulo
  const fraction = Math.max(
    0,
    Math.min(1, (source - binding.input[0]) / (binding.input[1] - binding.input[0])),
  )
  if (binding.samples) {
    const position = fraction * (binding.samples.length - 1)
    const index = Math.floor(position)
    const next = Math.min(index + 1, binding.samples.length - 1)
    return (
      binding.samples[index] + (binding.samples[next] - binding.samples[index]) * (position - index)
    )
  }
  return binding.output[0] + (binding.output[1] - binding.output[0]) * fraction
}

function textValue(text: NonNullable<SvgSceneLayer['text']>, values: SvgScene['values']): string {
  if (text.literal !== undefined) return text.literal
  const raw = values[text.value ?? ''] ?? 0
  let value: number | string = text.samples
    ? text.samples[Math.max(0, Math.min(text.samples.length - 1, Math.round(raw)))]
    : raw
  if (typeof value === 'number') {
    value *= text.scale ?? 1
    if (text.truncate) value = Math.floor(value + 1e-7)
    if (text.modulo !== undefined) value = ((value % text.modulo) + text.modulo) % text.modulo
    const decimals = text.decimals ?? 0
    value = value
      .toFixed(decimals)
      .padStart((text.minIntegerDigits ?? 1) + (decimals ? decimals + 1 : 0), '0')
  }
  return `${text.prefix ?? ''}${value}${text.suffix ?? ''}`
}

/** Approximate the scene's initial frame for inspection; Flutter remains the renderer of record. */
export function scenePreviewSvg(scene: SvgScene, environment: PanelEnvironment): string {
  const layers = scene.layers.map((layer, index) => {
    const prefix = `preview-layer-${index}-`
    const clip = `${prefix}bounds`
    const transform = [
      `translate(${layer.x + bindingValue(layer.translateX, scene.values)} ${layer.y + bindingValue(layer.translateY, scene.values)})`,
      `rotate(${bindingValue(layer.rotation, scene.values)} ${(layer.pivot?.[0] ?? 0.5) * layer.width} ${(layer.pivot?.[1] ?? 0.5) * layer.height})`,
    ].join(' ')
    let artwork: string
    if (layer.svg !== undefined) {
      const root = layer.svg.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i)
      if (!root) throw new Error(`Preview cannot read SVG layer ${layer.id}.`)
      const viewBox = root[1].match(/\bviewBox\s*=\s*(["'])(.*?)\1/i)?.[2]
      let body = root[2]
      // Each native layer is its own SVG document. Preserve that ID isolation
      // when assembling one portable preview document from all the layers.
      const ids = [...body.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map((match) => match[2])
      for (const id of ids) {
        for (const quote of ['"', "'"]) {
          body = body.split(`id=${quote}${id}${quote}`).join(`id=${quote}${prefix}${id}${quote}`)
          body = body
            .split(`href=${quote}#${id}${quote}`)
            .join(`href=${quote}#${prefix}${id}${quote}`)
          body = body
            .split(`url(${quote}#${id}${quote})`)
            .join(`url(${quote}#${prefix}${id}${quote})`)
        }
        body = body.split(`url(#${id})`).join(`url(#${prefix}${id})`)
      }
      artwork = `<svg width="${layer.width}" height="${layer.height}" viewBox="${xml(viewBox ?? `0 0 ${layer.width} ${layer.height}`)}" preserveAspectRatio="none">${body}</svg>`
    } else if (layer.text) {
      const text = layer.text
      const role = Object.values(environment.typography).find(
        (candidate) => candidate.fontSize === text.size,
      )
      const size = role?.scaledFontSize ?? text.size ?? 20
      const anchor = text.align === 'center' ? 'middle' : text.align === 'end' ? 'end' : 'start'
      const x = anchor === 'middle' ? layer.width / 2 : anchor === 'end' ? layer.width : 0
      artwork = `<text x="${x}" y="${layer.height / 2}" dominant-baseline="central" text-anchor="${anchor}" font-family="${xml(text.fontFamily ?? 'sans-serif')}" font-size="${size}" font-weight="${text.fontWeight ?? 400}" letter-spacing="${text.letterSpacing ?? 0}" fill="${xml(text.color ?? environment.colors.onSurface)}">${xml(textValue(text, scene.values))}</text>`
    } else throw new Error(`Preview layer ${layer.id} has no artwork or text.`)
    const opacity = Math.max(0, Math.min(1, bindingValue(layer.opacity, scene.values, 1)))
    return `<g transform="${transform}" opacity="${opacity}"><title>${xml(layer.id)}</title><defs><clipPath id="${clip}"><rect width="${layer.width}" height="${layer.height}"/></clipPath></defs><g clip-path="url(#${clip})">${artwork}</g></g>`
  })
  const caption = [
    'STATIC SVG PREVIEW · Native UI not tested here',
    'Text is approximate; controls and animation are inactive.',
  ]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.width}" height="${scene.height + 42}" viewBox="0 0 ${scene.width} ${scene.height + 42}" role="img" aria-label="RBN static scene preview, not native app acceptance"><title>RBN static scene preview</title><desc>The actual scene JSON is provided separately. This approximates the initial scene frame with browser SVG text, without Flutter text measurement, interaction, menus, or animation.</desc><rect width="100%" height="100%" fill="${environment.colors.surface}"/><svg width="${scene.width}" height="${scene.height}" viewBox="0 0 ${scene.width} ${scene.height}">${layers.join('')}</svg><path d="M0 ${scene.height}H${scene.width}" stroke="${environment.colors.outlineVariant}"/>${caption.map((line, index) => `<text x="8" y="${scene.height + 16 + index * 16}" font-family="sans-serif" font-size="10" fill="${environment.colors.onSurfaceVariant}">${xml(line)}</text>`).join('')}</svg>\n`
}

function previewEnvironment(options: PreviewOptions): PanelEnvironment {
  const width = options.width ?? 1280
  const height = options.height ?? 800
  if (![width, height].every((value) => Number.isInteger(value) && value >= 160 && value <= 4096))
    throw new Error(
      '--width and --height must be integer logical dimensions from 160 through 4096.',
    )
  const dark = options.theme === 'dark'
  const typography = (fontSize: number, fontWeight = 400, fontFamily = 'sans-serif') => ({
    fontFamily,
    fontFamilyFallback: [],
    fontSize,
    scaledFontSize: fontSize,
    fontWeight,
    lineHeight: 1.25,
    letterSpacing: 0,
  })
  return {
    version: 1,
    width,
    height,
    safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
    brightness: dark ? 'dark' : 'light',
    colors: {
      surface: dark ? '#132129' : '#ffffff',
      surfaceContainer: dark ? '#1d303a' : '#f3f6f8',
      onSurface: dark ? '#e4eff2' : '#172832',
      onSurfaceVariant: dark ? '#aec2cd' : '#526876',
      accent: dark ? '#7adac5' : '#086f63',
      primary: dark ? '#7adac5' : '#086f63',
      onPrimary: dark ? '#00382f' : '#ffffff',
      secondary: dark ? '#a3c8ed' : '#245fc2',
      outline: dark ? '#78939f' : '#6b8797',
      outlineVariant: dark ? '#3b5664' : '#cbd8df',
      error: dark ? '#ffb4ab' : '#ba1a1a',
      onError: dark ? '#690005' : '#ffffff',
    },
    typography: {
      body: typography(14),
      label: typography(12, 500),
      title: typography(16, 600),
      display: typography(34),
      mono: typography(14, 400, 'monospace'),
    },
    locale: 'en',
    textDirection: 'ltr',
    devicePixelRatio: 1,
    reducedMotion: true,
    highContrast: false,
  }
}

export async function previewRbn(root: string, options: PreviewOptions): Promise<void> {
  const call = options.call.trim().toUpperCase()
  const grid = options.grid.trim().toUpperCase()
  if (
    !/^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(call) ||
    !/[0-9]/.test(call) ||
    !/[A-Z]/.test(call) ||
    call.length > 24
  ) {
    throw new Error('--call must be a public station callsign to observe.')
  }
  if (!/^[A-R]{2}\d{2}(?:[A-X]{2}(?:\d{2})?)?$/.test(grid)) {
    throw new Error('--grid must be the observed station’s 4, 6, or 8 character Maidenhead grid.')
  }
  if (![15, 30, 60].includes(options.minutes)) throw new Error('--minutes must be 15, 30, or 60.')
  if (!/\.svg$/i.test(options.output)) throw new Error('--output must end with .svg.')
  const environment = previewEnvironment(options)

  const installation = await selectInstalledHost(options.app)
  const [extension] = await selectExtensions(root, 'n1rwj-rbn')
  const [kernelSource, bundle] = await Promise.all([
    readFile(join(installation.app, installedHostAssetsPath, 'kernel.js'), 'utf8'),
    readFile(join(extension.dir, 'build/index.js'), 'utf8'),
  ])
  const fetches: FetchRecord[] = []
  const logs: string[] = []
  let kernel: Kernel

  async function handleHostCall(message: HostMessage): Promise<unknown> {
    if (message.method === 'getSettings') return { locale: 'en', themeMode: environment.brightness }
    if (message.method !== 'fetch') throw new Error(`Preview does not implement ${message.method}.`)
    const url = new URL(message.params?.url ?? '')
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'vailrerbn.com' ||
      url.pathname !== '/api/v1/spots' ||
      (message.params?.method ?? 'GET') !== 'GET'
    ) {
      throw new Error('Preview only permits read-only HTTPS Vail ReRBN spot requests.')
    }
    const timeoutMs = Math.min(3000, Math.max(1, message.params?.timeout ?? 3000))
    const started = performance.now()
    const record: FetchRecord = { url: url.href, durationMs: 0, timeoutMs }
    fetches.push(record)
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      })
      const body = await response.text()
      record.status = response.status
      record.bodyBytes = Buffer.byteLength(body)
      return { status: response.status, body, headers: Object.fromEntries(response.headers) }
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error)
      throw error
    } finally {
      record.durationMs = Math.round(performance.now() - started)
    }
  }

  const context = createContext({
    sendMessage(_channel: string, raw: string) {
      const message = JSON.parse(raw) as HostMessage
      if (message.type === 'log' && message.message) logs.push(message.message)
      if (message.type !== 'hostCall') return
      queueMicrotask(() => {
        void handleHostCall(message).then(
          (value) => kernel.hostResponse(message.callId, true, JSON.stringify(value)),
          (error) =>
            kernel.hostResponse(
              message.callId,
              false,
              JSON.stringify(error instanceof Error ? error.message : String(error)),
            ),
        )
      })
    },
  })
  runInContext(kernelSource, context, { filename: 'installed-kernel.js', timeout: 5000 })
  kernel = context.__polo as Kernel
  for (const [name, range] of Object.entries(extension.manifest.sharedDependencies ?? {})) {
    if (!kernel.sharedVersions[name] || !satisfies(kernel.sharedVersions[name], range)) {
      throw new Error(
        `Installed kernel ${name} ${kernel.sharedVersions[name] ?? 'missing'} does not satisfy ${range}.`,
      )
    }
  }
  kernel.beginBundle(extension.manifest.key)
  try {
    runInContext(bundle, context, { filename: 'n1rwj-rbn-built-es2020.js', timeout: 5000 })
  } finally {
    kernel.endBundle()
  }
  kernel.activateAll()
  const panels = resultValue(
    await kernel.invokeLocal('panel', 'getPanels', {}, true, extension.manifest.key),
    'getPanels',
  )
  const panelKey = Array.isArray(panels) ? object(panels[0])?.key : undefined
  if (typeof panelKey !== 'string') throw new Error('RBN did not return a panel descriptor.')

  const operation = { stationCall: `${call}/TEST`, title: `RBN TEST — observing ${call}`, grid }
  const config = {
    watchCall: call,
    windowMinutes: options.minutes,
    grid,
    view: options.view ?? 'both',
    band: options.band ?? 'all',
    sort: options.sort ?? 'age',
    direction: options.direction ?? 'desc',
  }
  const renderStarted = performance.now()
  let deadline: ReturnType<typeof setTimeout> | undefined
  let rendered: unknown
  try {
    rendered = resultValue(
      await Promise.race([
        kernel.invokeLocal(
          'panel',
          'render',
          {
            panelKey,
            instanceId: `ext:${extension.manifest.key}:${panelKey}#preview`,
            environment,
            clock: { nowMillis: Date.now(), realNowMillis: Date.now() },
            operation,
            qsoCount: 0,
            config,
            reason: 'preview',
          },
          true,
          extension.manifest.key,
        ),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error('RBN render exceeded the host five-second deadline.')),
            5000,
          )
        }),
      ]),
      'render',
    )
  } finally {
    if (deadline) clearTimeout(deadline)
  }
  const renderDurationMs = Math.round(performance.now() - renderStarted)
  const panel = object(rendered)
  if (panel?.kind !== 'svgScene' || !object(panel.scene))
    throw new Error(
      `RBN render did not return svgScene content: ${String(panel?.content ?? panel?.kind)}.`,
    )
  const scene = panel.scene as SvgScene
  const svg = scenePreviewSvg(scene, environment)
  if (renderDurationMs > 5000)
    throw new Error(`RBN render exceeded the host deadline (${renderDurationMs} ms).`)
  const errors = logs.filter((log) => log.includes('ERROR'))
  if (errors.length) throw new Error(`Kernel reported errors: ${errors.join('; ')}`)

  const output = resolve(root, options.output)
  const outputStem = output.replace(/\.svg$/i, '')
  const metadataPath = `${outputStem}.json`
  const scenePath = `${outputStem}.scene.json`
  const sceneJson = `${JSON.stringify(scene, null, 2)}\n`
  const metadata = {
    scope:
      'Installed Ham2K JavaScript kernel and built ES2020 extension under Node VM with a synthetic scene environment. Static SVG approximates native text/layers; native rendering, controls, fonts, and animation are not exercised. Kernel compatibility does not establish native scene support in the installed app.',
    ...installation,
    operation,
    config,
    environment,
    windowMinutes: options.minutes,
    generatedAt: new Date().toISOString(),
    kernelSha256: createHash('sha256').update(kernelSource).digest('hex'),
    bundleSha256: createHash('sha256').update(bundle).digest('hex'),
    bundleBytes: Buffer.byteLength(bundle),
    svgBytes: Buffer.byteLength(svg),
    sceneBytes: Buffer.byteLength(sceneJson),
    layerCount: scene.layers.length,
    controlCount: scene.controls?.length ?? 0,
    text: scene.layers.flatMap((layer) =>
      layer.text ? [{ id: layer.id, text: textValue(layer.text, scene.values) }] : [],
    ),
    renderDurationMs,
    hostDeadlineMs: 5000,
    renderWithinBudget: true,
    registeredHooks: kernel.registeredHooks(),
    fetches,
    output,
    scenePath,
    metadataPath,
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, svg)
  await writeFile(scenePath, sceneJson)
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  console.log(JSON.stringify(metadata, null, 2))
}
