import React from "react";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import AppRoutes from "./routes/AppRoutes";

function AppContent() {
  const { serverError } = useAuth();

  return (
    <div className="app-container">
      <Navbar />

      {serverError && (
        <div style={{ maxWidth: "1000px", margin: "1rem auto 0", padding: "0 1rem", width: "100%" }}>
          <div className="alert alert-warning">
            <span>⚠️</span>
            <span>{serverError}</span>
          </div>
        </div>
      )}

      <main className="main-content">
        <AppRoutes />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}
