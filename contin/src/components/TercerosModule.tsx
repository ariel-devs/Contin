import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest } from '../services/accountingApi'
import type { Company, LoginSession, Tercero, TipoContribuyente } from '../types/accounting'
import { Icon } from './Icon'
import './TercerosModule.css'

type TerceroDraft = {
  tipo: 'CLIENTE' | 'PROVEEDOR' | 'AMBOS'
  nombre: string
  nit: string
  nrc: string
  tipoContribuyente: TipoContribuyente
  direccion: string
  correo: string
  telefono: string
}

const emptyDraft: TerceroDraft = {
  tipo: 'CLIENTE',
  nombre: '',
  nit: '',
  nrc: '',
  tipoContribuyente: 'PEQUENO',
  direccion: '',
  correo: '',
  telefono: '',
}

const nitPattern = /^\d{4}-\d{6}-\d{3}-\d{1}$/

const tipoContribuyenteLabel: Record<TipoContribuyente, string> = {
  GRAN_CONTRIBUYENTE: 'Gran Contribuyente',
  MEDIANO: 'Mediano',
  PEQUENO: 'Pequeño',
  EXENTO: 'Exento',
}

const tipoContribuyenteClass: Record<TipoContribuyente, string> = {
  GRAN_CONTRIBUYENTE: 'gran',
  MEDIANO: 'mediano',
  PEQUENO: 'pequeno',
  EXENTO: 'exento',
}

const tipoTerceroLabel: Record<Tercero['tipo'], string> = {
  CLIENTE: 'Cliente',
  PROVEEDOR: 'Proveedor',
  AMBOS: 'Ambos',
}

const tipoTerceroClass: Record<Tercero['tipo'], string> = {
  CLIENTE: 'cliente',
  PROVEEDOR: 'proveedor',
  AMBOS: 'ambos',
}

function TercerosModule({
  session,
  company,
}: {
  session: LoginSession
  company: Company
}) {
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filterTipo, setFilterTipo] = useState<'TODOS' | Tercero['tipo']>('TODOS')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingTercero, setEditingTercero] = useState<Tercero | null>(null)
  const [draft, setDraft] = useState<TerceroDraft>(emptyDraft)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')

  async function loadTerceros() {
    try {
      const result = await apiRequest<Tercero[]>(
        session,
        `/api/companies/${company.id}/terceros`,
      )
      setTerceros(result)
      setLoadError('')
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'No fue posible consultar los terceros.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    setIsLoading(true)
    void loadTerceros()
  }, [company.id, session])

  const filteredTerceros = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return terceros.filter((t) => {
      if (filterTipo !== 'TODOS' && t.tipo !== filterTipo) return false
      if (!normalized) return true
      return (
        t.nombre.toLocaleLowerCase().includes(normalized) ||
        (t.nit ?? '').toLocaleLowerCase().includes(normalized) ||
        (t.nrc ?? '').toLocaleLowerCase().includes(normalized)
      )
    })
  }, [terceros, search, filterTipo])

  function openCreateForm() {
    setEditingTercero(null)
    setDraft(emptyDraft)
    setFormError('')
    setIsFormOpen(true)
  }

  function openEditForm(tercero: Tercero) {
    setEditingTercero(tercero)
    setDraft({
      tipo: tercero.tipo,
      nombre: tercero.nombre,
      nit: tercero.nit ?? '',
      nrc: tercero.nrc ?? '',
      tipoContribuyente: tercero.tipoContribuyente,
      direccion: tercero.direccion ?? '',
      correo: tercero.correo ?? '',
      telefono: tercero.telefono ?? '',
    })
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingTercero(null)
    setFormError('')
  }

  async function saveTercero(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!draft.nombre.trim()) {
      setFormError('El nombre del tercero es obligatorio.')
      return
    }
    if (draft.nit.trim() && !nitPattern.test(draft.nit.trim())) {
      setFormError('El NIT debe tener el formato ####-######-###-#.')
      return
    }
    if (draft.correo.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.correo.trim())) {
      setFormError('El correo electrónico no es válido.')
      return
    }

    setIsSaving(true)
    try {
      const path = editingTercero
        ? `/api/companies/${company.id}/terceros/${editingTercero.id}`
        : `/api/companies/${company.id}/terceros`
      await apiRequest<Tercero>(session, path, {
        method: editingTercero ? 'PATCH' : 'POST',
        body: JSON.stringify({
          tipo: draft.tipo,
          nombre: draft.nombre.trim(),
          nit: draft.nit.trim() || null,
          nrc: draft.nrc.trim() || null,
          tipoContribuyente: draft.tipoContribuyente,
          direccion: draft.direccion.trim() || null,
          correo: draft.correo.trim() || null,
          telefono: draft.telefono.trim() || null,
        }),
      })
      setNotice(
        editingTercero
          ? 'El tercero se actualizó correctamente.'
          : 'El tercero se creó correctamente.',
      )
      setActionError('')
      closeForm()
      await loadTerceros()
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No fue posible guardar el tercero.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function deactivateTercero(tercero: Tercero) {
    if (
      !window.confirm(
        `¿Desactivar «${tercero.nombre}»? No podrá usarse en nuevas partidas.`,
      )
    ) {
      return
    }
    setBusyId(tercero.id)
    setActionError('')
    setNotice('')
    try {
      await apiRequest<{ id: number; estado: string }>(
        session,
        `/api/companies/${company.id}/terceros/${tercero.id}/deactivate`,
        { method: 'POST' },
      )
      setNotice(`El tercero «${tercero.nombre}» fue desactivado.`)
      await loadTerceros()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No fue posible desactivar el tercero.',
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="terceros-module">
      <header className="page-heading terceros-heading">
        <div>
          <span className="section-eyebrow">ADMINISTRACIÓN CONTABLE</span>
          <h1>Terceros</h1>
          <p>
            Clientes y proveedores de <strong>{company.nombre}</strong>.
          </p>
        </div>
        <button className="primary-button" onClick={openCreateForm}>
          <Icon name="plus" size={17} />
          Nuevo tercero
        </button>
      </header>

      {notice && (
        <div className="terceros-notice terceros-notice--success" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {actionError && (
        <div className="terceros-notice terceros-notice--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{actionError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setActionError('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <div className="terceros-toolbar">
        <label className="terceros-search">
          <Icon name="search" size={17} />
          <input
            aria-label="Buscar tercero por nombre, NIT o NRC"
            placeholder="Buscar por nombre, NIT o NRC"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="terceros-filter">
          <span>Tipo</span>
          <select
            value={filterTipo}
            onChange={(event) =>
              setFilterTipo(event.target.value as 'TODOS' | Tercero['tipo'])
            }
          >
            <option value="TODOS">Todos</option>
            <option value="CLIENTE">Clientes</option>
            <option value="PROVEEDOR">Proveedores</option>
            <option value="AMBOS">Ambos</option>
          </select>
          <Icon name="chevron" size={14} />
        </label>
      </div>

      <div className="terceros-card">
        {isLoading ? (
          <div className="terceros-empty">
            <span className="loading-spinner" />
            Cargando terceros...
          </div>
        ) : loadError ? (
          <div className="terceros-empty">
            <span className="terceros-empty-icon">
              <Icon name="warning" size={22} />
            </span>
            <h2>No se pudo cargar la lista</h2>
            <p>{loadError}</p>
            <button className="secondary-button" onClick={() => void loadTerceros()}>
              Reintentar
            </button>
          </div>
        ) : filteredTerceros.length === 0 ? (
          <div className="terceros-empty">
            <span className="terceros-empty-icon">
              <Icon name="building" size={22} />
            </span>
            <h2>
              {terceros.length === 0
                ? 'Aún no hay terceros registrados'
                : 'No se encontraron coincidencias'}
            </h2>
            <p>
              {terceros.length === 0
                ? 'Registra tus clientes y proveedores para agilizar el registro de compras y ventas con IVA.'
                : 'Prueba con otro término de búsqueda o cambia el filtro.'}
            </p>
            {terceros.length === 0 && (
              <button className="primary-button" onClick={openCreateForm}>
                <Icon name="plus" size={17} />
                Registrar primer tercero
              </button>
            )}
          </div>
        ) : (
          <div className="terceros-table-scroll">
            <table className="terceros-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>NIT</th>
                  <th>NRC</th>
                  <th>Tipo</th>
                  <th>Contribuyente</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredTerceros.map((tercero) => (
                  <tr key={tercero.id}>
                    <td>
                      <span className="terceros-name">{tercero.nombre}</span>
                    </td>
                    <td>
                      <span className="terceros-nit">{tercero.nit ?? '—'}</span>
                    </td>
                    <td>{tercero.nrc ?? '—'}</td>
                    <td>
                      <span
                        className={`terceros-badge terceros-badge--${tipoTerceroClass[tercero.tipo]}`}
                      >
                        {tipoTerceroLabel[tercero.tipo]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`terceros-badge terceros-badge--${tipoContribuyenteClass[tercero.tipoContribuyente]}`}
                      >
                        {tipoContribuyenteLabel[tercero.tipoContribuyente]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`terceros-status terceros-status--${tercero.estado === 'ACTIVO' ? 'activo' : 'inactivo'}`}
                      >
                        {tercero.estado === 'ACTIVO' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td>
                      <div className="terceros-actions">
                        <button type="button" onClick={() => openEditForm(tercero)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={tercero.estado === 'INACTIVO' || busyId === tercero.id}
                          onClick={() => void deactivateTercero(tercero)}
                        >
                          {busyId === tercero.id ? 'Desactivando…' : 'Desactivar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFormOpen && (
        <div
          className="terceros-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) closeForm()
          }}
        >
          <section
            aria-labelledby="tercero-form-title"
            aria-modal="true"
            className="terceros-modal"
            role="dialog"
          >
            <header className="terceros-modal-heading">
              <div>
                <span className="section-eyebrow">TERCERO</span>
                <h2 id="tercero-form-title">
                  {editingTercero ? 'Editar tercero' : 'Nuevo tercero'}
                </h2>
                <p>
                  Los terceros se usan al registrar compras y ventas con IVA y DTE.
                </p>
              </div>
              <button
                className="terceros-modal-close"
                aria-label="Cerrar formulario"
                onClick={closeForm}
                disabled={isSaving}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <form className="terceros-form" onSubmit={(event) => void saveTercero(event)}>
              <label className="terceros-form-full">
                Nombre o razón social <span aria-hidden="true">*</span>
                <input
                  autoFocus
                  required
                  maxLength={200}
                  value={draft.nombre}
                  onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
                  placeholder="Ej. Distribuidora La Estrella, S.A. de C.V."
                />
              </label>

              <label>
                Tipo
                <select
                  value={draft.tipo}
                  onChange={(event) =>
                    setDraft({ ...draft, tipo: event.target.value as Tercero['tipo'] })
                  }
                >
                  <option value="CLIENTE">Cliente</option>
                  <option value="PROVEEDOR">Proveedor</option>
                  <option value="AMBOS">Ambos</option>
                </select>
              </label>

              <label>
                Tipo de contribuyente
                <select
                  value={draft.tipoContribuyente}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      tipoContribuyente: event.target.value as TipoContribuyente,
                    })
                  }
                >
                  <option value="GRAN_CONTRIBUYENTE">Gran Contribuyente</option>
                  <option value="MEDIANO">Mediano</option>
                  <option value="PEQUENO">Pequeño</option>
                  <option value="EXENTO">Exento</option>
                </select>
              </label>

              <label>
                NIT
                <input
                  maxLength={20}
                  value={draft.nit}
                  onChange={(event) => setDraft({ ...draft, nit: event.target.value })}
                  placeholder="####-######-###-#"
                />
                <small>Formato: ####-######-###-#</small>
              </label>

              <label>
                NRC
                <input
                  maxLength={20}
                  value={draft.nrc}
                  onChange={(event) => setDraft({ ...draft, nrc: event.target.value })}
                  placeholder="Número de registro de contribuyente"
                />
              </label>

              <label className="terceros-form-full">
                Dirección
                <input
                  maxLength={250}
                  value={draft.direccion}
                  onChange={(event) => setDraft({ ...draft, direccion: event.target.value })}
                  placeholder="Dirección del tercero"
                />
              </label>

              <label>
                Correo electrónico
                <input
                  type="email"
                  maxLength={150}
                  value={draft.correo}
                  onChange={(event) => setDraft({ ...draft, correo: event.target.value })}
                  placeholder="correo@ejemplo.com"
                />
              </label>

              <label>
                Teléfono
                <input
                  maxLength={20}
                  value={draft.telefono}
                  onChange={(event) => setDraft({ ...draft, telefono: event.target.value })}
                  placeholder="0000-0000"
                />
              </label>

              {formError && (
                <p className="terceros-form-error" role="alert">
                  {formError}
                </p>
              )}

              <footer className="terceros-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving
                    ? 'Guardando…'
                    : editingTercero
                      ? 'Guardar cambios'
                      : 'Crear tercero'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default TercerosModule
