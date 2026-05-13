//ecommerce/backend/server.js
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import connectDB from "./config/db.js";
import productRoutes from "./routes/productRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import cartRoutes from "./routes/cartRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import passwordRoutes from "./routes/passwordResetRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import { connectRedis, redisClient } from "./config/redis/redisClient.js";
import { ioredisDemo } from "./config/redis/redisClient2.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
connectDB();
connectRedis();
const app = express();
app.use(express.json());

app.use("/images", express.static(path.join(__dirname, "uploads", "images")));
app.use(
  cors({
    origin: [
      "https://cautious-telegram-x5gqv4q4v6wpcpqxw-5173.app.github.dev",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(cookieParser());
app.set("trust proxy", true);
app.get("/redis2", ioredisDemo);
app.get("/redis", async (req, res) => {
  try {
    await redisClient.set("name", "talha", {
      EX: 60, // it will expires after 60secs
    });

    const value = await redisClient.get("name");
    res.json({ success: true, redisValue: value });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
});
app.get("/", (req, res) => res.json({ message: "API is running" }));
app.use("/products", productRoutes);
app.use("/auth", authRoutes);
app.use("/cart", cartRoutes);
app.use("/categories", categoryRoutes);
app.use("/orders", orderRoutes);
app.use("/admin", adminRoutes);
app.use("/users", userRoutes);
app.use("/wishlist", wishlistRoutes);
app.use("/password", passwordRoutes);
app.use("/ai", aiRoutes);
app.use((err, req, res, next) => {
  console.error("🔥 Global Error:", err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";

  res.status(statusCode).json({
    success: false,
    message,
    // Only show stack in development
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
