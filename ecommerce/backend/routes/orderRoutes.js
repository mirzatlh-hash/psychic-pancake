// ecommerce/backend/routes/orderRoutes.js
import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";

import {
  deleteOrder,
  getAllOrders,
  getOrderById,
  getOrdersByUser,
  placeOrder,
  statusChange,          // ← make sure this is imported
} from "../controllers/orderController.js";

const router = express.Router();

// ====================== PROTECTED USER ROUTES ======================
router.use(protect);

router.post("/place-order", placeOrder);

// My orders (recommended new route)
router.get("/my-orders", getOrdersByUser);

// View single order (user can view their own, admin can view any)
router.get("/:id", getOrderById);

// ====================== ADMIN ONLY ======================
router.use(admin);

router.get("/all", getAllOrders);           // Fixed: no more /orders/orders/all
router.get("/user/:userId", getOrdersByUser); // Admin can view any user's orders
router.put("/:id/status", statusChange);
router.delete("/:id", deleteOrder);

export default router;