import type { LoginSession } from '../types/accounting'

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
}

type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  onUnauthorized = handler
}

export class HttpError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export async function apiRequest<T>(
  session: LoginSession,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeoutMs = 30_000, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)
  headers.set('Authorization', `Bearer ${session.token}`)

  const hasBody = fetchOptions.body !== undefined && fetchOptions.body !== null
  const isFormData = hasBody && fetchOptions.body instanceof FormData
  if (hasBody && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(path, {
      ...fetchOptions,
      headers,
      signal: fetchOptions.signal ?? controller.signal,
    })
  } catch (networkError) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted) {
      throw new HttpError('La solicitud tardó demasiado. Inténtalo de nuevo.', 408)
    }
    console.error('Error de red:', networkError)
    throw new HttpError('No fue posible conectar con el servidor.', 0)
  } finally {
    clearTimeout(timeoutId)
  }

  if (response.status === 401) {
    onUnauthorized?.()
    throw new HttpError('La sesión expiró. Inicia sesión nuevamente.', 401)
  }

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const message =
      typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
        ? body.message
        : 'No fue posible completar la solicitud.'
    throw new HttpError(message, response.status)
  }

  return response.json() as Promise<T>
}
