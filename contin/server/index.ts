import 'dotenv/config'
import bcrypt from 'bcryptjs'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import helmet from 'helmet'
import jwt from 'jsonwebtoken'
import { timingSafeEqual } from 'node:crypto'
import sql from 'mssql/msnodesqlv8'

const requiredEnvironmentVariables = ['DB_SERVER', 'JWT_SECRET'] as const

for (const name of requiredEnvironmentVariables) {
  if (!process.env[name]) {
    throw new Error(
      `Falta ${name}. Crea el archivo .env copiando .env.example y configura ${name}.`,
    )
  }
}

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 bytes.')
}

const database = new sql.ConnectionPool({
  driver: process.env.DB_ODBC_DRIVER ?? 'ODBC Driver 18 for SQL Server',
  server: process.env.DB_SERVER!,
  database: process.env.DB_DATABASE ?? 'SistemaContableDB',
  ...(process.env.DB_INSTANCE
    ? {}
    : process.env.DB_PORT
      ? { port: Number(process.env.DB_PORT) }
      : {}),
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    trustedConnection: true,
    ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {}),
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30_000,
  },
})

const app = express()
app.use(helmet())
app.use(express.json({ limit: '2mb' }))

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const bcryptHashPattern = /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/
const nitPattern = /^\d{4}-\d{6}-\d{3}-\d{1}$/

declare module 'express-serve-static-core' {
  interface Request {
    authenticatedUserId?: number
  }
}

const authenticate: express.RequestHandler = (request, response, next) => {
  const authorization = request.get('authorization')
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) {
    response.status(401).json({ message: 'Inicia sesión para continuar.' })
    return
  }

  try {
    const payload = jwt.verify(token, jwtSecret)
    const userId =
      typeof payload === 'object' && payload.sub
        ? Number(payload.sub)
        : Number.NaN
    if (!Number.isSafeInteger(userId) || userId < 1) {
      response.status(401).json({ message: 'La sesión no es válida.' })
      return
    }

    request.authenticatedUserId = userId
    next()
  } catch {
    response.status(401).json({ message: 'La sesión expiró. Inicia sesión nuevamente.' })
  }
}

function parsePositiveId(value: string | string[]): number | null {
  if (typeof value !== 'string') return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

type AccountClassification =
  | 'ACTIVO'
  | 'PASIVO'
  | 'PATRIMONIO'
  | 'INGRESO'
  | 'COSTO'
  | 'GASTO'

type AccountNature = 'DEUDORA' | 'ACREEDORA'
type TipoContribuyente = 'GRAN_CONTRIBUYENTE' | 'MEDIANO' | 'PEQUENO' | 'EXENTO'

type AccountDraft = {
  nombre: string
  codigo: string
  clasificacion: AccountClassification
  naturaleza: AccountNature
  permiteMovimientos: boolean
  parentType: 'P' | 'C'
  parentId: number
}

type TerceroDraft = {
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'AMBOS'
  nombre: string
  nit: string | null
  nrc: string | null
  tipoContribuyente: TipoContribuyente
  direccion: string | null
  correo: string | null
  telefono: string | null
}

type DteDraft = {
  idTercero: number | null
  tipoDte: 'FACTURA' | 'CCF' | 'NC' | 'ND' | 'RETENCION' | 'SUJETO_EXCLUIDO' | 'EXPORTACION'
  numeroControl: string
  codigoGeneracion: string
  selloRecepcion: string | null
  fechaEmision: string
  montoGravado: string
  montoExento: string
  iva: string
  total: string
}

function parseAccountDraft(value: unknown): AccountDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  const parent =
    typeof body.parentKey === 'string'
      ? body.parentKey.match(/^([PC]):([1-9]\d*)$/)
      : null
  const parentId = parent ? parsePositiveId(parent[2]) : null
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const codigo = typeof body.codigo === 'string' ? body.codigo.trim() : ''
  const classifications: AccountClassification[] = [
    'ACTIVO',
    'PASIVO',
    'PATRIMONIO',
    'INGRESO',
    'COSTO',
    'GASTO',
  ]
  const natures: AccountNature[] = ['DEUDORA', 'ACREEDORA']

  if (
    !parent ||
    parentId === null ||
    nombre.length === 0 ||
    nombre.length > 150 ||
    codigo.length === 0 ||
    codigo.length > 20 ||
    typeof body.clasificacion !== 'string' ||
    !classifications.includes(body.clasificacion as AccountClassification) ||
    typeof body.naturaleza !== 'string' ||
    !natures.includes(body.naturaleza as AccountNature) ||
    typeof body.permiteMovimientos !== 'boolean'
  ) {
    return null
  }

  return {
    nombre,
    codigo,
    clasificacion: body.clasificacion as AccountClassification,
    naturaleza: body.naturaleza as AccountNature,
    permiteMovimientos: body.permiteMovimientos,
    parentType: parent[1] as 'P' | 'C',
    parentId,
  }
}

function parseTerceroDraft(value: unknown): TerceroDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  const tipos = ['CLIENTE', 'PROVEEDOR', 'AMBOS'] as const
  const tiposContribuyente: TipoContribuyente[] = [
    'GRAN_CONTRIBUYENTE',
    'MEDIANO',
    'PEQUENO',
    'EXENTO',
  ]
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const nit = typeof body.nit === 'string' ? body.nit.trim() : ''
  const nrc = typeof body.nrc === 'string' ? body.nrc.trim() : ''
  const direccion = typeof body.direccion === 'string' ? body.direccion.trim() : ''
  const correo = typeof body.correo === 'string' ? body.correo.trim() : ''
  const telefono = typeof body.telefono === 'string' ? body.telefono.trim() : ''

  if (
    nombre.length === 0 ||
    nombre.length > 200 ||
    typeof body.tipo !== 'string' ||
    !tipos.includes(body.tipo as (typeof tipos)[number]) ||
    typeof body.tipoContribuyente !== 'string' ||
    !tiposContribuyente.includes(body.tipoContribuyente as TipoContribuyente) ||
    (nit && !nitPattern.test(nit)) ||
    nrc.length > 20 ||
    direccion.length > 250 ||
    correo.length > 150 ||
    telefono.length > 20
  ) {
    return null
  }

  return {
    tipo: body.tipo as TerceroDraft['tipo'],
    nombre,
    nit: nit || null,
    nrc: nrc || null,
    tipoContribuyente: body.tipoContribuyente as TipoContribuyente,
    direccion: direccion || null,
    correo: correo || null,
    telefono: telefono || null,
  }
}

function parseDteDraft(value: unknown): DteDraft | null {
  if (typeof value !== 'object' || value === null) return null
  const body = value as Record<string, unknown>
  const tipos = ['FACTURA', 'CCF', 'NC', 'ND', 'RETENCION', 'SUJETO_EXCLUIDO', 'EXPORTACION'] as const
  const numeroControl = typeof body.numeroControl === 'string' ? body.numeroControl.trim() : ''
  const codigoGeneracion = typeof body.codigoGeneracion === 'string' ? body.codigoGeneracion.trim() : ''
  const selloRecepcion = typeof body.selloRecepcion === 'string' ? body.selloRecepcion.trim() : ''
  const fechaEmision = parseIsoDate(body.fechaEmision)
  const montoGravado = parseCents(body.montoGravado)
  const montoExento = parseCents(body.montoExento ?? '0')
  const iva = parseCents(body.iva)
  const total = parseCents(body.total)
  const idTercero =
    body.idTercero === null || body.idTercero === undefined
      ? null
      : typeof body.idTercero === 'number' && Number.isSafeInteger(body.idTercero)
        ? body.idTercero
        : NaN

  if (
    numeroControl.length === 0 ||
    numeroControl.length > 50 ||
    codigoGeneracion.length === 0 ||
    codigoGeneracion.length > 50 ||
    selloRecepcion.length > 50 ||
    fechaEmision === null ||
    montoGravado === null ||
    montoExento === null ||
    iva === null ||
    total === null ||
    typeof body.tipoDte !== 'string' ||
    !tipos.includes(body.tipoDte as (typeof tipos)[number]) ||
    (idTercero !== null && (!Number.isSafeInteger(idTercero) || idTercero < 1))
  ) {
    return null
  }

  return {
    idTercero: idTercero as number | null,
    tipoDte: body.tipoDte as DteDraft['tipoDte'],
    numeroControl,
    codigoGeneracion,
    selloRecepcion: selloRecepcion || null,
    fechaEmision: fechaEmision.toISOString().slice(0, 10),
    montoGravado: (montoGravado / 100).toFixed(2),
    montoExento: (montoExento / 100).toFixed(2),
    iva: (iva / 100).toFixed(2),
    total: (total / 100).toFixed(2),
  }
}

function accountErrorResponse(
  error: unknown,
  response: express.Response,
  fallbackMessage: string,
) {
  const errorNumber =
    typeof error === 'object' &&
      error !== null &&
      'number' in error &&
      typeof error.number === 'number'
      ? error.number
      : null

  console.error(fallbackMessage, error)
  if (errorNumber === 2601 || errorNumber === 2627) {
    response.status(409).json({ message: 'Ya existe un registro con ese código o clave única.' })
    return
  }
  if (errorNumber === 50020 || errorNumber === 50021) {
    response.status(400).json({ message: 'La cuenta padre debe ser agrupadora y coincidir en clasificación y naturaleza.' })
    return
  }
  if (errorNumber === 50022 || errorNumber === 50024) {
    response.status(400).json({ message: 'El cambio produciría una jerarquía de cuentas inconsistente.' })
    return
  }
  if (errorNumber === 50033) {
    response.status(409).json({ message: 'No se puede desactivar una cuenta con movimientos contabilizados.' })
    return
  }
  if (errorNumber === 547) {
    response.status(400).json({ message: 'El registro padre o relacionado ya no está disponible.' })
    return
  }
  response.status(500).json({ message: fallbackMessage })
}

async function userOwnsCompany(
  connection: sql.ConnectionPool,
  userId: number,
  companyId: number,
): Promise<boolean> {
  const result = await connection
    .request()
    .input('id_usuario', sql.Int, userId)
    .input('id_empresa', sql.Int, companyId)
    .query(
      `SELECT id_empresa
       FROM EMPRESA
       WHERE id_usuario = @id_usuario
         AND id_empresa = @id_empresa`,
    )
  return result.recordset.length > 0
}

function parseIsoDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null
  }

  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date
}

function parseCents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) {
    return null
  }

  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function timingSafeTextEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8')
  const rightBuffer = Buffer.from(right, 'utf8')
  const sameLength = leftBuffer.length === rightBuffer.length
  const bufferLength = Math.max(leftBuffer.length, rightBuffer.length, 1)
  const paddedLeft = Buffer.alloc(bufferLength)
  const paddedRight = Buffer.alloc(bufferLength)

  leftBuffer.copy(paddedLeft)
  rightBuffer.copy(paddedRight)

  return timingSafeEqual(paddedLeft, paddedRight) && sameLength
}

async function verifyPassword(
  connection: sql.ConnectionPool,
  user: { id_usuario: number; contrasena_hash: string },
  password: string,
): Promise<boolean> {
  if (bcryptHashPattern.test(user.contrasena_hash)) {
    return bcrypt.compare(password, user.contrasena_hash)
  }

  if (!timingSafeTextEqual(password, user.contrasena_hash)) {
    return false
  }

  const newHash = await bcrypt.hash(password, 10)
  const update = await connection
    .request()
    .input('id_usuario', sql.Int, user.id_usuario)
    .input('hash_anterior', sql.VarChar(255), user.contrasena_hash)
    .input('hash_nuevo', sql.VarChar(60), newHash)
    .query(
      `UPDATE dbo.USUARIO
       SET contrasena_hash = @hash_nuevo
       WHERE id_usuario = @id_usuario
         AND contrasena_hash = @hash_anterior`,
    )

  if (update.rowsAffected[0] > 0) {
    console.info('Se migró a bcrypt un hash de contraseña heredado.')
    return true
  }

  const latestHash = await connection
    .request()
    .input('id_usuario', sql.Int, user.id_usuario)
    .query<{ contrasena_hash: string }>(
      `SELECT contrasena_hash
       FROM dbo.USUARIO
       WHERE id_usuario = @id_usuario`,
    )
  const currentHash = latestHash.recordset[0]?.contrasena_hash

  return (
    typeof currentHash === 'string' &&
    bcryptHashPattern.test(currentHash) &&
    bcrypt.compare(password, currentHash)
  )
}

/* ============================================================
   HEALTH
   ============================================================ */

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', timestamp: new Date().toISOString() })
})

/* ============================================================
   AUTH
   ============================================================ */

app.post('/api/auth/login', loginRateLimit, async (request, response) => {
  const body: unknown = request.body
  if (typeof body !== 'object' || body === null) {
    response.status(400).json({ message: 'Ingresa un correo y contraseña válidos.' })
    return
  }

  const { correo, contrasena } = body as {
    correo?: unknown
    contrasena?: unknown
  }

  if (
    typeof correo !== 'string' ||
    typeof contrasena !== 'string' ||
    correo.trim().length === 0 ||
    correo.length > 150 ||
    contrasena.length === 0 ||
    contrasena.length > 1024
  ) {
    response.status(400).json({ message: 'Ingresa un correo y contraseña válidos.' })
    return
  }

  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('correo', sql.VarChar(150), correo.trim())
      .query<{
        id_usuario: number
        nombre: string
        correo: string
        contrasena_hash: string
      }>(
        `SELECT id_usuario, nombre, correo, contrasena_hash
         FROM USUARIO
         WHERE correo = @correo`,
      )

    const user = result.recordset[0]
    if (!user || !(await verifyPassword(connection, user, contrasena))) {
      response.status(401).json({ message: 'El correo o la contraseña no son correctos.' })
      return
    }

    const token = jwt.sign(
      { correo: user.correo },
      jwtSecret,
      { subject: String(user.id_usuario), expiresIn: '1h' },
    )

    response.json({
      token,
      user: {
        id: user.id_usuario,
        nombre: user.nombre,
        correo: user.correo,
      },
    })
  } catch (error) {
    console.error('Error al iniciar sesión:', error)
    response.status(500).json({ message: 'No fue posible iniciar sesión.' })
  }
})

/* ============================================================
   EMPRESAS
   ============================================================ */

app.get('/api/companies', authenticate, async (request, response) => {
  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .query<{
        id: number
        nombre: string
        nit: string | null
        nrc: string | null
        tipoContribuyente: TipoContribuyente
        inscritoDte: boolean
      }>(
        `SELECT id_empresa AS id, nombre, nit, nrc,
                tipo_contribuyente AS tipoContribuyente,
                inscrito_dte AS inscritoDte
         FROM EMPRESA
         WHERE id_usuario = @id_usuario
         ORDER BY nombre`,
      )
    response.json(result.recordset)
  } catch (error) {
    console.error('Error al consultar empresas:', error)
    response.status(500).json({ message: 'No fue posible consultar las empresas.' })
  }
})

app.post('/api/companies', authenticate, async (request, response) => {
  const body: unknown = request.body
  if (typeof body !== 'object' || body === null) {
    response.status(400).json({ message: 'Ingresa los datos de la empresa.' })
    return
  }

  const { nombre, nit, nrc, tipoContribuyente, inscritoDte, direccion } = body as {
    nombre?: unknown
    nit?: unknown
    nrc?: unknown
    tipoContribuyente?: unknown
    inscritoDte?: unknown
    direccion?: unknown
  }
  const trimmedName = typeof nombre === 'string' ? nombre.trim() : ''
  const trimmedNit = typeof nit === 'string' ? nit.trim() : ''
  const trimmedNrc = typeof nrc === 'string' ? nrc.trim() : ''
  const trimmedDireccion = typeof direccion === 'string' ? direccion.trim() : ''
  const tiposContribuyente: TipoContribuyente[] = [
    'GRAN_CONTRIBUYENTE',
    'MEDIANO',
    'PEQUENO',
    'EXENTO',
  ]
  const tipo = typeof tipoContribuyente === 'string' ? tipoContribuyente : 'PEQUENO'

  if (
    trimmedName.length === 0 ||
    trimmedName.length > 150 ||
    (nit !== undefined && nit !== null && typeof nit !== 'string') ||
    (trimmedNit && !nitPattern.test(trimmedNit)) ||
    trimmedNrc.length > 20 ||
    trimmedDireccion.length > 200 ||
    !tiposContribuyente.includes(tipo as TipoContribuyente) ||
    (inscritoDte !== undefined && typeof inscritoDte !== 'boolean')
  ) {
    response.status(400).json({ message: 'Revisa el nombre, NIT, NRC y tipo de contribuyente de la empresa.' })
    return
  }

  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .input('nombre', sql.VarChar(150), trimmedName)
      .input('nit', sql.VarChar(20), trimmedNit || null)
      .input('nrc', sql.VarChar(20), trimmedNrc || null)
      .input('direccion', sql.VarChar(200), trimmedDireccion || null)
      .input('tipo_contribuyente', sql.VarChar(20), tipo)
      .input('inscrito_dte', sql.Bit, inscritoDte === true)
      .query<{
        id: number
        nombre: string
        nit: string | null
        nrc: string | null
        tipoContribuyente: TipoContribuyente
        inscritoDte: boolean
      }>(
        `INSERT INTO EMPRESA
           (id_usuario, nombre, nit, nrc, direccion, tipo_contribuyente, inscrito_dte)
         OUTPUT
           INSERTED.id_empresa AS id,
           INSERTED.nombre, INSERTED.nit, INSERTED.nrc,
           INSERTED.tipo_contribuyente AS tipoContribuyente,
           INSERTED.inscrito_dte AS inscritoDte
         VALUES (@id_usuario, @nombre, @nit, @nrc, @direccion, @tipo_contribuyente, @inscrito_dte)`,
      )

    response.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Error al registrar empresa:', error)
    response.status(500).json({ message: 'No fue posible registrar la empresa.' })
  }
})

/* ============================================================
   TERCEROS
   ============================================================ */

app.get(
  '/api/companies/:companyId/terceros',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    if (companyId === null) {
      response.status(400).json({ message: 'La empresa seleccionada no es válida.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .query<{
          id: number
          tipo: string
          nombre: string
          nit: string | null
          nrc: string | null
          tipoContribuyente: TipoContribuyente
          direccion: string | null
          correo: string | null
          telefono: string | null
          estado: string
        }>(
          `SELECT id_tercero AS id, tipo, nombre, nit, nrc,
                  tipo_contribuyente AS tipoContribuyente,
                  direccion, correo, telefono, estado
           FROM TERCERO
           WHERE id_empresa = @id_empresa
           ORDER BY nombre`,
        )

      response.json(result.recordset)
    } catch (error) {
      console.error('Error al consultar terceros:', error)
      response.status(500).json({ message: 'No fue posible consultar los terceros.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/terceros',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const draft = parseTerceroDraft(request.body)
    if (companyId === null || draft === null) {
      response.status(400).json({ message: 'Revisa los datos del tercero.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('tipo', sql.VarChar(10), draft.tipo)
        .input('nombre', sql.VarChar(200), draft.nombre)
        .input('nit', sql.VarChar(20), draft.nit)
        .input('nrc', sql.VarChar(20), draft.nrc)
        .input('tipo_contribuyente', sql.VarChar(20), draft.tipoContribuyente)
        .input('direccion', sql.VarChar(250), draft.direccion)
        .input('correo', sql.VarChar(150), draft.correo)
        .input('telefono', sql.VarChar(20), draft.telefono)
        .query<{
          id: number
          tipo: string
          nombre: string
          nit: string | null
          tipoContribuyente: TipoContribuyente
          estado: string
        }>(
          `INSERT INTO TERCERO
             (id_empresa, tipo, nombre, nit, nrc, tipo_contribuyente, direccion, correo, telefono)
           OUTPUT
             INSERTED.id_tercero AS id, INSERTED.tipo, INSERTED.nombre, INSERTED.nit,
             INSERTED.tipo_contribuyente AS tipoContribuyente, INSERTED.estado
           VALUES
             (@id_empresa, @tipo, @nombre, @nit, @nrc, @tipo_contribuyente, @direccion, @correo, @telefono)`,
        )

      response.status(201).json(result.recordset[0])
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible crear el tercero.')
    }
  },
)

app.patch(
  '/api/companies/:companyId/terceros/:terceroId',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const terceroId = parsePositiveId(request.params.terceroId)
    const draft = parseTerceroDraft(request.body)
    if (companyId === null || terceroId === null || draft === null) {
      response.status(400).json({ message: 'Revisa los datos del tercero.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_tercero', sql.Int, terceroId)
        .input('tipo', sql.VarChar(10), draft.tipo)
        .input('nombre', sql.VarChar(200), draft.nombre)
        .input('nit', sql.VarChar(20), draft.nit)
        .input('nrc', sql.VarChar(20), draft.nrc)
        .input('tipo_contribuyente', sql.VarChar(20), draft.tipoContribuyente)
        .input('direccion', sql.VarChar(250), draft.direccion)
        .input('correo', sql.VarChar(150), draft.correo)
        .input('telefono', sql.VarChar(20), draft.telefono)
        .query<{
          id: number
          tipo: string
          nombre: string
          nit: string | null
          tipoContribuyente: TipoContribuyente
          estado: string
        }>(
          `UPDATE TERCERO
           SET tipo = @tipo,
               nombre = @nombre,
               nit = @nit,
               nrc = @nrc,
               tipo_contribuyente = @tipo_contribuyente,
               direccion = @direccion,
               correo = @correo,
               telefono = @telefono
           OUTPUT
             INSERTED.id_tercero AS id, INSERTED.tipo, INSERTED.nombre, INSERTED.nit,
             INSERTED.tipo_contribuyente AS tipoContribuyente, INSERTED.estado
           WHERE id_tercero = @id_tercero AND id_empresa = @id_empresa`,
        )

      if (result.recordset.length === 0) {
        response.status(404).json({ message: 'No se encontró el tercero.' })
        return
      }
      response.json(result.recordset[0])
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible actualizar el tercero.')
    }
  },
)

app.post(
  '/api/companies/:companyId/terceros/:terceroId/deactivate',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const terceroId = parsePositiveId(request.params.terceroId)
    if (companyId === null || terceroId === null) {
      response.status(400).json({ message: 'La empresa o el tercero seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_tercero', sql.Int, terceroId)
        .query(
          `UPDATE TERCERO
           SET estado = 'INACTIVO'
           OUTPUT INSERTED.id_tercero AS id
           WHERE id_tercero = @id_tercero AND id_empresa = @id_empresa AND estado = 'ACTIVO'`,
        )

      if (result.recordset.length === 0) {
        response.status(409).json({ message: 'El tercero no existe o ya está inactivo.' })
        return
      }
      response.json({ id: terceroId, estado: 'INACTIVO' })
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible desactivar el tercero.')
    }
  },
)

/* ============================================================
   DTE
   ============================================================ */

app.get(
  '/api/companies/:companyId/dte',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    if (companyId === null) {
      response.status(400).json({ message: 'La empresa seleccionada no es válida.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .query(
          `SELECT D.id_dte AS id, D.tipo_dte AS tipoDte,
                  D.numero_control AS numeroControl,
                  D.codigo_generacion AS codigoGeneracion,
                  D.sello_recepcion AS selloRecepcion,
                  D.fecha_emision AS fechaEmision,
                  D.monto_gravado AS montoGravado,
                  D.monto_exento AS montoExento,
                  D.iva, D.total,
                  D.estado_transmision AS estadoTransmision,
                  D.id_partida AS idPartida,
                  T.nombre AS terceroNombre,
                  T.nit AS terceroNit
           FROM DTE D
           LEFT JOIN TERCERO T ON T.id_tercero = D.id_tercero
           WHERE D.id_empresa = @id_empresa
           ORDER BY D.fecha_emision DESC, D.id_dte DESC`,
        )

      response.json(result.recordset)
    } catch (error) {
      console.error('Error al consultar DTE:', error)
      response.status(500).json({ message: 'No fue posible consultar los DTE.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/dte',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const draft = parseDteDraft(request.body)
    if (companyId === null || draft === null) {
      response.status(400).json({ message: 'Revisa los datos del DTE.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      // Validar que el tercero pertenezca a la empresa (si viene)
      if (draft.idTercero !== null) {
        const terceroValido = await connection
          .request()
          .input('id_empresa', sql.Int, companyId)
          .input('id_tercero', sql.Int, draft.idTercero)
          .query(
            `SELECT id_tercero FROM TERCERO
             WHERE id_tercero = @id_tercero AND id_empresa = @id_empresa AND estado = 'ACTIVO'`,
          )
        if (terceroValido.recordset.length === 0) {
          response.status(400).json({ message: 'El tercero seleccionado no existe o está inactivo.' })
          return
        }
      }

      // Validar sello de recepción (40 caracteres si viene)
      if (draft.selloRecepcion !== null && draft.selloRecepcion.length !== 40) {
        response.status(400).json({ message: 'El sello de recepción debe tener 40 caracteres.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_tercero', sql.Int, draft.idTercero)
        .input('tipo_dte', sql.VarChar(10), draft.tipoDte)
        .input('numero_control', sql.VarChar(50), draft.numeroControl)
        .input('codigo_generacion', sql.VarChar(50), draft.codigoGeneracion)
        .input('sello_recepcion', sql.VarChar(50), draft.selloRecepcion)
        .input('fecha_emision', sql.Date, new Date(draft.fechaEmision))
        .input('monto_gravado', sql.Decimal(12, 2), draft.montoGravado)
        .input('monto_exento', sql.Decimal(12, 2), draft.montoExento)
        .input('iva', sql.Decimal(12, 2), draft.iva)
        .input('total', sql.Decimal(12, 2), draft.total)
        .query<{
          id: number
          tipoDte: string
          numeroControl: string
          estadoTransmision: string
        }>(
          `INSERT INTO DTE
             (id_empresa, id_tercero, tipo_dte, numero_control, codigo_generacion,
              sello_recepcion, fecha_emision, monto_gravado, monto_exento, iva, total,
              estado_transmision)
           OUTPUT
             INSERTED.id_dte AS id,
             INSERTED.tipo_dte AS tipoDte,
             INSERTED.numero_control AS numeroControl,
             INSERTED.estado_transmision AS estadoTransmision
           VALUES
             (@id_empresa, @id_tercero, @tipo_dte, @numero_control, @codigo_generacion,
              @sello_recepcion, @fecha_emision, @monto_gravado, @monto_exento, @iva, @total,
              'TRANSMITIDO')`,
        )

      response.status(201).json(result.recordset[0])
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible registrar el DTE.')
    }
  },
)

/* ============================================================
   CUENTAS
   ============================================================ */

app.get(
  '/api/companies/:companyId/accounts',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    if (companyId === null) {
      response.status(400).json({ message: 'La empresa seleccionada no es válida.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .query<{
          key: string
          tipo: 'PREDETERMINADA' | 'PERSONALIZADA'
          id: number
          codigo: string
          nombre: string
          clasificacion: AccountClassification
          naturaleza: AccountNature
          parentKey: string | null
          estado: string
          permiteMovimientos: boolean
        }>(
          `SELECT
             CAST(CONCAT('P:', CP.id_cuenta) AS VARCHAR(32)) AS [key],
             CAST('PREDETERMINADA' AS VARCHAR(20)) AS tipo,
             CP.id_cuenta AS id,
             CP.codigo,
             CP.nombre,
             CP.clasificacion,
             CP.naturaleza,
             CASE WHEN CP.id_cuenta_padre IS NULL THEN NULL
                  ELSE CAST(CONCAT('P:', CP.id_cuenta_padre) AS VARCHAR(32))
             END AS parentKey,
             CP.estado,
             CP.permite_movimientos AS permiteMovimientos
           FROM CUENTA_PREDETERMINADA CP

           UNION ALL

           SELECT
             CAST(CONCAT('C:', CC.id_cuenta) AS VARCHAR(32)),
             CAST('PERSONALIZADA' AS VARCHAR(20)),
             CC.id_cuenta,
             CC.codigo,
             CC.nombre,
             CC.clasificacion,
             CC.naturaleza,
             CASE
               WHEN CC.id_cuenta_personalizada_padre IS NOT NULL
                 THEN CAST(CONCAT('C:', CC.id_cuenta_personalizada_padre) AS VARCHAR(32))
               WHEN CC.id_cuenta_predeterminada_padre IS NOT NULL
                 THEN CAST(CONCAT('P:', CC.id_cuenta_predeterminada_padre) AS VARCHAR(32))
               ELSE NULL
             END,
             CC.estado,
             CC.permite_movimientos
           FROM CUENTA_PERSONALIZADA CC
           WHERE CC.id_empresa = @id_empresa
           ORDER BY codigo, tipo`,
        )

      response.json(result.recordset)
    } catch (error) {
      console.error('Error al consultar el catálogo de cuentas:', error)
      response.status(500).json({ message: 'No fue posible consultar el catálogo de cuentas.' })
    }
  },
)

/* ============================================================
   CUENTAS (POST / PATCH / DEACTIVATE)
   ============================================================ */

app.post(
  '/api/companies/:companyId/accounts',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const draft = parseAccountDraft(request.body)
    if (companyId === null || draft === null) {
      response.status(400).json({ message: 'Revisa los datos de la cuenta y su cuenta padre.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('parent_type', sql.Char(1), draft.parentType)
        .input('parent_id', sql.Int, draft.parentId)
        .input('codigo', sql.VarChar(20), draft.codigo)
        .input('nombre', sql.VarChar(150), draft.nombre)
        .input('clasificacion', sql.VarChar(20), draft.clasificacion)
        .input('naturaleza', sql.VarChar(15), draft.naturaleza)
        .input('permite_movimientos', sql.Bit, draft.permiteMovimientos)
        .query(
          `INSERT INTO CUENTA_PERSONALIZADA (
             id_empresa, id_cuenta_predeterminada_padre,
             id_cuenta_personalizada_padre, codigo, nombre,
             clasificacion, naturaleza, permite_movimientos
           )
           OUTPUT
             INSERTED.id_cuenta AS id,
             INSERTED.codigo, INSERTED.nombre, INSERTED.clasificacion,
             INSERTED.naturaleza, INSERTED.estado,
             INSERTED.permite_movimientos AS permiteMovimientos
           SELECT
             @id_empresa,
             CASE WHEN @parent_type = 'P' THEN @parent_id ELSE NULL END,
             CASE WHEN @parent_type = 'C' THEN @parent_id ELSE NULL END,
             @codigo, @nombre, @clasificacion, @naturaleza, @permite_movimientos
           WHERE EXISTS (
             SELECT 1 FROM EMPRESA E
             WHERE E.id_empresa = @id_empresa AND E.id_usuario = @id_usuario
           )
           AND (
             (@parent_type = 'P' AND EXISTS (
               SELECT 1 FROM CUENTA_PREDETERMINADA P
               WHERE P.id_cuenta = @parent_id AND P.estado = 'ACTIVA'
                 AND P.permite_movimientos = 0 AND P.clasificacion = @clasificacion
                 AND P.naturaleza = @naturaleza
             ))
             OR
             (@parent_type = 'C' AND EXISTS (
               SELECT 1 FROM CUENTA_PERSONALIZADA P
               WHERE P.id_cuenta = @parent_id AND P.id_empresa = @id_empresa
                 AND P.estado = 'ACTIVA' AND P.permite_movimientos = 0
                 AND P.clasificacion = @clasificacion AND P.naturaleza = @naturaleza
             ))
           )`,
        )

      if (result.recordset.length === 0) {
        response.status(400).json({
          message: 'La cuenta padre no existe, está inactiva o no coincide en clasificación y naturaleza.',
        })
        return
      }
      response.status(201).json(result.recordset[0])
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible crear la cuenta personalizada.')
    }
  },
)

app.patch(
  '/api/companies/:companyId/accounts/:accountId',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const accountId = parsePositiveId(request.params.accountId)
    const draft = parseAccountDraft(request.body)
    if (companyId === null || accountId === null || draft === null) {
      response.status(400).json({ message: 'Revisa los datos de la cuenta y su cuenta padre.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_cuenta', sql.Int, accountId)
        .input('parent_type', sql.Char(1), draft.parentType)
        .input('parent_id', sql.Int, draft.parentId)
        .input('codigo', sql.VarChar(20), draft.codigo)
        .input('nombre', sql.VarChar(150), draft.nombre)
        .input('clasificacion', sql.VarChar(20), draft.clasificacion)
        .input('naturaleza', sql.VarChar(15), draft.naturaleza)
        .input('permite_movimientos', sql.Bit, draft.permiteMovimientos)
        .query(
          `UPDATE CC
           SET id_cuenta_predeterminada_padre =
                 CASE WHEN @parent_type = 'P' THEN @parent_id ELSE NULL END,
               id_cuenta_personalizada_padre =
                 CASE WHEN @parent_type = 'C' THEN @parent_id ELSE NULL END,
               codigo = @codigo, nombre = @nombre,
               clasificacion = @clasificacion, naturaleza = @naturaleza,
               permite_movimientos = @permite_movimientos
           OUTPUT
             INSERTED.id_cuenta AS id, INSERTED.codigo, INSERTED.nombre,
             INSERTED.clasificacion, INSERTED.naturaleza, INSERTED.estado,
             INSERTED.permite_movimientos AS permiteMovimientos
           FROM CUENTA_PERSONALIZADA CC
           WHERE CC.id_cuenta = @id_cuenta AND CC.id_empresa = @id_empresa
             AND EXISTS (
               SELECT 1 FROM EMPRESA E
               WHERE E.id_empresa = @id_empresa AND E.id_usuario = @id_usuario
             )
             AND NOT (@parent_type = 'C' AND @parent_id = @id_cuenta)
             AND (
               (@parent_type = 'P' AND EXISTS (
                 SELECT 1 FROM CUENTA_PREDETERMINADA P
                 WHERE P.id_cuenta = @parent_id AND P.estado = 'ACTIVA'
                   AND P.permite_movimientos = 0 AND P.clasificacion = @clasificacion
                   AND P.naturaleza = @naturaleza
               ))
               OR
               (@parent_type = 'C' AND EXISTS (
                 SELECT 1 FROM CUENTA_PERSONALIZADA P
                 WHERE P.id_cuenta = @parent_id AND P.id_empresa = @id_empresa
                   AND P.estado = 'ACTIVA' AND P.permite_movimientos = 0
                   AND P.clasificacion = @clasificacion AND P.naturaleza = @naturaleza
               ))
             )`,
        )

      if (result.recordset.length === 0) {
        const ownedAccount = await connection
          .request()
          .input('id_usuario', sql.Int, request.authenticatedUserId!)
          .input('id_empresa', sql.Int, companyId)
          .input('id_cuenta', sql.Int, accountId)
          .query(
            `SELECT CC.id_cuenta
             FROM CUENTA_PERSONALIZADA CC
             INNER JOIN EMPRESA E ON E.id_empresa = CC.id_empresa
             WHERE CC.id_cuenta = @id_cuenta AND CC.id_empresa = @id_empresa
               AND E.id_usuario = @id_usuario`,
          )
        if (ownedAccount.recordset.length === 0) {
          response.status(404).json({ message: 'No se encontró la cuenta personalizada.' })
        } else {
          response.status(400).json({
            message: 'La cuenta padre no es válida o produciría una jerarquía inconsistente.',
          })
        }
        return
      }
      response.json(result.recordset[0])
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible actualizar la cuenta personalizada.')
    }
  },
)

app.post(
  '/api/companies/:companyId/accounts/:accountId/deactivate',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const accountId = parsePositiveId(request.params.accountId)
    if (companyId === null || accountId === null) {
      response.status(400).json({ message: 'La empresa o la cuenta seleccionada no son válidas.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const result = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_cuenta', sql.Int, accountId)
        .query(
          `UPDATE CC SET estado = 'INACTIVA'
           OUTPUT INSERTED.id_cuenta AS id
           FROM CUENTA_PERSONALIZADA CC
           INNER JOIN EMPRESA E ON E.id_empresa = CC.id_empresa
           WHERE CC.id_cuenta = @id_cuenta AND CC.id_empresa = @id_empresa
             AND CC.estado = 'ACTIVA' AND E.id_usuario = @id_usuario`,
        )

      if (result.recordset.length === 0) {
        const ownedAccount = await connection
          .request()
          .input('id_usuario', sql.Int, request.authenticatedUserId!)
          .input('id_empresa', sql.Int, companyId)
          .input('id_cuenta', sql.Int, accountId)
          .query<{ estado: string }>(
            `SELECT CC.estado
             FROM CUENTA_PERSONALIZADA CC
             INNER JOIN EMPRESA E ON E.id_empresa = CC.id_empresa
             WHERE CC.id_cuenta = @id_cuenta AND CC.id_empresa = @id_empresa
               AND E.id_usuario = @id_usuario`,
          )
        if (ownedAccount.recordset.length === 0) {
          response.status(404).json({ message: 'No se encontró la cuenta personalizada.' })
        } else {
          response.status(409).json({ message: 'La cuenta ya está inactiva.' })
        }
        return
      }
      response.json({ id: accountId, estado: 'INACTIVA' })
    } catch (error) {
      accountErrorResponse(error, response, 'No fue posible desactivar la cuenta personalizada.')
    }
  },
)

/* ============================================================
   LIBROS
   ============================================================ */

app.get('/api/companies/:companyId/books', authenticate, async (request, response) => {
  const companyId = parsePositiveId(request.params.companyId)
  if (companyId === null) {
    response.status(400).json({ message: 'La empresa seleccionada no es válida.' })
    return
  }

  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .input('id_empresa', sql.Int, companyId)
      .query<{
        id: number
        nombre: string
        tipo: string
        fechaInicio: string
        fechaFin: string
        estado: string
      }>(
        `SELECT L.id_libro AS id, L.nombre, L.tipo_libro AS tipo,
                L.fecha_inicio AS fechaInicio, L.fecha_fin AS fechaFin,
                L.estado AS estado
         FROM LIBRO L
         INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
         WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
         ORDER BY CASE WHEN L.estado = 'ABIERTO' THEN 0 ELSE 1 END,
                  L.fecha_inicio DESC, L.id_libro DESC`,
      )

    response.json(result.recordset)
  } catch (error) {
    console.error('Error al consultar libros contables:', error)
    response.status(500).json({ message: 'No fue posible consultar los períodos contables.' })
  }
})

app.post('/api/companies/:companyId/books', authenticate, async (request, response) => {
  const companyId = parsePositiveId(request.params.companyId)
  const body: unknown = request.body
  if (companyId === null || typeof body !== 'object' || body === null) {
    response.status(400).json({ message: 'Revisa la empresa y los datos del período.' })
    return
  }

  const { nombre, fechaInicio, fechaFin } = body as {
    nombre?: unknown
    fechaInicio?: unknown
    fechaFin?: unknown
  }
  const name = typeof nombre === 'string' ? nombre.trim() : ''
  const startDate = parseIsoDate(fechaInicio)
  const endDate = parseIsoDate(fechaFin)
  if (
    name.length === 0 || name.length > 150 ||
    startDate === null || endDate === null || startDate > endDate
  ) {
    response.status(400).json({
      message: 'Ingresa un nombre y un rango de fechas válido para el período.',
    })
    return
  }

  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .input('id_empresa', sql.Int, companyId)
      .input('nombre', sql.VarChar(150), name)
      .input('fecha_inicio', sql.Date, startDate)
      .input('fecha_fin', sql.Date, endDate)
      .query<{
        id: number
        nombre: string
        tipo: string
        fechaInicio: Date
        fechaFin: Date
        estado: string
      }>(
        `INSERT INTO dbo.LIBRO
           (id_empresa, nombre, tipo_libro, fecha_inicio, fecha_fin, estado)
         OUTPUT INSERTED.id_libro AS id, INSERTED.nombre,
                INSERTED.tipo_libro AS tipo,
                INSERTED.fecha_inicio AS fechaInicio,
                INSERTED.fecha_fin AS fechaFin, INSERTED.estado
         SELECT E.id_empresa, @nombre, 'DIARIO', @fecha_inicio, @fecha_fin, 'ABIERTO'
         FROM dbo.EMPRESA E
         WHERE E.id_empresa = @id_empresa AND E.id_usuario = @id_usuario`,
      )

    if (!result.recordset[0]) {
      response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
      return
    }
    response.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Error al registrar el período contable:', error)
    response.status(500).json({ message: 'No fue posible registrar el período contable.' })
  }
})

app.patch(
  '/api/companies/:companyId/books/:bookId',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    const body: unknown = request.body
    if (companyId === null || bookId === null || typeof body !== 'object' || body === null) {
      response.status(400).json({ message: 'Revisa la empresa y los datos del período.' })
      return
    }

    const { nombre, fechaInicio, fechaFin } = body as {
      nombre?: unknown
      fechaInicio?: unknown
      fechaFin?: unknown
    }
    const name = typeof nombre === 'string' ? nombre.trim() : ''
    const startDate = parseIsoDate(fechaInicio)
    const endDate = parseIsoDate(fechaFin)
    if (
      name.length === 0 || name.length > 150 ||
      startDate === null || endDate === null || startDate > endDate
    ) {
      response.status(400).json({
        message: 'Ingresa un nombre y un rango de fechas válido para el período.',
      })
      return
    }

    const transaction = new sql.Transaction(database)
    let transactionStarted = false
    try {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
      transactionStarted = true
      const ownedBook = await transaction
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query<{ id: number; estado: string }>(
          `SELECT L.id_libro AS id, L.estado
           FROM dbo.LIBRO L WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN dbo.EMPRESA E WITH (UPDLOCK, HOLDLOCK)
             ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro`,
        )
      const book = ownedBook.recordset[0]
      if (!book) {
        await transaction.rollback()
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }
      if (book.estado !== 'ABIERTO') {
        await transaction.rollback()
        response.status(400).json({ message: 'No se pueden editar los datos de un período cerrado.' })
        return
      }

      const outOfRangeEntries = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .input('fecha_inicio', sql.Date, startDate)
        .input('fecha_fin', sql.Date, endDate)
        .query<{ id: number }>(
          `SELECT TOP (1) P.id_partida AS id
           FROM dbo.PARTIDA P WITH (UPDLOCK, HOLDLOCK)
           WHERE P.id_libro = @id_libro
             AND (P.fecha < @fecha_inicio OR P.fecha > @fecha_fin)`,
        )
      if (outOfRangeEntries.recordset.length > 0) {
        await transaction.rollback()
        response.status(400).json({
          message: 'El nuevo rango dejaría partidas existentes fuera del período.',
        })
        return
      }

      const updatedBook = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .input('nombre', sql.VarChar(150), name)
        .input('fecha_inicio', sql.Date, startDate)
        .input('fecha_fin', sql.Date, endDate)
        .query(
          `UPDATE dbo.LIBRO
           SET nombre = @nombre, fecha_inicio = @fecha_inicio, fecha_fin = @fecha_fin
           OUTPUT INSERTED.id_libro AS id, INSERTED.nombre,
                  INSERTED.tipo_libro AS tipo,
                  INSERTED.fecha_inicio AS fechaInicio,
                  INSERTED.fecha_fin AS fechaFin, INSERTED.estado
           WHERE id_libro = @id_libro`,
        )
      await transaction.commit()
      response.json(updatedBook.recordset[0])
    } catch (error) {
      if (transactionStarted) await transaction.rollback()
      console.error('Error al actualizar el período contable:', error)
      response.status(500).json({ message: 'No fue posible actualizar el período contable.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/books/:bookId/close',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const ownedBook = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(`SELECT id_libro FROM LIBRO WHERE id_libro = @id_libro AND id_empresa = @id_empresa`)
      if (ownedBook.recordset.length === 0) {
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }

      await connection
        .request()
        .input('IdLibro', sql.Int, bookId)
        .execute('sp_CerrarPeriodo')

      const closedBook = await connection
        .request()
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT id_libro AS id, nombre, tipo_libro AS tipo,
                  fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, estado
           FROM LIBRO WHERE id_libro = @id_libro`,
        )
      response.json(closedBook.recordset[0])
    } catch (error) {
      const errorNumber =
        typeof error === 'object' && error !== null && 'number' in error
          ? Number(error.number)
          : null
      if (errorNumber !== null && errorNumber >= 50050 && errorNumber <= 50053) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'No se pudo cerrar el período.',
        })
        return
      }
      console.error('Error al cerrar el período contable:', error)
      response.status(500).json({ message: 'No fue posible cerrar el período contable.' })
    }
  },
)

/* ============================================================
   CATÁLOGO PARA LIBRO DIARIO
   ============================================================ */

app.get(
  '/api/companies/:companyId/books/:bookId/accounts',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      const result = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `WITH LibroAutorizado AS (
             SELECT L.id_empresa
             FROM LIBRO L
             INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
             WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
               AND L.id_libro = @id_libro
           ),
           Cuentas AS (
             SELECT CAST(CONCAT('P:', CP.id_cuenta) AS VARCHAR(32)) AS [key],
                    CAST('PREDETERMINADA' AS VARCHAR(20)) AS tipo,
                    CP.id_cuenta AS id, CP.codigo, CP.nombre,
                    CASE WHEN CP.id_cuenta_padre IS NULL THEN NULL
                         ELSE CAST(CONCAT('P:', CP.id_cuenta_padre) AS VARCHAR(32))
                    END AS parentKey,
                    CP.estado, CP.permite_movimientos AS permiteMovimientos
             FROM CUENTA_PREDETERMINADA CP CROSS JOIN LibroAutorizado
             UNION ALL
             SELECT CAST(CONCAT('C:', CC.id_cuenta) AS VARCHAR(32)),
                    CAST('PERSONALIZADA' AS VARCHAR(20)),
                    CC.id_cuenta, CC.codigo, CC.nombre,
                    CASE
                      WHEN CC.id_cuenta_personalizada_padre IS NOT NULL
                        THEN CAST(CONCAT('C:', CC.id_cuenta_personalizada_padre) AS VARCHAR(32))
                      WHEN CC.id_cuenta_predeterminada_padre IS NOT NULL
                        THEN CAST(CONCAT('P:', CC.id_cuenta_predeterminada_padre) AS VARCHAR(32))
                      ELSE NULL
                    END,
                    CC.estado, CC.permite_movimientos
             FROM CUENTA_PERSONALIZADA CC
             INNER JOIN LibroAutorizado ON LibroAutorizado.id_empresa = CC.id_empresa
           ),
           Arbol AS (
             SELECT C.[key], C.tipo, C.id, C.codigo, C.nombre, C.parentKey,
                    C.estado, C.permiteMovimientos, 0 AS profundidad,
                    CAST(CONCAT('/', C.[key], '/') AS VARCHAR(MAX)) AS recorrido
             FROM Cuentas C WHERE C.parentKey IS NULL
             UNION ALL
             SELECT Hija.[key], Hija.tipo, Hija.id, Hija.codigo, Hija.nombre,
                    Hija.parentKey, Hija.estado, Hija.permiteMovimientos,
                    Padre.profundidad + 1,
                    CAST(CONCAT(Padre.recorrido, Hija.[key], '/') AS VARCHAR(MAX))
             FROM Cuentas Hija
             INNER JOIN Arbol Padre ON Padre.[key] = Hija.parentKey
             WHERE Padre.profundidad < 100
               AND CHARINDEX(CONCAT('/', Hija.[key], '/'), Padre.recorrido) = 0
           )
           SELECT C.[key], C.tipo, C.id, C.codigo, C.nombre, C.parentKey,
                  C.estado, C.permiteMovimientos, COALESCE(A.profundidad, 0) AS profundidad
           FROM Cuentas C LEFT JOIN Arbol A ON A.[key] = C.[key]
           ORDER BY C.codigo, C.tipo
           OPTION (MAXRECURSION 100)`,
        )

      if (result.recordset.length === 0) {
        const ownedBook = await connection
          .request()
          .input('id_usuario', sql.Int, request.authenticatedUserId!)
          .input('id_empresa', sql.Int, companyId)
          .input('id_libro', sql.Int, bookId)
          .query(
            `SELECT L.id_libro FROM LIBRO L
             INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
             WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
               AND L.id_libro = @id_libro`,
          )
        if (ownedBook.recordset.length === 0) {
          response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
          return
        }
      }
      response.json(result.recordset)
    } catch (error) {
      console.error('Error al consultar el catálogo para el libro diario:', error)
      response.status(500).json({ message: 'No fue posible consultar el catálogo de cuentas.' })
    }
  },
)

/* ============================================================
   JOURNAL (GET)
   ============================================================ */

app.get(
  '/api/companies/:companyId/books/:bookId/journal',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    const fromDate = request.query.desde
    const toDate = request.query.hasta
    const numberValue = request.query.numero
    const dateFrom = fromDate === undefined ? null : parseIsoDate(fromDate)
    const dateTo = toDate === undefined ? null : parseIsoDate(toDate)
    const entryNumber =
      typeof numberValue === 'string' && /^\d+$/.test(numberValue)
        ? Number(numberValue)
        : null

    if (
      companyId === null || bookId === null ||
      (fromDate !== undefined && dateFrom === null) ||
      (toDate !== undefined && dateTo === null) ||
      (dateFrom && dateTo && dateFrom > dateTo) ||
      (numberValue !== undefined &&
        (entryNumber === null || !Number.isSafeInteger(entryNumber) || entryNumber < 1))
    ) {
      response.status(400).json({ message: 'Revisa los filtros de fecha y número de partida.' })
      return
    }

    try {
      const connection = await database.connect()
      const bookResult = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT L.id_libro AS id, L.nombre, L.fecha_inicio AS fechaInicio,
                  L.fecha_fin AS fechaFin, L.estado, E.nombre AS empresa
           FROM LIBRO L
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro`,
        )
      const book = bookResult.recordset[0]
      if (!book) {
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }

      const result = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .input('desde', sql.Date, dateFrom)
        .input('hasta', sql.Date, dateTo)
        .input('numero', sql.Int, entryNumber)
        .query(
          `SELECT P.id_partida AS id, P.numero_partida AS numero,
                  P.fecha, P.concepto,
                  M.id_movimiento AS movimientoId,
                  CASE WHEN M.id_cuenta_predeterminada IS NOT NULL
                       THEN 'PREDETERMINADA' ELSE 'PERSONALIZADA' END AS tipoCuenta,
                  COALESCE(CP.id_cuenta, CC.id_cuenta) AS cuentaId,
                  COALESCE(CP.codigo, CC.codigo) AS codigo,
                  COALESCE(CP.nombre, CC.nombre) AS cuenta,
                  CASE
                    WHEN CP.id_cuenta_padre IS NOT NULL THEN CONCAT('P:', CP.id_cuenta_padre)
                    WHEN CC.id_cuenta_personalizada_padre IS NOT NULL
                      THEN CONCAT('C:', CC.id_cuenta_personalizada_padre)
                    WHEN CC.id_cuenta_predeterminada_padre IS NOT NULL
                      THEN CONCAT('P:', CC.id_cuenta_predeterminada_padre)
                    ELSE NULL
                  END AS parentKey,
                  M.parcial, M.debe, M.haber
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           INNER JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN CUENTA_PERSONALIZADA CC ON CC.id_cuenta = M.id_cuenta_personalizada
            AND CC.id_empresa = E.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro AND P.estado = 'CONTABILIZADA'
             AND (@desde IS NULL OR P.fecha >= @desde)
             AND (@hasta IS NULL OR P.fecha <= @hasta)
             AND (@numero IS NULL OR P.numero_partida = @numero)
           ORDER BY P.fecha, P.numero_partida, M.id_movimiento`,
        )

      const entries = new Map<number, {
        id: number; numero: number; fecha: Date; concepto: string;
        lines: {
          id: number; accountKey: string; tipoCuenta: string; cuentaId: number;
          codigo: string; cuenta: string; parentKey: string | null;
          parcial: number | null; debe: number; haber: number;
        }[]
      }>()

      for (const row of result.recordset) {
        let entry = entries.get(row.id)
        if (!entry) {
          entry = { id: row.id, numero: row.numero, fecha: row.fecha, concepto: row.concepto, lines: [] }
          entries.set(row.id, entry)
        }
        entry.lines.push({
          id: row.movimientoId,
          accountKey: `${row.tipoCuenta === 'PREDETERMINADA' ? 'P' : 'C'}:${row.cuentaId}`,
          tipoCuenta: row.tipoCuenta,
          cuentaId: row.cuentaId,
          codigo: row.codigo,
          cuenta: row.cuenta,
          parentKey: row.parentKey,
          parcial: row.parcial === null ? null : Number(row.parcial),
          debe: Number(row.debe),
          haber: Number(row.haber),
        })
      }

      const orderedEntries = [...entries.values()]
      response.json({
        book: {
          id: book.id, nombre: book.nombre,
          fechaInicio: book.fechaInicio, fechaFin: book.fechaFin,
          estado: book.estado, empresa: book.empresa,
        },
        entries: orderedEntries,
        totals: {
          partidas: orderedEntries.length,
          debe: orderedEntries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.debe, 0), 0),
          haber: orderedEntries.reduce((t, e) => t + e.lines.reduce((s, l) => s + l.haber, 0), 0),
        },
      })
    } catch (error) {
      console.error('Error al consultar el libro diario:', error)
      response.status(500).json({ message: 'No fue posible consultar el libro diario.' })
    }
  },
)

/* ============================================================
   ENTRY CON IVA AUTOMÁTICO
   ============================================================ */

app.post(
  '/api/companies/:companyId/books/:bookId/entries',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    const body: unknown = request.body
    if (companyId === null || bookId === null || typeof body !== 'object' || body === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    const {
      fecha, concepto, lineas,
      tipoOperacion, idTercero, idDte,
      baseGravada, calcularIvaAutomatico,
    } = body as {
      fecha?: unknown
      concepto?: unknown
      lineas?: unknown
      tipoOperacion?: unknown
      idTercero?: unknown
      idDte?: unknown
      baseGravada?: unknown
      calcularIvaAutomatico?: unknown
    }

    const entryDate = parseIsoDate(fecha)
    const description = typeof concepto === 'string' ? concepto.trim() : ''
    if (
      entryDate === null || description.length === 0 || description.length > 250 ||
      !Array.isArray(lineas) || lineas.length < 2
    ) {
      response.status(400).json({
        message: 'La partida requiere una fecha válida, un concepto y al menos dos movimientos.',
      })
      return
    }

    // Validar tipo de operación si viene
    const tipoOp =
      tipoOperacion === 'COMPRA' || tipoOperacion === 'VENTA' || tipoOperacion === 'AJUSTE'
        ? tipoOperacion
        : null
    if (tipoOperacion !== undefined && tipoOperacion !== null && tipoOp === null) {
      response.status(400).json({ message: 'El tipo de operación no es válido.' })
      return
    }

    // Validar idTercero si viene
    const terceroId =
      idTercero === null || idTercero === undefined
        ? null
        : typeof idTercero === 'number' && Number.isSafeInteger(idTercero) && idTercero > 0
          ? idTercero
          : NaN
    if (terceroId !== null && !Number.isSafeInteger(terceroId)) {
      response.status(400).json({ message: 'El tercero seleccionado no es válido.' })
      return
    }

    // Validar idDte si viene
    const dteId =
      idDte === null || idDte === undefined
        ? null
        : typeof idDte === 'number' && Number.isSafeInteger(idDte) && idDte > 0
          ? idDte
          : NaN
    if (dteId !== null && !Number.isSafeInteger(dteId)) {
      response.status(400).json({ message: 'El DTE seleccionado no es válido.' })
      return
    }

    const baseCents = baseGravada === undefined || baseGravada === null || baseGravada === ''
      ? null
      : parseCents(baseGravada)
    if (baseGravada !== undefined && baseGravada !== null && baseGravada !== '' && baseCents === null) {
      response.status(400).json({ message: 'La base gravada no es válida.' })
      return
    }

    const autoIva = calcularIvaAutomatico === true

    const normalizedLines: {
      accountId: number
      accountType: 'PREDETERMINADA' | 'PERSONALIZADA'
      partialCents: number | null
      debitCents: number
      creditCents: number
      baseGravadaCents: number | null
      idTercero: number | null
    }[] = []

    for (const line of lineas) {
      if (typeof line !== 'object' || line === null) {
        response.status(400).json({ message: 'Revisa las cuentas y los importes de cada movimiento.' })
        return
      }
      const item = line as {
        cuentaId?: unknown; tipoCuenta?: unknown; parcial?: unknown;
        debe?: unknown; haber?: unknown;
      }
      const accountId =
        typeof item.cuentaId === 'number' && Number.isSafeInteger(item.cuentaId)
          ? item.cuentaId
          : null
      const accountType = item.tipoCuenta
      const debitCents = parseCents(item.debe)
      const creditCents = parseCents(item.haber)
      const partialCents =
        item.parcial === '' || item.parcial === null || item.parcial === undefined
          ? null
          : parseCents(item.parcial)

      if (
        accountId === null || accountId < 1 ||
        (accountType !== 'PREDETERMINADA' && accountType !== 'PERSONALIZADA') ||
        debitCents === null || creditCents === null ||
        (item.parcial !== '' && item.parcial !== null && item.parcial !== undefined &&
          partialCents === null) ||
        ((debitCents > 0) === (creditCents > 0))
      ) {
        response.status(400).json({
          message: 'Cada movimiento debe tener una cuenta y un importe positivo en Debe o Haber.',
        })
        return
      }

      normalizedLines.push({
        accountId, accountType, partialCents, debitCents, creditCents,
        baseGravadaCents: null,
        idTercero: terceroId,
      })
    }

    // Cálculo automático de IVA
    if (autoIva) {
      if (baseCents === null || baseCents <= 0) {
        response.status(400).json({
          message: 'Para el cálculo automático de IVA debes indicar la base gravada.',
        })
        return
      }
      if (tipoOp === null) {
        response.status(400).json({
          message: 'Para el cálculo automático de IVA debes indicar el tipo de operación (COMPRA o VENTA).',
        })
        return
      }
      const ivaCents = Math.round(baseCents * 0.13)
      if (tipoOp === 'COMPRA') {
        // Buscar cuenta 110801 IVA Crédito
        const ivaAccount = await database.connect().then((c) =>
          c.request().query<{ id: number }>(
            `SELECT id_cuenta AS id FROM CUENTA_PREDETERMINADA
             WHERE codigo = '110801' AND estado = 'ACTIVA' AND permite_movimientos = 1`,
          ),
        )
        const ivaAccountId = ivaAccount.recordset[0]?.id
        if (!ivaAccountId) {
          response.status(400).json({ message: 'No existe la cuenta 110801 (IVA Crédito Fiscal) en el catálogo.' })
          return
        }
        normalizedLines.push({
          accountId: ivaAccountId, accountType: 'PREDETERMINADA',
          partialCents: null, debitCents: ivaCents, creditCents: 0,
          baseGravadaCents: baseCents,
          idTercero: terceroId,
        })
        if (dteId === null) {
          response.status(400).json({
            message: 'Las compras con IVA Crédito requieren un DTE registrado del proveedor.',
          })
          return
        }
      } else if (tipoOp === 'VENTA') {
        const ivaAccount = await database.connect().then((c) =>
          c.request().query<{ id: number }>(
            `SELECT id_cuenta AS id FROM CUENTA_PREDETERMINADA
             WHERE codigo = '210801' AND estado = 'ACTIVA' AND permite_movimientos = 1`,
          ),
        )
        const ivaAccountId = ivaAccount.recordset[0]?.id
        if (!ivaAccountId) {
          response.status(400).json({ message: 'No existe la cuenta 210801 (IVA Débito Fiscal) en el catálogo.' })
          return
        }
        normalizedLines.push({
          accountId: ivaAccountId, accountType: 'PREDETERMINADA',
          partialCents: null, debitCents: 0, creditCents: ivaCents,
          baseGravadaCents: baseCents,
          idTercero: terceroId,
        })

        // Retención 1% si aplica
        if (terceroId !== null) {
          const info = await database.connect().then((c) =>
            c.request()
              .input('id_empresa', sql.Int, companyId)
              .input('id_tercero', sql.Int, terceroId)
              .query<{
                empresaTipo: string
                terceroTipo: string
              }>(
                `SELECT E.tipo_contribuyente AS empresaTipo,
                        T.tipo_contribuyente AS terceroTipo
                 FROM EMPRESA E, TERCERO T
                 WHERE E.id_empresa = @id_empresa AND T.id_tercero = @id_tercero`,
              ),
          )
          const infoRow = info.recordset[0]
          const empresaEsPequenoMediano =
            infoRow?.empresaTipo === 'PEQUENO' || infoRow?.empresaTipo === 'MEDIANO'
          const terceroEsGranContribuyente = infoRow?.terceroTipo === 'GRAN_CONTRIBUYENTE'
          if (empresaEsPequenoMediano && terceroEsGranContribuyente) {
            const retencionCents = Math.round(baseCents * 0.01)
            const retAccount = await database.connect().then((c) =>
              c.request().query<{ id: number }>(
                `SELECT id_cuenta AS id FROM CUENTA_PREDETERMINADA
                 WHERE codigo = '110901' AND estado = 'ACTIVA' AND permite_movimientos = 1`,
              ),
            )
            const retAccountId = retAccount.recordset[0]?.id
            if (retAccountId) {
              normalizedLines.push({
                accountId: retAccountId, accountType: 'PREDETERMINADA',
                partialCents: null, debitCents: retencionCents, creditCents: 0,
                baseGravadaCents: baseCents,
                idTercero: terceroId,
              })
            }
          }
        }
      }
    }

    const totalDebitCents = normalizedLines.reduce((sum, l) => sum + l.debitCents, 0)
    const totalCreditCents = normalizedLines.reduce((sum, l) => sum + l.creditCents, 0)
    if (totalDebitCents !== totalCreditCents) {
      response.status(400).json({
        message: `La partida no está cuadrada. Debe ${(totalDebitCents / 100).toFixed(2)} vs Haber ${(totalCreditCents / 100).toFixed(2)}.`,
      })
      return
    }

    const transaction = new sql.Transaction(database)
    try {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE)
      const ownedBook = await transaction
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query<{ id: number; estado: string; fechaInicio: Date; fechaFin: Date }>(
          `SELECT L.id_libro AS id, L.estado, L.fecha_inicio AS fechaInicio, L.fecha_fin AS fechaFin
           FROM LIBRO L WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN EMPRESA E WITH (UPDLOCK, HOLDLOCK) ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro`,
        )
      const book = ownedBook.recordset[0]
      if (!book) {
        await transaction.rollback()
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }

      const isoEntryDate = entryDate.toISOString().slice(0, 10)
      const isoStartDate = new Date(book.fechaInicio).toISOString().slice(0, 10)
      const isoEndDate = new Date(book.fechaFin).toISOString().slice(0, 10)
      if (isoEntryDate < isoStartDate || isoEntryDate > isoEndDate) {
        await transaction.rollback()
        response.status(400).json({ message: 'La fecha debe estar dentro del período contable seleccionado.' })
        return
      }
      if (book.estado !== 'ABIERTO') {
        await transaction.rollback()
        response.status(400).json({ message: 'No se puede registrar una partida en un período cerrado.' })
        return
      }

      for (const line of normalizedLines) {
        const accountQuery = line.accountType === 'PREDETERMINADA'
          ? transaction.request().input('id_cuenta', sql.Int, line.accountId).query<{ id_cuenta: number }>(
            `SELECT id_cuenta FROM CUENTA_PREDETERMINADA
               WHERE id_cuenta = @id_cuenta AND estado = 'ACTIVA' AND permite_movimientos = 1`,
          )
          : transaction.request()
            .input('id_cuenta', sql.Int, line.accountId)
            .input('id_empresa', sql.Int, companyId)
            .query<{ id_cuenta: number }>(
              `SELECT id_cuenta FROM CUENTA_PERSONALIZADA
                 WHERE id_cuenta = @id_cuenta AND id_empresa = @id_empresa
                   AND estado = 'ACTIVA' AND permite_movimientos = 1`,
            )
        const account = await accountQuery
        if (account.recordset.length === 0) {
          await transaction.rollback()
          response.status(400).json({
            message: 'Una de las cuentas seleccionadas no está disponible para movimientos.',
          })
          return
        }
      }

      const nextNumber = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .query<{ numero: number }>(
          `SELECT COALESCE(MAX(numero_partida), 0) + 1 AS numero
           FROM PARTIDA WITH (UPDLOCK, HOLDLOCK) WHERE id_libro = @id_libro`,
        )
      const entryNumber = nextNumber.recordset[0].numero

      const insertedEntry = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .input('numero_partida', sql.Int, entryNumber)
        .input('fecha', sql.Date, entryDate)
        .input('concepto', sql.VarChar(250), description)
        .input('tipo_operacion', sql.VarChar(10), tipoOp)
        .input('id_dte', sql.Int, dteId)
        .query<{ id: number }>(
          `INSERT INTO PARTIDA (id_libro, numero_partida, fecha, concepto, estado, tipo_operacion, id_dte)
           OUTPUT INSERTED.id_partida AS id
           VALUES (@id_libro, @numero_partida, @fecha, @concepto, 'BORRADOR', @tipo_operacion, @id_dte)`,
        )
      const entryId = insertedEntry.recordset[0]?.id
      if (!entryId) throw new Error('No fue posible crear el borrador de la partida.')

      for (const line of normalizedLines) {
        await transaction
          .request()
          .input('id_cuenta_predeterminada', sql.Int,
            line.accountType === 'PREDETERMINADA' ? line.accountId : null)
          .input('id_cuenta_personalizada', sql.Int,
            line.accountType === 'PERSONALIZADA' ? line.accountId : null)
          .input('id_tercero', sql.Int, line.idTercero)
          .input('parcial', sql.Decimal(12, 2),
            line.partialCents === null ? null : line.partialCents / 100)
          .input('base_gravada', sql.Decimal(12, 2),
            line.baseGravadaCents === null ? null : line.baseGravadaCents / 100)
          .input('debe', sql.Decimal(12, 2), line.debitCents / 100)
          .input('haber', sql.Decimal(12, 2), line.creditCents / 100)
          .input('id_partida', sql.Int, entryId)
          .query(
            `INSERT INTO MOVIMIENTO (
               id_partida, id_cuenta_predeterminada, id_cuenta_personalizada,
               id_tercero, parcial, base_gravada, debe, haber
             )
             VALUES (
               @id_partida, @id_cuenta_predeterminada, @id_cuenta_personalizada,
               @id_tercero, @parcial, @base_gravada, @debe, @haber
             )`,
          )
      }

      if (dteId !== null) {
        await transaction
          .request()
          .input('id_dte', sql.Int, dteId)
          .input('id_partida', sql.Int, entryId)
          .query(`UPDATE DTE SET id_partida = @id_partida WHERE id_dte = @id_dte`)
      }

      await transaction
        .request()
        .input('IdPartida', sql.Int, entryId)
        .execute('dbo.sp_ContabilizarPartida')
      await transaction.commit()

      response.status(201).json({
        id: entryId, numero: entryNumber, fecha: isoEntryDate,
        concepto: description,
        totalDebe: totalDebitCents / 100,
        totalHaber: totalCreditCents / 100,
        estado: 'CONTABILIZADA',
      })
    } catch (error) {
      try { await transaction.rollback() } catch (rollbackError) {
        console.error('Error al revertir el registro de la partida:', rollbackError)
      }

      const errorNumber =
        typeof error === 'object' && error !== null && 'number' in error
          ? Number(error.number)
          : null
      if (errorNumber !== null && errorNumber >= 50010 && errorNumber <= 50019) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'La partida no pudo contabilizarse.',
        })
        return
      }
      console.error('Error al registrar la partida del libro diario:', error)
      response.status(500).json({ message: 'No fue posible registrar y contabilizar la partida.' })
    }
  },
)

/* ============================================================
   ANULAR PARTIDA
   ============================================================ */

app.post(
  '/api/companies/:companyId/books/:bookId/entries/:entryId/anular',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    const entryId = parsePositiveId(request.params.entryId)
    const body: unknown = request.body
    if (companyId === null || bookId === null || entryId === null || typeof body !== 'object' || body === null) {
      response.status(400).json({ message: 'La partida o el motivo no son válidos.' })
      return
    }
    const { motivo } = body as { motivo?: unknown }
    const motivoTexto = typeof motivo === 'string' ? motivo.trim() : ''
    if (motivoTexto.length === 0 || motivoTexto.length > 250) {
      response.status(400).json({ message: 'Indica un motivo de anulación (máx. 250 caracteres).' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }
      const ownedEntry = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .input('id_partida', sql.Int, entryId)
        .query(
          `SELECT P.id_partida FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           WHERE P.id_partida = @id_partida AND L.id_libro = @id_libro AND L.id_empresa = @id_empresa`,
        )
      if (ownedEntry.recordset.length === 0) {
        response.status(404).json({ message: 'No se encontró la partida.' })
        return
      }
      await connection
        .request()
        .input('IdPartida', sql.Int, entryId)
        .input('Motivo', sql.VarChar(250), motivoTexto)
        .execute('sp_AnularPartida')
      response.json({ id: entryId, estado: 'ANULADA', motivo: motivoTexto })
    } catch (error) {
      const errorNumber =
        typeof error === 'object' && error !== null && 'number' in error
          ? Number(error.number)
          : null
      if (errorNumber !== null && errorNumber >= 50040 && errorNumber <= 50042) {
        response.status(400).json({
          message: error instanceof Error ? error.message : 'No se pudo anular la partida.',
        })
        return
      }
      console.error('Error al anular la partida:', error)
      response.status(500).json({ message: 'No fue posible anular la partida.' })
    }
  },
)

/* ============================================================
   DASHBOARD CON WIDGETS DE IVA
   ============================================================ */

app.get(
  '/api/companies/:companyId/books/:bookId/dashboard',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      const ownedBook = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT L.id_libro FROM LIBRO L
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa AND L.id_libro = @id_libro`,
        )
      if (ownedBook.recordset.length === 0) {
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }

      const summary = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT
             COALESCE(SUM(CASE WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'ACTIVO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber ELSE M.haber - M.debe END
               ELSE 0 END), 0) AS assets,
             COALESCE(SUM(CASE WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'PASIVO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber ELSE M.haber - M.debe END
               ELSE 0 END), 0) AS liabilities,
             COALESCE(SUM(CASE WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'PATRIMONIO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber ELSE M.haber - M.debe END
               ELSE 0 END), 0) AS equity,
             COUNT(DISTINCT P.id_partida) AS entryCount,
             COALESCE(SUM(M.debe), 0) AS totalDebe,
             COALESCE(SUM(M.haber), 0) AS totalHaber,
             COALESCE(SUM(CASE WHEN CP.codigo = '210801' THEN M.haber - M.debe ELSE 0 END), 0) AS ivaDebito,
             COALESCE(SUM(CASE WHEN CP.codigo = '110801' THEN M.debe - M.haber ELSE 0 END), 0) AS ivaCredito,
             COALESCE(SUM(CASE WHEN CP.codigo = '110901' THEN M.debe - M.haber ELSE 0 END), 0) AS ivaPercibido
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           LEFT JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN CUENTA_PERSONALIZADA CC ON CC.id_cuenta = M.id_cuenta_personalizada
            AND CC.id_empresa = E.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro AND P.estado = 'CONTABILIZADA'`,
        )

      const recent = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT TOP (5) P.id_partida AS id, P.numero_partida AS numero, P.fecha, P.concepto
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro AND P.estado = 'CONTABILIZADA'
           ORDER BY P.fecha DESC, P.numero_partida DESC`,
        )

      const row = summary.recordset[0]
      const amount = (v: number | string) => Number(v)
      const totalDebe = amount(row.totalDebe)
      const totalHaber = amount(row.totalHaber)
      const balanceDifference = totalDebe - totalHaber

      const ivaDebito = amount(row.ivaDebito)
      const ivaCredito = amount(row.ivaCredito)
      const ivaPercibido = amount(row.ivaPercibido)
      const ivaNeto = ivaDebito - ivaCredito - ivaPercibido

      response.json({
        assets: amount(row.assets),
        liabilities: amount(row.liabilities),
        equity: amount(row.equity),
        entryCount: row.entryCount,
        totalDebe, totalHaber, balanceDifference,
        balanced: Math.abs(balanceDifference) < 0.01,
        iva: {
          debito: ivaDebito,
          credito: ivaCredito,
          percibido: ivaPercibido,
          aPagar: ivaNeto > 0 ? ivaNeto : 0,
          remanente: ivaNeto < 0 ? Math.abs(ivaNeto) : 0,
        },
        recentEntries: recent.recordset,
      })
    } catch (error) {
      console.error('Error al consultar el dashboard contable:', error)
      response.status(500).json({ message: 'No fue posible consultar el dashboard.' })
    }
  },
)

/* ============================================================
   DECLARACIÓN IVA (F-07)
   ============================================================ */

app.get(
  '/api/companies/:companyId/books/:bookId/declaracion-iva',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const bookInfo = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query<{ fechaInicio: Date; fechaFin: Date; estado: string }>(
          `SELECT fecha_inicio AS fechaInicio, fecha_fin AS fechaFin, estado
           FROM LIBRO WHERE id_libro = @id_libro AND id_empresa = @id_empresa`,
        )
      const book = bookInfo.recordset[0]
      if (!book) {
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }

      const periodo = new Date(book.fechaInicio).toISOString().slice(0, 7)

      const existing = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('periodo', sql.VarChar(7), periodo)
        .query(
          `SELECT id_declaracion AS id, periodo, debito_fiscal AS debitoFiscal,
                  credito_fiscal AS creditoFiscal, iva_retenido AS ivaRetenido,
                  iva_percibido AS ivaPercibido, remanente_anterior AS remanenteAnterior,
                  iva_a_pagar AS ivaAPagar, remanente_siguiente AS remanenteSiguiente,
                  estado, fecha_presentacion AS fechaPresentacion
           FROM DECLARACION_IVA WHERE id_empresa = @id_empresa AND periodo = @periodo`,
        )

      if (existing.recordset[0]) {
        response.json({ ...existing.recordset[0], calculada: false })
        return
      }

      const summary = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT
             COALESCE(SUM(CASE WHEN CP.codigo = '210801' THEN M.haber - M.debe ELSE 0 END), 0) AS debitoFiscal,
             COALESCE(SUM(CASE WHEN CP.codigo = '110801' THEN M.debe - M.haber ELSE 0 END), 0) AS creditoFiscal,
             COALESCE(SUM(CASE WHEN CP.codigo = '110901' THEN M.debe - M.haber ELSE 0 END), 0) AS ivaPercibido
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           WHERE L.id_empresa = @id_empresa AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA'`,
        )
      const row = summary.recordset[0]
      const debito = Number(row.debitoFiscal)
      const credito = Number(row.creditoFiscal)
      const percibido = Number(row.ivaPercibido)
      const neto = debito - credito - percibido
      const ivaAPagar = neto > 0 ? neto : 0
      const remanenteSiguiente = neto < 0 ? Math.abs(neto) : 0

      response.json({
        periodo,
        debitoFiscal: debito,
        creditoFiscal: credito,
        ivaRetenido: 0,
        ivaPercibido: percibido,
        remanenteAnterior: 0,
        ivaAPagar,
        remanenteSiguiente,
        estado: 'BORRADOR',
        fechaPresentacion: null,
        calculada: true,
      })
    } catch (error) {
      console.error('Error al calcular declaración IVA:', error)
      response.status(500).json({ message: 'No fue posible calcular la declaración de IVA.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/books/:bookId/declaracion-iva',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const bookInfo = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query<{ fechaInicio: Date }>(
          `SELECT fecha_inicio AS fechaInicio FROM LIBRO
           WHERE id_libro = @id_libro AND id_empresa = @id_empresa`,
        )
      const book = bookInfo.recordset[0]
      if (!book) {
        response.status(404).json({ message: 'No se encontró el período contable seleccionado.' })
        return
      }
      const periodo = new Date(book.fechaInicio).toISOString().slice(0, 7)

      const summary = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT
             COALESCE(SUM(CASE WHEN CP.codigo = '210801' THEN M.haber - M.debe ELSE 0 END), 0) AS debitoFiscal,
             COALESCE(SUM(CASE WHEN CP.codigo = '110801' THEN M.debe - M.haber ELSE 0 END), 0) AS creditoFiscal,
             COALESCE(SUM(CASE WHEN CP.codigo = '110901' THEN M.debe - M.haber ELSE 0 END), 0) AS ivaPercibido
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           WHERE L.id_empresa = @id_empresa AND L.id_libro = @id_libro AND P.estado = 'CONTABILIZADA'`,
        )
      const row = summary.recordset[0]
      const debito = Number(row.debitoFiscal)
      const credito = Number(row.creditoFiscal)
      const percibido = Number(row.ivaPercibido)
      const neto = debito - credito - percibido
      const ivaAPagar = neto > 0 ? neto : 0
      const remanenteSiguiente = neto < 0 ? Math.abs(neto) : 0

      const inserted = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .input('periodo', sql.VarChar(7), periodo)
        .input('debito', sql.Decimal(12, 2), debito)
        .input('credito', sql.Decimal(12, 2), credito)
        .input('percibido', sql.Decimal(12, 2), percibido)
        .input('ivaAPagar', sql.Decimal(12, 2), ivaAPagar)
        .input('remanente', sql.Decimal(12, 2), remanenteSiguiente)
        .query(
          `INSERT INTO DECLARACION_IVA
             (id_empresa, id_libro, periodo, debito_fiscal, credito_fiscal,
              iva_retenido, iva_percibido, remanente_anterior, iva_a_pagar, remanente_siguiente, estado)
           OUTPUT INSERTED.id_declaracion AS id, INSERTED.periodo,
                  INSERTED.debito_fiscal AS debitoFiscal, INSERTED.credito_fiscal AS creditoFiscal,
                  INSERTED.iva_a_pagar AS ivaAPagar, INSERTED.remanente_siguiente AS remanenteSiguiente,
                  INSERTED.estado
           VALUES
             (@id_empresa, @id_libro, @periodo, @debito, @credito,
              0, @percibido, 0, @ivaAPagar, @remanente, 'BORRADOR')`,
        )

      response.status(201).json(inserted.recordset[0])
    } catch (error) {
      const errorNumber =
        typeof error === 'object' && error !== null && 'number' in error
          ? Number(error.number)
          : null
      if (errorNumber === 2601 || errorNumber === 2627) {
        response.status(409).json({ message: 'Ya existe una declaración de IVA para este período.' })
        return
      }
      console.error('Error al generar declaración IVA:', error)
      response.status(500).json({ message: 'No fue posible generar la declaración de IVA.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/books/:bookId/declaracion-iva/presentar',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }
      const result = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `UPDATE DECLARACION_IVA
           SET estado = 'PRESENTADA', fecha_presentacion = SYSDATETIME()
           OUTPUT INSERTED.id_declaracion AS id, INSERTED.periodo, INSERTED.estado,
                  INSERTED.fecha_presentacion AS fechaPresentacion
           WHERE id_empresa = @id_empresa AND id_libro = @id_libro AND estado = 'BORRADOR'`,
        )
      if (result.recordset.length === 0) {
        response.status(404).json({ message: 'No existe declaración en borrador para este período.' })
        return
      }
      response.json(result.recordset[0])
    } catch (error) {
      console.error('Error al presentar declaración IVA:', error)
      response.status(500).json({ message: 'No fue posible presentar la declaración de IVA.' })
    }
  },
)

/* ============================================================
   LIBRO IVA
   ============================================================ */

app.get(
  '/api/companies/:companyId/books/:bookId/libro-iva',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }

    try {
      const connection = await database.connect()
      if (!await userOwnsCompany(connection, request.authenticatedUserId!, companyId)) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const ventas = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT P.id_partida AS idPartida, P.fecha, P.numero_partida AS numeroPartida,
                  P.concepto,
                  COALESCE(T.nombre, 'Consumidor Final') AS tercero,
                  COALESCE(T.nit, '') AS nit,
                  M.base_gravada AS baseGravada,
                  CASE WHEN CP.codigo = '210801' THEN M.haber ELSE 0 END AS ivaDebito,
                  (M.debe + M.haber) AS total
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN TERCERO T ON T.id_tercero = M.id_tercero
           WHERE L.id_empresa = @id_empresa AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA' AND P.tipo_operacion = 'VENTA'
           ORDER BY P.fecha, P.numero_partida`,
        )

      const compras = await connection
        .request()
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query(
          `SELECT P.id_partida AS idPartida, P.fecha, P.numero_partida AS numeroPartida,
                  P.concepto,
                  COALESCE(T.nombre, 'Proveedor') AS tercero,
                  COALESCE(T.nit, '') AS nit,
                  D.numero_control AS numeroControl,
                  D.codigo_generacion AS codigoGeneracion,
                  M.base_gravada AS baseGravada,
                  CASE WHEN CP.codigo = '110801' THEN M.debe ELSE 0 END AS ivaCredito,
                  (M.debe + M.haber) AS total
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN TERCERO T ON T.id_tercero = M.id_tercero
           LEFT JOIN DTE D ON D.id_dte = P.id_dte
           WHERE L.id_empresa = @id_empresa AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA' AND P.tipo_operacion = 'COMPRA'
           ORDER BY P.fecha, P.numero_partida`,
        )

      response.json({
        ventas: ventas.recordset,
        compras: compras.recordset,
      })
    } catch (error) {
      console.error('Error al consultar libro IVA:', error)
      response.status(500).json({ message: 'No fue posible consultar el libro de IVA.' })
    }
  },
)

app.get(
  '/api/reportes/mayor',
  authenticate,
  async (request, response) => {
    const fechaInicio = parseIsoDate(request.query.fecha_inicio)
    const fechaFin = parseIsoDate(request.query.fecha_fin)
    if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
      response.status(400).json({ message: 'Revisa las fechas del período.' })
      return
    }

    const rawEmpresa = request.query.id_empresa
    const rawCuenta = request.query.id_cuenta
    const companyId =
      rawEmpresa === undefined
        ? null
        : typeof rawEmpresa === 'string'
          ? parsePositiveId(rawEmpresa)
          : null
    const accountId =
      rawCuenta === undefined
        ? null
        : typeof rawCuenta === 'string'
          ? parsePositiveId(rawCuenta)
          : null

    if (
      (rawEmpresa !== undefined && companyId === null) ||
      (rawCuenta !== undefined && accountId === null)
    ) {
      response.status(400).json({ message: 'La empresa o la cuenta seleccionada no son válidas.' })
      return
    }

    try {
      const connection = await database.connect()
      if (
        companyId !== null &&
        !(await userOwnsCompany(connection, request.authenticatedUserId!, companyId))
      ) {
        response.status(404).json({ message: 'No se encontró la empresa seleccionada.' })
        return
      }

      const companyFilter = companyId === null ? '' : 'AND E.id_empresa = @id_empresa'
      const accountFilter =
        accountId === null
          ? ''
          : 'AND (M.id_cuenta_predeterminada = @id_cuenta OR M.id_cuenta_personalizada = @id_cuenta)'

      const mayorRequest = connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('fecha_inicio', sql.Date, fechaInicio)
        .input('fecha_fin', sql.Date, fechaFin)
      if (companyId !== null) mayorRequest.input('id_empresa', sql.Int, companyId)
      if (accountId !== null) mayorRequest.input('id_cuenta', sql.Int, accountId)

      type MayorRow = {
        tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
        idCuenta: number
        codigo: string
        nombre: string
        naturaleza: 'DEUDORA' | 'ACREEDORA'
        saldoInicial: number | string
        totalDebe: number | string
        totalHaber: number | string
        saldoFinal: number | string
      }

      const result = await mayorRequest.query<MayorRow>(
        `WITH Base AS (
           SELECT
             M.id_cuenta_predeterminada,
             M.id_cuenta_personalizada,
             M.debe,
             M.haber,
             P.fecha,
             E.id_empresa
           FROM MOVIMIENTO M
           INNER JOIN PARTIDA P ON P.id_partida = M.id_partida
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND P.estado = 'CONTABILIZADA'
             AND P.fecha <= @fecha_fin
             ${companyFilter}
             ${accountFilter}
         ),
         Movimientos AS (
           SELECT
             'PREDETERMINADA' AS tipoCuenta,
             B.id_cuenta_predeterminada AS idCuenta,
             CP.codigo,
             CP.nombre,
             CP.naturaleza,
             B.fecha,
             B.debe,
             B.haber
           FROM Base B
           INNER JOIN CUENTA_PREDETERMINADA CP ON CP.id_cuenta = B.id_cuenta_predeterminada
           WHERE B.id_cuenta_predeterminada IS NOT NULL
           UNION ALL
           SELECT
             'PERSONALIZADA' AS tipoCuenta,
             B.id_cuenta_personalizada AS idCuenta,
             CC.codigo,
             CC.nombre,
             CC.naturaleza,
             B.fecha,
             B.debe,
             B.haber
           FROM Base B
           INNER JOIN CUENTA_PERSONALIZADA CC
             ON CC.id_cuenta = B.id_cuenta_personalizada
            AND CC.id_empresa = B.id_empresa
           WHERE B.id_cuenta_personalizada IS NOT NULL
         )
         SELECT
           tipoCuenta,
           idCuenta,
           codigo,
           nombre,
           naturaleza,
           CAST(SUM(CASE WHEN fecha < @fecha_inicio
             THEN CASE WHEN naturaleza = 'DEUDORA' THEN debe - haber ELSE haber - debe END
             ELSE 0 END) AS DECIMAL(12,2)) AS saldoInicial,
           CAST(SUM(CASE WHEN fecha >= @fecha_inicio THEN debe ELSE 0 END) AS DECIMAL(12,2)) AS totalDebe,
           CAST(SUM(CASE WHEN fecha >= @fecha_inicio THEN haber ELSE 0 END) AS DECIMAL(12,2)) AS totalHaber,
           CAST(SUM(CASE WHEN naturaleza = 'DEUDORA' THEN debe - haber ELSE haber - debe END) AS DECIMAL(12,2)) AS saldoFinal
         FROM Movimientos
         GROUP BY tipoCuenta, idCuenta, codigo, nombre, naturaleza
         HAVING SUM(CASE WHEN fecha >= @fecha_inicio THEN debe + haber ELSE 0 END) > 0
             OR SUM(CASE WHEN fecha < @fecha_inicio
               THEN CASE WHEN naturaleza = 'DEUDORA' THEN debe - haber ELSE haber - debe END
               ELSE 0 END) <> 0
         ORDER BY codigo, tipoCuenta, idCuenta`,
      )

      response.json({
        fechaInicio: fechaInicio.toISOString().slice(0, 10),
        fechaFin: fechaFin.toISOString().slice(0, 10),
        cuentas: result.recordset.map((row) => ({
          tipoCuenta: row.tipoCuenta,
          idCuenta: Number(row.idCuenta),
          codigo: row.codigo,
          nombre: row.nombre,
          naturaleza: row.naturaleza,
          saldoInicial: Number(row.saldoInicial),
          totalDebe: Number(row.totalDebe),
          totalHaber: Number(row.totalHaber),
          saldoFinal: Number(row.saldoFinal),
        })),
      })
    } catch (error) {
      console.error('Error al consultar libro mayor:', error)
      response.status(500).json({ message: 'No fue posible consultar el libro mayor.' })
    }
  },
)

/* ============================================================
   START
   ============================================================ */

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`API lista en http://localhost:${port}`)
})
