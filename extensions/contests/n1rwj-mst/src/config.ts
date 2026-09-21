import type { ContestConfig } from '../../../../packages/mini-contest/src/model.ts'

export const config: ContestConfig = {
  type: 'mst',
  name: 'ICWC Medium Speed Test',
  shortName: 'MST',
  adifId: 'ICWC-MST',
  cabrilloId: 'ICWC-MST',
  aliases: ['MST', 'ICWC', 'ICWC MST', 'MEDIUM SPEED TEST'],
  rulesUrl: 'https://internationalcwcouncil.org/mst-contest/',
  slots: [
    { day: 1, hour: 13 },
    { day: 1, hour: 19 },
    { day: 2, hour: 3 },
  ],
  historyPrefix: 'icwc-mst-',
  historyAliases: ['ICWC-MST', 'MST'],
  exchange: 'serial-name',
  guidance:
    'Send a sequential QSO number and your name. Maximum speed: 25 WPM. Each session is a separate contest. Report total QSOs × unique callsigns on 3830 Scores.',
}
