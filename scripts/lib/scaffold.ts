import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { keyProblem, SCAFFOLD_SHARED_DEPENDENCIES } from '@ham2k/extension-tools/format'
import { type PackageJson, readJson, writeJson } from './extensions.ts'

interface ScaffoldOptions {
  key: string
  name?: string
  group?: string
}

export async function scaffoldExtension(root: string, options: ScaffoldOptions): Promise<string> {
  const { key, name = key, group = 'dashboards' } = options
  const problem = keyProblem(key)
  if (problem) throw new Error(problem)
  if (!/^[a-z][a-z0-9-]*$/.test(group))
    throw new Error('Group must use lowercase letters, digits, and hyphens')
  if (!name.trim()) throw new Error('Display name cannot be empty')
  const pkg = await readJson<PackageJson>(join(root, 'package.json'))
  const sharedDependencies: Record<string, string> = {}
  for (const dependency of Object.keys(SCAFFOLD_SHARED_DEPENDENCIES)) {
    const version = pkg.devDependencies?.[dependency]
    if (!version) throw new Error(`Missing local development dependency: ${dependency}`)
    sharedDependencies[dependency] = `^${version.replace(/^[~^]/, '')}`
  }
  const base = join(root, 'extensions')
  await mkdir(base, { recursive: true })
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if ((await readdir(join(base, entry.name))).includes(key)) {
      throw new Error(`Extension ${key} already exists in ${entry.name}; refusing to overwrite`)
    }
  }
  await mkdir(join(base, group), { recursive: true })
  const dir = join(base, group, key)
  // Atomic creation also refuses an existing directory if another task won the race.
  await mkdir(dir)
  await mkdir(join(dir, 'src'))
  await mkdir(join(dir, 'tests'))
  await writeJson(join(dir, 'manifest.json'), {
    key,
    name,
    version: pkg.version,
    description: `${name}, an extension for Ham2K Logger`,
    category: 'dashboard',
    api: 1,
    icon: 'hand-wave-outline',
    hooks: ['panel'],
    sharedDependencies,
  })
  await writeJson(join(dir, 'package.json'), {
    name: key,
    version: pkg.version,
    private: true,
    type: 'module',
    license: 'MPL-2.0',
  })
  await writeFile(
    join(dir, 'src/index.ts'),
    `import { defineExtension } from '@ham2k/extension-sdk'
import manifest from '../manifest.json'
import { Panel } from './panel.ts'

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook('panel', { key: manifest.key, hook: Panel })
  },
})
`,
  )
  await writeFile(
    join(dir, 'src/panel.ts'),
    `import type { PanelHook } from '@ham2k/extension-sdk'

export const Panel = {
  async getPanels() {
    return [{ key: 'welcome', title: ${JSON.stringify(name)}, icon: 'hand-wave-outline' }]
  },
  async render() {
    return { kind: 'markdown', content: ${JSON.stringify(`# ${name}\n\nYour extension is ready.`)} }
  },
} satisfies PanelHook
`,
  )
  await writeFile(
    join(dir, 'tests/panel.test.ts'),
    `import { expect, it } from 'vitest'
import { Panel } from '../src/panel.ts'

it('exposes an addressable panel with renderable content', async () => {
  const panels = await Panel.getPanels()
  expect(panels.length).toBeGreaterThan(0)
  expect(new Set(panels.map(({ key }) => key)).size).toBe(panels.length)
  for (const panel of panels) expect(panel.key).toMatch(/^[a-z0-9-]+$/)
  const result = await Panel.render()
  expect(result.kind).toBe('markdown')
  expect(result.content.trim().length).toBeGreaterThan(0)
})
`,
  )
  await writeFile(
    join(dir, 'README.md'),
    `# ${name}

A starting panel extension. Read \`node_modules/@ham2k/extension-sdk/AGENTS.md\`
and the relevant SDK docs before adding hooks. Change \`category\` and \`hooks\`
in the manifest when adapting this starter to another extension type.

- Build: \`mise run build ${key}\`
- Package: \`mise run pack ${key}\`
- Test: \`mise run test -- ${dir.slice(root.length + 1)}/tests\`
- Check the monorepo: \`mise run check\`

Packages and versions are managed by the root workspace. Shared source belongs
in \`packages/\`; declare host-provided dependencies in \`manifest.json\`.
`,
  )
  return dir
}
