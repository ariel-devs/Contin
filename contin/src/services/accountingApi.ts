import type { LoginSession } from '../types/accounting'

type AuthSource = LoginSession | string

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
  source: AuthSource,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { timeoutMs = 30_000, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)
  headers.set('Authorization', `Bearer ${typeof source === 'string' ? source : source.token}`)

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

export type LibroMayorParams = {
  fecha_inicio: string
  fecha_fin: string
  id_cuenta?: number
  id_empresa?: number
}

export type LibroMayorCuenta = {
  tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
  idCuenta: number
  codigo: string
  nombre: string
  naturaleza: 'DEUDORA' | 'ACREEDORA'
  saldoInicial: number
  totalDebe: number
  totalHaber: number
  saldoFinal: number
}

export type LibroMayorData = {
  fechaInicio: string
  fechaFin: string
  cuentas: LibroMayorCuenta[]
}

export async function getLibroMayor(
  token: string,
  params: LibroMayorParams,
): Promise<LibroMayorData> {
  const search = new URLSearchParams({
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
  })
  if (params.id_cuenta !== undefined) search.set('id_cuenta', String(params.id_cuenta))
  if (params.id_empresa !== undefined) search.set('id_empresa', String(params.id_empresa))
  return apiRequest<LibroMayorData>(token, `/api/reportes/mayor?${search.toString()}`)
}

export type BalanceParams = {
  fecha_inicio: string
  fecha_fin: string
  id_empresa?: number
}

export type BalanceCuenta = {
  tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
  idCuenta: number
  codigo: string
  nombre: string
  naturaleza: 'DEUDORA' | 'ACREEDORA'
  debe: number
  haber: number
}

export type BalanceData = {
  cuentas: BalanceCuenta[]
  totales: {
    totalDebe: number
    totalHaber: number
    diferencia: number
    cuadra: boolean
  }
}

export async function getBalanceComprobacion(
  token: string,
  params: BalanceParams,
): Promise<BalanceData> {
  const search = new URLSearchParams({
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
  })
  if (params.id_empresa !== undefined) search.set('id_empresa', String(params.id_empresa))
  return apiRequest<BalanceData>(token, `/api/reportes/balance?${search.toString()}`)
}

export type IvaReporteParams = {
  fecha_inicio: string
  fecha_fin: string
  id_empresa?: number
}

export type IvaReporteMovimiento = {
  fecha: string
  partida: number
  cuenta: string
  concepto: string
  debe: number
  haber: number
}

export type IvaReporteData = {
  movimientos: IvaReporteMovimiento[]
  totales: {
    ivaDebe: number
    ivaHaber: number
  }
}

export async function getLibroIva(
  token: string,
  params: IvaReporteParams,
): Promise<IvaReporteData> {
  const search = new URLSearchParams({
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
  })
  if (params.id_empresa !== undefined) search.set('id_empresa', String(params.id_empresa))
  return apiRequest<IvaReporteData>(token, `/api/reportes/iva?${search.toString()}`)
}

export type CierreParams = {
  fecha_inicio: string
  fecha_fin: string
  id_empresa?: number
}

export type CierrePartida = {
  id: number
  numero: number
  fecha: string
  concepto: string
  monto: number
}

export type CierreData = {
  resumen: {
    totalIngresos: number
    totalGastos: number
    utilidadPerdida: number
  }
  partidas: CierrePartida[]
}

export async function getPartidasCierre(
  token: string,
  params: CierreParams,
): Promise<CierreData> {
  const search = new URLSearchParams({
    fecha_inicio: params.fecha_inicio,
    fecha_fin: params.fecha_fin,
  })
  if (params.id_empresa !== undefined) search.set('id_empresa', String(params.id_empresa))
  return apiRequest<CierreData>(token, `/api/reportes/partidas-cierre?${search.toString()}`)
}
