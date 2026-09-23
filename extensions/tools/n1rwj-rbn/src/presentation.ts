import type { UiModel } from '../../../../packages/reception/src/ui/types.ts'
export const rbnPresentation: NonNullable<UiModel['presentation']> = {
  source: 'RBN via Vail',
  stationLabel: 'Receiver',
  refreshLabel: 'Refresh receiver reports (30-second minimum between requests)',
  cwSpeed: true,
  details: [
    'Reception paths connect your station to receivers that reported it. They are not a coverage boundary. Signal-to-noise readings are measured at each receiver; receiver sites have different antennas and noise levels.',
    'Source: Reverse Beacon Network.',
  ],
}
