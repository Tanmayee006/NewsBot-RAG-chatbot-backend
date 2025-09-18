const path = require('path');
const fs = require('fs');
const qdrant = require('../config/qdrant');
const { GoogleGenerativeAIEmbeddings } = require('@langchain/google-genai'); // ✅ Gemini embeddings

class IngestionValidator {
  constructor() {
    this.validationResults = {
      fileValidation: null,
      vectorDBValidation: null,
      dataConsistency: null,
      contentQuality: null
    };

    // ✅ Initialize Gemini embeddings
    this.embeddings = new GoogleGenerativeAIEmbeddings({
      model: "text-embedding-004",
      apiKey: process.env.GOOGLE_API_KEY
    });
  }

  async validateVectorDatabase() {
    console.log('🗄️ Validating vector database...');
    
    const validation = {
      connectionStatus: 'unknown',
      collectionExists: false,
      vectorCount: 0,
      collectionInfo: null,
      sampleQuery: null
    };

    try {
      // Test connection
      const collections = await qdrant.client.getCollections();
      validation.connectionStatus = 'connected';
      
      // Check if news collection exists
      const newsCollection = collections.collections.find(c => c.name === qdrant.collectionName);
      if (newsCollection) {
        validation.collectionExists = true;
        
        // Get collection info
        const collectionInfo = await qdrant.client.getCollection(qdrant.collectionName);
        validation.vectorCount = collectionInfo.vectors_count || 0;
        validation.pointsCount = collectionInfo.points_count || 0;
        validation.segmentsCount = collectionInfo.segments_count || 0;

        // ✅ Check vector size
        validation.collectionInfo = {
          vectorSize: collectionInfo.config?.params?.vectors?.size,
          distance: collectionInfo.config?.params?.vectors?.distance
        };

        // Test sample query with real Gemini embedding
        if (validation.vectorCount > 0) {
          try {
            const query = "Ukraine conflict updates"; // test query
            const [embedding] = await this.embeddings.embedDocuments([query]);

            const searchResult = await qdrant.client.search(qdrant.collectionName, {
              vector: embedding,
              limit: 1,
              with_payload: true
            });

            validation.sampleQuery = {
              success: true,
              resultsReturned: searchResult.length,
              sampleResult: searchResult[0] ? {
                id: searchResult[0].id,
                score: searchResult[0].score,
                title: searchResult[0].payload?.title,
                source: searchResult[0].payload?.source
              } : null
            };

          } catch (error) {
            validation.sampleQuery = {
              success: false,
              error: error.message
            };
          }
        }
      }

    } catch (error) {
      validation.connectionStatus = 'error';
      validation.error = error.message;
    }

    this.validationResults.vectorDBValidation = validation;
    return validation;
  }

  async validateDataConsistency() {
    console.log('🔍 Validating data consistency...');
    
    const consistency = {
      fileVsVector: null,
      duplicateCheck: null,
      contentQuality: null
    };

    try {
      // Compare file count vs vector count
      if (this.validationResults.fileValidation && this.validationResults.vectorDBValidation) {
        const fileCount = this.validationResults.fileValidation.fileStats.articles?.count || 0;
        const vectorCount = this.validationResults.vectorDBValidation.vectorCount || 0;
        
        consistency.fileVsVector = {
          fileArticles: fileCount,
          vectorArticles: vectorCount,
          match: fileCount === vectorCount,
          difference: Math.abs(fileCount - vectorCount)
        };
      }

      // Content quality check
      const articlesPath = path.join(__dirname, '..', 'data', 'news_articles.json');
      if (fs.existsSync(articlesPath)) {
        try {
          const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
          const sampleSize = Math.min(10, articles.length);
          const sample = articles.slice(0, sampleSize);

          const qualityMetrics = {
            averageContentLength: 0,
            averageWordCount: 0,
            articlesWithImages: 0,
            articlesWithCategories: 0,
            sourcesDistribution: {}
          };

          let totalContentLength = 0;
          let totalWordCount = 0;

          for (const article of sample) {
            totalContentLength += article.content?.length || 0;

            // ✅ compute word count dynamically
            const wordCount = article.content ? article.content.split(/\s+/).length : 0;
            totalWordCount += wordCount;
            
            if (article.imageUrl) qualityMetrics.articlesWithImages++;
            if (article.categories?.length > 0) qualityMetrics.articlesWithCategories++;
            
            const source = article.source || 'Unknown';
            qualityMetrics.sourcesDistribution[source] = (qualityMetrics.sourcesDistribution[source] || 0) + 1;
          }

          qualityMetrics.averageContentLength = Math.round(totalContentLength / sampleSize);
          qualityMetrics.averageWordCount = Math.round(totalWordCount / sampleSize);

          consistency.contentQuality = {
            sampleSize,
            ...qualityMetrics
          };

        } catch (error) {
          consistency.contentQuality = {
            error: error.message
          };
        }
      }

    } catch (error) {
      consistency.error = error.message;
    }

    this.validationResults.dataConsistency = consistency;
    return consistency;
  }
}

module.exports = IngestionValidator;
