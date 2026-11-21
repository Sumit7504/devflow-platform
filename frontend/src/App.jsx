import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import Navbar from "./components/Navbar";
import AppRoutes from "./routes/AppRoutes";
import NotificationToast from "./components/notifications/NotificationToast";
import ServerWakingBanner from "./components/common/ServerWakingBanner";
import ErrorBoundary from "./components/common/ErrorBoundary";
import RouteTitle from "./components/common/RouteTitle";
import { API_CONFIG_ERROR } from "./api/client";

function AppContent() {
  const { serverError } = useAuth();

  if (API_CONFIG_ERROR) {
    return (
      <div className="config-error-wrapper" role="alert">
        <div className="card config-error-card">
          <h2 className="config-error-title">Deployment Configuration Error</h2>
          <p className="config-error-desc">{API_CONFIG_ERROR}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <RouteTitle />
      <ServerWakingBanner />
      <Navbar />

      {serverError && (
        <div style={{ maxWidth: "1100px", margin: "1rem auto 0", padding: "0 1rem", width: "100%" }}>
          <div className="alert alert-danger" style={{ margin: 0 }}>
            <span>{serverError}</span>
          </div>
        </div>
      )}

      <main className="main-content">
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </main>

      <NotificationToast />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
