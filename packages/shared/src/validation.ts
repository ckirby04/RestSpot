// Input validation shared by every client. The database enforces the same
// limits with CHECK constraints; these give users fast, friendly errors.
import { z } from 'zod'
import { isValidHHMM } from './hours.ts'
import { ACCESS_TYPES, FEE_TYPES, REPORT_REASONS, ROOM_DESIGNATIONS, ROOM_LAYOUTS } from './types.ts'

export const LIMITS = {
  nameMax: 100,
  notesMax: 500,
  commentMax: 500,
  passwordMin: 8,
  radiusMinMiles: 0.1,
  radiusMaxMiles: 25,
  radiusDefaultMiles: 2,
  duplicateRadiusMeters: 50,
} as const

const triState = z.enum(['yes', 'no', 'unknown'])
const hhmm = z.string().refine(isValidHHMM, 'Use 24-hour HH:MM')
const rating = z.number().int().min(1).max(5)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === '' ? null : s))
    .nullable()

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

export const dayHoursSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unknown') }),
  z.object({ kind: z.literal('closed') }),
  z.object({ kind: z.literal('all_day') }),
  z.object({ kind: z.literal('open'), open: hhmm, close: hhmm }),
])

export const weeklyHoursSchema = z.tuple([
  dayHoursSchema,
  dayHoursSchema,
  dayHoursSchema,
  dayHoursSchema,
  dayHoursSchema,
  dayHoursSchema,
  dayHoursSchema,
])

export const roomInputSchema = z
  .object({
    designation: z.enum(ROOM_DESIGNATIONS),
    layout: z.enum(ROOM_LAYOUTS),
    changingTable: triState,
    adaAccessible: triState,
  })
  .refine((r) => r.layout !== 'family' || r.designation === 'all_gender', {
    message: 'Family rooms are all-gender',
    path: ['designation'],
  })

export const locationInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(LIMITS.nameMax),
  coordinates: coordinatesSchema,
  accessType: z.enum(ACCESS_TYPES),
  fee: z.enum(FEE_TYPES),
  keyRequired: triState,
  hours: weeklyHoursSchema,
  notes: optionalText(LIMITS.notesMax),
  rooms: z.array(roomInputSchema).min(1, 'Add at least one room'),
})
export type LocationInput = z.input<typeof locationInputSchema>

export const reviewInputSchema = z.object({
  overall: rating,
  cleanliness: rating,
  comment: optionalText(LIMITS.commentMax),
  anonymous: z.boolean(),
})
export type ReviewInput = z.input<typeof reviewInputSchema>

export const reportInputSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  comment: optionalText(LIMITS.commentMax),
})
export type ReportInput = z.input<typeof reportInputSchema>

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(LIMITS.passwordMin, `At least ${LIMITS.passwordMin} characters`),
})
