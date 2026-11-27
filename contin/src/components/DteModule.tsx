import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiRequest } from '../services/accountingApi'
import type { Company, Dte, LoginSession, Tercero } from '../types/accounting'
import { formatDate, formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './DteModule.css'

type DteDraft = {
  idTercero: string
  tipoDte: Dte['tipoDte']
  numeroControl: string
  codigoGeneracion: string
  selloRecepcion: string
  fechaEmision: string
  montoGravado: string
  montoExento: string
  iva: string
  total: string
}

const emptyDraft: DteDraft = {
  idTercero: '',
  tipoDte: 'CCF',
  numeroControl: '',
  codigoGeneracion: '',
  selloRecepcion: '',
  fechaEmision: '',
  montoGravado: '',
  montoExento: '0.00',
  iva: '',
  total: '',
}

const tipoDteLabel: Record<Dte['tipoDte'], string> = {
  FACTURA: 'Factura',
  CCF: 'CCF',
  NC: 'Nota de Crédito',
  ND: 'Nota de Débito',
  RETENCION: 'Retención',
  SUJETO_EXCLUIDO: 'Sujeto Excluido',
  EXPORTACION: 'Exportación',
}

const tipoDteClass: Record<Dte['tipoDte'], string> = {
  FACTURA: 'factura',
  CCF: 'ccf',
  NC: 'nc',
  ND: 'nd',
  RETENCION: 'factura',
  SUJETO_EXCLUIDO: 'factura',
  EXPORTACION: 'factura',
}

const estadoLabel: Record<Dte['estadoTransmision'], string> = {
  PENDIENTE: 'Pendiente',
  TRANSMITIDO: 'Transmitido',
  RECHAZADO: 'Rechazado',
  INVALIDADO: 'Invalidado',
  CONTINGENCIA: 'Contingencia',
}

const estadoClass: Record<Dte['estadoTransmision'], string> = {
  PENDIENTE: 'pendiente',
  TRANSMITIDO: 'transmitido',
  RECHAZADO: 'rechazado',
  INVALIDADO: 'invalidado',
  CONTINGENCIA: 'contingencia',
}

function DteModule({
  session,
  company,
}: {
  session: LoginSession
  company: Company
}) {
  const [dtes, setDtes] = useState<Dte[]>([])
  const [terceros, setTerceros] = useState<Tercero[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<'TODOS' | Dte['estadoTransmision']>('TODOS')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [draft, setDraft] = useState<DteDraft>(emptyDraft)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest<Dte[]>(session, `/api/companies/${company.id}/dte`),
      apiRequest<Tercero[]>(session, `/api/companies/${company.id}/terceros`),
    ])
      .then(([dteResult, terceroResult]) => {
        if (active) {
          setDtes(dteResult)
          setTerceros(terceroResult.filter((t) => t.estado === 'ACTIVO'))
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'No fue posible consultar los DTE.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [company.id, session, refreshKey])

  const filteredDtes = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase()
    return dtes.filter((d) => {
      if (filterEstado !== 'TODOS' && d.estadoTransmision !== filterEstado) return false
      if (!normalized) return true
      return (
        d.numeroControl.toLocaleLowerCase().includes(normalized) ||
        d.codigoGeneracion.toLocaleLowerCase().includes(normalized) ||
        (d.terceroNombre ?? '').toLocaleLowerCase().includes(normalized) ||
        (d.terceroNit ?? '').toLocaleLowerCase().includes(normalized)
      )
    })
  }, [dtes, search, filterEstado])

  function openCreateForm() {
    setDraft(emptyDraft)
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setFormError('')
  }

  // IVA autocalculado visualmente cuando cambia el monto gravado
  function handleMontoGravadoChange(value: string) {
    const normalized = value.replace(',', '.')
    const num = Number(normalized)
    const patch: Partial<DteDraft> = { montoGravado: value }
    if (Number.isFinite(num) && num >= 0) {
      const iva = (num * 0.13).toFixed(2)
      patch.iva = iva
      const exento = Number(draft.montoExento.replace(',', '.')) || 0
      patch.total = (num + Number(iva) + exento).toFixed(2)
    }
    setDraft((current) => ({ ...current, ...patch }))
  }

  function handleMontoExentoChange(value: string) {
    const normalized = value.replace(',', '.')
    const num = Number(normalized) || 0
    const gravado = Number(draft.montoGravado.replace(',', '.')) || 0
    const iva = Number(draft.iva.replace(',', '.')) || 0
    setDraft((current) => ({
      ...current,
      montoExento: value,
      total: (gravado + num + iva).toFixed(2),
    }))
  }

  async function saveDte(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')

    if (!draft.numeroControl.trim()) {
      setFormError('El número de control es obligatorio.')
      return
    }
    if (!draft.codigoGeneracion.trim()) {
      setFormError('El código de generación es obligatorio.')
      return
    }
    if (!draft.fechaEmision) {
      setFormError('La fecha de emisión es obligatoria.')
      return
    }
    if (draft.selloRecepcion && draft.selloRecepcion.length !== 40) {
      setFormError('El sello de recepción debe tener 40 caracteres.')
      return
    }

    const gravado = Number(draft.montoGravado.replace(',', '.')) || 0
    const exento = Number(draft.montoExento.replace(',', '.')) || 0
    const iva = Number(draft.iva.replace(',', '.')) || 0
    const total = Number(draft.total.replace(',', '.')) || 0

    if (gravado < 0 || exento < 0 || iva < 0 || total < 0) {
      setFormError('Los montos no pueden ser negativos.')
      return
    }

    setIsSaving(true)
    try {
      await apiRequest<Dte>(session, `/api/companies/${company.id}/dte`, {
        method: 'POST',
        body: JSON.stringify({
          idTercero: draft.idTercero ? Number(draft.idTercero) : null,
          tipoDte: draft.tipoDte,
          numeroControl: draft.numeroControl.trim(),
          codigoGeneracion: draft.codigoGeneracion.trim(),
          selloRecepcion: draft.selloRecepcion.trim() || null,
          fechaEmision: draft.fechaEmision,
          montoGravado: gravado.toFixed(2),
          montoExento: exento.toFixed(2),
          iva: iva.toFixed(2),
          total: total.toFixed(2),
        }),
      })
      setNotice('El DTE se registró correctamente.')
      setActionError('')
      closeForm()
      setIsLoading(true)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No fue posible registrar el DTE.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="dte-module">
      <header className="page-heading dte-heading">
        <div>
          <span className="section-eyebrow">ADMINISTRACIÓN TRIBUTARIA</span>
          <h1>DTE</h1>
          <p>
            Documentos Tributarios Electrónicos de <strong>{company.nombre}</strong>.
          </p>
        </div>
        <button className="primary-button" onClick={openCreateForm}>
          <Icon name="plus" size={17} />
          Registrar DTE
        </button>
      </header>

      <div className="dte-info-banner" role="note">
        <Icon name="warning" size={18} />
        <div>
          <strong>Registra aquí los DTE recibidos de tus proveedores</strong> para respaldar el
          IVA Crédito Fiscal. Las partidas con cuenta <strong>110801</strong> requerirán un DTE
          asociado. Si aún no estás inscrito como emisor, este módulo también te permite
          almacenar la estructura de tus DTE de venta sin transmitirlos a Hacienda.
        </div>
      </div>

      {notice && (
        <div className="dte-notice dte-notice--success" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {actionError && (
        <div className="dte-notice dte-notice--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{actionError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setActionError('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <div className="dte-toolbar">
        <label className="dte-search">
          <Icon name="search" size={17} />
          <input
            aria-label="Buscar DTE por número de control, código de generación o tercero"
            placeholder="Buscar por número, código o tercero"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="dte-filter">
          <span>Estado</span>
          <select
            value={filterEstado}
            onChange={(event) =>
              setFilterEstado(event.target.value as 'TODOS' | Dte['estadoTransmision'])
            }
          >
            <option value="TODOS">Todos</option>
            <option value="TRANSMITIDO">Transmitidos</option>
            <option value="PENDIENTE">Pendientes</option>
            <option value="RECHAZADO">Rechazados</option>
            <option value="INVALIDADO">Invalidados</option>
            <option value="CONTINGENCIA">Contingencia</option>
          </select>
          <Icon name="chevron" size={14} />
        </label>
      </div>

      <div className="dte-card">
        {isLoading ? (
          <div className="dte-empty">
            <span className="loading-spinner" />
            Cargando DTE...
          </div>
        ) : loadError ? (
          <div className="dte-empty">
            <span className="dte-empty-icon">
              <Icon name="warning" size={22} />
            </span>
            <h2>No se pudo cargar la lista</h2>
            <p>{loadError}</p>
            <button
              className="secondary-button"
              onClick={() => {
                setIsLoading(true)
                setRefreshKey((key) => key + 1)
              }}
            >
              Reintentar
            </button>
          </div>
        ) : filteredDtes.length === 0 ? (
          <div className="dte-empty">
            <span className="dte-empty-icon">
              <Icon name="journal" size={22} />
            </span>
            <h2>
              {dtes.length === 0 ? 'Aún no hay DTE registrados' : 'No se encontraron coincidencias'}
            </h2>
            <p>
              {dtes.length === 0
                ? 'Registra los DTE de tus proveedores para respaldar el IVA Crédito Fiscal de tus compras.'
                : 'Prueba con otro término de búsqueda o cambia el filtro.'}
            </p>
            {dtes.length === 0 && (
              <button className="primary-button" onClick={openCreateForm}>
                <Icon name="plus" size={17} />
                Registrar primer DTE
              </button>
            )}
          </div>
        ) : (
          <div className="dte-table-scroll">
            <table className="dte-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>N.º Control</th>
                  <th>Tercero</th>
                  <th className="dte-amount">Gravado</th>
                  <th className="dte-amount">IVA</th>
                  <th className="dte-amount">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredDtes.map((dte) => (
                  <tr key={dte.id}>
                    <td>{formatDate(dte.fechaEmision)}</td>
                    <td>
                      <span
                        className={`dte-tipo-badge dte-tipo-badge--${tipoDteClass[dte.tipoDte]}`}
                      >
                        {tipoDteLabel[dte.tipoDte]}
                      </span>
                    </td>
                    <td>
                      <span className="dte-code">{dte.numeroControl}</span>
                    </td>
                    <td>
                      {dte.terceroNombre ?? '—'}
                      {dte.terceroNit && (
                        <div style={{ fontSize: '9px', color: '#98a2ae' }}>
                          {dte.terceroNit}
                        </div>
                      )}
                    </td>
                    <td className="dte-amount">{formatMoney(dte.montoGravado)}</td>
                    <td className="dte-amount">{formatMoney(dte.iva)}</td>
                    <td className="dte-amount">{formatMoney(dte.total)}</td>
                    <td>
                      <span
                        className={`dte-estado dte-estado--${estadoClass[dte.estadoTransmision]}`}
                      >
                        <span />
                        {estadoLabel[dte.estadoTransmision]}
                      </span>
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
          className="dte-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) closeForm()
          }}
        >
          <section
            aria-labelledby="dte-form-title"
            aria-modal="true"
            className="dte-modal"
            role="dialog"
          >
            <header className="dte-modal-heading">
              <div>
                <span className="section-eyebrow">DOCUMENTO TRIBUTARIO</span>
                <h2 id="dte-form-title">Registrar DTE</h2>
                <p>
                  Ingresa los datos del documento. El IVA se calcula automáticamente al 13%
                  sobre el monto gravado.
                </p>
              </div>
              <button
                className="dte-modal-close"
                aria-label="Cerrar formulario"
                onClick={closeForm}
                disabled={isSaving}
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <form className="dte-form" onSubmit={(event) => void saveDte(event)}>
              <p className="dte-form-section-title">Datos del documento</p>

              <label>
                Tipo de DTE
                <select
                  value={draft.tipoDte}
                  onChange={(event) =>
                    setDraft({ ...draft, tipoDte: event.target.value as Dte['tipoDte'] })
                  }
                >
                  <option value="CCF">Comprobante de Crédito Fiscal</option>
                  <option value="FACTURA">Factura</option>
                  <option value="NC">Nota de Crédito</option>
                  <option value="ND">Nota de Débito</option>
                  <option value="RETENCION">Comprobante de Retención</option>
                  <option value="SUJETO_EXCLUIDO">Sujeto Excluido</option>
                  <option value="EXPORTACION">Exportación</option>
                </select>
              </label>

              <label>
                Fecha de emisión <span aria-hidden="true">*</span>
                <input
                  type="date"
                  required
                  value={draft.fechaEmision}
                  onChange={(event) => setDraft({ ...draft, fechaEmision: event.target.value })}
                />
              </label>

              <label className="dte-form-full">
                Número de control <span aria-hidden="true">*</span>
                <input
                  required
                  maxLength={50}
                  value={draft.numeroControl}
                  onChange={(event) =>
                    setDraft({ ...draft, numeroControl: event.target.value })
                  }
                  placeholder="Ej. DTE-01-M001-000000000000001"
                />
                <small>Número de control del DTE (hasta 50 caracteres).</small>
              </label>

              <label className="dte-form-full">
                Código de generación <span aria-hidden="true">*</span>
                <input
                  required
                  maxLength={50}
                  value={draft.codigoGeneracion}
                  onChange={(event) =>
                    setDraft({ ...draft, codigoGeneracion: event.target.value })
                  }
                  placeholder="Ej. 8F3B2A1C-9D4E-4F5A-8B6C-7D8E9F0A1B2C"
                />
                <small>UUID del documento (hasta 50 caracteres).</small>
              </label>

              <label className="dte-form-full">
                Sello de recepción
                <input
                  maxLength={40}
                  value={draft.selloRecepcion}
                  onChange={(event) =>
                    setDraft({ ...draft, selloRecepcion: event.target.value })
                  }
                  placeholder="Sello de 40 caracteres (opcional)"
                />
                <small>
                  Si el proveedor ya transmitió el DTE a Hacienda, pega aquí el sello de
                  recepción (40 caracteres).
                </small>
              </label>

              <label className="dte-form-full">
                Tercero (proveedor o cliente)
                <select
                  value={draft.idTercero}
                  onChange={(event) => setDraft({ ...draft, idTercero: event.target.value })}
                >
                  <option value="">— Sin tercero asociado —</option>
                  {terceros.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                      {t.nit ? ` · ${t.nit}` : ''}
                    </option>
                  ))}
                </select>
                <small>
                  Si el tercero no está en la lista, puedes registrarlo primero en{' '}
                  <strong>Terceros</strong>.
                </small>
              </label>

              <p className="dte-form-section-title">Montos</p>

              <label>
                Monto gravado <span aria-hidden="true">*</span>
                <input
                  required
                  inputMode="decimal"
                  value={draft.montoGravado}
                  onChange={(event) => handleMontoGravadoChange(event.target.value)}
                  placeholder="0.00"
                />
                <small>Base sin IVA. El IVA se calcula al 13%.</small>
              </label>

              <label>
                Monto exento
                <input
                  inputMode="decimal"
                  value={draft.montoExento}
                  onChange={(event) => handleMontoExentoChange(event.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label>
                IVA (13%)
                <input
                  inputMode="decimal"
                  value={draft.iva}
                  onChange={(event) => setDraft({ ...draft, iva: event.target.value })}
                  placeholder="0.00"
                />
              </label>

              <label>
                Total
                <input
                  inputMode="decimal"
                  value={draft.total}
                  onChange={(event) => setDraft({ ...draft, total: event.target.value })}
                  placeholder="0.00"
                />
              </label>

              <p className="dte-hint">
                El monto total debe coincidir con el documento físico o PDF recibido del
                proveedor. Si hay diferencias, el IVA Crédito podría ser rechazado.
              </p>

              {formError && (
                <p className="dte-form-error" role="alert">
                  {formError}
                </p>
              )}

              <footer className="dte-form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeForm}
                  disabled={isSaving}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  {isSaving ? 'Guardando…' : 'Registrar DTE'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default DteModule
