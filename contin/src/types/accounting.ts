export type LoginSession = {
  token: string
  user: {
    id: number
    nombre: string
    correo: string
  }
}

export type Company = {
  id: number
  nombre: string
  nit: string | null
}

export type Book = {
  id: number
  nombre: string
  tipo: string
  fechaInicio: string
  fechaFin: string
  estado: string
}
