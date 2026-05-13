// ecommerce/frontend/src/context/CartContext.jsx
import { createContext, useContext, useState, useEffect } from "react";
import API from "../api";
import { useAuth } from "./AuthContext"; // 👈 new import

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState({
    items: [],
    totalAmount: 0,
    totalItems: 0,
  });
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);

  const { isAuthenticated, loading: authLoading, token } = useAuth(); // 👈 use auth state

  const getCartHeaders = () => {
    const headers = {};
    if (isAuthenticated && token) {
      headers.Authorization = `Bearer ${token}`;
    } else if (sessionId) {
      headers["x-session-id"] = sessionId;
    }
    return headers;
  };

  // Initialize or retrieve sessionId from cookies (unchanged)
  useEffect(() => {
    const getSessionId = () => {
      const cookies = document.cookie.split("; ");
      const sidCookie = cookies.find((row) => row.startsWith("sessionId="));
      let sid = sidCookie ? sidCookie.split("=")[1] : null;

      if (!sid) {
        sid = crypto.randomUUID();
        document.cookie = `sessionId=${sid}; path=/; max-age=${
          30 * 24 * 60 * 60
        }; SameSite=Strict; Secure=${window.location.protocol === "https:"}`;
      }

      setSessionId(sid);
    };

    getSessionId();
  }, []);

const fetchCart = async () => {
  setLoading(true);
  try {
    const headers = {};

    if (isAuthenticated && token) {
      headers.Authorization = `Bearer ${token}`;
      console.log("🧑‍💼 Fetching as LOGGED-IN user with token");
    } else if (sessionId) {
      headers["x-session-id"] = sessionId;
      console.log("👤 Fetching as GUEST");
    }

    console.log("📤 Sending headers:", headers);

    console.log("isAuthenticated:", isAuthenticated);
console.log("token exists:", !!token);
console.log("sessionId:", sessionId);

    const res = await API.get("/cart", { headers });

    const fetchedCart = res.data.cart || {
      items: [],
      totalAmount: 0,
      totalItems: 0,
    };

    setCart(fetchedCart);
    console.log("✅ Cart updated in UI:", fetchedCart.totalItems, "items");
  } catch (err) {
    console.error("❌ Failed to fetch cart:", err.response?.data || err.message);
  } finally {
    setLoading(false);
  }
};
  // Fetch cart when sessionId changes (guest) or when authenticated
  useEffect(() => {
    if (sessionId) {
      fetchCart();
    }
  }, [sessionId]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      // Clear cart state
      setCart({
        items: [],
        totalAmount: 0,
        totalItems: 0,
      });
      // Generate a brand new session ID for the next guest
      const newSid = crypto.randomUUID();
      document.cookie = `sessionId=${newSid}; path=/; max-age=${
        30 * 24 * 60 * 60
      }; SameSite=Strict; Secure=${window.location.protocol === "https:"}`;
      setSessionId(newSid);
    }
  }, [isAuthenticated, authLoading]);

  // 👇 NEW: Refresh cart when user logs in (ensures we display the merged user cart)
  useEffect(() => {
    if (!authLoading && isAuthenticated && sessionId) {
      fetchCart();
    }
  }, [isAuthenticated, authLoading, sessionId]);

  const addToCart = async (productId, quantity = 1) => {
    if (!sessionId && !(isAuthenticated && token)) return;

    try {
      const headers = getCartHeaders();

      const res = await API.post(
        "/cart/add",
        { productId, quantity },
        { headers },
      );
      setCart(res.data.cart);
    } catch (err) {
      console.error("Add to cart failed:", err);
      alert(err.response?.data?.message || "Failed to add to cart");
    }
  };
  const clearCart = async () => {
    if (!sessionId && !(isAuthenticated && token)) return;

    try {
      const headers = getCartHeaders();

      await API.delete("/cart/clear", { headers });

      setCart({
        items: [],
        totalAmount: 0,
        totalItems: 0,
      });
    } catch (err) {
      console.error("Clear cart failed:", err);
    }
  };
  const updateCartItem = async (productId, quantity) => {
    if ((!sessionId && !(isAuthenticated && token)) || quantity < 1) return;

    try {
      const headers = getCartHeaders();

      const res = await API.put(
        `/cart/update/${productId}`,
        { quantity },
        { headers },
      );

      setCart(res.data.cart);
    } catch (err) {
      console.error("Update cart failed:", err);
    }
  };

  const removeFromCart = async (productId) => {
    if (!sessionId && !(isAuthenticated && token)) return;

    try {
      const headers = getCartHeaders();

      const res = await API.delete(`/cart/remove/${productId}`, { headers });

      setCart(res.data.cart);
    } catch (err) {
      console.error("Remove from cart failed:", err);
    }
  };

  const value = {
    cart,
    loading,
    addToCart,
    updateCartItem,
    removeFromCart,
    refreshCart: fetchCart,
    itemCount: cart?.totalItems || cart?.items?.length || 0,
    cartTotal: cart?.totalAmount || 0,
    clearCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
