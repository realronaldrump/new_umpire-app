import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[judgment-call] renderer crashed:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="crash">
          <div className="crash__box panel">
            <span className="crash__title">RAIN DELAY</span>
            <p>The renderer hit a snag: {this.state.error.message}</p>
            <button className="btn btn--gold" onClick={() => window.location.reload()}>
              RESTART THE BROADCAST
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
