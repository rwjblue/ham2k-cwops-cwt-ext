import { describe, expect, it } from 'vitest'
import { receptionMapTheme } from '../../src/map/theme.ts'
import { renderReceptionScene } from '../../src/ui/scene.ts'
import type { UiModel } from '../../src/ui/types.ts'

function contrast(a: string, b: string): number {
  const luminance = (hex: string): number => {
    const linear = (channel: string): number => {
      const value = Number.parseInt(channel, 16) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }
    return (
      0.2126 * linear(hex.slice(1, 3)) +
      0.7152 * linear(hex.slice(3, 5)) +
      0.0722 * linear(hex.slice(5, 7))
    )
  }
  const values = [luminance(a), luminance(b)].sort((a, b) => a - b)
  return (values[1] + 0.05) / (values[0] + 0.05)
}

describe('reception map palette', () => {
  for (const brightness of ['light', 'dark'] as const) {
    it(`keeps ${brightness} text and receiver colors readable over water and land`, () => {
      const theme = receptionMapTheme(brightness)
      for (const value of Object.values(theme)) expect(value).toMatch(/^#[\da-f]{6}$/i)
      expect(theme.surface).not.toBe(theme.land)
      for (const ink of [theme.text, theme.muted, theme.accent]) {
        for (const fill of [theme.surface, theme.land]) {
          expect(contrast(ink, fill)).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`retains geographic colors with a monochrome ${brightness} host palette`, () => {
      const monochrome = brightness === 'light' ? '#ffffff' : '#000000'
      const theme = receptionMapTheme(brightness)
      const model: UiModel = {
        title: 'My signal',
        watchCall: 'N1RWJ',
        rows: [],
        defaultView: 'map',
        theme: {
          brightness,
          surface: monochrome,
          surfaceContainer: monochrome,
          accent: monochrome,
        },
        mapOptions: {
          width: 640,
          height: 400,
          origin: { latitude: 28, longitude: -81 },
          stations: [],
          theme,
        },
      }
      const { scene } = renderReceptionScene(model)
      const mapSvg = scene.layers
        .filter((layer) => layer.id.startsWith('reception-map-'))
        .map((layer) => layer.svg)
        .join('')
      expect(mapSvg).toContain(`fill="${theme.surface}"`)
      expect(mapSvg).toContain(`fill="${theme.land}"`)
      expect(receptionMapTheme(brightness, monochrome).accent).toBe(theme.accent)
    })
  }

  it('preserves a host accent only when it is readable on both map fills', () => {
    expect(receptionMapTheme('light', '#123456').accent).toBe('#123456')
    expect(receptionMapTheme('dark', '#ABCDEF').accent).toBe('#ABCDEF')
    expect(receptionMapTheme('light', '#d6e8ef').accent).toBe(receptionMapTheme('light').accent)
    expect(receptionMapTheme('dark', '#354741').accent).toBe(receptionMapTheme('dark').accent)
  })

  it('rejects malformed or unsupported host color values', () => {
    for (const value of ['red', '#fff', '#123456ff', 'url(https://invalid.test)', '#zzzzzz']) {
      expect(receptionMapTheme('light', value)).toEqual(receptionMapTheme('light'))
    }
  })
})
