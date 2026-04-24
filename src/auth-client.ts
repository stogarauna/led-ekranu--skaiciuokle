export type AuthStorageMode = 'local' | 'desktop' | 'server'

type UserRole = 'admin' | 'user'

type AuthUserRecord = {
  username: string
  passwordHash: string
  role: UserRole
}

type SharedAuthPayload = {
  user?: AuthUserRecord
  users?: AuthUserRecord[]
  token?: string | null
  usersFilePath?: string
  message?: string
}

type AppError = Error & {
  code?: string
  status?: number
}

const sharedAuthUnavailableCode = 'SHARED_AUTH_UNAVAILABLE'
const configuredAuthApiBaseUrl = (import.meta.env.VITE_AUTH_API_BASE_URL ?? '').trim().replace(/\/$/, '')

function createUnavailableError() {
  const error = new Error('Bendras vartotojų serveris nepasiekiamas.') as AppError
  error.code = sharedAuthUnavailableCode
  return error
}

function shouldAttemptServerAuth() {
  if (typeof window === 'undefined') {
    return false
  }

  if (configuredAuthApiBaseUrl) {
    return true
  }

  return window.location.protocol === 'http:' || window.location.protocol === 'https:'
}

function buildApiUrl(pathname: string) {
  return configuredAuthApiBaseUrl ? `${configuredAuthApiBaseUrl}${pathname}` : pathname
}

function buildAuthHeaders(token?: string | null) {
  const headers: Record<string, string> = {}

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

async function requestJson<T>(pathname: string, init: RequestInit = {}) {
  try {
    const response = await fetch(buildApiUrl(pathname), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })

    const contentType = response.headers.get('content-type') ?? ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '')

    if (!response.ok) {
      const error = new Error(
        typeof payload === 'object' && payload && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : 'Užklausa nepavyko.',
      ) as AppError
      error.status = response.status
      throw error
    }

    return payload as T
  } catch (error) {
    if (!configuredAuthApiBaseUrl) {
      const appError = error as AppError

      if (error instanceof TypeError || appError?.status === 404 || appError?.status === 405) {
        throw createUnavailableError()
      }
    }

    throw error
  }
}

export function isDesktopAuthAvailable() {
  return typeof window !== 'undefined'
    && typeof window.desktopApp?.loginUser === 'function'
    && typeof window.desktopApp?.loadUsers === 'function'
}

export function hasDesktopUsersFileAccess() {
  return typeof window !== 'undefined' && typeof window.desktopApp?.openUsersFile === 'function'
}

export function getInitialAuthStorageMode(): AuthStorageMode {
  return isDesktopAuthAvailable() ? 'desktop' : 'local'
}

export function isSharedAuthUnavailableError(error: unknown) {
  return (error as AppError)?.code === sharedAuthUnavailableCode
}

export async function loginWithSharedAuth(username: string, password: string) {
  if (isDesktopAuthAvailable()) {
    const response = await window.desktopApp.loginUser(username, password)
    return {
      ...response,
      token: null,
      mode: 'desktop' as const,
    }
  }

  if (!shouldAttemptServerAuth()) {
    throw createUnavailableError()
  }

  const response = await requestJson<SharedAuthPayload>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

  if (!response.user) {
    throw new Error('Nepavyko gauti vartotojo duomenų.')
  }

  return {
    user: response.user,
    token: response.token ?? null,
    usersFilePath: response.usersFilePath ?? '',
    mode: 'server' as const,
  }
}

export async function loadSharedUsers(token?: string | null) {
  if (isDesktopAuthAvailable()) {
    const response = await window.desktopApp.loadUsers()
    return {
      ...response,
      mode: 'desktop' as const,
    }
  }

  if (!shouldAttemptServerAuth()) {
    throw createUnavailableError()
  }

  const response = await requestJson<SharedAuthPayload>('/api/users', {
    method: 'GET',
    headers: buildAuthHeaders(token),
  })

  return {
    users: response.users ?? [],
    usersFilePath: response.usersFilePath ?? '',
    mode: 'server' as const,
  }
}

export async function createSharedUser(token: string | null | undefined, payload: { username: string; password: string; role: UserRole }) {
  if (isDesktopAuthAvailable()) {
    const response = await window.desktopApp.createUser(payload)
    return {
      ...response,
      mode: 'desktop' as const,
    }
  }

  if (!shouldAttemptServerAuth()) {
    throw createUnavailableError()
  }

  const response = await requestJson<SharedAuthPayload>('/api/users', {
    method: 'POST',
    headers: buildAuthHeaders(token),
    body: JSON.stringify(payload),
  })

  return {
    users: response.users ?? [],
    usersFilePath: response.usersFilePath ?? '',
    mode: 'server' as const,
  }
}

export async function deleteSharedUser(token: string | null | undefined, username: string) {
  if (isDesktopAuthAvailable()) {
    const response = await window.desktopApp.deleteUser(username)
    return {
      ...response,
      mode: 'desktop' as const,
    }
  }

  if (!shouldAttemptServerAuth()) {
    throw createUnavailableError()
  }

  const response = await requestJson<SharedAuthPayload>(`/api/users/${encodeURIComponent(username)}`, {
    method: 'DELETE',
    headers: buildAuthHeaders(token),
  })

  return {
    users: response.users ?? [],
    usersFilePath: response.usersFilePath ?? '',
    mode: 'server' as const,
  }
}

export async function openDesktopUsersFile() {
  if (!hasDesktopUsersFileAccess()) {
    throw createUnavailableError()
  }

  return window.desktopApp.openUsersFile()
}