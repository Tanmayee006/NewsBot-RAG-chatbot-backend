const qdrant = require('../config/qdrant');
const redisClient = require('../config/redis');
const fs = require('fs');
const path = require('path');

class IngestionMonitor {
  async getVectorDBStats() {
    try {
      const collections = await qdrant.client.getCollections();
      const targetCollection = collections.collections.find(c => c.name === qdrant.collectionName);
      
      if (!targetCollection) {
        return { status: 'Collection not found' };
      }
      
      const collectionInfo = await qdrant.client.getCollection(qdrant.collectionName);
      
      return {
        status: 'Connected',
        collection: {
          name: targetCollection.name,
          status: targetCollection.status,
          vectorCount: targetCollection.vectors_count || collectionInfo.vectors_count,
          indexedVectorCount: collectionInfo.indexed_vectors_count,
          pointsCount: collectionInfo.points_count,
          segments: collectionInfo.segments_count,
          config: {
            vectorSize: collectionInfo.config?.params?.vectors?.size,
            distance: collectionInfo.config?.params?.vectors?.distance
          }
        }
      };
      
    } catch (error) {
      return { 
        status: 'Error', 
        error: error.message 
      };
    }
  }

  async getCacheStats() {
    try {
      const info = await redisClient.info('memory');
      const keyCount = await redisClient.dbSize();
      
      // Count different key types
      const queryKeys = await redisClient.keys('query:*');
      const sessionKeys = await redisClient.keys('session:*');
      
      return {
        status: 'Connected',
        totalKeys: keyCount,
        queryCache: {
          count: queryKeys.length,
          keys: queryKeys.slice(0, 5) // Show first 5
        },
        sessions: {
          count: sessionKeys.length,
          keys: sessionKeys.slice(0, 5) // Show first 5
        },
        memory: this.parseRedisMemoryInfo(info)
      };
      
    } catch (error) {
      return {
        status: 'Error',
        error: error.message
      };
    }
  }

  parseRedisMemoryInfo(info) {
    const lines = info.split('\r\n');
    const memoryInfo = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        if (key.includes('memory')) {
          memoryInfo[key] = value;
        }
      }
    }
    
    return memoryInfo;
  }

  async getDataFileStats() {
    const dataDir = path.join(__dirname, '..', 'data');
    
    try {
      if (!fs.existsSync(dataDir)) {
        return { status: 'No data directory' };
      }
      
      const files = fs.readdirSync(dataDir);
      const fileStats = [];
      
      for (const file of files) {
        const filePath = path.join(dataDir, file);
        const stats = fs.statSync(filePath);
        
        fileStats.push({
          name: file,
          size: this.formatFileSize(stats.size),
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString()
        });
      }
      
      // Load metadata if available
      let metadata = null;
      const metadataPath = path.join(dataDir, 'ingestion_metadata.json');
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      }
      
      return {
        status: 'Available',
        files: fileStats,
        metadata: metadata
      };
      
    } catch (error) {
      return {
        status: 'Error',
        error: error.message
      };
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async getFullStatus() {
    console.log('📊 Ingestion System Status Report');
    console.log('═'.repeat(50));
    
    // Vector Database
    console.log('\n🗄️  Vector Database (Qdrant):');
    const vectorStats = await this.getVectorDBStats();
    if (vectorStats.status === 'Connected') {
      console.log(`   Status: ✅ ${vectorStats.status}`);
      console.log(`   Collection: ${vectorStats.collection.name}`);
      console.log(`   Vectors: ${vectorStats.collection.vectorCount || 0}`);
      console.log(`   Points: ${vectorStats.collection.pointsCount || 0}`);
      console.log(`   Segments: ${vectorStats.collection.segments || 0}`);
    } else {
      console.log(`   Status: ❌ ${vectorStats.status}`);
      if (vectorStats.error) {
        console.log(`   Error: ${vectorStats.error}`);
      }
    }
    
    // Cache
    console.log('\n💾 Cache (Redis):');
    const cacheStats = await this.getCacheStats();
    if (cacheStats.status === 'Connected') {
      console.log(`   Status: ✅ ${cacheStats.status}`);
      console.log(`   Total keys: ${cacheStats.totalKeys}`);
      console.log(`   Query cache: ${cacheStats.queryCache.count} entries`);
      console.log(`   Active sessions: ${cacheStats.sessions.count}`);
      console.log(`   Memory used: ${cacheStats.memory.used_memory_human || 'Unknown'}`);
    } else {
      console.log(`   Status: ❌ ${cacheStats.status}`);
      if (cacheStats.error) {
        console.log(`   Error: ${cacheStats.error}`);
      }
    }
    
    // Data Files
    console.log('\n📁 Data Files:');
    const fileStats = await this.getDataFileStats();
    if (fileStats.status === 'Available') {
      console.log(`   Status: ✅ ${fileStats.status}`);
      for (const file of fileStats.files) {
        console.log(`   ${file.name}: ${file.size} (modified: ${new Date(file.modified).toLocaleString()})`);
      }
      
      if (fileStats.metadata) {
        const meta = fileStats.metadata;
        console.log(`\n   Last Ingestion:`);
        console.log(`   • Time: ${new Date(meta.ingestionTime).toLocaleString()}`);
        console.log(`   • Duration: ${Math.round(meta.ingestionDurationMs / 1000)}s`);
        console.log(`   • Articles: ${meta.totalArticles}`);
        console.log(`   • With embeddings: ${meta.articlesWithEmbeddings}`);
        console.log(`   • Sources: ${meta.sources.join(', ')}`);
      }
    } else {
      console.log(`   Status: ⚠️  ${fileStats.status}`);
    }
    
    console.log('\n═'.repeat(50));
    
    return {
      vectorDB: vectorStats,
      cache: cacheStats,
      dataFiles: fileStats,
      timestamp: new Date().toISOString()
    };
  }

  async watchSystem(intervalSeconds = 30) {
    console.log(`👀 Starting system monitor (checking every ${intervalSeconds}s)`);
    console.log('Press Ctrl+C to stop\n');
    
    const monitor = async () => {
      console.clear();
      await this.getFullStatus();
      console.log(`\n⏰ Next check in ${intervalSeconds} seconds...`);
    };
    
    // Initial check
    await monitor();
    
    // Set up interval
    const interval = setInterval(monitor, intervalSeconds * 1000);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n\n👋 Stopping monitor...');
      clearInterval(interval);
      process.exit(0);
    });
  }
}

// Export monitor
module.exports = IngestionMonitor;

// Run monitor if this file is executed directly
if (require.main === module) {
  const monitor = new IngestionMonitor();
  
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
📊 Ingestion Monitor

Usage: node scripts/monitorIngestion.js [options]

Options:
  --watch [seconds]   Watch mode (default: 30s intervals)
  --status           One-time status check (default)
  --help             Show this help

Examples:
  node scripts/monitorIngestion.js
  node scripts/monitorIngestion.js --watch 60
    `);
    process.exit(0);
  }
  
  async function runMonitor() {
    try {
      if (args.includes('--watch')) {
        const intervalIndex = args.indexOf('--watch');
        const intervalSeconds = parseInt(args[intervalIndex + 1]) || 30;
        await monitor.watchSystem(intervalSeconds);
      } else {
        await monitor.getFullStatus();
      }
    } catch (error) {
      console.error('💥 Monitor failed:', error.message);
      process.exit(1);
    }
  }
  
  runMonitor();
}