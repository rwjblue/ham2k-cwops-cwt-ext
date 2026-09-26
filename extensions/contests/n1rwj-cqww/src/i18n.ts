// Copyright ©️ 2026 Sebastian Delmont <sd@ham2k.com>
// SPDX-License-Identifier: MIT
//
// User-visible strings for the CQ WW extension, following POTA's
// pattern: per-locale flat key → string catalogs in i18n/<locale>.json, with
// hooks building a translator from `ctx.locale` via `tFor`. Contest
// identifiers and exchanges are operator-supplied data, never translated.

import { createCachedTranslator } from '@ham2k/extension-sdk'

import en from './i18n/en.json' with { type: 'json' }
import es from './i18n/es.json' with { type: 'json' }

/// Translator for this extension's strings, cached per locale — `ctx.locale`
/// only changes when the app's locale setting does.
export const tFor = createCachedTranslator({ en: { translation: en }, es: { translation: es } })
