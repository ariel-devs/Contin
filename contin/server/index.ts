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
app.use(express.json({ limit: '100kb' }))

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const bcryptHashPattern = /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/

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

type AccountDraft = {
  nombre: string
  codigo: string
  clasificacion: AccountClassification
  naturaleza: AccountNature
  permiteMovimientos: boolean
  parentType: 'P' | 'C'
  parentId: number
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
    response.status(409).json({ message: 'Ya existe una cuenta con ese código en esta empresa.' })
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
    response.status(400).json({ message: 'La cuenta padre seleccionada ya no está disponible.' })
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

app.get('/api/companies', authenticate, async (request, response) => {
  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .query<{ id: number; nombre: string; nit: string | null }>(
        `SELECT id_empresa AS id, nombre, nit
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

  const { nombre, nit } = body as { nombre?: unknown; nit?: unknown }
  const trimmedName = typeof nombre === 'string' ? nombre.trim() : ''
  const trimmedNit = typeof nit === 'string' ? nit.trim() : ''
  if (
    trimmedName.length === 0 ||
    trimmedName.length > 150 ||
    (nit !== undefined && nit !== null && typeof nit !== 'string') ||
    trimmedNit.length > 20
  ) {
    response.status(400).json({ message: 'Revisa el nombre y NIT de la empresa.' })
    return
  }

  try {
    const connection = await database.connect()
    const result = await connection
      .request()
      .input('id_usuario', sql.Int, request.authenticatedUserId!)
      .input('nombre', sql.VarChar(150), trimmedName)
      .input('nit', sql.VarChar(20), trimmedNit || null)
      .query<{ id: number; nombre: string; nit: string | null }>(
        `INSERT INTO EMPRESA (id_usuario, nombre, nit)
         OUTPUT INSERTED.id_empresa AS id, INSERTED.nombre, INSERTED.nit
         VALUES (@id_usuario, @nombre, @nit)`,
      )

    response.status(201).json(result.recordset[0])
  } catch (error) {
    console.error('Error al registrar empresa:', error)
    response.status(500).json({ message: 'No fue posible registrar la empresa.' })
  }
})

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
             INSERTED.codigo,
             INSERTED.nombre,
             INSERTED.clasificacion,
             INSERTED.naturaleza,
             INSERTED.estado,
             INSERTED.permite_movimientos AS permiteMovimientos
           SELECT
             @id_empresa,
             CASE WHEN @parent_type = 'P' THEN @parent_id ELSE NULL END,
             CASE WHEN @parent_type = 'C' THEN @parent_id ELSE NULL END,
             @codigo, @nombre, @clasificacion, @naturaleza, @permite_movimientos
           WHERE EXISTS (
             SELECT 1
             FROM EMPRESA E
             WHERE E.id_empresa = @id_empresa
               AND E.id_usuario = @id_usuario
           )
           AND (
             (@parent_type = 'P' AND EXISTS (
               SELECT 1
               FROM CUENTA_PREDETERMINADA P
               WHERE P.id_cuenta = @parent_id
                 AND P.estado = 'ACTIVA'
                 AND P.permite_movimientos = 0
                 AND P.clasificacion = @clasificacion
                 AND P.naturaleza = @naturaleza
             ))
             OR
             (@parent_type = 'C' AND EXISTS (
               SELECT 1
               FROM CUENTA_PERSONALIZADA P
               WHERE P.id_cuenta = @parent_id
                 AND P.id_empresa = @id_empresa
                 AND P.estado = 'ACTIVA'
                 AND P.permite_movimientos = 0
                 AND P.clasificacion = @clasificacion
                 AND P.naturaleza = @naturaleza
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
               codigo = @codigo,
               nombre = @nombre,
               clasificacion = @clasificacion,
               naturaleza = @naturaleza,
               permite_movimientos = @permite_movimientos
           OUTPUT
             INSERTED.id_cuenta AS id,
             INSERTED.codigo,
             INSERTED.nombre,
             INSERTED.clasificacion,
             INSERTED.naturaleza,
             INSERTED.estado,
             INSERTED.permite_movimientos AS permiteMovimientos
           FROM CUENTA_PERSONALIZADA CC
           WHERE CC.id_cuenta = @id_cuenta
             AND CC.id_empresa = @id_empresa
             AND EXISTS (
               SELECT 1
               FROM EMPRESA E
               WHERE E.id_empresa = @id_empresa
                 AND E.id_usuario = @id_usuario
             )
             AND NOT (@parent_type = 'C' AND @parent_id = @id_cuenta)
             AND (
               (@parent_type = 'P' AND EXISTS (
                 SELECT 1
                 FROM CUENTA_PREDETERMINADA P
                 WHERE P.id_cuenta = @parent_id
                   AND P.estado = 'ACTIVA'
                   AND P.permite_movimientos = 0
                   AND P.clasificacion = @clasificacion
                   AND P.naturaleza = @naturaleza
               ))
               OR
               (@parent_type = 'C' AND EXISTS (
                 SELECT 1
                 FROM CUENTA_PERSONALIZADA P
                 WHERE P.id_cuenta = @parent_id
                   AND P.id_empresa = @id_empresa
                   AND P.estado = 'ACTIVA'
                   AND P.permite_movimientos = 0
                   AND P.clasificacion = @clasificacion
                   AND P.naturaleza = @naturaleza
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
             WHERE CC.id_cuenta = @id_cuenta
               AND CC.id_empresa = @id_empresa
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
          `UPDATE CC
           SET estado = 'INACTIVA'
           OUTPUT INSERTED.id_cuenta AS id
           FROM CUENTA_PERSONALIZADA CC
           INNER JOIN EMPRESA E ON E.id_empresa = CC.id_empresa
           WHERE CC.id_cuenta = @id_cuenta
             AND CC.id_empresa = @id_empresa
             AND CC.estado = 'ACTIVA'
             AND E.id_usuario = @id_usuario`,
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
             WHERE CC.id_cuenta = @id_cuenta
               AND CC.id_empresa = @id_empresa
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
         WHERE E.id_usuario = @id_usuario
           AND E.id_empresa = @id_empresa
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
    name.length === 0 ||
    name.length > 150 ||
    startDate === null ||
    endDate === null ||
    startDate > endDate
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
         WHERE E.id_empresa = @id_empresa
           AND E.id_usuario = @id_usuario`,
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
      name.length === 0 ||
      name.length > 150 ||
      startDate === null ||
      endDate === null ||
      startDate > endDate
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
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
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
        .query<{
          id: number
          nombre: string
          tipo: string
          fechaInicio: Date
          fechaFin: Date
          estado: string
        }>(
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
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
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
        response.status(400).json({ message: 'Este período contable ya está cerrado.' })
        return
      }

      const closedBook = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .query<{
          id: number
          nombre: string
          tipo: string
          fechaInicio: Date
          fechaFin: Date
          estado: string
        }>(
          `UPDATE dbo.LIBRO
           SET estado = 'CERRADO'
           OUTPUT INSERTED.id_libro AS id, INSERTED.nombre,
                  INSERTED.tipo_libro AS tipo,
                  INSERTED.fecha_inicio AS fechaInicio,
                  INSERTED.fecha_fin AS fechaFin, INSERTED.estado
           WHERE id_libro = @id_libro`,
        )
      await transaction.commit()
      response.json(closedBook.recordset[0])
    } catch (error) {
      if (transactionStarted) await transaction.rollback()
      console.error('Error al cerrar el período contable:', error)
      response.status(500).json({ message: 'No fue posible cerrar el período contable.' })
    }
  },
)

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
          `SELECT L.id_libro
           FROM LIBRO L
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro`,
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
        .query<{
          assets: number | string
          liabilities: number | string
          equity: number | string
          entryCount: number
          totalDebe: number | string
          totalHaber: number | string
        }>(
          `SELECT
             COALESCE(SUM(CASE
               WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'ACTIVO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber
                 ELSE M.haber - M.debe
               END ELSE 0 END), 0) AS assets,
             COALESCE(SUM(CASE
               WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'PASIVO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber
                 ELSE M.haber - M.debe
               END ELSE 0 END), 0) AS liabilities,
             COALESCE(SUM(CASE
               WHEN COALESCE(CP.clasificacion, CC.clasificacion) = 'PATRIMONIO'
               THEN CASE COALESCE(CP.naturaleza, CC.naturaleza)
                 WHEN 'DEUDORA' THEN M.debe - M.haber
                 ELSE M.haber - M.debe
               END ELSE 0 END), 0) AS equity,
             COUNT(DISTINCT P.id_partida) AS entryCount,
             COALESCE(SUM(M.debe), 0) AS totalDebe,
             COALESCE(SUM(M.haber), 0) AS totalHaber
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           LEFT JOIN MOVIMIENTO M ON M.id_partida = P.id_partida
           LEFT JOIN CUENTA_PREDETERMINADA CP
             ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN CUENTA_PERSONALIZADA CC
             ON CC.id_cuenta = M.id_cuenta_personalizada
            AND CC.id_empresa = E.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA'`,
        )

      const recent = await connection
        .request()
        .input('id_usuario', sql.Int, request.authenticatedUserId!)
        .input('id_empresa', sql.Int, companyId)
        .input('id_libro', sql.Int, bookId)
        .query<{
          id: number
          numero: number
          fecha: string
          concepto: string
        }>(
          `SELECT TOP (5) P.id_partida AS id, P.numero_partida AS numero,
                  P.fecha, P.concepto
           FROM PARTIDA P
           INNER JOIN LIBRO L ON L.id_libro = P.id_libro
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA'
           ORDER BY P.fecha DESC, P.numero_partida DESC`,
        )

      const row = summary.recordset[0]
      const amount = (value: number | string) => Number(value)
      const totalDebe = amount(row.totalDebe)
      const totalHaber = amount(row.totalHaber)
      const balanceDifference = totalDebe - totalHaber

      response.json({
        assets: amount(row.assets),
        liabilities: amount(row.liabilities),
        equity: amount(row.equity),
        entryCount: row.entryCount,
        totalDebe,
        totalHaber,
        balanceDifference,
        balanced: Math.abs(balanceDifference) < 0.01,
        recentEntries: recent.recordset,
      })
    } catch (error) {
      console.error('Error al consultar el dashboard contable:', error)
      response.status(500).json({ message: 'No fue posible consultar el dashboard.' })
    }
  },
)

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
        .query<{
          key: string
          tipo: 'PREDETERMINADA' | 'PERSONALIZADA'
          id: number
          codigo: string
          nombre: string
          parentKey: string | null
          estado: string
          permiteMovimientos: boolean
        }>(
          `WITH LibroAutorizado AS (
             SELECT L.id_empresa
             FROM LIBRO L
             INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
             WHERE E.id_usuario = @id_usuario
               AND E.id_empresa = @id_empresa
               AND L.id_libro = @id_libro
           ),
           Cuentas AS (
             SELECT
               CAST(CONCAT('P:', CP.id_cuenta) AS VARCHAR(32)) AS [key],
               CAST('PREDETERMINADA' AS VARCHAR(20)) AS tipo,
               CP.id_cuenta AS id,
               CP.codigo,
               CP.nombre,
               CASE WHEN CP.id_cuenta_padre IS NULL THEN NULL
                    ELSE CAST(CONCAT('P:', CP.id_cuenta_padre) AS VARCHAR(32))
               END AS parentKey,
               CP.estado,
               CP.permite_movimientos AS permiteMovimientos
             FROM CUENTA_PREDETERMINADA CP
             CROSS JOIN LibroAutorizado

             UNION ALL

             SELECT
               CAST(CONCAT('C:', CC.id_cuenta) AS VARCHAR(32)),
               CAST('PERSONALIZADA' AS VARCHAR(20)),
               CC.id_cuenta,
               CC.codigo,
               CC.nombre,
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
             INNER JOIN LibroAutorizado ON LibroAutorizado.id_empresa = CC.id_empresa
           ),
           Arbol AS (
             SELECT C.[key], C.tipo, C.id, C.codigo, C.nombre, C.parentKey,
                    C.estado, C.permiteMovimientos, 0 AS profundidad,
                    CAST(CONCAT('/', C.[key], '/') AS VARCHAR(MAX)) AS recorrido
             FROM Cuentas C
             WHERE C.parentKey IS NULL

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
                  C.estado, C.permiteMovimientos,
                  COALESCE(A.profundidad, 0) AS profundidad
           FROM Cuentas C
           LEFT JOIN Arbol A ON A.[key] = C.[key]
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
            `SELECT L.id_libro
             FROM LIBRO L
             INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
             WHERE E.id_usuario = @id_usuario
               AND E.id_empresa = @id_empresa
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
      companyId === null ||
      bookId === null ||
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
        .query<{
          id: number
          nombre: string
          fechaInicio: Date
          fechaFin: Date
          estado: string
          empresa: string
        }>(
          `SELECT L.id_libro AS id, L.nombre, L.fecha_inicio AS fechaInicio,
                  L.fecha_fin AS fechaFin, L.estado,
                  E.nombre AS empresa
           FROM LIBRO L
           INNER JOIN EMPRESA E ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
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
        .query<{
          id: number
          numero: number
          fecha: Date
          concepto: string
          movimientoId: number
          tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
          cuentaId: number
          codigo: string
          cuenta: string
          parentKey: string | null
          parcial: number | string | null
          debe: number | string
          haber: number | string
        }>(
          `SELECT P.id_partida AS id, P.numero_partida AS numero,
                  P.fecha, P.concepto,
                  M.id_movimiento AS movimientoId,
                  CASE WHEN M.id_cuenta_predeterminada IS NOT NULL
                       THEN 'PREDETERMINADA' ELSE 'PERSONALIZADA' END AS tipoCuenta,
                  COALESCE(CP.id_cuenta, CC.id_cuenta) AS cuentaId,
                  COALESCE(CP.codigo, CC.codigo) AS codigo,
                  COALESCE(CP.nombre, CC.nombre) AS cuenta,
                  CASE
                    WHEN CP.id_cuenta_padre IS NOT NULL
                      THEN CONCAT('P:', CP.id_cuenta_padre)
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
           LEFT JOIN CUENTA_PREDETERMINADA CP
             ON CP.id_cuenta = M.id_cuenta_predeterminada
           LEFT JOIN CUENTA_PERSONALIZADA CC
             ON CC.id_cuenta = M.id_cuenta_personalizada
            AND CC.id_empresa = E.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
             AND L.id_libro = @id_libro
             AND P.estado = 'CONTABILIZADA'
             AND (@desde IS NULL OR P.fecha >= @desde)
             AND (@hasta IS NULL OR P.fecha <= @hasta)
             AND (@numero IS NULL OR P.numero_partida = @numero)
           ORDER BY P.fecha, P.numero_partida, M.id_movimiento`,
        )

      const entries = new Map<number, {
        id: number
        numero: number
        fecha: Date
        concepto: string
        lines: {
          id: number
          accountKey: string
          tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
          cuentaId: number
          codigo: string
          cuenta: string
          parentKey: string | null
          parcial: number | null
          debe: number
          haber: number
        }[]
      }>()

      for (const row of result.recordset) {
        let entry = entries.get(row.id)
        if (!entry) {
          entry = {
            id: row.id,
            numero: row.numero,
            fecha: row.fecha,
            concepto: row.concepto,
            lines: [],
          }
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
          id: book.id,
          nombre: book.nombre,
          fechaInicio: book.fechaInicio,
          fechaFin: book.fechaFin,
          estado: book.estado,
          empresa: book.empresa,
        },
        entries: orderedEntries,
        totals: {
          partidas: orderedEntries.length,
          debe: orderedEntries.reduce(
            (total, entry) => total + entry.lines.reduce((sum, line) => sum + line.debe, 0),
            0,
          ),
          haber: orderedEntries.reduce(
            (total, entry) => total + entry.lines.reduce((sum, line) => sum + line.haber, 0),
            0,
          ),
        },
      })
    } catch (error) {
      console.error('Error al consultar el libro diario:', error)
      response.status(500).json({ message: 'No fue posible consultar el libro diario.' })
    }
  },
)

app.post(
  '/api/companies/:companyId/books/:bookId/entries',
  authenticate,
  async (request, response) => {
    const companyId = parsePositiveId(request.params.companyId)
    const bookId = parsePositiveId(request.params.bookId)
    const body: unknown = request.body
    if (companyId === null || bookId === null) {
      response.status(400).json({ message: 'La empresa o el período seleccionado no son válidos.' })
      return
    }
    if (typeof body !== 'object' || body === null) {
      response.status(400).json({ message: 'Ingresa los datos de la partida.' })
      return
    }

    const { fecha, concepto, lineas } = body as {
      fecha?: unknown
      concepto?: unknown
      lineas?: unknown
    }
    const entryDate = parseIsoDate(fecha)
    const description = typeof concepto === 'string' ? concepto.trim() : ''
    if (
      entryDate === null ||
      description.length === 0 ||
      description.length > 250 ||
      !Array.isArray(lineas) ||
      lineas.length < 2
    ) {
      response.status(400).json({
        message: 'La partida requiere una fecha válida, un concepto y al menos dos movimientos.',
      })
      return
    }

    const normalizedLines: {
      accountId: number
      accountType: 'PREDETERMINADA' | 'PERSONALIZADA'
      partialCents: number | null
      debitCents: number
      creditCents: number
    }[] = []

    for (const line of lineas) {
      if (typeof line !== 'object' || line === null) {
        response.status(400).json({ message: 'Revisa las cuentas y los importes de cada movimiento.' })
        return
      }
      const item = line as {
        cuentaId?: unknown
        tipoCuenta?: unknown
        parcial?: unknown
        debe?: unknown
        haber?: unknown
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
        accountId === null ||
        accountId < 1 ||
        (accountType !== 'PREDETERMINADA' && accountType !== 'PERSONALIZADA') ||
        debitCents === null ||
        creditCents === null ||
        (item.parcial !== '' &&
          item.parcial !== null &&
          item.parcial !== undefined &&
          partialCents === null) ||
        ((debitCents > 0) === (creditCents > 0))
      ) {
        response.status(400).json({
          message: 'Cada movimiento debe tener una cuenta y un importe positivo en Debe o Haber.',
        })
        return
      }

      normalizedLines.push({
        accountId,
        accountType,
        partialCents,
        debitCents,
        creditCents,
      })
    }

    const totalDebitCents = normalizedLines.reduce((sum, line) => sum + line.debitCents, 0)
    const totalCreditCents = normalizedLines.reduce((sum, line) => sum + line.creditCents, 0)
    if (totalDebitCents !== totalCreditCents) {
      response.status(400).json({ message: 'La partida no está cuadrada. El Debe y el Haber deben ser iguales.' })
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
        .query<{
          id: number
          estado: string
          fechaInicio: Date
          fechaFin: Date
        }>(
          `SELECT L.id_libro AS id, L.estado,
                  L.fecha_inicio AS fechaInicio, L.fecha_fin AS fechaFin
           FROM LIBRO L WITH (UPDLOCK, HOLDLOCK)
           INNER JOIN EMPRESA E WITH (UPDLOCK, HOLDLOCK)
             ON E.id_empresa = L.id_empresa
           WHERE E.id_usuario = @id_usuario
             AND E.id_empresa = @id_empresa
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
        const accountQuery =
          line.accountType === 'PREDETERMINADA'
            ? transaction
                .request()
                .input('id_cuenta', sql.Int, line.accountId)
                .query<{ id_cuenta: number }>(
                  `SELECT id_cuenta
                   FROM CUENTA_PREDETERMINADA
                   WHERE id_cuenta = @id_cuenta
                     AND estado = 'ACTIVA'
                     AND permite_movimientos = 1`,
                )
            : transaction
                .request()
                .input('id_cuenta', sql.Int, line.accountId)
                .input('id_empresa', sql.Int, companyId)
                .query<{ id_cuenta: number }>(
                  `SELECT id_cuenta
                   FROM CUENTA_PERSONALIZADA
                   WHERE id_cuenta = @id_cuenta
                     AND id_empresa = @id_empresa
                     AND estado = 'ACTIVA'
                     AND permite_movimientos = 1`,
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
           FROM PARTIDA WITH (UPDLOCK, HOLDLOCK)
           WHERE id_libro = @id_libro`,
        )
      const entryNumber = nextNumber.recordset[0].numero
      const insertedEntry = await transaction
        .request()
        .input('id_libro', sql.Int, bookId)
        .input('numero_partida', sql.Int, entryNumber)
        .input('fecha', sql.Date, entryDate)
        .input('concepto', sql.VarChar(250), description)
        .query<{ id: number }>(
          `INSERT INTO PARTIDA (id_libro, numero_partida, fecha, concepto, estado)
           OUTPUT INSERTED.id_partida AS id
           VALUES (@id_libro, @numero_partida, @fecha, @concepto, 'BORRADOR')`,
        )
      const entryId = insertedEntry.recordset[0]?.id
      if (!entryId) {
        throw new Error('No fue posible crear el borrador de la partida.')
      }

      for (const line of normalizedLines) {
        await transaction
          .request()
          .input(
            'id_cuenta_predeterminada',
            sql.Int,
            line.accountType === 'PREDETERMINADA' ? line.accountId : null,
          )
          .input(
            'id_cuenta_personalizada',
            sql.Int,
            line.accountType === 'PERSONALIZADA' ? line.accountId : null,
          )
          .input(
            'parcial',
            sql.Decimal(12, 2),
            line.partialCents === null ? null : line.partialCents / 100,
          )
          .input('debe', sql.Decimal(12, 2), line.debitCents / 100)
          .input('haber', sql.Decimal(12, 2), line.creditCents / 100)
          .input('id_partida', sql.Int, entryId)
          .query(
            `INSERT INTO MOVIMIENTO (
               id_partida, id_cuenta_predeterminada, id_cuenta_personalizada,
               parcial, debe, haber
             )
             VALUES (
               @id_partida, @id_cuenta_predeterminada, @id_cuenta_personalizada,
               @parcial, @debe, @haber
             )`,
          )
      }

      await transaction
        .request()
        .input('IdPartida', sql.Int, entryId)
        .execute('dbo.sp_ContabilizarPartida')
      await transaction.commit()

      response.status(201).json({
        id: entryId,
        numero: entryNumber,
        fecha: isoEntryDate,
        concepto: description,
        totalDebe: totalDebitCents / 100,
        totalHaber: totalCreditCents / 100,
        estado: 'CONTABILIZADA',
      })
    } catch (error) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        console.error('Error al revertir el registro de la partida:', rollbackError)
      }

      const errorNumber =
        typeof error === 'object' && error !== null && 'number' in error
          ? Number(error.number)
          : null
      if (errorNumber !== null && errorNumber >= 50010 && errorNumber <= 50017) {
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

const port = Number(process.env.PORT ?? 3001)
app.listen(port, () => {
  console.log(`API lista en http://localhost:${port}`)
})
