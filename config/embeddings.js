// config/embeddings.js

const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize the core client with your API key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Get the specific model for text embeddings
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

class GoogleEmbeddingsClient {
  constructor() {
    this.modelName = "google-text-embedding-004";
  }

  async embed(texts) {
    if (!texts || texts.length === 0) {
      return [];
    }
    try {
      // Use batchEmbedContents for efficiency
      const result = await model.batchEmbedContents({
        requests: texts.map(text => ({
          model: `models/${this.modelName}`,
          content: { parts: [{ text }] }
        }))
      });
      // Extract the vector values from the response
      return result.embeddings.map(e => e.values);
    } catch (error) {
      console.error('Error creating Google embeddings:', error);
      throw new Error('Failed to create embeddings');
    }
  }

  async embedSingle(text) {
    const embeddings = await this.embed([text]);
    return embeddings[0];
  }
}

// Export a single instance of the client
module.exports = new GoogleEmbeddingsClient();