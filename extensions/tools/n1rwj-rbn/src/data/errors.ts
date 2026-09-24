export type RbnFailureKind = 'rate-limit' | 'timeout' | 'request' | 'http' | 'response' | 'offline'

/** Retain transport context without exposing response bodies or stack traces. */
export class RbnRequestError extends Error {
  kind: RbnFailureKind
  retryAtMs?: number
  requestSent: boolean

  constructor(
    kind: RbnFailureKind,
    message: string,
    options: { retryAtMs?: number; requestSent?: boolean } = {},
  ) {
    super(message)
    this.kind = kind
    this.retryAtMs = options.retryAtMs
    this.requestSent = options.requestSent ?? true
  }
}

export function requestFailure(error: unknown): RbnRequestError {
  if (error instanceof RbnRequestError) return error
  const message =
    typeof error === 'string'
      ? error
      : error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : ''
  const detail = message
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Strip control characters from host-provided diagnostics.
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const bounded = detail.length > 300 ? `${detail.slice(0, 300)}…` : detail
  const timeout = /\b(?:TimeoutException|TimeoutError|ETIMEDOUT|timed?\s*out|timeout)\b/i.test(
    detail,
  )
  return new RbnRequestError(
    timeout ? 'timeout' : 'request',
    `Vail ReRBN ${timeout ? 'request timed out (3-second request budget)' : 'request failed'}; no HTTP response was available.${bounded ? ` Host detail: ${bounded}` : ' The host supplied no error detail.'}`,
  )
}
