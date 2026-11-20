import React, { createContext, useContext, useState, useEffect } from "react";
import client, {
  getStoredToken,
  setStoredToken,
  clearStoredToken,
} from "../api/client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredToken);
  const [loading, setLoading] = useState(true);
  const [serverError, setServerError] = useState(null);

  // Restore session on application startup
  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = getStoredToken();
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const res = await client.get("/auth/me");
        if (res.data?.success && res.data?.user) {
          setUser(res.data.user);
          setToken(storedToken);
          setServerError(null);
        }
      } catch (err) {
        // Clear token strictly on 401 or 403 from /auth/me
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
          clearStoredToken();
          setUser(null);
          setToken(null);
        } else {
          // Network or server unreachable error: preserve token, notify user
          setServerError("Unable to reach DevFlow servers. Please check your connection.");
        }
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (email, password) => {
    const res = await client.post("/auth/login", { email, password });
    if (res.data?.success && res.data?.token) {
      const receivedToken = res.data.token;
      const receivedUser  = res.data.user;
      setStoredToken(receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      setServerError(null);
      return res.data;
    }
    return res.data;
  };

  const register = async (name, email, password, role) => {
    const res = await client.post("/auth/register", {
      name,
      email,
      password,
      role,
    });
    if (res.data?.success && res.data?.token) {
      const receivedToken = res.data.token;
      const receivedUser  = res.data.user;
      setStoredToken(receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      setServerError(null);
      return res.data;
    }
    return res.data;
  };

  const logout = () => {
    clearStoredToken();
    setUser(null);
    setToken(null);
    setServerError(null);
  };

  const value = {
    user,
    token,
    loading,
    serverError,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
