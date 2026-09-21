export const NOW = 1_780_000_000_000

export function spotPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 123,
    timestamp: new Date(NOW - 60_000).toISOString(),
    spotter: 'W3LPL',
    spotter_grid: 'FM19',
    callsign: 'N1RWJ',
    grid: 'FN31pr',
    frequency: 14060.1,
    mode: 'CW',
    snr: 19,
    wpm: 20,
    ...overrides,
  }
}

export function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    spots: [spotPayload()],
    total: 1,
    offset: 0,
    limit: 500,
    ...overrides,
  }
}
