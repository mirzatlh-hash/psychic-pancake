// ecommerce/backend/controllers/userController.js
import User from "../models/User.js";
import asyncHandler from "../utils/asyncHandler.js";

export const getAllUsers = asyncHandler(async (req, res) => {
  const users = await User.find().select("-password").lean();
  res.json({ success: true, users });
});
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role = "user", phone, address } = req.body;

  if (!password) {
    return res
      .status(400)
      .json({ success: false, message: "Password is required" });
  }

  const userExists = await User.findOne({ email });
  if (userExists) {
    return res
      .status(400)
      .json({ success: false, message: "User already exists" });
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    phone,
    address,
  });

  res.status(201).json({
    success: true,
    message: "User created successfully",
    user: { ...user.toObject(), password: undefined },
  });
});
export const updateUser = asyncHandler(async (req, res) => {
  const { name, email, phone, address, role } = req.body;
  const user = await User.findById(req.params.id);

  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  if (name) user.name = name;
  if (email) user.email = email;
  if (phone) user.phone = phone;
  if (address) user.address = address;
  if (role) user.role = role.toLowerCase();

  await user.save();
  res.json({
    success: true,
    message: "User updated",
    user: { ...user.toObject(), password: undefined },
  });
});

export const userRoleChange = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const validRoles = ["user", "admin", "customer", "guest"];

  if (!validRoles.includes(role.toLowerCase())) {
    return res.status(400).json({ success: false, message: "Invalid role" });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role: role.toLowerCase() },
    { new: true },
  ).select("-password");

  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  res.json({ success: true, message: "Role updated", user });
});

export const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  await user.deleteOne();
  res.json({ success: true, message: "User deleted successfully" });
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");
  if (!user)
    return res.status(404).json({ success: false, message: "User not found" });

  res.json({ success: true, user });
});
