// ecommerce/frontend/src/context/AuthContext.jsx
import { createContext, useState, useEffect, useContext, useMemo } from "react";
import API from "../api";
import { jwtDecode } from "jwt-decode";

// Helper – read sessionId from cookie (used in CartContext too)
const getSessionIdFromCookie = () => {
  const match = document.cookie.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem("token");
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const decoded = jwtDecode(storedToken);
        if (decoded.exp < Date.now() / 1000) {
          console.warn("Token expired → logging out");
          logout();
          return;
        }

        API.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;

        const res = await API.get("/auth/me");
        const freshUser = res.data.user || res.data;
        setUser(freshUser);
        localStorage.setItem("user", JSON.stringify(freshUser));
      } catch (err) {
        console.warn("Auth init failed:", err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

const login = async (email, password) => {
  try {
    console.log("Attempting login with:", email, password);
    const res = await API.post("/auth/login", { email, password });
    const { token, user } = res.data;

    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));

    API.defaults.headers.common["Authorization"] = `Bearer ${token}`;

    setToken(token);
    setUser(user);

    // ─── MERGE CART AFTER LOGIN ────────────────────────────────
    const sessionId = getSessionIdFromCookie();
    console.log("Session ID from cookie:", sessionId); // Debug log
    
    if (sessionId) {
      try {
        // Wait for cart merge to complete
        const mergeResponse = await API.post(
          "/cart/merge",
          { sessionId }, // Send in body
          {
            headers: { 
              "x-session-id": sessionId,
              "Authorization": `Bearer ${token}` 
            },
          }
        );
        console.log("Cart merge response:", mergeResponse.data);
        
        // If you have cart context, you might want to update it here
        // const { setCart } = useCart();
        // setCart(mergeResponse.data.cart);
        
      } catch (mergeErr) {
        console.warn("Cart merge failed after login:", mergeErr.response?.data || mergeErr);
      }
    }

    return { success: true, user, token };
  } catch (err) {
    console.error("Login failed:", err);
    return {
      success: false,
      message: err.response?.data?.message || "Invalid email or password",
    };
  }
};
const logout = () => {
  document.cookie = "sessionId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  delete API.defaults.headers.common["Authorization"];
  setToken(null);
  setUser(null);
};
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem("user", JSON.stringify(updatedUser));
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: !!user && !!token,
      login,
      logout,
      updateUser,
    }),
    [user, token, loading],
  );

  if (loading) {
    return null; // or a minimal spinner
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
