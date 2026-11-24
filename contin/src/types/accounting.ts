export type LoginSession = {
  token: string
  user: {
    id: number
    nombre: string
    correo: string
  }
}

export type TipoContribuyente =
  | 'GRAN_CONTRIBUYENTE'
  | 'MEDIANO'
  | 'PEQUENO'
  | 'EXENTO'

export type Company = {
  id: number
  nombre: string
  nit: string | null
  nrc: string | null
  tipoContribuyente: TipoContribuyente
  inscritoDte: boolean
}

export type BookType = 'DIARIO' | 'MAYOR' | 'IVA' | 'BALANCE'

export type Book = {
  id: number
  nombre: string
  tipo: BookType
  fechaInicio: string
  fechaFin: string
  estado: 'ABIERTO' | 'CERRADO'
}

export type AccountClassification =
  | 'ACTIVO'
  | 'PASIVO'
  | 'PATRIMONIO'
  | 'INGRESO'
  | 'COSTO'
  | 'GASTO'

export type AccountNature = 'DEUDORA' | 'ACREEDORA'

export type Account = {
  key: string
  tipo: 'PREDETERMINADA' | 'PERSONALIZADA'
  id: number
  codigo: string
  nombre: string
  clasificacion: AccountClassification
  naturaleza: AccountNature
  parentKey: string | null
  estado: 'ACTIVA' | 'INACTIVA'
  permiteMovimientos: boolean
  profundidad?: number
}

export type Tercero = {
  id: number
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'AMBOS'
  nombre: string
  nit: string | null
  nrc: string | null
  tipoContribuyente: TipoContribuyente
  direccion: string | null
  correo: string | null
  telefono: string | null
  estado: 'ACTIVO' | 'INACTIVO'
}

export type Dte = {
  id: number
  tipoDte:
  | 'FACTURA'
  | 'CCF'
  | 'NC'
  | 'ND'
  | 'RETENCION'
  | 'SUJETO_EXCLUIDO'
  | 'EXPORTACION'
  numeroControl: string
  codigoGeneracion: string
  selloRecepcion: string | null
  fechaEmision: string
  montoGravado: number
  montoExento: number
  iva: number
  total: number
  estadoTransmision: 'PENDIENTE' | 'TRANSMITIDO' | 'RECHAZADO' | 'INVALIDADO' | 'CONTINGENCIA'
  idPartida: number | null
  terceroNombre: string | null
  terceroNit: string | null
}

export type DeclaracionIva = {
  id?: number
  periodo: string
  debitoFiscal: number
  creditoFiscal: number
  ivaRetenido: number
  ivaPercibido: number
  remanenteAnterior: number
  ivaAPagar: number
  remanenteSiguiente: number
  estado: 'BORRADOR' | 'PRESENTADA' | 'PAGADA'
  fechaPresentacion: string | null
  calculada?: boolean
}

export type LibroIvaVenta = {
  idPartida: number
  fecha: string
  numeroPartida: number
  concepto: string
  tercero: string
  nit: string
  baseGravada: number | null
  ivaDebito: number
  total: number
}

export type LibroIvaCompra = {
  idPartida: number
  fecha: string
  numeroPartida: number
  concepto: string
  tercero: string
  nit: string
  numeroControl: string | null
  codigoGeneracion: string | null
  baseGravada: number | null
  ivaCredito: number
  total: number
}

export type LibroIvaData = {
  ventas: LibroIvaVenta[]
  compras: LibroIvaCompra[]
}

export type DashboardIva = {
  debito: number
  credito: number
  percibido: number
  aPagar: number
  remanente: number
}

export type DashboardData = {
  assets: number
  liabilities: number
  equity: number
  entryCount: number
  totalDebe: number
  totalHaber: number
  balanceDifference: number
  balanced: boolean
  iva: DashboardIva
  recentEntries: {
    id: number
    numero: number
    fecha: string
    concepto: string
  }[]
}

export type ApiError = Error & {
  status: number
  code?: string
}
