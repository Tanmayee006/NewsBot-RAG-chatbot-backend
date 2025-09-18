require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const RSSParser = require('rss-parser');
const { v4: uuidv4 } = require('uuid');

const qdrant = require('../config/qdrant');
const embeddings = require('../config/embeddings');


class NewsIngestionService {
  constructor() {
    this.parser = new RSSParser({
      customFields: {
        item: [
          'media:content',
          'media:thumbnail', 
          'content:encoded',
          'dc:creator',
          'description'
        ]
      },
      timeout: 10000
    });
    this.articles = [];
    this.processedCount = 0;
    this.batchSize = 10;
    this.maxArticlesPerFeed = 20;
  }

  async ingestFromRSSFeeds() {
    const feedUrls = process.env.RSS_FEEDS?.split(',');

    console.log(`🔄 Starting ingestion from ${feedUrls.length} RSS feeds...`);

    for (const feedUrl of feedUrls) {
      try {
        console.log(`📡 Fetching feed: ${feedUrl}`);
        const feed = await this.parser.parseURL(feedUrl);
        
        console.log(`📰 Found ${feed.items.length} articles in ${feed.title}`);
        
        let processedFromFeed = 0;
        for (const item of feed.items) {
          if (processedFromFeed >= this.maxArticlesPerFeed) {
            console.log(`📊 Reached max articles (${this.maxArticlesPerFeed}) for ${feed.title}`);
            break;
          }

          const article = await this.processRSSItem(item, feed.title, feed.link);
          if (article) {
            this.articles.push(article);
            processedFromFeed++;
          }
        }
      } catch (error) {
        console.error(`❌ Error fetching feed ${feedUrl}:`, error.message);
        continue;
      }
    }

    console.log(`✅ Collected ${this.articles.length} articles total`);
    return this.articles;
  }

  async processRSSItem(item, source, feedUrl) {
    try {
      if (!item.title || item.title.trim().length === 0) {
        return null;
      }

      let content = this.extractContent(item);
      
      if (content.length < 200 && item.link) {
        const fetchedContent = await this.fetchFullArticle(item.link);
        if (fetchedContent && fetchedContent.length > content.length) {
          content = fetchedContent;
        }
      }

      if (content.length < 100) {
        return null;
      }

      content = this.cleanContent(content);
      
      const article = {
        id: uuidv4(),
        title: this.cleanText(item.title),
        content: content,
        summary: this.generateSummary(item.contentSnippet || item.description || content),
        url: item.link || '',
        publishedAt: this.parseDate(item.pubDate || item.isoDate),
        source: source || 'Unknown',
        feedUrl: feedUrl || '',
        categories: this.extractCategories(item.categories),
        author: this.extractAuthor(item),
        imageUrl: this.extractImageUrl(item),
        wordCount: content.split(/\s+/).length,
        language: 'en',
        createdAt: new Date().toISOString()
      };

      if (this.validateArticle(article)) {
        return article;
      } else {
        return null;
      }

    } catch (error) {
      console.error(`❌ Error processing RSS item:`, error.message);
      return null;
    }
  }

  extractContent(item) {
    const contentFields = [
      item['content:encoded'],
      item.content,
      item.description,
      item.contentSnippet,
      item.summary
    ];
    for (const field of contentFields) {
      if (field && field.trim().length > 0) {
        if (field.includes('<')) {
          const $ = cheerio.load(field);
          $('script, style, nav, header, footer').remove();
          return $.text().trim();
        }
        return field.trim();
      }
    }
    return '';
  }

  async fetchFullArticle(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0; +http://example.com/bot)'
        },
        maxRedirects: 3
      });
      const $ = cheerio.load(response.data);
      $('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share, .comments').remove();
      const selectors = [
        'article [data-module="ArticleBody"]',
        '.story-body',
        '.ArticleBody-articleBody',
        '.pg-rail-tall__body',
        '.l-col__main .story-body',
        'article .story-content',
        'article .post-content', 
        'article .entry-content',
        'article .article-content',
        '.article-body',
        '.post-body',
        '.entry-body',
        'article',
        '[role="main"]',
        'main'
      ];
      for (const selector of selectors) {
        const element = $(selector);
        if (element.length && element.text().trim().length > 200) {
          let text = element.text().trim();
          text = text.replace(/\s+/g, ' ');
          text = text.replace(/\n{3,}/g, '\n\n');
          if (text.length > 8000) {
            text = text.substring(0, 8000) + '...';
          }
          return text;
        }
      }
      const bodyText = $('body').text().trim();
      if (bodyText.length > 200) {
        return bodyText.substring(0, 5000);
      }
      return '';
    } catch (error) {
      console.log(`⚠️  Could not fetch full article from ${url}: ${error.message}`);
      return '';
    }
  }

  cleanContent(content) {
    if (!content) return '';
    content = content.replace(/\s+/g, ' ').trim();
    const unwantedPhrases = [
      'Sign up for our newsletter', 'Subscribe to our newsletter', 'Follow us on',
      'Download our app', 'Read more:', 'Related:', 'ADVERTISEMENT', 'Cookie Policy', 'Privacy Policy'
    ];
    for (const phrase of unwantedPhrases) {
      content = content.replace(new RegExp(phrase, 'gi'), '');
    }
    content = content.replace(/https?:\/\/[^\s]+/g, '');
    content = content.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '');
    return content.trim();
  }

  cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  generateSummary(text) {
    if (!text) return '';
    const cleanText = this.cleanText(text);
    if (cleanText.length <= 200) return cleanText;
    const sentences = cleanText.split(/[.!?]+/);
    let summary = '';
    for (const sentence of sentences) {
      if ((summary + sentence).length > 200) break;
      summary += sentence + '. ';
    }
    return summary.trim() || cleanText.substring(0, 200) + '...';
  }

  parseDate(dateString) {
    if (!dateString) return new Date().toISOString();
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  extractCategories(categories) {
    if (!categories) return [];
    if (Array.isArray(categories)) {
      return categories.map(cat => typeof cat === 'string' ? cat : cat._).filter(Boolean);
    }
    if (typeof categories === 'string') {
      return [categories];
    }
    return [];
  }

  extractAuthor(item) {
    return item.creator || item['dc:creator'] || item.author || item['itunes:author'] || '';
  }

  extractImageUrl(item) {
    if (item['media:content'] && item['media:content']['$'] && item['media:content']['$'].url) {
      return item['media:content']['$'].url;
    }
    if (item['media:thumbnail'] && item['media:thumbnail']['$'] && item['media:thumbnail']['$'].url) {
      return item['media:thumbnail']['$'].url;
    }
    if (item.enclosure && item.enclosure.url && item.enclosure.type?.startsWith('image/')) {
      return item.enclosure.url;
    }
    return '';
  }

  validateArticle(article) {
    if (!article.title || article.title.length < 10) return false;
    if (!article.content || article.content.length < 100) return false;
    if (!article.url) return false;
    if (article.wordCount < 50) return false;
    const existingArticle = this.articles.find(a => a.title.toLowerCase() === article.title.toLowerCase());
    if (existingArticle) {
      return false;
    }
    return true;
  }

  // in scripts/ingestNews.js

async createEmbeddings() {
  console.log('🧠 Creating embeddings for articles...');
  if (this.articles.length === 0) {
    console.log('❌ No articles to process for embeddings');
    return [];
  }
  
  const articlesWithEmbeddings = [];
  
  for (let i = 0; i < this.articles.length; i += this.batchSize) {
    const batch = this.articles.slice(i, i + this.batchSize);
    
    try {
      console.log(`📊 Processing batch ${Math.floor(i/this.batchSize) + 1}/${Math.ceil(this.articles.length/this.batchSize)}`);
      
      const texts = batch.map(article => {
        const contentSnippet = article.content.substring(0, 1500);
        return `${article.title}\n\n${article.summary}\n\n${contentSnippet}`.substring(0, 8000);
      });
      
      console.log(`   Processing ${texts.length} articles...`);
      const batchEmbeddings = await embeddings.embed(texts);

      // --- START: ADDED VALIDATION CHECKS ---
      if (!Array.isArray(batchEmbeddings)) {
        throw new Error('API response is not a valid array.');
      }
      if (batchEmbeddings.length !== batch.length) {
        throw new Error(`API returned ${batchEmbeddings.length} embeddings for a batch of ${batch.length} articles. Mismatch occurred.`);
      }
      // --- END: ADDED VALIDATION CHECKS ---

      for (let j = 0; j < batch.length; j++) {
        // This check ensures we don't process an invalid embedding from the batch
        if (!batchEmbeddings[j] || !Array.isArray(batchEmbeddings[j])) {
            console.error(`   ⚠️ Invalid or missing embedding for article index ${j} in batch.`);
            // Push the article with an error instead of crashing
            articlesWithEmbeddings.push({
                ...batch[j],
                embedding: null,
                embeddingError: 'Invalid embedding received from API for this article.',
                embeddingCreatedAt: new Date().toISOString()
            });
            continue; // Skip to the next article
        }

        articlesWithEmbeddings.push({
          ...batch[j],
          embedding: batchEmbeddings[j],
          embeddingCreatedAt: new Date().toISOString(),
          embeddingModel: embeddings.modelName,
          embeddingDimensions: batchEmbeddings[j].length || 0
        });
      }
      
      this.processedCount += batch.length;
      console.log(`✅ Processed ${this.processedCount}/${this.articles.length} articles`);
      
      if (i + this.batchSize < this.articles.length) {
        console.log('   Waiting 2 seconds to avoid rate limits...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      console.error(`❌ Error creating embeddings for batch ${Math.floor(i/this.batchSize) + 1}:`, error.message);
      for (const article of batch) {
        articlesWithEmbeddings.push({
          ...article,
          embedding: null,
          embeddingError: error.message,
          embeddingCreatedAt: new Date().toISOString()
        });
      }
    }
  }
  
  const successfulEmbeddings = articlesWithEmbeddings.filter(a => a.embedding).length;
  console.log(`🎉 Successfully created embeddings for ${successfulEmbeddings}/${articlesWithEmbeddings.length} articles`);
  return articlesWithEmbeddings;
}
  async storeInVectorDB(articlesWithEmbeddings) {
    console.log('💾 Storing articles in Qdrant vector database...');
    await qdrant.initializeCollection();
    const articlesWithValidEmbeddings = articlesWithEmbeddings.filter(article => article.embedding);
    if (articlesWithValidEmbeddings.length === 0) {
      console.log('❌ No articles with valid embeddings to store');
      return 0;
    }
    const points = articlesWithValidEmbeddings.map(article => ({
      id: article.id,
      vector: article.embedding,
      payload: {
        title: article.title, content: article.content, summary: article.summary,
        url: article.url, publishedAt: article.publishedAt, source: article.source,
        feedUrl: article.feedUrl, categories: article.categories, author: article.author,
        imageUrl: article.imageUrl, wordCount: article.wordCount, language: article.language,
        createdAt: article.createdAt, embeddingCreatedAt: article.embeddingCreatedAt,
        embeddingModel: article.embeddingModel
      }
    }));
    const vectorBatchSize = 50;
    let storedCount = 0;
    for (let i = 0; i < points.length; i += vectorBatchSize) {
      const batch = points.slice(i, i + vectorBatchSize);
      try {
        console.log(`📦 Storing batch ${Math.floor(i/vectorBatchSize) + 1}/${Math.ceil(points.length/vectorBatchSize)} (${batch.length} articles)`);
        await qdrant.client.upsert(qdrant.collectionName, {
          wait: true,
          points: batch
        });
        storedCount += batch.length;
        console.log(`   ✅ Stored ${storedCount}/${points.length} articles in vector DB`);
        if (i + vectorBatchSize < points.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`❌ Error storing batch in Qdrant:`, error.message);
      }
    }
    console.log(`✅ Successfully stored ${storedCount} articles in vector database`);
    try {
      const collectionInfo = await qdrant.client.getCollection(qdrant.collectionName);
      console.log(`📊 Collection info: ${collectionInfo.vectors_count} vectors total`);
    } catch (error) {
      console.error('❌ Could not verify collection info:', error.message);
    }
    return storedCount;
  }

  async saveToFile(articles, filename = 'news_articles.json') {
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const filePath = path.join(dataDir, filename);
    const articlesForFile = articles.map(article => {
      const { embedding, ...articleWithoutEmbedding } = article;
      return {
        ...articleWithoutEmbedding,
        hasEmbedding: !!embedding,
        embeddingDimensions: embedding?.length || 0
      };
    });
    fs.writeFileSync(filePath, JSON.stringify(articlesForFile, null, 2));
    console.log(`💾 Saved ${articlesForFile.length} articles to ${filePath}`);
    const metadata = {
      ingestionId: uuidv4(),
      totalArticles: articles.length,
      articlesWithEmbeddings: articles.filter(a => a.embedding).length,
      articlesWithErrors: articles.filter(a => a.embeddingError).length,
      sources: [...new Set(articles.map(a => a.source))],
      categories: [...new Set(articles.flatMap(a => a.categories))],
      authors: [...new Set(articles.map(a => a.author).filter(Boolean))],
      dateRange: {
        oldest: articles.reduce((oldest, article) => article.publishedAt < oldest ? article.publishedAt : oldest, articles[0]?.publishedAt || new Date().toISOString()),
        newest: articles.reduce((newest, article) => article.publishedAt > newest ? article.publishedAt : newest, articles[0]?.publishedAt || new Date().toISOString())
      },
      stats: {
        totalWords: articles.reduce((sum, a) => sum + a.wordCount, 0),
        averageWordsPerArticle: Math.round(articles.reduce((sum, a) => sum + a.wordCount, 0) / articles.length),
        articlesWithImages: articles.filter(a => a.imageUrl).length,
        languageDistribution: articles.reduce((acc, a) => {
          acc[a.language] = (acc[a.language] || 0) + 1;
          return acc;
        }, {})
      },
      ingestionTime: new Date().toISOString(),
      ingestionDurationMs: Date.now() - this.startTime
    };
    const metadataPath = path.join(dataDir, 'ingestion_metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`📊 Saved ingestion metadata to ${metadataPath}`);
    return metadata;
  }

  async run() {
    try {
      this.startTime = Date.now();
      console.log('🚀 Starting news ingestion pipeline...\n');
      console.log('📰 Step 1: Ingesting articles from RSS feeds...');
      const articles = await this.ingestFromRSSFeeds();
      if (articles.length === 0) {
        console.log('❌ No articles found. Exiting...');
        process.exit(0); // Exit gracefully if no articles
      }
      console.log(`✅ Step 1 completed: ${articles.length} articles collected\n`);
      console.log('🧠 Step 2: Creating embeddings...');
      const articlesWithEmbeddings = await this.createEmbeddings();
      console.log(`✅ Step 2 completed: ${articlesWithEmbeddings.filter(a => a.embedding).length} articles with embeddings\n`);
      console.log('💾 Step 3: Storing in vector database...');
      const storedCount = await this.storeInVectorDB(articlesWithEmbeddings);
      console.log(`✅ Step 3 completed: ${storedCount} articles stored in vector DB\n`);
      console.log('📄 Step 4: Saving backup files...');
      const metadata = await this.saveToFile(articlesWithEmbeddings);
      console.log(`✅ Step 4 completed: Backup files saved\n`);
      const duration = Date.now() - this.startTime;
      console.log('🎉 Ingestion pipeline completed successfully!');
      console.log('═'.repeat(50));
      console.log(`📈 FINAL SUMMARY:`);
      console.log(`   • Duration: ${Math.round(duration / 1000)}s`);
      console.log(`   • Total articles collected: ${articles.length}`);
      console.log(`   • Articles with embeddings: ${articlesWithEmbeddings.filter(a => a.embedding).length}`);
      console.log(`   • Articles stored in vector DB: ${storedCount}`);
      console.log(`   • Articles with errors: ${articlesWithEmbeddings.filter(a => a.embeddingError).length}`);
      console.log(`   • Sources: ${metadata.sources.join(', ')}`);
      console.log(`   • Total words processed: ${metadata.stats.totalWords.toLocaleString()}`);
      console.log(`   • Average words per article: ${metadata.stats.averageWordsPerArticle}`);
      console.log('═'.repeat(50));
      return metadata;
    } catch (error) {
      console.error('❌ Ingestion pipeline failed:', error);
      process.exit(1);
    }
  }
}

module.exports = NewsIngestionService;

if (require.main === module) {
  const ingestionService = new NewsIngestionService();
  process.on('SIGINT', () => {
    console.log('\n🛑 Ingestion interrupted by user');
    process.exit(1);
  });
  process.on('SIGTERM', () => {
    console.log('\n🛑 Ingestion terminated');
    process.exit(1);
  });
  ingestionService.run()
    .then(() => {
      console.log('✅ Ingestion completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Ingestion failed:', error.message);
      process.exit(1);
    });
}