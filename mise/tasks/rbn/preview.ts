#!/usr/bin/env -S node --experimental-strip-types
//[MISE] description="Export a live RBN scene and static SVG preview through the installed Ham2K kernel"
//[MISE] depends=["build", "local-tasks-npm-install"]
//[USAGE] flag "--call <callsign>" required=#true help="Public callsign to observe in a local /TEST operation"
//[USAGE] flag "--grid <locator>" required=#true help="Observed station's Maidenhead grid"
//[USAGE] flag "--minutes <minutes>" default="30" help="Report window: 15, 30, or 60 minutes"
//[USAGE] flag "--output <path>" default="dist/rbn-preview.svg" help="Static SVG preview; raw .scene.json and provenance .json are written beside it"
//[USAGE] flag "--width <pixels>" default="1280" help="Synthetic panel width in logical pixels"
//[USAGE] flag "--height <pixels>" default="800" help="Synthetic panel height in logical pixels"
//[USAGE] flag "--theme <theme>" default="light" {
//[USAGE]   choices "light" "dark"
//[USAGE] }
//[USAGE] flag "--view <view>" default="both" {
//[USAGE]   choices "both" "map" "list"
//[USAGE] }
//[USAGE] flag "--band <band>" default="all" help="Initial band filter"
//[USAGE] flag "--sort <key>" default="age" {
//[USAGE]   choices "age" "call" "snr" "distance" "frequency" "wpm"
//[USAGE] }
//[USAGE] flag "--direction <direction>" default="desc" {
//[USAGE]   choices "asc" "desc"
//[USAGE] }
//[USAGE] flag "--app <path>" help="Explicit installed Ham2K .app path"

import { previewRbn } from '../../../scripts/rbn-preview.ts'

await previewRbn(process.cwd(), {
  call: process.env.usage_call ?? '',
  grid: process.env.usage_grid ?? '',
  minutes: Number(process.env.usage_minutes ?? '30'),
  output: process.env.usage_output ?? 'dist/rbn-preview.svg',
  width: Number(process.env.usage_width ?? '1280'),
  height: Number(process.env.usage_height ?? '800'),
  theme: process.env.usage_theme === 'dark' ? 'dark' : 'light',
  view:
    process.env.usage_view === 'map' || process.env.usage_view === 'list'
      ? process.env.usage_view
      : 'both',
  band: process.env.usage_band ?? 'all',
  sort: (process.env.usage_sort ?? 'age') as
    | 'age'
    | 'call'
    | 'snr'
    | 'distance'
    | 'frequency'
    | 'wpm',
  direction: process.env.usage_direction === 'asc' ? 'asc' : 'desc',
  app: process.env.usage_app,
})
