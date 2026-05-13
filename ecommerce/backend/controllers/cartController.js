// ecommerce/backend/controllers/cartController.js
import asyncHandler from "../utils/asyncHandler.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";
import crypto from "crypto";

const getCartQuery = (req) => {
  console.log("🔍 getCartQuery Debug:", {
    hasUser: !!req.user,
    userId: req.user?.id,
    authHeader: req.headers.authorization ? "YES" : "NO"
  });
  // 1. Authenticated user takes priority
  if (req.user) {
    return { userId: req.user.id };
  }

  // 2. Try cookie first (more persistent)
  let sessionId = req.cookies?.sessionId;
  console.log("Session ID from cookie in getCartQuery:", sessionId); // Debug

  // 3. Fallback to header if cookie missing (during transition)
  if (!sessionId) {
    sessionId = req.headers["x-session-id"];
    console.log("Session ID from header:", sessionId); // Debug
  }

  if (sessionId) {
    return { sessionId };
  }

  return null;
};
// ─── GET CART ───────────────────────────────────────────────────────────────
export const getCart = asyncHandler(async (req, res) => {
  const query = getCartQuery(req);
  console.log("getCart query:", query);

  if (!query) {
    return res.status(200).json({ success: true, cart: { items: [], totalAmount: 0, totalItems: 0 } });
  }

  let cart = await Cart.findOne(query).populate("items.productId");
  
  console.log("Found cart:", cart ? cart._id : "none");

  if (!cart) {
    console.log("Attempting to create cart with query:", query);
    try {
      cart = await Cart.create(query);
      console.log("Cart created successfully, ID:", cart._id);
    } catch (err) {
      console.error("Cart creation error details:", err);
      return res.status(500).json({ success: false, message: "Cart creation failed" });
    }
  }

  console.log("Cart before totals update:", cart ? cart._id : "null");
  if (!cart) {
    return res.status(500).json({ success: false, message: "Cart missing after creation" });
  }

  await updateCartTotals(cart);
  await cart.save();

  res.json({ success: true, cart: formatCartResponse(cart) });
});

// ─── ADD TO CART ────────────────────────────────────────────────────────────
export const addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;
  const qty = Number(quantity);

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid product ID" });
  }
  if (isNaN(qty) || qty < 1) {
    return res
      .status(400)
      .json({ success: false, message: "Quantity must be ≥ 1" });
  }

  const product = await Product.findById(productId);
  if (!product)
    return res
      .status(404)
      .json({ success: false, message: "Product not found" });

  const query = getCartQuery(req);
  if (!query)
    return res
      .status(401)
      .json({ success: false, message: "Session required" });

  let cart = await Cart.findOne(query);
  if (!cart) {
    const sessionId =
      req.headers["x-session-id"] || crypto.randomBytes(16).toString("hex");
    cart = new Cart({ ...query, sessionId, items: [] });
    if (!req.user) {
      res.cookie("sessionId", sessionId, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });
    }
  }

  const itemIndex = cart.items.findIndex(
    (i) => i.productId.toString() === productId,
  );

  const newQty = itemIndex >= 0 ? cart.items[itemIndex].quantity + qty : qty;

  if (newQty > product.stock) {
    return res.status(400).json({
      success: false,
      message: `Only ${product.stock} in stock (requested: ${newQty})`,
    });
  }

  if (itemIndex >= 0) {
    cart.items[itemIndex].quantity = newQty;
  } else {
    cart.items.push({ productId, quantity: qty });
  }

  await updateCartTotals(cart);
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(
    "items.productId",
    "name price images slug stock",
  );
  res.json({ success: true, cart: formatCartResponse(populated) });
});

// ─── UPDATE CART ITEM ───────────────────────────────────────────────────────
export const updateCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { quantity } = req.body;
  const qty = Number(quantity);

  if (isNaN(qty) || qty < 1) {
    return res
      .status(400)
      .json({ success: false, message: "Quantity must be ≥ 1" });
  }

  const query = getCartQuery(req);
  if (!query)
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });

  const cart = await Cart.findOne(query);
  if (!cart)
    return res.status(404).json({ success: false, message: "Cart not found" });

  const item = cart.items.find((i) => i.productId.toString() === productId);
  if (!item)
    return res
      .status(404)
      .json({ success: false, message: "Item not in cart" });

  const product = await Product.findById(productId);
  if (qty > product.stock) {
    return res
      .status(400)
      .json({ success: false, message: `Only ${product.stock} available` });
  }

  item.quantity = qty;
  await updateCartTotals(cart);
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(
    "items.productId",
    "name price images",
  );
  res.json({ success: true, cart: formatCartResponse(populated) });
});

// ─── REMOVE CART ITEM ───────────────────────────────────────────────────────
export const removeCartItem = asyncHandler(async (req, res) => {
  const { productId } = req.params;
  console.log("Removing productId:", productId);
  const query = getCartQuery(req);
  if (!query)
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });

  const cart = await Cart.findOne(query);
  console.log("Query used to find cart:", JSON.stringify(query, null, 2));
  console.log("Current cart items before removal:", cart);

  if (!cart) {
    // Diagnostic: look for ANY cart belonging to this user
    if (req.user) {
      const userCarts = await Cart.find({ user: req.user._id }).lean();
      console.log("All carts for this user:", userCarts);
    }

    // Diagnostic: look for the guest session cart
    const guestCart = await Cart.findOne({
      sessionId: req.headers["x-session-id"],
    }).lean();
    console.log("Guest/session cart still exists?", guestCart ? "YES" : "NO");

    return res.status(404).json({ success: false, message: "Cart not found" });
  }
  cart.items = cart.items.filter((i) => i.productId.toString() !== productId);

  await updateCartTotals(cart);
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(
    "items.productId",
    "name price images",
  );
  res.json({ success: true, cart: formatCartResponse(populated) });
});

// ─── CLEAR CART ─────────────────────────────────────────────────────────────
export const clearCart = asyncHandler(async (req, res) => {
  const query = getCartQuery(req);
  if (!query)
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });

  await Cart.findOneAndUpdate(query, {
    $set: { items: [], totalAmount: 0, totalItems: 0 },
  });

  res.json({
    success: true,
    cart: { items: [], totalAmount: 0, totalItems: 0 },
  });
});

// ─── MERGE GUEST CART (called after login) ──────────────────────────────────
export const mergeGuestCart = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const sessionId =
    req.body.sessionId || req.headers["x-session-id"] || req.cookies?.sessionId;

  console.log("Merge attempt - SessionId:", sessionId); // Debug log
  console.log("Merge attempt - UserId:", userId); // Debug log

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: "Session ID required for merge",
    });
  }

  // Find guest cart - make sure we're using the correct field name
  const guestCart = await Cart.findOne({ sessionId: sessionId });
  console.log("Guest cart found:", guestCart ? "YES" : "NO"); // Debug log

  if (!guestCart || guestCart.items.length === 0) {
    return res.status(200).json({
      success: true,
      message: "No guest cart to merge or cart is empty",
    });
  }

  // Find or create user cart
  let userCart = await Cart.findOne({ userId });
  if (!userCart) {
    userCart = await Cart.create({
      userId,
      items: [],
      totalAmount: 0,
      totalItems: 0,
    });
  }

  // Merge logic
  const itemMap = new Map();

  // Add user cart items to map
  userCart.items.forEach((item) => {
    itemMap.set(item.productId.toString(), {
      productId: item.productId,
      quantity: item.quantity,
    });
  });

  // Merge guest cart items
  for (const guestItem of guestCart.items) {
    const productId = guestItem.productId.toString();
    const product = await Product.findById(productId);

    if (!product) continue; // Skip if product doesn't exist

    if (itemMap.has(productId)) {
      // Item exists in user cart - combine quantities
      const newQuantity = itemMap.get(productId).quantity + guestItem.quantity;
      // Check stock
      if (newQuantity > product.stock) {
        itemMap.get(productId).quantity = product.stock;
      } else {
        itemMap.get(productId).quantity = newQuantity;
      }
    } else {
      // New item - check stock
      if (guestItem.quantity <= product.stock) {
        itemMap.set(productId, {
          productId: guestItem.productId,
          quantity: guestItem.quantity,
        });
      }
    }
  }

  // Update user cart
  userCart.items = Array.from(itemMap.values());

  // Update totals
  await updateCartTotals(userCart);
  await userCart.save();

  // Delete guest cart
  await Cart.deleteOne({ _id: guestCart._id });

  // Clear session cookie
  res.clearCookie("sessionId", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });

  // Return populated cart
  const populatedCart = await Cart.findById(userCart._id).populate({
    path: "items.productId",
    select: "name price images slug stock",
  });

  res.json({
    success: true,
    cart: formatCartResponse(populatedCart),
    message: "Cart merged successfully",
  });
});

// Helpers (unchanged from your code)
async function updateCartTotals(cart) {
  const populated = await Cart.findById(cart._id).populate("items.productId");
  let totalItems = 0;
  let totalAmount = 0;

  populated.items.forEach((item) => {
    const price = item.productId?.price || 0;
    totalItems += item.quantity;
    totalAmount += price * item.quantity;
  });

  cart.totalItems = totalItems;
  cart.totalAmount = totalAmount;
}

function formatCartResponse(cart) {
  return {
    _id: cart._id,
    items: cart.items.map((item) => ({
      productId: item.productId?._id || item.productId,
      name: item.productId?.name,
      price: item.productId?.price,
      images: item.productId?.images,
      quantity: item.quantity,
    })),
    totalItems: cart.totalItems,
    totalAmount: cart.totalAmount,
    updatedAt: cart.updatedAt,
  };
}
