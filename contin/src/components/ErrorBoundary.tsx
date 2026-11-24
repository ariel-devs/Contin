import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean; message: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message:
        error instanceof Error
          ? error.message
          : 'Ocurrió un error inesperado en la aplicación.',
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturó un error:', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'grid',
            minHeight: '100vh',
            placeItems: 'center',
            padding: '24px',
            background: '#f5f7fa',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              padding: '28px',
              border: '1px solid #e6eaf0',
              borderRadius: '10px',
              background: '#fff',
              textAlign: 'center',
            }}
          >
            <h1
              style={{
                margin: '0 0 8px',
                color: '#30455d',
                fontFamily: 'Manrope, sans-serif',
                fontSize: '20px',
              }}
            >
              Algo salió mal
            </h1>
            <p style={{ margin: '0 0 18px', color: '#7b8795', fontSize: '13px' }}>
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '10px 18px',
                border: 0,
                borderRadius: '7px',
                background: '#294d77',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
