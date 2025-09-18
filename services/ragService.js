// services/ragService.js
const qdrant = require("../config/qdrant");
const gemini = require("../config/gemini");
const embeddings = require("../config/embeddings"); 
const cacheService = require("./cacheService");

class RagService {
  constructor() {
    this.collectionName = qdrant.collectionName || "news_articles";
  }
  async embedQuery(query) {
    try {
      return await embeddings.generateEmbedding(query); 
    } catch (err) {
      console.error("❌ Error generating query embedding:", err.message);
      throw new Error("Embedding generation failed");
    }
  }
  async retrieveRelevantDocs(queryEmbedding, k = 5) {
    try {
      const results = await qdrant.client.search(this.collectionName, {
        vector: queryEmbedding,
        limit: k,
        with_payload: true,
      });
      console.log(`🔍 Retrieved ${results.length} docs from Qdrant`);
      return results;
    } catch (err) {
      console.error("❌ Error retrieving from Qdrant:", err.message);
      return [];
    }
  }
  formatContext(results) {
    if (!results || results.length === 0) return "";
    return results
      .map((doc, idx) => {
        const payload = doc.payload || {};
        return `Document ${idx + 1} [${payload.source || "unknown"}]:\n${
          payload.content || ""
        }`;
      })
      .join("\n\n");
  }
  async answerQuery(sessionId, query) {
    try {
      const cached = await cacheService.getCachedResponse(sessionId, query);
      if (cached) {
        console.log("⚡ Cache hit");
        return cached;
      }
      const queryEmbedding = await this.embedQuery(query);
      const results = await this.retrieveRelevantDocs(queryEmbedding, 5);
      if (!results || results.length === 0) {
        return "I couldn't find relevant information in the provided news.";
      }
      const context = this.formatContext(results);
      const prompt = `You are a news assistant. Use the following retrieved articles to answer the question.\n\nContext:\n${context}\n\nQuestion: ${query}\nAnswer:`;
      const answer = await gemini.generateAnswer(prompt);
      await cacheService.cacheResponse(sessionId, query, answer);
      return answer || "I couldn't find relevant information in the provided news.";
    } catch (err) {
      console.error("❌ RAG pipeline error:", err.message);
      return "Something went wrong while processing your query.";
    }
  }
}
module.exports = new RagService();
