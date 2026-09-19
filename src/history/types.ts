export type Membership = 'member' | 'nonmember' | 'cwa' | 'unknown'

export interface CallHistoryRecord {
  call: string
  name?: string
  /** CWT exchange: a member number, CWA, or an explicitly supplied location. */
  number?: string
  membership: Membership
}

export interface ParseIssue {
  line: number
  severity: 'warning' | 'error'
  code:
    | 'unsupported-directive'
    | 'invalid-order'
    | 'unknown-column'
    | 'invalid-row'
    | 'extra-columns'
    | 'invalid-exchange'
    | 'duplicate-call'
    | 'incompatible-contest'
    | 'empty-file'
  message: string
}

export interface ParsedCallHistory {
  records: Record<string, CallHistoryRecord>
  issues: ParseIssue[]
  associations: string[]
  /** ISO calendar date declared by the file's LastEdit comment, when present. */
  sourceUpdatedAt?: string
  /** False means the caller must retain the previous good cache. */
  usable: boolean
}

export interface CwtHistoryContact {
  call: string
  name?: string
  number?: string
  /** An explicit compatible contest marker, never inferred from mode or name. */
  contest: string
  /** Numeric milliseconds; invalid/missing values sort behind dated contacts. */
  timestamp?: number
}

export interface OperatorExchange {
  /** Scope explicit edits to the callsign they were entered for. */
  call: string
  /** A present empty string or null is intentional clearing. */
  name?: string | null
  number?: string | null
}

export type ExchangeSource = 'operator' | 'current-operation' | 'selected-file' | 'older-history'

export interface ResolvedField {
  value: string
  source: ExchangeSource
  matchedCall: string
  match: 'exact' | 'base'
}

export interface ResolvedCwtExchange {
  call: string
  name?: ResolvedField
  number?: ResolvedField
  membership: Membership
}

export interface ResolveCwtExchangeInput {
  call: string
  operator?: OperatorExchange
  currentOperation?: readonly CwtHistoryContact[]
  selectedFile?: Readonly<Record<string, CallHistoryRecord>>
  olderHistory?: readonly CwtHistoryContact[]
}
