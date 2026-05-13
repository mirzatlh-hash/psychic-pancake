// ecommerce/backend/controllers/orderController.js
import asyncHandler from "../utils/asyncHandler.js";
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";

export const getAllOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find().populate("user", "name");
  res.json({ success: true, orders });
});
export const getOrdersByUser = asyncHandler(async (req, res) => {
  let userId = req.user._id;

  // If admin provided a userId in URL, use that instead
  if (
    req.params.userId &&
    (req.user.role === "admin" || req.user.role === "Admin")
  ) {
    userId = req.params.userId;
  }

  const orders = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ success: true, orders });
});
export const statusChange = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status)
    return res
      .status(400)
      .json({ success: false, message: "Status is required" });

  const order = await Order.findById(id);
  if (!order)
    return res.status(404).json({ success: false, message: "Order not found" });

  const isOwner = order.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "Admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to view this order",
    });
  }
  order.status = status;

  await order.save();

  res.json({ success: true, message: "Order status updated", order });
});

export const deleteOrder = asyncHandler(async (req, res) => {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order)
    return res.status(404).json({ success: false, message: "Order not found" });

  res.json({ success: true, message: "Order deleted", order });
});
export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Optional: early validation (good practice)
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid order ID format",
    });
  }

  // Populate more useful fields
  const order = await Order.findById(id)
    .populate("user", "name email phone") // add phone if you have it
    .populate({
      path: "items.product",
      select: "name images price slug", // useful fields for frontend
    })
    .lean(); // faster when we don't need to modify the doc

  if (!order) {
    return res.status(404).json({
      success: false,
      message: "Order not found",
    });
  }

  // Permission check – allow owner OR admin
  const isOwner = order.user._id.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin" || req.user.role === "Admin";

  if (!isOwner && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to view this order",
    });
  }

  // Calculations
  const subTotal = order.items.reduce((sum, item) => {
    // Use populated price if available, fallback to stored snapshot
    const itemPrice = item.product?.price || item.price;
    return sum + itemPrice * item.quantity;
  }, 0);

  // In real app: tax rate should come from order / settings / shipping country
  const taxRate = 0.05; // ← consider making this configurable later
  const tax = subTotal * taxRate;
  const totalAmount = subTotal + tax;

  // Optional: also return shipping cost, discount etc if your Order model has them
  res.json({
    success: true,
    order,
    subTotal: Number(subTotal.toFixed(2)),
    tax: Number(tax.toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
  });
});
export const placeOrder = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // ─── 1. Extract & validate input ───────────────────────────────────────
  const {
    items,
    shippingAddress,
    paymentMethod,
  } = req.body;

  // Do NOT trust frontend totalAmount or paymentStatus
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Order must contain at least one item",
    });
  }

  if (!shippingAddress?.street || !shippingAddress?.city ||
      !shippingAddress?.country || !shippingAddress?.zipCode ||
      !shippingAddress?.fullName) {
    return res.status(400).json({
      success: false,
      message: "Complete shipping address is required (fullName, street, city, country, zipCode)",
    });
  }

  if (!paymentMethod || !["cod", "card"].includes(paymentMethod)) {
    return res.status(400).json({
      success: false,
      message: "Valid payment method required (cod or card)",
    });
  }

  // ─── 2. Validate products, stock & calculate real total ────────────────
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let calculatedTotal = 0;
    const orderItems = [];
    const stockBulkOps = [];
for (const item of items) {
  const productId = item.product || item.productId;
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error("Invalid product ID");
  }

  const product = await Product.findById(productId).session(session);
  if (!product) throw new Error(`Product not found`);

  if (product.stock < item.quantity) {
    throw new Error(`Only ${product.stock} left for ${product.name}`);
  }

  calculatedTotal += product.price * item.quantity;

  orderItems.push({
    product: product._id,
    name: item.name || product.name,
    image: item.image || (product.images?.[0] || ""),
    price: product.price,
    quantity: item.quantity,
  });

  stockBulkOps.push({
    updateOne: {
      filter: { _id: product._id },
      update: { $inc: { stock: -item.quantity } },
    },
  });
}

    // ─── 3. Create order ───────────────────────────────────────────────────
    const order = new Order({
      user: userId,
      items: orderItems,
      shippingAddress: {
        fullName: shippingAddress.fullName,
        street: shippingAddress.street,
        city: shippingAddress.city,
        state: shippingAddress.state || "N/A",
        country: shippingAddress.country,
        zipCode: shippingAddress.zipCode,
        phone: shippingAddress.phone,
      },
      paymentMethod,
      paymentStatus: paymentMethod === "cod" ? "pending" : "processing", // sensible default
      status: "pending",
      totalAmount: calculatedTotal,
    });

    await order.save({ session });

    // ─── 4. Apply stock updates atomically ─────────────────────────────────
    if (stockBulkOps.length > 0) {
      await Product.bulkWrite(stockBulkOps, { session });
    }

    // ─── 5. Clear user's cart ──────────────────────────────────────────────
    await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], totalAmount: 0, totalItems: 0 } },
      { session }
    );

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Order placed successfully",
      order: {
        _id: order._id,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    // Distinguish between expected validation errors and real failures
    if (error.message.includes("Insufficient stock") || error.message.includes("not found")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Order placement failed:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to place order. Please try again later.",
    });
  } finally {
    session.endSession();
  }
});