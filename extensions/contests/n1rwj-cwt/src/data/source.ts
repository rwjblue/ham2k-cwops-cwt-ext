import { createN1mmSource } from '../../../../../packages/n1mm/src/source.ts'

export type { Fetcher } from '../../../../../packages/n1mm/src/source.ts'
export {
  DEFAULT_SOURCE,
  downloadForm,
  sourceValidationError,
} from '../../../../../packages/n1mm/src/source.ts'

export const { latestEntry, sourceText } = createN1mmSource({
  filePrefix: 'cwops_',
  label: 'CWOPS',
})
