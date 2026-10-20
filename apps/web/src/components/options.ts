import { TRI_STATE_LABELS } from '@restspot/shared'

/** Yes / No / Not sure, for <Segmented> pickers. */
export const TRI_STATE_OPTIONS = (['yes', 'no', 'unknown'] as const).map((v) => ({
  value: v,
  label: TRI_STATE_LABELS[v],
}))
