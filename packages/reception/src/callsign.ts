export function normalizeCall(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidCall(value: string): boolean {
  return (
    value.length >= 3 &&
    value.length <= 24 &&
    /^[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(value) &&
    /[A-Z]/.test(value) &&
    /[0-9]/.test(value)
  )
}
