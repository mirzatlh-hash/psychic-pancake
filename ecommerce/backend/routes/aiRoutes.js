// ecommerce/backend/routes/aiRoutes.js
import express from "express";
import askRAG from "../services/ragService.js";

import Chat from "../models/Chat.js";
import { detectIntent } from "../services/intentService.js";
import getVectorStore from "../config/vectorStore.js";
import { addToCartTool } from "../tool/addToCartTool.js";
import { protect } from "../middleware/authMiddleware.js";
import { extractProductFromMessage } from "../services/extractProductService.js";
import { streamCustomerSupport } from "../services/chatService.js";

const router = express.Router();

// Health check
router.get("/test", (req, res) => {
  res.json({ message: "AI route is working!" });
});

router.post("/chat", protect, async (req, res) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { message, sessionId } = req.body;
  const userId = req.user?.id;

  if (!message?.trim()) {
    res.write("Error: Message is required");
    return res.end();
  }

  try {
    const intent = await detectIntent(message.trim());

    if (intent === "product_search") {
      const response = await askRAG(message.trim());
      res.write(response);
      return res.end();
    }

    if (intent === "add_to_cart") {
      const productName = await extractProductFromMessage(message);
      const vectorStore = await getVectorStore();
      const docs = await vectorStore.similaritySearch(productName, 1);

      const productId = docs[0]?.metadata?.productId;

      if (!productId) {
        res.write("I couldn't find that product.");
        return res.end();
      }

      const result = await addToCartTool({ productId, userId, token: req.headers.authorization?.replace("Bearer ", "") });
      res.write(result);
      return res.end();
    }

    // Default: General Support
    await streamCustomerSupport(sessionId, message.trim(), res);
  } catch (error) {
    console.error("Chat Error:", error);
    res.write("Sorry, something went wrong. Please try again.");
    res.end();
  }
});
router.post("/chat/reset", async (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }
  try {
    await Chat.findOneAndUpdate(
      {
        sessionId: sessionId,
      },
      {
        messages: [],
      },
    );
    console.log(`Chat reset for session: ${sessionId}`);
    return res.json({ message: "Chat reset successfully." });
  } catch (error) {
    console.error("Error resetting chat:", error);
    return res.status(500).json({ error: "Failed to reset chat." });
  }
});

export default router;
