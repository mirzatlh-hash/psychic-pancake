//ecommerce/backend/routes/authRoutes.js
import express from "express";
import { register, login, getProfile, getCurrentUser } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Public */
router.post("/register", register);
router.post("/login", login);

/* Protected */
router.get("/profile", protect, getProfile);
router.get("/me", protect, getCurrentUser);
export default router;
