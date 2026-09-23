#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Build an isolated API-2 PSK development package against a candidate SDK/tools"
//[MISE] depends=["build", "local-tasks-npm-install"]
//[USAGE] flag "--sdk <directory>" help="SDK package directory with built dist; defaults to installed SDK"
//[USAGE] flag "--tools <directory>" help="Tools package directory; defaults to installed tools"

import { execFileSync } from 'node:child_process'
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BuildOptions } from 'esbuild'
import { build } from 'esbuild'
import manifest from '../../../extensions/tools/n1rwj-psk-reporter/manifest.json' with {
  type: 'json',
}
import { verifyPskBundle } from '../../../scripts/lib/psk-smoke.ts'

const root = process.cwd()
const sdk = resolve(process.env.usage_sdk || 'node_modules/@ham2k/extension-sdk')
const tools = resolve(process.env.usage_tools || 'node_modules/@ham2k/extension-tools')
const scratch = await mkdtemp(join(tmpdir(), 'psk-contract-'))
const output = join(root, 'dist/psk-development')
try {
  const contract = join(scratch, 'contract.ts')
  await writeFile(
    contract,
    `import { host } from ${JSON.stringify(join(sdk, 'dist/index.js'))};\nimport type { OpenSocket } from ${JSON.stringify(join(root, 'extensions/tools/n1rwj-psk-reporter/src/transport/socket.ts'))};\nconst open: OpenSocket = host.webSocket;\nvoid open;\n`,
  )
  const config = join(scratch, 'tsconfig.json')
  await writeFile(
    config,
    JSON.stringify({
      extends: join(root, 'tsconfig.json'),
      compilerOptions: { paths: { '@ham2k/extension-sdk': [join(sdk, 'dist/index.d.ts')] } },
      files: [contract],
    }),
  )
  // Check both the complete extension source and its public socket contract.
  execFileSync(join(root, 'node_modules/.bin/tsc'), ['--project', config], { stdio: 'inherit' })
  const preset = (await import(pathToFileURL(join(tools, 'h2kext-build.mjs')).href)) as {
    buildOptionsFor: (options: Record<string, unknown>) => BuildOptions
  }
  const format = (await import(pathToFileURL(join(tools, 'h2kext.mjs')).href)) as {
    pack: (dir: string, options: { outPath: string }) => Promise<unknown>
  }
  const staged = join(scratch, 'build')
  await mkdir(staged)
  await build(
    preset.buildOptionsFor({
      dir: root,
      entry: join(root, 'extensions/tools/n1rwj-psk-reporter/src/index.ts'),
      outfile: join(staged, 'index.js'),
      manifest: manifest,
      alias: { '@ham2k/extension-sdk': join(sdk, 'dist/index.js') },
    }),
  )
  await writeFile(join(staged, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  await cp(join(root, 'extensions/tools/n1rwj-psk-reporter/build/assets'), join(staged, 'assets'), {
    recursive: true,
  })
  const filename = `${manifest.key}-${manifest.version}-development.h2kext`
  // The selected official packer must accept API 2 and its socket grant.
  await format.pack(staged, { outPath: join(scratch, filename) })
  await verifyPskBundle(join(staged, 'index.js'), manifest)
  await mkdir(output, { recursive: true })
  await copyFile(join(scratch, filename), join(output, filename))
  await cp(staged, join(output, 'build'), { recursive: true })
  await writeFile(
    join(output, 'toolchain.json'),
    `${JSON.stringify(
      {
        developmentOnly: true,
        builtAt: new Date().toISOString(),
        sdk,
        tools,
        sdkPackage: JSON.parse(await readFile(join(sdk, 'package.json'), 'utf8')),
        toolsPackage: JSON.parse(await readFile(join(tools, 'package.json'), 'utf8')),
      },
      null,
      2,
    )}\n`,
  )
  console.log(
    `Development package: ${join(output, filename)}\nCandidate build only; publication and native runtime validation remain separate.`,
  )
} finally {
  await rm(scratch, { recursive: true, force: true })
}
