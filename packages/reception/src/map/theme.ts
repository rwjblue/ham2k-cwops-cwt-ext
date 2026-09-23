import type { MapTheme } from './types.ts'

const themes: Record<'light' | 'dark', MapTheme> = {
  light: {
    surface: '#d6e8ef',
    land: '#f4f1e8',
    text: '#233c45',
    muted: '#49636a',
    border: '#9aadae',
    accent: '#006b62',
  },
  dark: {
    surface: '#102a38',
    land: '#354741',
    text: '#eef4ee',
    muted: '#b0c4bf',
    border: '#658078',
    accent: '#7ce0ce',
  },
}

function luminance(color: string): number {
  const channels = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(color.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(a: string, b: string): number {
  const al = luminance(a)
  const bl = luminance(b)
  return (Math.max(al, bl) + 0.05) / (Math.min(al, bl) + 0.05)
}

/** Geographic fills remain distinct even when the host uses identical surfaces. */
export function receptionMapTheme(brightness: 'light' | 'dark', hostAccent?: string): MapTheme {
  const theme = { ...themes[brightness] }
  // The accent also colors native call labels: require normal-text contrast on
  // both geographic fills, not only the lower contrast required for a marker.
  if (
    hostAccent &&
    /^#[\da-f]{6}$/i.test(hostAccent) &&
    contrast(hostAccent, theme.surface) >= 4.5 &&
    contrast(hostAccent, theme.land) >= 4.5
  ) {
    theme.accent = hostAccent
  }
  return theme
}
