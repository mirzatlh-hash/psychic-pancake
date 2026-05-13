//ecommerce/backend/config/redis/redisClient.js
import { createClient } from "redis";
export const redisClient = createClient({
  host: "localhost",
  port: 6379,
});

export const connectRedis = async () => {
  try {
    await redisClient.connect();
    console.log("✔✔✔ REDIS Connected ✔✔✔");
  } catch (error) {
    redisClient.on("error", (err) => {
      console.error("Redis Error:", err);
    });
  }
};
