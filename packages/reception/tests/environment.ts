import type { PanelEnvironment } from '@ham2k/extension-sdk'

export function environment(width = 1366, height = 900, scale = 1): PanelEnvironment {
  const role = (fontSize: number) => ({
    fontFamily: 'Host font',
    fontFamilyFallback: [],
    fontSize,
    scaledFontSize: fontSize * scale,
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: 0,
  })
  return {
    version: 1,
    width,
    height,
    safeInsets: { left: 0, top: 0, right: 0, bottom: 0 },
    brightness: 'light',
    colors: {
      surface: '#ffffff',
      surfaceContainer: '#f1f5f7',
      onSurface: '#172832',
      onSurfaceVariant: '#526876',
      accent: '#086f63',
      primary: '#086f63',
      onPrimary: '#ffffff',
      secondary: '#226688',
      outline: '#cbd8df',
      outlineVariant: '#cbd8df',
      error: '#990000',
      onError: '#ffffff',
    },
    typography: {
      label: role(13),
      body: role(15),
      title: role(20),
      display: role(32),
      mono: role(14),
    },
    locale: 'en-US',
    textDirection: 'ltr',
    devicePixelRatio: 1,
    reducedMotion: false,
    highContrast: false,
  }
}
