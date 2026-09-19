import type { FetchOptions, FetchResponse } from '@ham2k/extension-sdk'

export const DEFAULT_SOURCE = 'https://n1mm.hamdocs.com/mmfiles/categories/callhistory/'
export type Fetcher = (url: string, options?: FetchOptions) => Promise<FetchResponse>

/** Native data-file downloads use HTTP; the SDK exposes no local file reader. */
export function sourceValidationError(value: string): string | null {
  const source = value.trim()
  if (!source || /^https:\/\/n1mm(?:wp)?\.hamdocs\.com\/\S*$/i.test(source)) return null
  return 'Use an HTTPS N1MM URL or leave blank for automatic discovery. Local file paths are not supported.'
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
    const name = match[1]
    const value = match[3]
    if (name && value !== undefined) result[name.toLowerCase()] = decode(value)
  }
  return result
}

function n1mmUrl(value: string, base: string): string {
  const origin = /^https:\/\/[^/]+/.exec(base)?.[0]
  const url = value.startsWith('/') ? `${origin}${value}` : value
  if (sourceValidationError(url)) {
    throw new Error(
      'The N1MM page linked to an unsupported download host. Select an HTTPS CWOPS entry or text URL on an N1MM host.',
    )
  }
  return url
}

export function latestEntry(html: string, base: string): string {
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(match[0]).href
    if (href && /\/mmfiles\/cwops_[\w-]+-txt\/?(?:[?#].*)?$/i.test(href)) {
      return n1mmUrl(href, base)
    }
  }
  throw new Error(
    'No CWOPS entry found on the N1MM listing. Select its current HTTPS CWOPS entry or text URL on an N1MM host.',
  )
}

export function downloadForm(html: string, base: string): { url: string; body: string } {
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gi)) {
    const attrs = attributes(match[0].split('>')[0] ?? '')
    if (!attrs.action || !/\/mmfile\/get\/file\//.test(attrs.action)) continue
    const fields: Record<string, string> = {}
    for (const input of match[0].matchAll(/<input\b[^>]*>/gi)) {
      const field = attributes(input[0])
      if (field.name && field.value !== undefined) fields[field.name] = field.value
    }
    if (!fields.cmdm_nonce || !fields.id || !fields.shortcodeId) continue
    return {
      url: n1mmUrl(attrs.action, base),
      body: Object.entries(fields)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&'),
    }
  }
  throw new Error(
    'N1MM download form has changed. Previous data retained; this extension needs a download adapter update or a direct HTTPS text URL on an N1MM host.',
  )
}

async function request(fetch: Fetcher, url: string, options?: FetchOptions): Promise<string> {
  const result = await fetch(url, { ...options, timeout: 3500 })
  if (result.status !== 200)
    throw new Error(`N1MM download failed (HTTP ${result.status}). Previous data retained.`)
  return result.body
}

/** Only invoked by a data-file refresh, never by logging/lookup hooks. */
export async function sourceText(
  body: string,
  url: string,
  fetch: Fetcher,
): Promise<{ body: string; url: string }> {
  const error = sourceValidationError(url)
  if (error) throw new Error(error)
  if (!/<(?:!doctype|html|form)\b/i.test(body)) return { body, url }
  let entryUrl = url
  let entry = body
  if (/\/categories\/callhistory\/?(?:[?#].*)?$/.test(url)) {
    entryUrl = latestEntry(body, url)
    entry = await request(fetch, entryUrl)
  }
  const form = downloadForm(entry, entryUrl)
  return {
    body: await request(fetch, form.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.body,
    }),
    url: form.url,
  }
}
