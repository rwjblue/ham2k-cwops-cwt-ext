export type { PanelConfig } from '../../../../packages/reception/src/config.ts'
export {
  operationOrigin,
  readConfig,
  receptionBands as rbnBands,
  watchedCall,
} from '../../../../packages/reception/src/config.ts'

import { receptionConfigFields } from '../../../../packages/reception/src/config.ts'
export const configFields = receptionConfigFields()
