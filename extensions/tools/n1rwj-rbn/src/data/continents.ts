/** RBN receiver-directory continent codes, not the spotted station's DXCC. */
export const continents = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
} as const

export type Continent = keyof typeof continents

export function continentCode(value: unknown): Continent | null {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return Object.keys(continents).includes(code) ? (code as Continent) : null
}
