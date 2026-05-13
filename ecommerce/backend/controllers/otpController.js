import { redisClient } from "../config/redis/redisClient";

// /ecommerce/backend/controllers/otpController.js
export const sendOTP = async (req, res) => {
  try {
    const { phone } = req.body;
    const key = `otp:${phone}`;
    const otp = Math.floor(1000 + Math.random() * 9000);

    await redisClient.set(key, otp, { EXP: 120 });
    res.json({ message: "OTP SENT", otp });
  } catch (error) {
    console.error("error sending OTP", error);
  }
};  
export const verifyOTP = async (req, res) => {};
