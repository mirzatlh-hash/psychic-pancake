//ecommerce/backend/controllers/productController.js
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Category from "../models/Category.js";
import asyncHandler from "../utils/asyncHandler.js";
import { deleteImage } from "./imageController.js";
import mongoose from "mongoose";
import { reIngestProduct } from "../config/vectorService.js";
import { redisClient } from "../config/redis/redisClient.js";

export const getAllProducts = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 12,
    search,
    priceMin = 0,
    priceMax = 100000,
    category,
    sortField = "createdAt",
    sortOrder = "desc",
    rating,
    brand,
  } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // 🔹 Build filter
  const filter = {
    price: {
      $gte: Number(priceMin),
      $lte: Number(priceMax),
    },
  };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }
  if (brand) {
    filter.brand = brand;
  }
  if (category) {
    if (!mongoose.isValidObjectId(category)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid category ID – must be a valid MongoDB ObjectId (24 hex characters)",
      });
    }

    filter.category = category;
  }
  if (rating) {
    filter.rating = { $gte: Number(rating) };
  }
  // 🔹 Sorting
  const sort = {
    [sortField]: sortOrder === "desc" ? -1 : 1,
  };

  // ✅ APPLY FILTER HERE
  const products = await Product.find(filter)
    .populate("category", "name")
    .sort(sort)
    .skip(skip)
    .limit(limitNum)
    .lean();

  const totalProducts = await Product.countDocuments(filter);
  const TotalProductCount = await Product.countDocuments();
  const featuredProducts = await Product.find({ featured: true });
  const newArrivals = await Product.find()
    .populate("category", "name")
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    products,
    totalProducts,
    currentPage: pageNum,
    TotalProductCount,
    totalPages: Math.ceil(totalProducts / limitNum),
    featuredProducts,
    newArrivals,
  });
});
export const getProductsByUser = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  // ── Sorting parameters ────────────────────────────────────────
  const sortField = req.query.sortBy || "createdAt"; // default createdAt
  const sortOrder = req.query.sortOrder || "desc";

  // Validate sortField to prevent injection (optional but good)
  const allowedFields = ["createdAt", "price", "rating"];
  if (!allowedFields.includes(sortField)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid sort field" });
  }

  const sortDir = sortOrder === "asc" ? 1 : -1;

  try {
    const products = await Product.find({ createdBy: userId })
      .sort({ [sortField]: sortDir })
      .populate("category", "name")
      .lean();

    res.status(200).json(products);
  } catch (error) {
    console.error("Error fetching user products:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
export const getPopularProducts = asyncHandler(async (req, res) => {
  // Aggregate to find most sold products
  const popularProducts = await Order.aggregate([
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        totalSold: { $sum: "$items.quantity" },
        productName: { $first: "$items.name" }, // from order (snapshot)
        productImage: { $first: "$items.image" },
        productPrice: { $first: "$items.price" },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 10 }, // Top 10 popular products
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productDetails",
      },
    },
    { $unwind: "$productDetails" },
    {
      $project: {
        _id: 0,
        productId: "$_id",
        name: "$productName",
        image: "$productImage",
        price: "$productPrice",
        totalSold: 1,
        category: "$productDetails.category",
        createdAt: "$productDetails.createdAt",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "categoryInfo",
      },
    },
    { $unwind: "$categoryInfo" },
    {
      $project: {
        name: 1,
        image: 1,
        price: 1,
        totalSold: 1,
        categoryName: "$categoryInfo.name",
        dateAdded: "$createdAt",
      },
    },
    { $sort: { totalSold: -1 } },
  ]);

  res.status(200).json({
    success: true,
    data: popularProducts,
  });
});
export const getSingleProductById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid product ID" });
  }
  const cacheKey = `product:${id}`;

  const cached = await redisClient.get(cacheKey);
  console.log("cached : ", cached);
  if (cached) {
    return res.json({
      source: "redis-cache",
      data: JSON.parse(cached),
    });
  }
  const product = await Product.findById(id).populate("category", "name");
  if (!product) {
    return res.json({ success: false, message: "no product found ! " });
  }
  console.log("product : ", product);
  // cached the request first assign a key for first time
  await redisClient.set(cacheKey, JSON.stringify(product), { EX: 3600 });
  return res.json({ source: "mongodb ", data: product });
});
export const AddProduct = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    price,
    stock,
    category,
    releaseDate,
    countryOfOrigin,
    brand,
    specifications,
  } = req.body;

  let specsArray = [];

  if (specifications && typeof specifications == "string") {
    try {
      const parsed = JSON.parse(specifications);
      specsArray = parsed.filter(
        (item) => item?.label?.trim() && item?.value?.trim(),
      );
    } catch (error) {
      console.log("error parsing the specifications ", error);
    }
  }

  if (!name || !description) {
    return res.json({
      success: false,
      message: "name or description required !! ",
    });
  }
  const images = req.files
    ? req.files.map((file) => `/images/${file.filename}`)
    : [];
  const product = await Product.create({
    name: name.trim(),
    description: description.trim(),
    price: Number(price) || 0,
    stock: Number(stock) || 0,
    category,
    images,
    releaseDate: releaseDate || undefined,
    countryOfOrigin: countryOfOrigin?.trim(),
    brand: brand?.trim(),
    specifications: specsArray,
    createdBy: req.user._id,
  });
  const populatedProduct = await Product.findById(product._id).populate(
    "category",
    "name",
  );
  res.json({
    success: true,
    message: `product ${name} added `,
    product: populatedProduct,
  });
});
export const UpdateProduct = asyncHandler(async (req, res) => {
  console.log("Full req.body:", req.body); // ← Add this
  console.log("req.body type:", typeof req.body); // should be "object"
  const {
    name,
    description,
    price,
    stock,
    category,
    brand,
    countryOfOrigin,
    releaseDate,
    specifications,
  } = req.body;
  console.log("Received update data:", req.body);
  const updateData = {};
  const { id } = req.params;
  // Only set fields that are provided
  if (name) updateData.name = name;
  if (description) updateData.description = description;
  if (price) updateData.price = Number(price);
  if (stock) updateData.stock = Number(stock);
  if (category) updateData.category = category;
  if (brand) updateData.brand = brand;
  if (countryOfOrigin) updateData.countryOfOrigin = countryOfOrigin;
  if (releaseDate)
    updateData.releaseDate = releaseDate ? new Date(releaseDate) : undefined;
  let specsArray = [];

  if (specifications && typeof specifications == "string") {
    try {
      const parsed = JSON.parse(specifications);
      specsArray = parsed.filter(
        (item) => item?.label?.trim() && item?.value?.trim(),
      );
    } catch (error) {
      console.log("error parsing the specifications ", error);
    }
  }

  if (specsArray.length > 0 || specifications === "[]") {
    updateData.specifications = specsArray;
  }
  if (req.files?.length > 0) {
    updateData.images = req.files.map((file) => `/images/${file.filename}`);
  }
  const updated = await Product.findByIdAndUpdate(
    req.params.id,
    { $set: updateData },
    { new: true, runValidators: true },
  ).populate("category", "name");
  console.log("Updated product:", updated); // ← Add this
  if (!updated) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }
  await redisClient.del(`product:${id}`);

  await reIngestProduct(updated._id);
  res.json({
    success: true,
    product: updated,
  });
});

// DeleteProduct — improved response
export const DeleteProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }
  await redisClient.del(`product:${id}`);

  await deleteImage(product); // should handle array of images

  await Product.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: `Product "${product.name}" deleted successfully`,
  });
});
export const getProductBrand = asyncHandler(async (req, res) => {
  const brands = await Product.distinct("brand");
  const brandsWithCount = await Product.aggregate([
    {
      $group: {
        _id: {
          $cond: [
            {
              $or: [
                { $eq: ["$brand", null] },
                { $eq: ["$brand", ""] },
                { $not: { $ne: ["$brand", "$$REMOVE"] } },
              ],
            },
            "Miscellaneous",
            "$brand",
          ],
        },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 1,
        brandName: "$_id",
        count: 1,
      },
    },
    {
      $sort: {
        brandName: 1, // alphabetical order (A → Z), including "Miscellaneous"
      },
    },
  ]);
  res.json({ success: true, brands, brandsWithCount });
});
export const getTrendingProducts = asyncHandler(async (req, res) => {
  const trendingProducts = await Order.aggregate([
    {
      $match: {
        status: {
          $in: ["completed", "delivered", "Completed", "Delivered"],
        },
      },
    },

    { $unwind: "$items" },

    {
      $group: {
        _id: "$items.product", // product ObjectId
        totalSold: { $sum: "$items.quantity" },
      },
    },

    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "product",
      },
    },

    { $unwind: "$product" },

    {
      $project: {
        _id: "$_id",
        name: "$product.name",
        images: "$product.images",
        price: "$product.price",
        salePrice: "$product.salePrice",
        discountPercentage: "$product.discountPercentage",
        stockStatus: "$product.stockStatus",
        rating: "$product.rating",
        totalSold: 1,
        originalPrice: "$product.price",
      },
    },

    { $sort: { totalSold: -1 } },

    { $limit: 8 },
  ]);
  const imageandName = await Product.find({}, { name: 1, images: 1, _id: 0 });

  res.json({ success: true, trendingProducts, imageandName });
});
