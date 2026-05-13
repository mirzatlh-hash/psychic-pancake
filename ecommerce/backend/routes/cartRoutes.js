// ecommerce/backend/routes/cartRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";

import {
  addToCart,
  clearCart,
  getCart,
  mergeGuestCart,
  removeCartItem,
  updateCartItem,
} from "../controllers/cartController.js";

const router = express.Router();
router.get("/", protect, getCart);

router.post("/add", protect, addToCart);
router.post("/merge", protect, mergeGuestCart); // ← changed to "/" (current user)
router.put("/update/:productId",protect, updateCartItem);
router.delete("/remove/:productId",protect, removeCartItem);
router.delete("/clear", clearCart);

export default router;
