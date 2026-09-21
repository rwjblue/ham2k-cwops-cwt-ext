import { describe, expect, it } from 'vitest'
import { operationOrigin, readConfig, watchedCall } from '../src/config.ts'

describe('operation identity and map origin', () => {
  it('follows the first station without stripping portable or test suffixes', () => {
    expect(watchedCall({ stationCall: ' k8btu/test, N1RWJ' }, '')).toBe('K8BTU/TEST')
    expect(watchedCall({ stationCall: 'K8BTU/TEST' }, 'K8BTU')).toBe('K8BTU')
    expect(watchedCall({ stationCall: 'F5HTR/P' }, '')).toBe('F5HTR/P')
  })

  it('uses exact operation coordinates ahead of the grid center', () => {
    expect(operationOrigin({ lat: 42, lon: -72, grid: 'FN31' }, '')).toEqual({
      latitude: 42,
      longitude: -72,
      label: 'FN31',
    })
  })

  it('uses the explicit grid override and never invents a missing position', () => {
    expect(operationOrigin({ lat: 42, lon: -72 }, 'FN31')).toEqual({
      latitude: 41.5,
      longitude: -73,
      label: 'FN31',
    })
    expect(operationOrigin({ stationCall: 'N1RWJ' }, '')).toBeUndefined()
    expect(operationOrigin({ lat: 42, lon: -72 }, 'ZZ99')).toBeUndefined()
    expect(operationOrigin({ lat: null, lon: 0 }, '')).toBeUndefined()
    expect(operationOrigin({ lat: 0, lon: 0 }, '')).toMatchObject({ latitude: 0, longitude: 0 })
  })

  it('normalizes saved configuration and bounds unsupported values', () => {
    expect(
      readConfig({ watchCall: '  k8btu ', grid: 'em99dq', windowMinutes: 60, view: 'list' }),
    ).toMatchObject({
      watchCall: 'K8BTU',
      gridOverride: 'EM99DQ',
      windowMinutes: 60,
      view: 'list',
    })
    expect(
      readConfig({ windowMinutes: 100000, view: 'unknown', sort: 'random', band: '<x>' }),
    ).toMatchObject({
      windowMinutes: 15,
      view: 'both',
      sort: 'age',
      band: 'all',
    })
  })
})
