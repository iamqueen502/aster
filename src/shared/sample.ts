import type { Profile } from './types'

/**
 * The chart shown before anyone enters their own data. Chosen because it is
 * easy to check by hand: 17 May 1990 puts the Sun late in Taurus.
 */
export const SAMPLE_PROFILE: Profile = {
  id: 'sample',
  label: 'Sample chart',
  birthDate: '1990-05-17',
  birthTime: '14:30',
  timeKnown: true,
  placeLabel: 'New York, United States',
  lat: 40.7128,
  lon: -74.006,
  tz: 'America/New_York',
  createdAt: 0,
  updatedAt: 0,
}
