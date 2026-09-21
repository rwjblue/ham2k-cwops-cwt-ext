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

export interface N1mmRow {
  line: number
  call: string
  /** Lowercase N1MM column names; no field is interpreted as an exchange. */
  fields: Record<string, string>
}

export interface N1mmDocument {
  rows: N1mmRow[]
  issues: ParseIssue[]
  associations: string[]
  sourceUpdatedAt?: string
  usable: boolean
}
