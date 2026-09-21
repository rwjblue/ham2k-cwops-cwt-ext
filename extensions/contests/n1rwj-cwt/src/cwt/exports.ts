// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Adapted from Ham2K CWT; see docs/PROVENANCE.md.

import type {
  AdifFieldsHook as AdifFieldsHookType,
  ExportHook as ExportHookType,
  ExportOption,
  ExportOptionsRequest,
  ExportRequest,
  ExportResult,
  HookContext,
  JSONValue,
} from '@ham2k/extension-sdk'
import { adifForExport, exportFilename, startMillisOf } from '@ham2k/extension-sdk'
import { qsonToCabrillo } from '@ham2k/lib-qson-cabrillo'
import manifest from '../../manifest.json'
import { firstName, normalizeNumber, ourExchange } from './exchange.ts'
import { tFor } from './i18n.ts'
import { CONTEST_TAG, POWER_CLASSES, refOfType, sessionOn, str, TYPE } from './shared.ts'

export const AdifFieldsHook = {
  async fieldsForOneQSO(
    { qso, operation }: { qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
    _ctx: HookContext,
  ): Promise<{ name: string; value: string }[]> {
    const opRef = refOfType(operation, TYPE)
    if (!opRef) return []

    const fields: { name: string; value: string }[] = [{ name: 'CONTEST_ID', value: CONTEST_TAG }]
    const ours = ourExchange(opRef)
    const qsoRef = refOfType(qso, TYPE)
    const sent = [ours.name, ours.number].filter((x) => x).join(' ')
    const received = [firstName(qsoRef?.name), normalizeNumber(qsoRef?.number)]
      .filter((x) => x)
      .join(' ')
    if (sent) fields.push({ name: 'STX_STRING', value: sent })
    if (received) fields.push({ name: 'SRX_STRING', value: received })
    return fields
  },
} satisfies AdifFieldsHookType

function reportFor(qso: Record<string, JSONValue>, side: 'our' | 'their'): string {
  const sideData = (qso[side] as Record<string, JSONValue>) ?? {}
  return str(sideData.sent) || '599'
}

/// This operation's own name for its files — the session, since two CWTs a day
/// are two separate entries and their files must not collide. Not
/// [CONTEST_TAG], which names the contest and so is the same for all of them.
function filenameActivity(operation: Record<string, JSONValue>): string {
  const session = sessionOn(operation)
  return session ? `CWT-${session.key}` : 'CWT'
}

function filenameFor(
  operation: Record<string, JSONValue>,
  qsos: Record<string, JSONValue>[],
  extension: string,
  compact?: boolean,
): string {
  return exportFilename({
    stationCall: operation.stationCall,
    activity: filenameActivity(operation),
    startAtMillis: startMillisOf(operation, qsos),
    extension,
    compact,
  })
}

export const ExportHook = {
  async suggestExportOptions(
    args: ExportOptionsRequest,
    ctx: HookContext,
  ): Promise<ExportOption[]> {
    if (!refOfType(args.operation, TYPE)) return []
    const t = tFor(ctx)
    const named = (extension: string) =>
      filenameFor(args.operation, args.qsos ?? [], extension, args.compactFilenames)
    return [
      {
        exportType: 'contest-adif',
        format: 'adif',
        label: t('adifExport', { contest: manifest.shortName }),
        filename: named('adi'),
        selectedByDefault: true,
        refType: TYPE,
      },
      {
        exportType: 'cabrillo',
        format: 'cabrillo',
        label: t('cabrilloExport', { contest: manifest.shortName }),
        filename: named('log'),
        selectedByDefault: true,
        refType: TYPE,
      },
    ]
  },

  async generateExport(args: ExportRequest, _ctx: HookContext): Promise<ExportResult> {
    // Only the two exportTypes offered above. Belt and braces alongside the
    // keyed delegation in `adifForExport`: a hook answering for an exportType it never
    // offered makes the ADIF delegation recurse into itself.
    if (args.exportType !== 'cabrillo' && args.exportType !== 'contest-adif') {
      return { filename: '', mimeType: '', content: '' }
    }

    const operation = args.operation
    const opRef = refOfType(operation, TYPE)
    const ourCall = str(operation.stationCall)
    const ours = ourExchange(opRef)

    if (args.exportType === 'cabrillo') {
      const power = POWER_CLASSES.find((entry) => entry.value === str(opRef?.power))
      const content = qsonToCabrillo(args.qsos, {
        headers: [
          ['CONTEST', CONTEST_TAG],
          ['CALLSIGN', ourCall],
          ['CATEGORY-POWER', power?.cabrillo ?? ''],
          ['NAME', ours.name],
          ['OPERATORS', str((operation.local as Record<string, JSONValue>)?.operatorCall)],
          ['GRID-LOCATOR', str(operation.grid)],
        ],
        qsoParts: (qso) => {
          const qsoRef = refOfType(qso, TYPE)
          return [
            ourCall || '-',
            reportFor(qso, 'our'),
            [ours.name, ours.number].filter((x) => x).join(' ') || '-',
            str((qso.their as Record<string, JSONValue> | undefined)?.call) || '-',
            reportFor(qso, 'their'),
            [firstName(qsoRef?.name), normalizeNumber(qsoRef?.number)].filter((x) => x).join(' ') ||
              '-',
          ]
        },
      })
      return {
        filename: filenameFor(operation, args.qsos, 'log', args.compactFilenames),
        mimeType: 'text/plain',
        content,
      }
    }

    const content = await adifForExport({
      operation: args.operation,
      qsos: args.qsos,
      segments: args.segments,
      includeLookupData: args.includeLookupData,
      exportSettings: args.exportSettings,
      exportData: args.exportData,
      exportTitle: args.exportTitle,
      includePrivateData: args.includePrivateData,
      // This file is the CONTEST's log, so the core exporter asks this
      // extension's `adifFields` hook and no other's — app-polo's main
      // handler (see `ExportRequest.mainHandler`).
      mainHandler: manifest.key,
    })
    return {
      filename: filenameFor(operation, args.qsos, 'adi', args.compactFilenames),
      mimeType: 'text/plain',
      content,
    }
  },
} satisfies ExportHookType
