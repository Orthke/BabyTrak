import React from 'react';
import { XLg } from '../icons.jsx';

function formatError(error, info) {
  const lines = [];
  if (error?.name || error?.message) lines.push(`${error?.name || 'Error'}: ${error?.message || ''}`.trim());
  if (error?.stack) lines.push(error.stack);
  if (info?.componentStack) lines.push(`Component stack:${info.componentStack}`);
  return lines.filter(Boolean).join('\n\n');
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error('Unhandled UI error', error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    const details = formatError(error, info);

    return (
      <div className="app error-shell">
        <main className="app-main error-main">
          <section className="error-card" role="alert" aria-live="assertive">
            <div className="error-icon-wrap">
              <XLg size={24} />
            </div>
            <h1>Something went wrong</h1>
            <p className="error-summary">
              The app hit an unexpected error. You can expand the details below to see the stack trace.
            </p>
            <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
              Reload app
            </button>
            <details className="error-details">
              <summary>View details</summary>
              <pre>{details || 'No stack trace was captured.'}</pre>
            </details>
          </section>
        </main>
      </div>
    );
  }
}