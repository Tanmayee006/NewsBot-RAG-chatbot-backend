// config/qdrant.js

const { QdrantClient } = require('@qdrant/js-client-rest');

// Initialize the Qdrant client
const client = new QdrantClient({
  url: process.env.QDRANT_URL || 'http://localhost:6333',
});

const collectionName = process.env.QDRANT_COLLECTION_NAME || 'news_articles';

/**
 * Initializes the Qdrant collection, creating it if it doesn't exist.
 * This function is safe to run on every application start.
 */
async function initializeCollection() {
  try {
    // Check if the collection already exists
    await client.getCollection(collectionName);
    console.log(`✅ Qdrant collection "${collectionName}" already exists.`);
  } catch (error) {
    // If the collection does not exist, Qdrant throws an error.
    // We can safely ignore the error and create the collection.
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      console.log(`Collection "${collectionName}" not found. Creating a new one...`);
      
      // Define the parameters for the new collection's vectors
      const vectorParams = {
        // This is the CRITICAL CHANGE to match the Google Gemini model
        size: 768, 
        distance: 'Cosine'
      };

      // Create the collection
      await client.recreateCollection(collectionName, {
        vectors: vectorParams,
      });
      console.log(`✅ Successfully created Qdrant collection "${collectionName}".`);
    } else {
      // For any other errors, we should log them.
      console.error('❌ Error initializing Qdrant collection:', error);
      throw error;
    }
  }
}

module.exports = {
  client,
  collectionName,
  initializeCollection,
};