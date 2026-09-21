import type { FetchResponse } from '@ham2k/extension-sdk'
import { describe, expect, it, vi } from 'vitest'
import type { Fetcher } from '../../src/data/source'
import {
  DEFAULT_SOURCE,
  downloadForm,
  latestEntry,
  sourceText,
  sourceValidationError,
} from '../../src/data/source'

const entryUrl = 'https://n1mmwp.hamdocs.com/mmfiles/cwops_4321-new-txt/'
const downloadUrl = 'https://n1mmwp.hamdocs.com/mmfile/get/file/CWOPS_4321-NEW.txt'
const listing = `<!DOCTYPE html><html><body>
  <a href="https://n1mmwp.hamdocs.com/mmfiles/naqp_2026-txt/">NAQP</a>
  <a class="cmdm-link" href="${entryUrl}">CWOPS_4321-NEW.txt</a>
  <a href="https://n1mmwp.hamdocs.com/mmfiles/cwops_3992-aaa-txt/">Older entry</a>
</body></html>`
const raw = '!!Order!!,Call,Name,Exch1,UserText,\n# CWOPS\nK1ABC,Pat,123,Somewhere'

function form(nonce = 'fresh-nonce') {
  return `<!DOCTYPE html><html><body>
    <form action="/search"><input name="q" value="irrelevant"></form>
    <form method="post" class="CMDM-downloadForm" action="${downloadUrl}">
      <input type="hidden" name="cmdm_nonce" value="${nonce}" />
      <input type="hidden" name="id" value="241902" />
      <input type="hidden" name="shortcodeId" value="changing-shortcode" />
      <input type="hidden" name="backurl" value="/mmfiles/cwops_4321-new-txt/?x=1&amp;y=2" />
      <input type="submit" value="Download" />
    </form>
  </body></html>`
}

describe('N1MM source discovery', () => {
  it('discovers the first current CWOPS entry from a real-shaped category rather than pinning a filename', () => {
    expect(latestEntry(listing, DEFAULT_SOURCE)).toBe(entryUrl)
  })

  it('handles relative links, attribute order/case, single quotes, querystrings, and entity decoding', () => {
    expect(
      latestEntry(
        "<A class='entry' HREF='/mmfiles/CWOPS_5555-next-txt/?x=1&amp;y=2'>File</A>",
        DEFAULT_SOURCE,
      ),
    ).toBe('https://n1mm.hamdocs.com/mmfiles/CWOPS_5555-next-txt/?x=1&y=2')
  })

  it('extracts dynamic form fields and URL-encodes them exactly once', () => {
    const download = downloadForm(form('token+with&amp;symbols'), entryUrl)
    expect(download.url).toBe(downloadUrl)
    expect(Object.fromEntries(new URLSearchParams(download.body))).toEqual({
      cmdm_nonce: 'token+with&symbols',
      id: '241902',
      shortcodeId: 'changing-shortcode',
      backurl: '/mmfiles/cwops_4321-new-txt/?x=1&y=2',
    })
    expect(download.body).toContain('token%2Bwith%26symbols')
  })

  it('supports a relative download action on either allowed N1MM hostname', () => {
    const html = form().replace(downloadUrl, '/mmfile/get/file/CWOPS_4321-NEW.txt')
    expect(downloadForm(html, 'https://n1mm.hamdocs.com/mmfiles/example/').url).toBe(
      'https://n1mm.hamdocs.com/mmfile/get/file/CWOPS_4321-NEW.txt',
    )
  })

  it('gets the current entry then POSTs its current nonce with a bounded request timeout', async () => {
    const fetch = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce({ status: 200, body: form('unique-token') })
      .mockResolvedValueOnce({ status: 200, body: raw })
    await expect(sourceText(listing, DEFAULT_SOURCE, fetch)).resolves.toEqual({
      body: raw,
      url: downloadUrl,
    })
    expect(fetch).toHaveBeenNthCalledWith(1, entryUrl, { timeout: 3500 })
    expect(fetch).toHaveBeenNthCalledWith(2, downloadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: downloadForm(form('unique-token'), entryUrl).body,
      timeout: 3500,
    })
  })

  it('accepts a selected entry page directly, with only its POST request', async () => {
    const fetch = vi.fn<Fetcher>().mockResolvedValue({ status: 200, body: raw })
    await sourceText(form(), entryUrl, fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe(downloadUrl)
  })

  it('passes directly downloaded HTTPS text through without additional network access', async () => {
    const fetch = vi.fn<Fetcher>()
    await expect(sourceText(raw, downloadUrl, fetch)).resolves.toEqual({
      body: raw,
      url: downloadUrl,
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(['/tmp/CWOPS.txt', 'file:///tmp/CWOPS.txt', 'http://n1mm.hamdocs.com/file.txt'])(
    'rejects unsupported source %s instead of promising local file access',
    async (url) => {
      const fetch = vi.fn<Fetcher>()
      expect(sourceValidationError(url)).toContain('Local file paths are not supported')
      await expect(sourceText(raw, url, fetch)).rejects.toThrow(
        'Local file paths are not supported',
      )
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it.each(['', '  ', DEFAULT_SOURCE, entryUrl, downloadUrl])(
    'accepts a supported HTTPS source or automatic discovery: %s',
    (url) => expect(sourceValidationError(url)).toBeNull(),
  )

  it('reports changed listing or form markup instead of guessing a stale URL or nonce', async () => {
    const fetch = vi.fn<Fetcher>()
    await expect(sourceText('<html>No current file</html>', DEFAULT_SOURCE, fetch)).rejects.toThrow(
      'No CWOPS entry',
    )
    await expect(
      sourceText(form().replace('name="cmdm_nonce"', 'name="new_nonce"'), entryUrl, fetch),
    ).rejects.toThrow('download form has changed')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    'https://evil.example',
    'http://n1mm.hamdocs.com',
    'https://n1mm.hamdocs.com.evil.example',
  ])('refuses linked non-N1MM host %s before calling fetch', async (origin) => {
    const fetch = vi.fn<Fetcher>()
    const hostileListing = `<html><a href="${origin}/mmfiles/cwops_9999-txt/">CWOPS</a></html>`
    await expect(sourceText(hostileListing, DEFAULT_SOURCE, fetch)).rejects.toThrow(
      'unsupported download host',
    )
    const hostileForm = form().replace(downloadUrl, `${origin}/mmfile/get/file/CWOPS.txt`)
    await expect(sourceText(hostileForm, entryUrl, fetch)).rejects.toThrow(
      'unsupported download host',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([403, 404, 503])(
    'reports HTTP %s without returning a success payload',
    async (status) => {
      const fetch = vi.fn<Fetcher>().mockResolvedValue({ status, body: '<html>Error</html>' })
      await expect(sourceText(listing, DEFAULT_SOURCE, fetch)).rejects.toThrow(`HTTP ${status}`)
      expect(fetch).toHaveBeenCalledTimes(1)
    },
  )

  it('propagates network and POST failures for the cache adapter to preserve previous data', async () => {
    const offline = vi.fn<Fetcher>().mockRejectedValue(new Error('offline'))
    await expect(sourceText(form(), entryUrl, offline)).rejects.toThrow('offline')
    const denied = vi
      .fn<Fetcher>()
      .mockResolvedValueOnce({ status: 200, body: form() })
      .mockResolvedValueOnce({ status: 403, body: 'Denied' } satisfies FetchResponse)
    await expect(sourceText(listing, DEFAULT_SOURCE, denied)).rejects.toThrow('HTTP 403')
    expect(denied).toHaveBeenCalledTimes(2)
  })
})
