import type { LoginSession } from '../types/accounting'

export async function apiRequest<T>(
  session: LoginSession,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Authorization', `Bearer ${session.token}`)
  if (options.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { ...options, headers })

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'No fue posible completar la solicitud.'
    throw new Error(message)
  }

  return response.json() as Promise<T>
}
