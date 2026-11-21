import React from "react";
import { useLocation } from "react-router-dom";

class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an unhandled rendering error:", error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    // Automatically reset error boundary state when the route changes
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-wrapper" role="alert">
          <div className="card error-boundary-card">
            <h2 className="error-boundary-title">Something went wrong</h2>
            <p className="error-boundary-desc">
              An unexpected error occurred while displaying this page.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={this.handleReload}
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function ErrorBoundary({ children }) {
  const location = useLocation();
  const resetKey = location.pathname + location.search;

  return (
    <ErrorBoundaryInner resetKey={resetKey}>
      {children}
    </ErrorBoundaryInner>
  );
}
