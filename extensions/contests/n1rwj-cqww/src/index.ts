// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// CQ World Wide DX Contest. Ported from app-polo's CQWWExtension.
//
// What it exercises that simple-contest doesn't: a validated numeric
// exchange, and per-band
// multipliers accumulated from two different axes (zone and country).

import type {
  ActivityHook as ActivityHookContract,
  AdifFieldsHook as AdifFieldsHookContract,
  ExportHook as ExportHookContract,
  ExportOption,
  ExportOptionsRequest,
  ExportRequest,
  ExportResult,
  FormElement,
  HookContext,
  JSONValue,
  LoggingControlDescriptor,
  Ref,
  RefLink,
} from '@ham2k/extension-sdk'
import {
  adifForExport,
  annotateCallAgainstCountryFile,
  contestScorer,
  defineExtension,
  exportFilename,
  exportTypeDefinition,
  startMillisOf,
} from '@ham2k/extension-sdk'
import { qsonToCabrillo } from '@ham2k/lib-qson-cabrillo'
import manifest from '../manifest.json' with { type: 'json' }
import { tFor } from './i18n.ts'

import {
  isRtty,
  normalizeQth,
  QTH_OPTIONS,
  QTH_PATTERN,
  qthForCall,
  qthIsValid,
  RTTY_BANDS,
  suggestedQth,
} from './rtty.ts'
import { CQWWScorer, normalizeZone, ZONE_PATTERN } from './scorer.ts'

/// The ref type an operation stores. It is data in the operator's log, so it
/// stays what the app's own built-in wrote there whatever this package is
/// called: the manifest key names the package, `TYPE` names the activation.
const TYPE = 'cqww'

function refOfType(
  container: Record<string, JSONValue>,
  type: string,
): Record<string, JSONValue> | undefined {
  return ((container.refs as Record<string, JSONValue>[] | undefined) ?? []).find(
    (r) => r?.type === type,
  )
}

function str(value: JSONValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/// Our own zone: whatever was set at setup, else the country file's answer for
/// our station call — right for the great majority of operators, and better
/// than exporting an empty exchange.
function ourZone(operation: Record<string, JSONValue>): string {
  const ref = refOfType(operation, TYPE)
  if (ref && 'zone' in ref) return normalizeZone(ref.zone)
  return normalizeZone(annotateCallAgainstCountryFile(str(operation.stationCall)).cqZone)
}

function ourQth(operation: Record<string, JSONValue>): string {
  return qthForCall(str(operation.stationCall), refOfType(operation, TYPE)?.qth)
}

function exchangeText(zone: string, qth: string): string {
  return [zone, qth].filter(Boolean).join(' ')
}

function rttySetup(ctx: HookContext): FormElement[] {
  const t = tFor(ctx)
  return [
    { type: 'markdown', text: t('rttyGuidance') },
    {
      type: 'field',
      fieldType: 'select',
      key: 'qth',
      label: t('ourQthLabel'),
      options: QTH_OPTIONS.map(({ code }) => ({ value: code, label: code })),
    },
    {
      type: 'field',
      fieldType: 'select',
      key: 'categoryOperator',
      label: t('operatorLabel'),
      value: 'SINGLE-OP',
      options: [
        { value: 'SINGLE-OP', label: t('singleOperator') },
        { value: 'CHECKLOG', label: t('checklog') },
      ],
    },
    {
      type: 'field',
      fieldType: 'select',
      key: 'categoryBand',
      label: t('bandLabel'),
      value: 'ALL',
      options: ['ALL', ...RTTY_BANDS.map((band) => band.slice(0, -1))].map((value) => ({
        value,
        label: value === 'ALL' ? t('allBands') : `${value}m`,
      })),
    },
    {
      type: 'field',
      fieldType: 'select',
      key: 'categoryPower',
      label: t('powerLabel'),
      value: 'LOW',
      options: ['LOW', 'HIGH', 'QRP'].map((value) => ({ value, label: value })),
    },
    {
      type: 'field',
      fieldType: 'select',
      key: 'categoryAssisted',
      label: t('assistedLabel'),
      value: 'NON-ASSISTED',
      options: ['NON-ASSISTED', 'ASSISTED'].map((value) => ({ value, label: value })),
    },
  ]
}

const ActivityHook: ActivityHookContract = {
  async operationControls(
    _args: { operation: Record<string, JSONValue> },
    ctx: HookContext,
  ): Promise<LoggingControlDescriptor[]> {
    const t = tFor(ctx)
    return [
      {
        key: 'cqww/setup',
        // Named for the contest family — this is what the Activity Types list
        // shows, where "Setup" would read as a settings screen rather than the
        // thing you're adding to the operation.
        label: t('activityLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 10,
        input: {
          kind: 'form',
          refType: TYPE,
          form: {
            title: t('setupLabel'),
            elements: [
              {
                type: 'field',
                fieldType: 'radio',
                key: 'mode',
                label: t('modeLabel'),
                // CQ WW runs these as separate contests on separate weekends.
                options: [
                  { value: 'CW', label: 'CW' },
                  { value: 'SSB', label: 'SSB' },
                  { value: 'RTTY', label: 'RTTY' },
                ],
              },
              {
                type: 'field',
                fieldType: 'text',
                key: 'zone',
                label: t('ourZoneLabel'),
                placeholder: t('ourZonePlaceholder'),
              },
              ...rttySetup(ctx),
            ],
          },
        },
      },
    ]
  },

  /// The one field typed per QSO. The country file resolves a zone for most
  /// callsigns offline, so it's offered as a suggestion the operator can
  /// correct — a station may be operating away from its callsign's zone.
  async loggingControls(
    args: { operation: Record<string, JSONValue>; qso?: Record<string, JSONValue> },
    ctx: HookContext,
  ): Promise<LoggingControlDescriptor[]> {
    // Off-contest, contribute nothing. This is an OPTIMIZATION, not the rule:
    // the core already refuses a primary field to any activity the operation
    // isn't running (halo_widgets' `_textControls`), so forgetting this guard
    // is invisible to the operator. What it saves is the work below — a country
    // -file annotation per keystroke-triggered refresh, in the JS isolate,
    // multiplied by every contest extension the user happens to have enabled.
    if (!refOfType(args.operation, TYPE)) return []

    const their = (args.qso?.their as Record<string, JSONValue>) ?? {}
    const guess = (their.guess as Record<string, JSONValue>) ?? {}
    const call = str(their.call)
    const suggested =
      normalizeZone(guess.cqZone) ||
      (call ? normalizeZone(annotateCallAgainstCountryFile(call).cqZone) : '')

    const controls: LoggingControlDescriptor[] = [
      {
        key: 'cqww/zone',
        label: tFor(ctx)('zoneLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 10,
        input: {
          kind: 'text',
          refType: TYPE,
          field: 'theirZone',
          numeric: true,
          maxLength: 3,
          pattern: ZONE_PATTERN,
          // Only ever the guessed zone for THIS callsign — never a format
          // hint like "1-40", which reads as a real value at a glance.
          placeholder: suggested || undefined,
          // Filled in for the operator, but never over something they typed.
          suggestedValue: suggested || undefined,
        },
      },
    ]
    if (refOfType(args.operation, TYPE)?.mode === 'RTTY') {
      const qth = suggestedQth(call, guess)
      controls.push({
        key: 'cqww/qth',
        label: tFor(ctx)('qthLabel'),
        icon: manifest.icon,
        color: manifest.accentColor,
        order: 20,
        input: {
          kind: 'options',
          refType: TYPE,
          field: 'theirQth',
          options: QTH_OPTIONS,
          pattern: QTH_PATTERN,
          maxLength: 3,
          allowFreeform: true,
          suggestedValue: qth || undefined,
          placeholder: qth || undefined,
        },
      })
    }
    return controls
  },

  /// Records the zone they sent, and mirrors it where the rest of the app can
  /// see it.
  ///
  /// When the operator typed nothing, the country file's zone for that call is
  /// written onto the ref as DATA OF RECORD (docs/design/contests.md §8). The
  /// scorer already falls back to the same value, so without this a QSO could
  /// earn a zone multiplier and then export a dash — the log disagreeing with
  /// its own score. The logging control's `suggestedValue` fills this in
  /// whenever a lookup resolves; this covers the QSOs where none did.
  ///
  /// `their.exchange` is the projection on top: nothing outside this extension
  /// knows to look inside a contest ref, so without it the QSO row's exchange
  /// column and a plain (non-contest) ADIF export both come up empty.
  async processQsoBeforeSave(
    args: { qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
    _ctx: HookContext,
  ): Promise<Record<string, JSONValue> | null> {
    if (!refOfType(args.operation, TYPE)) return null

    const their = (args.qso.their as Record<string, JSONValue>) ?? {}
    const guess = (their.guess as Record<string, JSONValue>) ?? {}
    const call = str(their.call)
    const qsoRef = refOfType(args.qso, TYPE)

    // PRESENCE of the field, not its truthiness. The core writes `theirZone: ''`
    // when the operator empties the field on purpose, and drops the key
    // entirely when it was simply never filled in — so a present key, blank or
    // not, is a decision, and guessing over it would put back what they just
    // removed.
    const exchange =
      qsoRef && 'theirZone' in qsoRef
        ? normalizeZone(qsoRef.theirZone)
        : normalizeZone(guess.cqZone) ||
          (call ? normalizeZone(annotateCallAgainstCountryFile(call).cqZone) : '')

    if (refOfType(args.operation, TYPE)?.mode === 'RTTY') {
      const qth = qthForCall(call, qsoRef?.theirQth)
      return {
        refs: [{ type: TYPE, theirZone: exchange, theirQth: qth }],
        their: { exchange: exchangeText(exchange, qth) },
      }
    }

    // A deliberate blank still projects, so clearing an exchange on an edit
    // clears the QSO row's column too instead of leaving the old value there.
    if (!exchange) {
      return qsoRef && 'theirZone' in qsoRef ? { their: { exchange: '' } } : null
    }

    return {
      // Field-wise into our own ref; the core allows this extension no other.
      refs: [{ type: TYPE, theirZone: exchange }],
      their: { exchange },
    }
  },
}

const RefHandler = {
  async validateRef({ ref }: { ref: Ref }, _ctx: HookContext) {
    return { valid: true, normalized: (ref.ref ?? '').trim() }
  },

  async decorateRef({ ref }: { ref: Ref }, ctx: HookContext): Promise<Ref> {
    const mode = str((ref as Record<string, JSONValue>).mode)
    const label = mode ? `CQ WW ${mode}` : tFor(ctx)('unconfigured')
    const zone = normalizeZone((ref as Record<string, JSONValue>).zone)
    const t = tFor(ctx)
    // `ourZoneSubtitle`, not a hardcoded `Zone ${zone}`: the two halves of
    // this line have to speak the same language, and the key already exists
    // for `suggestOperationTitle`.
    return {
      ...ref,
      program: 'Contest',
      label,
      shortLabel: label,
      name: zone
        ? exchangeText(t('ourZoneSubtitle', { zone }), mode === 'RTTY' ? normalizeQth(ref.qth) : '')
        : t('notConfigured'),
    }
  },

  /// "KI2D for CQWW CW" with "Zone 8" beneath it: the sent exchange is the one
  /// thing an operator re-reads constantly during a contest, so it goes in the
  /// subtitle rather than being buried in setup.
  async suggestOperationTitle(
    { ref, operation }: { ref: Ref; operation: Record<string, JSONValue> },
    ctx: HookContext,
  ) {
    const mode = str((ref as Record<string, JSONValue>).mode)
    const zone = ourZone(operation)
    return {
      for: ['CQWW', mode].filter((x) => x).join(' '),
      subtitle: zone
        ? exchangeText(
            tFor(ctx)('ourZoneSubtitle', { zone }),
            mode === 'RTTY' ? ourQth(operation) : '',
          )
        : undefined,
    }
  },

  /// The contest's published rules — a reference here names an event, not a
  /// place, so what there is to read about it is the rules it is run under.
  async linkForRef({ ref }: { ref: Ref }, _ctx: HookContext): Promise<RefLink | null> {
    return ref.mode === 'RTTY'
      ? { url: 'https://cqwwrtty.com/rules.htm', label: 'CQ WW RTTY' }
      : { url: 'https://www.cqww.com/rules.htm', label: 'CQ WW' }
  },
}

const AdifFieldsHook: AdifFieldsHookContract = {
  async fieldsForOneQSO(
    { qso, operation }: { qso: Record<string, JSONValue>; operation: Record<string, JSONValue> },
    _ctx: HookContext,
  ): Promise<{ name: string; value: string }[]> {
    const opRef = refOfType(operation, TYPE)
    if (!opRef) return []
    const mode = str(opRef.mode)

    const fields: { name: string; value: string }[] = [
      { name: 'CONTEST_ID', value: mode ? `CQ-WW-${mode}` : 'CQ-WW' },
    ]
    const zone = normalizeZone(refOfType(qso, TYPE)?.theirZone)
    const sent =
      mode === 'RTTY' ? exchangeText(ourZone(operation), ourQth(operation)) : ourZone(operation)
    const received =
      mode === 'RTTY'
        ? exchangeText(
            zone,
            qthForCall(
              str((qso.their as Record<string, JSONValue>)?.call),
              refOfType(qso, TYPE)?.theirQth,
            ),
          )
        : zone
    if (mode === 'RTTY' && isRtty(qso.mode)) fields.push({ name: 'MODE', value: 'RTTY' })
    if (sent) fields.push({ name: 'STX_STRING', value: sent })
    if (received) fields.push({ name: 'SRX_STRING', value: received })
    return fields
  },
}

function reportFor(qso: Record<string, JSONValue>, side: 'our' | 'their'): string {
  const sideData = (qso[side] as Record<string, JSONValue>) ?? {}
  const sent = str(sideData.sent)
  if (sent) return sent
  return str(qso.mode) === 'CW' || isRtty(qso.mode) ? '599' : '59'
}

/// The contest's own name for this operation's file — the mode is part of
/// the identity here, since CQ WW CW and CQ WW SSB are separate contests
/// with separate submissions.
function contestTag(operation: Record<string, JSONValue>): string {
  const mode = str(refOfType(operation, TYPE)?.mode)
  return `CQ-WW-${mode || 'DX'}`
}

function filenameFor(
  operation: Record<string, JSONValue>,
  qsos: Record<string, JSONValue>[],
  extension: string,
  compact?: boolean,
): string {
  return exportFilename({
    stationCall: operation.stationCall,
    activity: contestTag(operation),
    startAtMillis: startMillisOf(operation, qsos),
    extension,
    compact,
  })
}

const ExportHook: ExportHookContract = {
  async getExportTypes() {
    return [
      exportTypeDefinition(TYPE, 'adif', manifest.shortName),
      exportTypeDefinition(TYPE, 'cabrillo', manifest.shortName),
    ]
  },
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
        exportType: `${TYPE}-adif`,
        templateData: { activity: contestTag(args.operation) },
        format: 'adif',
        label: t('adifExport', { contest: manifest.shortName }),
        filename: named('adi'),
        selectedByDefault: true,
        refType: TYPE,
      },
      {
        exportType: `${TYPE}-cabrillo`,
        templateData: { activity: contestTag(args.operation) },
        format: 'cabrillo',
        label: t('cabrilloExport', { contest: manifest.shortName }),
        filename: named('log'),
        selectedByDefault: true,
        refType: TYPE,
      },
    ]
  },

  async generateExport(args: ExportRequest, ctx: HookContext): Promise<ExportResult> {
    // Only the two exportTypes `suggestExportOptions` above offers. Belt and
    // braces alongside `adifForExport`'s keyed delegation: a hook that answers for an
    // exportType it never offered makes the ADIF delegation recurse into
    // itself.
    if (args.exportType !== `${TYPE}-cabrillo` && args.exportType !== `${TYPE}-adif`) {
      return { filename: '', mimeType: '', content: '' }
    }

    const operation = args.operation
    const mode = str(refOfType(operation, TYPE)?.mode)
    const ourCall = str(operation.stationCall)
    const sentZone = ourZone(operation)
    const opRef = refOfType(operation, TYPE)
    const rtty = mode === 'RTTY'
    const sentQth = rtty ? ourQth(operation) : ''

    if (args.exportType === `${TYPE}-cabrillo`) {
      if (
        rtty &&
        (!sentZone || !qthIsValid(sentQth, annotateCallAgainstCountryFile(ourCall).entityPrefix))
      ) {
        throw new Error(tFor(ctx)('setupRequired'))
      }
      // The shared writer (1.2) emits all digital modes as DG. Restrict the
      // RTTY file to RTTY contacts, then adapt just its QSO mode column to RY.
      // Keep off-band RTTY contacts in single-band submissions as required.
      const qsos = rtty ? args.qsos.filter((qso) => isRtty(qso.mode)) : args.qsos
      let content = qsonToCabrillo(qsos, {
        headers: [
          ['CONTEST', mode ? `CQ-WW-${mode}` : 'CQ-WW'],
          ['CALLSIGN', ourCall],
          ['OPERATORS', str((operation.local as Record<string, JSONValue>)?.operatorCall)],
          ['GRID-LOCATOR', str(operation.grid)],
          ...(rtty
            ? ([
                ['LOCATION', sentQth],
                ['CATEGORY-MODE', 'RTTY'],
                ['CATEGORY-OPERATOR', str(opRef?.categoryOperator) || 'SINGLE-OP'],
                ['CATEGORY-TRANSMITTER', 'ONE'],
                ['CATEGORY-BAND', str(opRef?.categoryBand) || 'ALL'],
                ['CATEGORY-POWER', str(opRef?.categoryPower) || 'LOW'],
                ['CATEGORY-ASSISTED', str(opRef?.categoryAssisted) || 'NON-ASSISTED'],
              ] as [string, string][])
            : []),
        ],
        qsoParts: (qso) => [
          ourCall || '-',
          reportFor(qso, 'our'),
          sentZone ? (rtty ? sentZone.padStart(2, '0') : sentZone) : '-',
          ...(rtty ? [sentQth] : []),
          str((qso.their as Record<string, JSONValue>)?.call) || '-',
          reportFor(qso, 'their'),
          normalizeZone(refOfType(qso, TYPE)?.theirZone)
            ? rtty
              ? normalizeZone(refOfType(qso, TYPE)?.theirZone).padStart(2, '0')
              : normalizeZone(refOfType(qso, TYPE)?.theirZone)
            : '-',
          ...(rtty
            ? [
                qthForCall(
                  str((qso.their as Record<string, JSONValue>)?.call),
                  refOfType(qso, TYPE)?.theirQth,
                ) || '-',
              ]
            : []),
        ],
      })
      if (rtty) content = content.replace(/^(QSO:\s+\S+\s+)DG(?=\s)/gm, '$1RY')
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
      includePrivateData: args.includePrivateData,
      includeLookupData: args.includeLookupData,
      exportSettings: args.exportSettings,
      exportData: args.exportData,
      exportTitle: args.exportTitle,
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
}

defineExtension({
  ...manifest,
  onActivation({ registerHook }) {
    registerHook('activity', { hook: ActivityHook, key: manifest.key })
    registerHook(`ref:${TYPE}`, { hook: RefHandler, key: manifest.key })
    registerHook('adifFields', { hook: AdifFieldsHook, key: manifest.key })
    registerHook('export', { hook: ExportHook, key: manifest.key })
    registerHook('scoring', {
      hook: contestScorer(CQWWScorer, { scope: { refTypes: [TYPE] } }),
      key: manifest.key,
    })
  },
})
