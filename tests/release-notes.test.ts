import { describe, expect, it } from 'vitest'
import { catalogNotesByExtension, scaffoldReleaseNotes } from '../scripts/lib/release-notes.ts'

const extensions = [
  { key: 'n1rwj-cwt', name: 'CWT' },
  { key: 'n1rwj-rbn', name: 'RBN · My signal' },
]
const sections =
  '## n1rwj-cwt\n\nNo extension-specific changes for CWT.\n\n## n1rwj-rbn\n\n- Improved receiver map.'

describe('release notes audiences', () => {
  it('keeps the overview and repository notes on GitHub and isolates extension changes', () => {
    const body = `# v0.3.5 — Better maps\n\nA summary of the whole release.\n\n${sections}\n\n## Repository notes\n\nBuild validation and installation details.`
    expect(catalogNotesByExtension(body, extensions)).toEqual(
      new Map([
        ['n1rwj-cwt', '## CWT\n\nNo extension-specific changes for CWT.'],
        ['n1rwj-rbn', '## RBN · My signal\n\n- Improved receiver map.'],
      ]),
    )
  })

  it('includes root dependency changes for every extension, even one without specific changes', () => {
    const notes = catalogNotesByExtension(
      `## Shared changes\n\n- Updated the root SDK dependency.\n\n${sections}`,
      extensions,
    )
    for (const { key } of extensions) {
      expect(notes.get(key)).toContain('## Shared changes\n\n- Updated the root SDK dependency.')
    }
    expect(notes.get('n1rwj-cwt')).not.toContain('Improved receiver map')
  })

  it('supports shared-library notes repeated only in their affected extensions', () => {
    const notes = catalogNotesByExtension(
      '## n1rwj-cwt\n\nFixed contest-history parsing.\n\n## n1rwj-rbn\n\nNo extension-specific changes for RBN.',
      extensions,
    )
    expect(notes.get('n1rwj-cwt')).toContain('Fixed contest-history parsing.')
    expect(notes.get('n1rwj-rbn')).not.toContain('contest-history')
  })

  it('preserves subsections, lists, links and fenced examples without treating code as sections', () => {
    const body = [
      sections,
      '### Details',
      '[Help](https://example.com)',
      '````md\n## n1rwj-cwt\n```\n````',
      '~~~md\n## Shared changes\n~~~',
      '## Repository notes',
      'Private to GitHub.',
    ].join('\n\n')
    const notes = catalogNotesByExtension(body.replace(/\n/g, '\r\n'), extensions)
    expect(notes.get('n1rwj-rbn')).toContain('### Details\n\n[Help](https://example.com)')
    expect(notes.get('n1rwj-rbn')).toContain('````md\n## n1rwj-cwt\n```\n````')
    expect(notes.get('n1rwj-rbn')).not.toContain('Private to GitHub')
    expect(notes.get('n1rwj-cwt')).not.toContain('Details')
  })

  it('ignores author comments and empty shared sections', () => {
    const notes = catalogNotesByExtension(
      `<!-- ## n1rwj-typo -->\n## Shared changes\n<!-- No universal changes. -->\n${sections}`,
      extensions,
    )
    expect(notes.get('n1rwj-cwt')).toBe('## CWT\n\nNo extension-specific changes for CWT.')
  })

  it.each([
    ['Unstructured historical notes', 'Missing or empty'],
    ['## n1rwj-cwt\n\nNo changes.', 'n1rwj-rbn'],
    ['## n1rwj-cwt\n<!-- author guidance -->\n## n1rwj-rbn\n\nMap fix.', 'Missing or empty'],
    [`${sections}\n\n## n1rwj-cwt\n\nMore changes.`, 'Duplicate'],
    [`${sections}\n\n## n1rwj-rnb\n\nTypo.`, 'Unknown'],
    [`${sections}\n\n[TODO: Finish notes]`, 'unfinished'],
    [`${sections}\n\n# Repository notes\n\nWrong heading.`, 'level-one'],
    [`${sections}\n\nRepository notes\n---------------\n\nWrong heading.`, 'Setext'],
    [[sections, '```md\nUnclosed example.'].join('\n\n'), 'unclosed code fence'],
  ])('rejects incomplete or ambiguous notes: %s', (body, error) => {
    expect(() => catalogNotesByExtension(body, extensions)).toThrow(error)
  })

  it('accepts closing hashes on section headings', () => {
    const body = sections.replace('## n1rwj-cwt', '## n1rwj-cwt ##')
    expect(catalogNotesByExtension(body, extensions).get('n1rwj-cwt')).toContain(
      'No extension-specific changes for CWT.',
    )
  })
})

describe('release notes scaffold', () => {
  it('discovers every audience without claiming an unreviewed extension has no changes', () => {
    const scaffold = scaffoldReleaseNotes('v0.3.5', extensions)
    expect(scaffold).toContain('# v0.3.5 —')
    expect(scaffold).toContain('## Shared changes')
    for (const { key } of extensions) expect(scaffold).toContain(`## ${key}`)
    expect(() => catalogNotesByExtension(scaffold, extensions)).toThrow('unfinished')
    const completed = scaffold.replace(/\[TODO:[^\]]*\]/g, 'Reviewed release changes.')
    expect(catalogNotesByExtension(completed, extensions).size).toBe(2)
  })

  it.each(['0.3.5', '../v0.3.5', 'vgarbage', 'v01.0.0'])('rejects invalid tag %s', (tag) => {
    expect(() => scaffoldReleaseNotes(tag, extensions)).toThrow('valid SemVer')
  })
})
