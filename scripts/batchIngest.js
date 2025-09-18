const NewsIngestionService = require('./ingestNews');

class BatchIngestionService extends NewsIngestionService {
  constructor(options = {}) {
    super();
    this.batchSize = options.batchSize || 100;
    this.maxConcurrentBatches = options.maxConcurrentBatches || 3;
    this.delayBetweenBatches = options.delayBetweenBatches || 5000; // 5 seconds
    this.resumeFromBatch = options.resumeFromBatch || 0;
  }

  async runBatchIngestion() {
    console.log('🏭 Starting batch ingestion process...');
    console.log(`   Batch size: ${this.batchSize}`);
    console.log(`   Max concurrent batches: ${this.maxConcurrentBatches}`);
    console.log(`   Delay between batches: ${this.delayBetweenBatches}ms`);
    
    if (this.resumeFromBatch > 0) {
      console.log(`   Resuming from batch: ${this.resumeFromBatch}`);
    }
    
    try {
      // Step 1: Collect all articles
      const allArticles = await this.ingestFromRSSFeeds();
      
      if (allArticles.length === 0) {
        console.log('❌ No articles to process');
        return;
      }

      // Step 2: Process in batches
      const totalBatches = Math.ceil(allArticles.length / this.batchSize);
      console.log(`\n📦 Processing ${allArticles.length} articles in ${totalBatches} batches...`);

      const processedArticles = [];
      
      for (let batchIndex = this.resumeFromBatch; batchIndex < totalBatches; batchIndex++) {
        const startIdx = batchIndex * this.batchSize;
        const endIdx = Math.min(startIdx + this.batchSize, allArticles.length);
        const batch = allArticles.slice(startIdx, endIdx);

        console.log(`\n🔄 Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} articles)`);

        try {
          // Process embeddings for this batch
          this.articles = batch;
          const batchWithEmbeddings = await this.createEmbeddings();
          
          // Store in vector database
          const storedCount = await this.storeInVectorDB(batchWithEmbeddings);
          console.log(`   ✅ Batch ${batchIndex + 1} completed: ${storedCount} articles stored`);
          
          processedArticles.push(...batchWithEmbeddings);

          // Save progress
          await this.saveProgress(batchIndex + 1, processedArticles);

          // Delay before next batch (except for the last one)
          if (batchIndex + 1 < totalBatches) {
            console.log(`   ⏳ Waiting ${this.delayBetweenBatches}ms before next batch...`);
            await new Promise(resolve => setTimeout(resolve, this.delayBetweenBatches));
          }

        } catch (error) {
          console.error(`❌ Batch ${batchIndex + 1} failed:`, error.message);
          
          // Save progress even on failure
          await this.saveProgress(batchIndex, processedArticles);
          
          console.log(`💾 Progress saved. You can resume with: --resume-from-batch ${batchIndex}`);
          throw error; // Re-throw to stop processing
        }
      }

      // Final summary
      await this.saveToFile(processedArticles, 'batch_ingestion_complete.json');
      
      const successfulEmbeddings = processedArticles.filter(a => a.embedding).length;
      const storedInDB = processedArticles.filter(a => a.embedding).length; // Assuming all with embeddings were stored
      
      console.log('\n🎉 Batch ingestion completed!');
      console.log('═'.repeat(50));
      console.log(`📈 BATCH INGESTION SUMMARY:`);
      console.log(`   • Total articles processed: ${processedArticles.length}`);
      console.log(`   • Articles with embeddings: ${successfulEmbeddings}`);
      console.log(`   • Articles stored in vector DB: ${storedInDB}`);
      console.log(`   • Batches processed: ${totalBatches}`);
      console.log(`   • Success rate: ${((successfulEmbeddings / processedArticles.length) * 100).toFixed(1)}%`);
      console.log('═'.repeat(50));

      return processedArticles;

    } catch (error) {
      console.error('❌ Batch ingestion failed:', error.message);
      throw error;
    }
  }

  async saveProgress(completedBatches, processedArticles) {
    const progressData = {
      completedBatches,
      totalArticles: processedArticles.length,
      articlesWithEmbeddings: processedArticles.filter(a => a.embedding).length,
      lastBatchTime: new Date().toISOString(),
      batchSize: this.batchSize,
      resumeCommand: `npm run batch-ingest -- --resume-from-batch ${completedBatches}`
    };

    const progressPath = path.join(__dirname, '..', 'data', 'batch_progress.json');
    fs.writeFileSync(progressPath, JSON.stringify(progressData, null, 2));
    
    console.log(`💾 Progress saved: ${completedBatches} batches completed`);
  }
}

// Export batch service
module.exports = BatchIngestionService;

// Run batch ingestion if executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  // Parse command line arguments
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--batch-size':
        options.batchSize = parseInt(value);
        break;
      case '--max-concurrent':
        options.maxConcurrentBatches = parseInt(value);
        break;
      case '--delay':
        options.delayBetweenBatches = parseInt(value);
        break;
      case '--resume-from-batch':
        options.resumeFromBatch = parseInt(value);
        break;
    }
  }

  if (args.includes('--help')) {
    console.log(`
🏭 Batch Ingestion Service

Usage: node scripts/batchIngest.js [options]

Options:
  --batch-size <number>         Articles per batch (default: 100)
  --max-concurrent <number>     Max concurrent batches (default: 3)
  --delay <milliseconds>        Delay between batches (default: 5000)
  --resume-from-batch <number>  Resume from specific batch (default: 0)
  --help                        Show this help

Examples:
  node scripts/batchIngest.js --batch-size 50 --delay 3000
  node scripts/batchIngest.js --resume-from-batch 5
    `);
    process.exit(0);
  }

  const batchService = new BatchIngestionService(options);
  
  batchService.runBatchIngestion()
    .then(() => {
      console.log('✅ Batch ingestion completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Batch ingestion failed:', error.message);
      process.exit(1);
    });
}

