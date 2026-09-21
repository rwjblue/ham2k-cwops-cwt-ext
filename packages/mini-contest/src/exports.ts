// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MPL-2.0
// Export delegation and filename handling adapted from Ham2K CWT.
import type { AdifFieldsHook, ExportHook, ExportRequest, HookContext } from '@ham2k/extension-sdk'
import { adifForExport, exportFilename, startMillisOf } from '@ham2k/extension-sdk'
import { qsonToCabrillo } from '@ham2k/lib-qson-cabrillo'
import { exchangeText, received, sent, validSerial } from './exchange.ts'
import {
  type ContestConfig,
  type ContestManifest,
  object,
  POWER_CLASSES,
  type Qson,
  refOf,
  text,
} from './model.ts'

export function createExports(config: ContestConfig, manifest: ContestManifest) {
  const adifFields = {
    async fieldsForOneQSO({ qso, operation }, _ctx: HookContext) {
      if (!refOf(operation, config.type)) return []
      const ours = sent(config, operation, qso)
      const theirs = received(config, qso)
      const fields = [{ name: 'CONTEST_ID', value: config.adifId }]
      const sentText = exchangeText(config, ours)
      const receivedText = exchangeText(config, theirs)
      if (sentText) fields.push({ name: 'STX_STRING', value: sentText })
      if (receivedText) fields.push({ name: 'SRX_STRING', value: receivedText })
      if (config.exchange === 'serial-name') {
        if (validSerial(ours.value)) fields.push({ name: 'STX', value: String(Number(ours.value)) })
        if (validSerial(theirs.value))
          fields.push({ name: 'SRX', value: String(Number(theirs.value)) })
      }
      return fields
    },
  } satisfies AdifFieldsHook
  const filename = (operation: Qson, qsos: Qson[], extension: string, compact?: boolean) =>
    exportFilename({
      stationCall: operation.stationCall,
      activity: [config.shortName, text(refOf(operation, config.type)?.ref)]
        .filter(Boolean)
        .join('-'),
      startAtMillis: startMillisOf(operation, qsos),
      extension,
      compact,
    })
  const exports = {
    async suggestExportOptions({ operation, qsos, compactFilenames }, _ctx: HookContext) {
      if (!refOf(operation, config.type)) return []
      return [
        {
          exportType: 'contest-adif',
          format: 'adif',
          label: `${config.shortName} ADIF`,
          filename: filename(operation, qsos ?? [], 'adi', compactFilenames),
          refType: config.type,
          selectedByDefault: true,
        },
        {
          exportType: 'cabrillo',
          format: 'cabrillo',
          label: `${config.shortName} Cabrillo`,
          filename: filename(operation, qsos ?? [], 'log', compactFilenames),
          refType: config.type,
          selectedByDefault: true,
        },
      ]
    },
    async generateExport(args: ExportRequest, _ctx: HookContext) {
      if (
        !refOf(args.operation, config.type) ||
        (args.exportType !== 'cabrillo' && args.exportType !== 'contest-adif')
      )
        return { filename: '', mimeType: '', content: '' }
      const op = refOf(args.operation, config.type)
      if (args.exportType === 'cabrillo') {
        const call = text(args.operation.stationCall)
        const power = POWER_CLASSES.find((entry) => entry.value === text(op?.power))
        const content = qsonToCabrillo(args.qsos, {
          headers: [
            ['CONTEST', config.cabrilloId],
            ['CALLSIGN', call],
            ['CATEGORY-OPERATOR', 'SINGLE-OP'],
            ['CATEGORY-MODE', 'CW'],
            ['CATEGORY-POWER', power?.cabrillo ?? ''],
            ['NAME', text(op?.ourName)],
            ['OPERATORS', text(object(args.operation.local).operatorCall)],
          ],
          qsoParts(qso) {
            const ours = sent(config, args.operation, qso)
            const theirs = received(config, qso)
            // Sponsor-linked N1MM definitions omit RST for both contests.
            // Their Cabrillo columns use name then serial/location, even
            // when the on-air MST exchange sends the serial first.
            return [
              call || '-',
              ours.name || '-',
              ours.value || '-',
              text(object(qso.their).call) || '-',
              theirs.name || '-',
              theirs.value || '-',
            ]
          },
        })
        return {
          filename: filename(args.operation, args.qsos, 'log', args.compactFilenames),
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
        mainHandler: manifest.key,
      })
      return {
        filename: filename(args.operation, args.qsos, 'adi', args.compactFilenames),
        mimeType: 'text/plain',
        content,
      }
    },
  } satisfies ExportHook
  return { adifFields, exports }
}
