import rateLimit from "express-rate-limit";

export const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // max 20 requests per minute
  message: "Too many requests, please try again later.",
});