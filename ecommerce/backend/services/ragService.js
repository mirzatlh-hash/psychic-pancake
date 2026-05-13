// backend/services/ragService.js
import { rewriteQuery } from "../config/aiProvider.js";
import getVectorStore from "../config/vectorStore.js";
import OpenAI from "openai";
import {
  classifyAiError,
  FALLBACK_RESPONSES,
  withRetry,
} from "./ai/errorHandler.js";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export const askRAG = async (question) => {
  try {
    console.log(`🔍 RAG Search for: "${question}"`);

    const vectorStore = await getVectorStore();

    // Ai rewrites user query to improve search results, especially for vague or complex questions
    const improvedQuery = await rewriteQuery(question);
    console.log("🔎 Original:", question);
    console.log("✨ Improved:", improvedQuery);

    const docs = await vectorStore.similaritySearch(improvedQuery, 2);

    const inStock = docs.filter((doc) => Number(doc.metadata.stock) > 0);
    const outOfStock = docs.filter((doc) => Number(doc.metadata?.stock) <= 0);
    if (outOfStock > 0) {
      console.log(`❌ ${outOfStock.length} out-of-stock items filtered out:`);
      outOfStock.forEach((doc) =>
        console.log(`   - ${doc.metadata.name} (stock: ${doc.metadata.stock})`),
      );
    }
    const filteredDocs = docs.filter(
      (doc) =>
        doc.metadata?.stock !== undefined && Number(doc.metadata.stock) > 0,
    );
    console.log("filtered Docs : ", filteredDocs);
    if (filteredDocs.length === 0) {
      return "I couldn't find any relevant products for your question. Could you please rephrase it?";
    }
    if (inStock === 0) {
      const anyMatch = docs.some((doc) =>
        doc.metadata.name
          .toLowerCase()
          .includes(question.toLowerCase().replace(/[^a-z0-9\s]/g, "")),
      );
      if (anyMatch && outOfStock.length > 0) {
        return `I found some products matching your search but they're currently out of stock. Would you like me to suggest similar in-stock alternatives?`;
      }

      return "I couldn't find any in-stock products matching your search. Could you try different keywords or browse our categories?";
    }

    const context = filteredDocs
      .map((doc, i) => {
        const m = doc.metadata;
        const saleInfo = m.onSale && m.salePrice ? `${m.salePrice}` : "";
        return `
Product ${i + 1}:
Name: ${m.name}
Brand: ${m.brand}
Category: ${m.category}
Price: $${m.price}
Stock: ${m.stock}
Rating: ${m.rating}
`;
      })
      .join("\n");
    console.log("context : ", context);

    const systemPrompt = `You are Alex, a friendly and knowledgeable customer support assistant for an electronics e-commerce store.

Core Instructions:
- Answer using ONLY the information from the provided context.
- If the context doesn't have the answer, honestly say "I don't have specific information about that right now." but dont mention something like The context only mentions this product not the one user asking just say or refine it to tell user that we dont have the product availaible at the moment but i can suggest alternatives then you can suggest the what you found in the context but dont mention the context .
- When multiple products match, list 2-4 best options with key details (price, stock, features).
- Be natural, helpful, and conversational.
- Do not invent prices, stock levels, or features not present in the context.`;

    const response = await withRetry(() => {
      groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Context:\n${context}\n\nQuestion: ${question}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 850,
      });
    });

    return response.choices[0].message.content;
  } catch (error) {
    const classified = classifyAiError(error);

    console.error(" Error:", classified.type);
    return FALLBACK_RESPONSES[classified.type] || FALLBACK_RESPONSES.default;
  }
};

export default askRAG;
