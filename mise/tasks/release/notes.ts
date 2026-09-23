#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Scaffold or validate and preview per-extension release notes"
//[MISE] depends=["install", "local-tasks-npm-install"]
//[USAGE] arg "<tag>" help="Release tag, such as v0.3.5"
//[USAGE] arg "[key]" help="Preview only this extension; all sections are still validated"
//[USAGE] flag "--create" help="Create a notes scaffold without overwriting an existing file"
//[USAGE] flag "--file <path>" help="Notes path; defaults to docs/releases/<tag>.md"

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { discoverExtensions } from '../../../scripts/lib/extensions.ts'
import {
  catalogNotesByExtension,
  scaffoldReleaseNotes,
  validateReleaseNotesTag,
} from '../../../scripts/lib/release-notes.ts'

const tag = process.env.usage_tag ?? ''
validateReleaseNotesTag(tag)
const extensions = await discoverExtensions(process.cwd())
const key = process.env.usage_key
if (key && !extensions.some((extension) => extension.manifest.key === key)) {
  throw new Error(`Unknown extension: ${key}`)
}
const file = resolve(process.env.usage_file || `docs/releases/${tag}.md`)
const manifests = extensions.map(({ manifest }) => manifest)
if (process.env.usage_create === 'true') {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, scaffoldReleaseNotes(tag, manifests), { flag: 'wx' })
  console.log(
    `Created ${file}. Review changes since the previous release, replace every [TODO], then rerun without --create to preview.`,
  )
} else {
  const notes = catalogNotesByExtension(await readFile(file, 'utf8'), manifests)
  for (const [extensionKey, body] of notes) {
    if (!key || key === extensionKey) console.log(`Catalog notes for ${extensionKey}:\n\n${body}\n`)
  }
  console.log(`Validated ${file}. Use this same file as the GitHub release body (--notes-file).`)
}
