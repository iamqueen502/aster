import type { Profile, ProgressState } from '../shared/types'

const schema = [
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    label TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    birth_time TEXT NOT NULL,
    time_known INTEGER NOT NULL,
    place_label TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    tz TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS profiles_owner_created ON profiles(owner_sub, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS progress (
    owner_sub TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
]

const ready = new WeakMap<D1Database, Promise<void>>()
export function ensureSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db)
  if (!pending) {
    pending = db
      .batch(schema.map((sql) => db.prepare(sql)))
      .then(() => undefined)
      .catch((error) => {
        ready.delete(db)
        throw error
      })
    ready.set(db, pending)
  }
  return pending
}

export type ProfileRow = {
  id: string
  label: string
  birth_date: string
  birth_time: string
  time_known: number
  place_label: string
  lat: number
  lon: number
  tz: string
  created_at: number
  updated_at: number
}

export const mapProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  label: row.label,
  birthDate: row.birth_date,
  birthTime: row.birth_time,
  timeKnown: Boolean(row.time_known),
  placeLabel: row.place_label,
  lat: row.lat,
  lon: row.lon,
  tz: row.tz,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const emptyProgress: ProgressState = { lessons: {} }

export function parseProgress(raw: string | null | undefined): ProgressState {
  if (!raw) return { lessons: {} }
  try {
    const value = JSON.parse(raw) as ProgressState
    return value && typeof value === 'object' && value.lessons
      ? { lessons: value.lessons }
      : { lessons: {} }
  } catch {
    return { lessons: {} }
  }
}
