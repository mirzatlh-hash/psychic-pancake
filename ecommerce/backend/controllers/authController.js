// ecommerce/backend/controllers/authController.js
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

/* Generate JWT */
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

/* REGISTER */
export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({
      success: false,
      message: "Name is required",
    });
  }

  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  if (!password) {
    return res.status(400).json({
      success: false,
      message: "Password is required",
    });
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    return res.status(400).json({
      success: false,
      message: "Email already registered",
    });
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: "user", // ← Always lowercase "user"
  });

  res.status(201).json({
    success: true,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
  });
});

/* LOGIN */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  console.log("LOGIN REQUEST BODY:", req.body); // ← Add this
  console.log("LOGIN HEADERS:", req.headers); // ← Add this

  if (!email || typeof email !== "string" || !email.trim() || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide email and password",
    });
  }

  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+password");

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password",
    });
  }
  //console.log("User logged in:", user.email , user.toObject()); // Debug log
  res.status(200).json({
    success: true,
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    token: generateToken(user._id),
    user: user.toObject(),
  });
});

/* PROFILE (Protected) */
export const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      phone: req.user.phone,
      address: req.user.address,
    },
  });
});
export const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Not authenticated" });
  }

  res.json({
    success: true,
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      phone: req.user.phone,
      address: req.user.address,
      // add any other safe fields
    },
  });
});
