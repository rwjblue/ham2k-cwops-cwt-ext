import { valid } from 'semver'
import type { Manifest } from './extensions.ts'

type NotesExtension = Pick<Manifest, 'key' | 'name'>

const sharedHeading = 'Shared changes'
const repositoryHeading = 'Repository notes'

export function validateReleaseNotesTag(tag: string): void {
  if (!tag.startsWith('v') || valid(tag.slice(1)) !== tag.slice(1)) {
    throw new Error('Release notes tag must be v<version>, using a valid SemVer.')
  }
}

export function scaffoldReleaseNotes(tag: string, extensions: NotesExtension[]): string {
  validateReleaseNotesTag(tag)
  return [
    `# ${tag} — [TODO: Release title]`,
    '[TODO: Repository-wide summary. This introduction appears only on GitHub.]',
    `## ${sharedHeading}`,
    '[TODO: Changes affecting every extension, including root dependency updates. Remove this section if none.]',
    ...extensions.flatMap(({ key, name }) => [
      `## ${key}`,
      `[TODO: Describe changes for ${name}, or write "No extension-specific changes for ${name}." after reviewing the release diff.]`,
    ]),
    `## ${repositoryHeading}`,
    '[TODO: Optional tooling, validation, and installation details for GitHub only. Remove this section if unused.]',
    '',
  ].join('\n\n')
}

/** One authored GitHub body; only explicit shared and matching sections reach the catalog. */
export function catalogNotesByExtension(
  body: string,
  extensions: NotesExtension[],
  options: { changedOnly?: boolean } = {},
): Map<string, string> {
  // Comments are author guidance, not catalog content or evidence of a completed section.
  const markdown = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r\n?/g, '\n')
  if (/\[TODO\b/i.test(markdown)) {
    throw new Error('Release notes contain unfinished [TODO] placeholders.')
  }
  const allowed = new Set([sharedHeading, repositoryHeading, ...extensions.map(({ key }) => key)])
  const sections = new Map<string, string[]>()
  let current: string[] | undefined
  let fence: { character: string; length: number } | undefined
  for (const line of markdown.split('\n')) {
    // Examples containing headings inside fenced code must not change the audience.
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (delimiter) {
      const marker = delimiter[1]
      if (!fence) {
        fence = { character: marker[0], length: marker.length }
      } else if (
        marker[0] === fence.character &&
        marker.length >= fence.length &&
        !delimiter[2].trim()
      ) {
        fence = undefined
      }
      current?.push(line)
      continue
    }
    if (!fence) {
      const heading = /^ {0,3}##[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(line)?.[1]
      if (heading) {
        if (!allowed.has(heading)) {
          throw new Error(
            `Unknown release notes section "${heading}". Use an extension key, "${sharedHeading}", or "${repositoryHeading}".`,
          )
        }
        if (sections.has(heading)) throw new Error(`Duplicate release notes section: ${heading}`)
        current = []
        sections.set(heading, current)
        continue
      }
      if (/^ {0,3}#[ \t]+/.test(line) && current) {
        throw new Error(
          'Only the release title may use a level-one heading; use ### inside sections.',
        )
      }
      if (/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) && current?.[current.length - 1]?.trim()) {
        throw new Error(
          'Use ## headings for release notes sections and ### for subsections, not Setext headings.',
        )
      }
    }
    current?.push(line)
  }
  if (fence) throw new Error('Release notes contain an unclosed code fence.')

  const shared = sections.get(sharedHeading)?.join('\n').trim()
  const result = new Map<string, string>()
  for (const { key, name } of extensions) {
    const specific = sections.get(key)?.join('\n').trim()
    if (!specific) {
      throw new Error(
        `Missing or empty release notes section "## ${key}". Describe its changes or explicitly state no extension-specific changes.`,
      )
    }
    // The authored release document is the reviewed publication plan. A version
    // bump or repository-only change does not warrant another catalog review.
    if (
      options.changedOnly &&
      !shared &&
      /^No extension-specific changes for [^\n.]+\.$/.test(specific)
    ) {
      continue
    }
    result.set(
      key,
      [`## ${name || key}`, specific, ...(shared ? [`## ${sharedHeading}`, shared] : [])].join(
        '\n\n',
      ),
    )
  }
  return result
}
