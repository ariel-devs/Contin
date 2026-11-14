import { useState, type FormEvent } from 'react'
import { apiRequest } from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { Icon } from './Icon'
import './PeriodsModule.css'

type PeriodDraft = {
  nombre: string
  fechaInicio: string
  fechaFin: string
}

const emptyDraft: PeriodDraft = { nombre: '', fechaInicio: '', fechaFin: '' }

function displayDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export default function PeriodsModule({
  session,
  company,
  books,
  onBooksChanged,
  onSelectBook,
}: {
  session: LoginSession
  company: Company
  books: Book[]
  onBooksChanged: (preferredBookId?: number) => void
  onSelectBook: (book: Book) => void
}) {
  const [editingBook, setEditingBook] = useState<Book | null>(null)
  const [draft, setDraft] = useState<PeriodDraft>(emptyDraft)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [closingBookId, setClosingBookId] = useState<number | null>(null)
  const [actionError, setActionError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  function openCreateForm() {
    setEditingBook(null)
    setDraft(emptyDraft)
    setFormError('')
    setIsFormOpen(true)
  }

  function openEditForm(book: Book) {
    setEditingBook(book)
    setDraft({
      nombre: book.nombre,
      fechaInicio: book.fechaInicio.slice(0, 10),
      fechaFin: book.fechaFin.slice(0, 10),
    })
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingBook(null)
    setFormError('')
  }

  async function savePeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!draft.nombre.trim() || !draft.fechaInicio || !draft.fechaFin) {
      setFormError('Completa todos los campos para guardar el período.')
      return
    }
    if (draft.fechaInicio > draft.fechaFin) {
      setFormError('La fecha de inicio no puede ser posterior a la fecha de finalización.')
      return
    }

    setIsSaving(true)
    try {
      const path = editingBook
        ? `/api/companies/${company.id}/books/${editingBook.id}`
        : `/api/companies/${company.id}/books`
      const savedBook = await apiRequest<Book>(session, path, {
        method: editingBook ? 'PATCH' : 'POST',
        body: JSON.stringify({
          nombre: draft.nombre.trim(),
          fechaInicio: draft.fechaInicio,
          fechaFin: draft.fechaFin,
        }),
      })
      setEditingBook(null)
      setDraft(emptyDraft)
      setIsFormOpen(false)
      setSuccessMessage(
        editingBook
          ? `Se actualizaron los datos de «${savedBook.nombre}».`
          : `Se creó el período «${savedBook.nombre}» y quedó abierto.`,
      )
      setActionError('')
      onBooksChanged(editingBook ? undefined : savedBook.id)
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : 'No fue posible guardar el período contable.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function closePeriod(book: Book) {
    if (
      !window.confirm(
        `¿Cerrar el período «${book.nombre}»? Después de cerrarlo no se podrán registrar nuevas partidas.`,
      )
    ) {
      return
    }

    setClosingBookId(book.id)
    setActionError('')
    setSuccessMessage('')
    try {
      await apiRequest<Book>(
        session,
        `/api/companies/${company.id}/books/${book.id}/close`,
        { method: 'POST' },
      )
      setSuccessMessage(`El período «${book.nombre}» fue cerrado.`)
      onBooksChanged()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'No fue posible cerrar el período contable.',
      )
    } finally {
      setClosingBookId(null)
    }
  }

  return (
    <section className="periods-module">
      <header className="page-heading periods-heading">
        <div>
          <span className="section-eyebrow">ADMINISTRACIÓN CONTABLE</span>
          <h1>Períodos contables</h1>
          <p>Períodos de trabajo de <strong>{company.nombre}</strong>.</p>
        </div>
        <button className="primary-button" onClick={openCreateForm}>
          <Icon name="plus" size={17} />
          Nuevo período
        </button>
      </header>

      {successMessage && (
        <div className="periods-notice periods-notice--success" role="status">
          <Icon name="check" size={17} />
          <span>{successMessage}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setSuccessMessage('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {actionError && (
        <div className="periods-notice periods-notice--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{actionError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setActionError('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {books.length === 0 ? (
        <div className="periods-empty">
          <span className="periods-empty-icon"><Icon name="calendar" size={24} /></span>
          <h2>Esta empresa aún no tiene períodos</h2>
          <p>Crea un período contable para consultar y registrar partidas en el Libro diario.</p>
          <button className="primary-button" onClick={openCreateForm}>
            <Icon name="plus" size={17} />
            Crear primer período
          </button>
        </div>
      ) : (
        <section className="periods-list-card" aria-label="Períodos de la empresa">
          <div className="periods-list-heading">
            <div>
              <h2>Períodos de {company.nombre}</h2>
              <p>{books.length} {books.length === 1 ? 'período registrado' : 'períodos registrados'}</p>
            </div>
            <span className="periods-company-tag">
              <Icon name="building" size={15} />
              {company.nombre}
            </span>
          </div>
          <div className="periods-table-scroll">
            <table className="periods-table">
              <thead>
                <tr>
                  <th>PERÍODO</th>
                  <th>FECHA DE INICIO</th>
                  <th>FECHA DE FINALIZACIÓN</th>
                  <th>ESTADO</th>
                  <th><span className="visually-hidden">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {books.map((book) => (
                  <tr key={book.id}>
                    <td data-label="Período">
                      <span className="periods-book-name">{book.nombre}</span>
                    </td>
                    <td data-label="Fecha de inicio">{displayDate(book.fechaInicio)}</td>
                    <td data-label="Fecha de finalización">{displayDate(book.fechaFin)}</td>
                    <td data-label="Estado">
                      <span className={`period-status${book.estado === 'ABIERTO' ? ' period-status--open' : ' period-status--closed'}`}>
                        <span />
                        {book.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}
                      </span>
                    </td>
                    <td data-label="Acciones">
                      <div className="period-row-actions">
                        <button
                          className="period-action-button"
                          onClick={() => onSelectBook(book)}
                          title="Seleccionar período para consultar"
                        >
                          Consultar
                        </button>
                        {book.estado === 'ABIERTO' && (
                          <>
                            <button
                              className="period-action-button"
                              onClick={() => openEditForm(book)}
                              title={`Editar ${book.nombre}`}
                            >
                              Editar
                            </button>
                            <button
                              className="period-action-button period-action-button--close"
                              disabled={closingBookId === book.id}
                              onClick={() => void closePeriod(book)}
                              title={`Cerrar ${book.nombre}`}
                            >
                              {closingBookId === book.id ? 'Cerrando…' : 'Cerrar'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {isFormOpen && (
        <div className="period-form-backdrop" onMouseDown={closeForm}>
          <section
            aria-labelledby="period-form-title"
            aria-modal="true"
            className="period-form-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="period-form-heading">
              <div>
                <span className="section-eyebrow">{editingBook ? 'ACTUALIZACIÓN' : 'NUEVO REGISTRO'}</span>
                <h2 id="period-form-title">{editingBook ? 'Editar período' : 'Nuevo período contable'}</h2>
                <p>Empresa: <strong>{company.nombre}</strong></p>
              </div>
              <button
                aria-label="Cerrar formulario"
                className="period-form-dismiss"
                disabled={isSaving}
                onClick={closeForm}
                type="button"
              >
                <Icon name="close" size={18} />
              </button>
            </header>
            <form onSubmit={(event) => void savePeriod(event)}>
              <label>
                Nombre del período
                <input
                  autoFocus
                  maxLength={150}
                  onChange={(event) => setDraft((current) => ({ ...current, nombre: event.target.value }))}
                  placeholder="Ej. 2026"
                  required
                  value={draft.nombre}
                />
              </label>
              <div className="period-form-date-grid">
                <label>
                  Fecha de inicio
                  <input
                    onChange={(event) => setDraft((current) => ({ ...current, fechaInicio: event.target.value }))}
                    required
                    type="date"
                    value={draft.fechaInicio}
                  />
                </label>
                <label>
                  Fecha de finalización
                  <input
                    onChange={(event) => setDraft((current) => ({ ...current, fechaFin: event.target.value }))}
                    required
                    type="date"
                    value={draft.fechaFin}
                  />
                </label>
              </div>
              {!editingBook && (
                <p className="period-form-open-note">
                  El período se creará asociado a esta empresa y con estado Abierto.
                </p>
              )}
              {formError && <p className="period-form-error" role="alert">{formError}</p>}
              <footer className="period-form-actions">
                <button className="secondary-button" disabled={isSaving} onClick={closeForm} type="button">
                  Cancelar
                </button>
                <button className="primary-button" disabled={isSaving} type="submit">
                  {isSaving ? 'Guardando…' : editingBook ? 'Guardar cambios' : 'Crear período'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}
