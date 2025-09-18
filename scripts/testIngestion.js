const NewsIngestionService = require('./ingestNews');

class IngestionTester {
  constructor() {
    this.testFeeds = [
      'https://feeds.reuters.com/reuters/topNews'
    ];
  }

  async testBasicIngestion() {
    console.log('🧪 Testing basic RSS ingestion...\n');
    
    const ingestion = new NewsIngestionService();
    
    // Override feeds for testing
    process.env.RSS_FEEDS = this.testFeeds.join(',');
    ingestion.maxArticlesPerFeed = 3; // Limit for testing
    
    try {
      // Test RSS parsing
      console.log('1️⃣ Testing RSS feed parsing...');
      const articles = await ingestion.ingestFromRSSFeeds();
      
      if (articles.length === 0) {
        throw new Error('No articles parsed from RSS feeds');
      }
      
      console.log(`✅ Successfully parsed ${articles.length} articles\n`);
      
      // Show sample article
      const sample = articles[0];
      console.log('📄 Sample article:');
      console.log(`   Title: ${sample.title}`);
      console.log(`   Source: ${sample.source}`);
      console.log(`   Content length: ${sample.content.length} characters`);
      console.log(`   Word count: ${sample.wordCount}`);
      console.log(`   Published: ${sample.publishedAt}`);
      console.log(`   URL: ${sample.url}`);
      console.log(`   Categories: ${sample.categories.join(', ') || 'None'}\n`);
      
      return articles;
      
    } catch (error) {
      console.error('❌ Basic ingestion test failed:', error.message);
      throw error;
    }
  }

  async testEmbeddingCreation() {
    console.log('2️⃣ Testing embedding creation...');
    
    const articles = await this.testBasicIngestion();
    const ingestion = new NewsIngestionService();
    
    // Test with just one article
    ingestion.articles = articles.slice(0, 1);
    
    try {
      const withEmbeddings = await ingestion.createEmbeddings();
      
      if (withEmbeddings.length === 0) {
        throw new Error('No embeddings created');
      }
      
      const embeddedArticle = withEmbeddings[0];
      
      if (!embeddedArticle.embedding) {
        throw new Error('Embedding is null or undefined');
      }
      
      console.log(`✅ Successfully created embedding`);
      console.log(`📊 Embedding info:`);
      console.log(`   Dimensions: ${embeddedArticle.embedding.length}`);
      console.log(`   Model: ${embeddedArticle.embeddingModel}`);
      console.log(`   Sample values: [${embeddedArticle.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);
      console.log(`   Created at: ${embeddedArticle.embeddingCreatedAt}\n`);
      
      return withEmbeddings;
      
    } catch (error) {
      console.error('❌ Embedding test failed:', error.message);
      throw error;
    }
  }

  async testVectorStorage() {
    console.log('3️⃣ Testing vector database storage...');
    
    const articlesWithEmbeddings = await this.testEmbeddingCreation();
    const ingestion = new NewsIngestionService();
    
    try {
      const storedCount = await ingestion.storeInVectorDB(articlesWithEmbeddings);
      
      if (storedCount === 0) {
        throw new Error('No articles stored in vector database');
      }
      
      console.log(`✅ Successfully stored ${storedCount} article(s) in vector database\n`);
      
      // Test retrieval
      const qdrant = require('../config/qdrant');
      const collections = await qdrant.client.getCollections();
      const targetCollection = collections.collections.find(c => c.name === qdrant.collectionName);
      
      if (targetCollection) {
        console.log(`📊 Collection verification:`);
        console.log(`   Name: ${targetCollection.name}`);
        console.log(`   Status: ${targetCollection.status}`);
        console.log(`   Vector count: ${targetCollection.vectors_count || 'Unknown'}`);
      }
      
      return storedCount;
      
    } catch (error) {
      console.error('❌ Vector storage test failed:', error.message);
      throw error;
    }
  }

  async testFullPipeline() {
    console.log('🔬 Running full pipeline test...\n');
    
    try {
      const storedCount = await this.testVectorStorage();
      
      console.log('🎉 All tests passed!');
      console.log('═'.repeat(40));
      console.log('✅ RSS parsing: OK');
      console.log('✅ Embedding creation: OK');
      console.log('✅ Vector storage: OK');
      console.log(`✅ Articles stored: ${storedCount}`);
      console.log('═'.repeat(40));
      
    } catch (error) {
      console.error('\n❌ Pipeline test failed:', error.message);
      throw error;
    }
  }

  async runHealthCheck() {
    console.log('🏥 Running health check for required services...\n');
    
    try {
      // Check Qdrant
      const qdrant = require('../config/qdrant');
      await qdrant.client.getCollections();
      console.log('✅ Qdrant: Connected');
      
      // Check embeddings API
      const embeddings = require('../config/embeddings');
      await embeddings.embedSingle('test');
      console.log('✅ Jina Embeddings: Connected');
      
      // Check environment variables
      const requiredEnvVars = ['JINA_API_KEY', 'GEMINI_API_KEY'];
      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          throw new Error(`Missing required environment variable: ${envVar}`);
        }
        console.log(`✅ ${envVar}: Set`);
      }
      
      console.log('\n🎉 All health checks passed!');
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      throw error;
    }
  }
}

// Export tester for use in other modules
module.exports = IngestionTester;

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new IngestionTester();
  
  async function runTests() {
    try {
      await tester.runHealthCheck();
      await tester.testFullPipeline();
      console.log('\n🚀 Ready to run full ingestion!');
    } catch (error) {
      console.error('\n💥 Tests failed:', error.message);
      process.exit(1);
    }
  }
  
  runTests();
}
