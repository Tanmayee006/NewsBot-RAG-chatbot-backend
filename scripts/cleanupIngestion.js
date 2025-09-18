const qdrant = require('../config/qdrant');
const redisClient = require('../config/redis');
const fs = require('fs');
const path = require('path');

class IngestionCleanup {
  async clearVectorDB() {
    console.log('🗑️ Clearing vector database...');
    
    try {
      // Delete collection
      await qdrant.client.deleteCollection(qdrant.collectionName);
      console.log('✅ Vector database cleared');
      
      // Recreate collection
      await qdrant.initializeCollection();
      console.log('✅ Collection recreated');
      
    } catch (error) {
      console.error('❌ Failed to clear vector database:', error.message);
      throw error;
    }
  }

  async clearCache() {
    console.log('🗑️ Clearing cache...');
    
    try {
      // Clear query cache
      const queryKeys = await redisClient.keys('query:*');
      if (queryKeys.length > 0) {
        await redisClient.del(queryKeys);
        console.log(`✅ Cleared ${queryKeys.length} cached queries`);
      }
      
      // Clear session cache (optional)
      const sessionKeys = await redisClient.keys('session:*');
      if (sessionKeys.length > 0) {
        console.log(`⚠️  Found ${sessionKeys.length} active sessions (not clearing)`);
      }
      
    } catch (error) {
      console.error('❌ Failed to clear cache:', error.message);
      throw error;
    }
  }

  async clearDataFiles() {
    console.log('🗑️ Clearing data files...');
    
    const dataDir = path.join(__dirname, '..', 'data');
    
    try {
      if (fs.existsSync(dataDir)) {
        const files = fs.readdirSync(dataDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(dataDir, file));
            console.log(`✅ Deleted ${file}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Failed to clear data files:', error.message);
      throw error;
    }
  }

  async fullCleanup() {
    console.log('🧹 Starting full cleanup...\n');
    
    try {
      await this.clearVectorDB();
      await this.clearCache();
      await this.clearDataFiles();
      
      console.log('\n✅ Full cleanup completed!');
      
    } catch (error) {
      console.error('\n❌ Cleanup failed:', error.message);
      throw error;
    }
  }
}

// Export cleanup utilities
module.exports = IngestionCleanup;

// Run cleanup if this file is executed directly
if (require.main === module) {
  const cleanup = new IngestionCleanup();
  
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
🧹 Ingestion Cleanup Utility

Usage: node scripts/cleanupIngestion.js [options]

Options:
  --vector    Clear vector database only
  --cache     Clear Redis cache only  
  --files     Clear data files only
  --all       Full cleanup (default)
  --help      Show this help message

Examples:
  node scripts/cleanupIngestion.js --vector
  node scripts/cleanupIngestion.js --all
    `);
    process.exit(0);
  }
  
  async function runCleanup() {
    try {
      if (args.includes('--vector')) {
        await cleanup.clearVectorDB();
      } else if (args.includes('--cache')) {
        await cleanup.clearCache();
      } else if (args.includes('--files')) {
        await cleanup.clearDataFiles();
      } else {
        await cleanup.fullCleanup();
      }
    } catch (error) {
      console.error('💥 Cleanup failed:', error.message);
      process.exit(1);
    }
  }
  
  runCleanup();
}
