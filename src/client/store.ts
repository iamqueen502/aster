import type { Profile, ProfileInput, ProgressState, Session } from '../shared/types'

const PROFILES_KEY = 'aster.profiles.v1'
const PROGRESS_KEY = 'aster.progress.v1'
const EMPTY: ProgressState = { lessons: {} }

export function canSync(session: Session | null): boolean {
  return Boolean(session?.user && session.database && session.mode !== 'setup')
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Reached through globalThis so this module also compiles without DOM types. */
const storage = (): StorageLike | null =>
  (globalThis as unknown as { localStorage?: StorageLike }).localStorage ?? null

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = storage()?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    storage()?.setItem(key, JSON.stringify(value))
  } catch {
    /* a full or blocked store should not break the page */
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await response.json().catch(() => ({
    error: 'Could not reach the server.',
  }))) as T & { error?: string }
  if (!response.ok) throw new Error(body.error || 'The request failed.')
  return body
}

export function localProfiles(): Profile[] {
  return readJson<Profile[]>(PROFILES_KEY, []).sort((a, b) => b.createdAt - a.createdAt)
}

export function localProfileCount(): number {
  return readJson<Profile[]>(PROFILES_KEY, []).length
}

export async function listProfiles(session: Session | null): Promise<Profile[]> {
  if (canSync(session)) {
    try {
      const result = await api<{ profiles: Profile[] }>('/api/profiles')
      return result.profiles
    } catch {
      return localProfiles()
    }
  }
  return localProfiles()
}

export async function getProfile(
  id: string,
  session: Session | null,
): Promise<Profile | null> {
  const profiles = await listProfiles(session)
  return profiles.find((profile) => profile.id === id) ?? null
}

async function saveProfile(
  input: ProfileInput,
  session: Session | null,
): Promise<Profile> {
  if (canSync(session)) {
    const result = await api<{ profile: Profile }>('/api/profiles', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return result.profile
  }
  const now = Date.now()
  const profile: Profile = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }
  writeJson(PROFILES_KEY, [profile, ...localProfiles()].slice(0, 50))
  return profile
}

async function updateProfile(
  id: string,
  input: ProfileInput,
  session: Session | null,
): Promise<Profile> {
  if (canSync(session)) {
    const result = await api<{ profile: Profile }>(`/api/profiles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    })
    return result.profile
  }
  const existing = localProfiles().find((profile) => profile.id === id)
  if (!existing) throw new Error('That chart is not on this device.')
  const updated: Profile = { ...existing, ...input, updatedAt: Date.now() }
  writeJson(
    PROFILES_KEY,
    localProfiles().map((profile) => (profile.id === id ? updated : profile)),
  )
  return updated
}

export async function deleteProfile(id: string, session: Session | null): Promise<void> {
  if (canSync(session)) {
    await api(`/api/profiles/${id}`, { method: 'DELETE' })
    return
  }
  writeJson(
    PROFILES_KEY,
    localProfiles().filter((profile) => profile.id !== id),
  )
}

export async function loadProgress(session: Session | null): Promise<ProgressState> {
  if (canSync(session)) {
    try {
      const result = await api<{ progress: ProgressState }>('/api/progress')
      return result.progress ?? EMPTY
    } catch {
      return readJson<ProgressState>(PROGRESS_KEY, EMPTY)
    }
  }
  return readJson<ProgressState>(PROGRESS_KEY, EMPTY)
}

export async function saveProgress(
  progress: ProgressState,
  session: Session | null,
): Promise<void> {
  if (canSync(session)) {
    try {
      await api('/api/progress', { method: 'PUT', body: JSON.stringify({ progress }) })
      return
    } catch {
      /* fall through to the local copy so a lost connection does not lose a step */
    }
  }
  writeJson(PROGRESS_KEY, progress)
}

/**
 * The only exported way to write a chart. An open profile is updated in place
 * and a new one is created, so no caller can add a duplicate by choosing the
 * wrong function: there is nothing else to import.
 */
export function persistProfile(
  input: ProfileInput,
  profile: Profile | null,
  session: Session | null,
): Promise<Profile> {
  return profile ? updateProfile(profile.id, input, session) : saveProfile(input, session)
}

/** Moves charts saved on this device into the signed-in account. */
export async function importLocalProfiles(session: Session | null): Promise<number> {
  if (!canSync(session)) return 0
  const pending = localProfiles()
  let imported = 0
  for (const profile of pending) {
    try {
      // A copy into the account has no target profile, so the funnel creates.
      await persistProfile(
        {
          label: profile.label,
          birthDate: profile.birthDate,
          birthTime: profile.birthTime,
          timeKnown: profile.timeKnown,
          placeLabel: profile.placeLabel,
          lat: profile.lat,
          lon: profile.lon,
          tz: profile.tz,
        },
        null,
        session,
      )
      imported += 1
    } catch {
      break
    }
  }
  if (imported === pending.length) writeJson(PROFILES_KEY, [])
  return imported
}
