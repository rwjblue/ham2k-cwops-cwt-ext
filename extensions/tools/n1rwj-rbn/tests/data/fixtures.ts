export const NOW = 1_780_000_000_000

export const metadata = {
  spot_fields: ['de', 'freq', 'dx', 'db', 'wpm', 'time', 'diff', 'band', 'type', 'mode', 'epoch'],
  call_info_fields: ['pfx', 'country', 'cont', 'ccode', 'ituz', 'cqz', 'lat', 'long'],
  bands: [
    { code: 22, meters: 20 },
    { code: 12, meters: 40 },
  ],
  modes: {
    '1': { mode: 'cw' },
    '10': { mode: 'psk31' },
    '11': { mode: 'rtty' },
    '34': { mode: 'ft8' },
    '45': { mode: 'ft4' },
  },
}

export function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    now: NOW / 1000,
    ver_h: 'example',
    spots: { '123': ['W3LPL', '14060.1', 'N1RWJ', 19, 20, '', 0, 22, 1, 1, NOW / 1000 - 60] },
    call_info: { W3LPL: ['K', 'United States', 'NA', 'us', '8', '5', '39.2', '-76.8'] },
    ...overrides,
  }
}
