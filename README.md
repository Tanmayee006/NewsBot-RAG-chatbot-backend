# News RAG System 🗞️🤖

A Retrieval-Augmented Generation (RAG) system that ingests news articles from RSS feeds, creates embeddings, stores them in a vector database, and provides intelligent Q&A capabilities using Google's Gemini AI.

## 🌟 Features

- **RSS Feed Ingestion**: Automatically collect news articles from multiple RSS sources
- **Smart Content Processing**: Extract and clean article content with full-text fetching
- **Vector Embeddings**: Generate embeddings using Google's text-embedding-004 model
- **Vector Search**: Store and search articles using Qdrant vector database
- **AI-Powered Q&A**: Answer questions using Gemini AI with relevant news context
- **Real-time Chat**: WebSocket-based chat interface with session management
- **Caching**: Redis-powered caching for improved performance
- **Batch Processing**: Efficient batch ingestion with progress tracking
- **Monitoring**: Comprehensive health checks and system monitoring

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   RSS Feeds     │───▶│  News Ingestion  │───▶│   Qdrant DB     │
└─────────────────┘    │     Service      │    │  (Vectors)      │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Embeddings     │───▶│   Google        │
                       │   (Google)       │    │   Gemini AI     │
                       └──────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │◀──▶│   Express API    │───▶│   Redis Cache   │
│   (React)       │    │   + WebSocket    │    │   (Sessions)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Node.js** 16+ 
- **Redis** server
- **Qdrant** vector database
- **Google AI API Key** (for Gemini and embeddings)

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd news-rag-system

# Install dependencies
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Required
GEMINI_API_KEY=your_google_ai_api_key_here

# Database URLs
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=news_articles

# RSS Feeds (comma-separated)
RSS_FEEDS=https://feeds.reuters.com/reuters/topNews,https://rss.cnn.com/rss/edition.rss,https://feeds.bbci.co.uk/news/rss.xml

# Optional Configuration
SESSION_TTL=86400
CACHE_TTL=3600
MAX_CONTEXT_LENGTH=4000
TOP_K_RESULTS=5
SIMILARITY_THRESHOLD=0.7
FRONTEND_URL=http://localhost:3000
PORT=5000
```

### 3. Start Services

Start Redis and Qdrant:

```bash
# Redis (using Docker)
docker run -d --name redis -p 6379:6379 redis:latest

# Qdrant (using Docker)
docker run -d --name qdrant -p 6333:6333 qdrant/qdrant:latest
```

### 4. Initialize System

```bash
# Run health check
npm run health-check

# Ingest news articles
npm run ingest

# Start the server
npm start
```

## 📝 Scripts

| Script | Command | Description |
|--------|---------|-------------|
| **Health Check** | `npm run health-check` | Verify all services are working |
| **News Ingestion** | `npm run ingest` | Ingest articles from RSS feeds |
| **Batch Ingestion** | `npm run batch-ingest` | Large-scale batch processing |
| **Test Ingestion** | `npm run test-ingest` | Test the ingestion pipeline |
| **Monitor System** | `npm run monitor` | Real-time system monitoring |
| **Cleanup** | `npm run cleanup` | Clear all data and caches |
| **Start Server** | `npm start` | Start the API server |
| **Development** | `npm run dev` | Start with hot reload |

## 🔧 Detailed Usage

### News Ingestion

#### Basic Ingestion
```bash
# Ingest from configured RSS feeds
node scripts/ingestNews.js
```

#### Batch Ingestion (for large datasets)
```bash
# Process 50 articles per batch with 3-second delay
node scripts/batchIngest.js --batch-size 50 --delay 3000

# Resume from specific batch
node scripts/batchIngest.js --resume-from-batch 5
```

#### Test Pipeline
```bash
# Test with small dataset
node scripts/testIngestion.js
```

### System Monitoring

```bash
# One-time status check
node scripts/monitorIngestion.js

# Continuous monitoring (30s intervals)
node scripts/monitorIngestion.js --watch 30

# Health check with detailed diagnostics
node scripts/healthCheck.js
```

### Data Management

```bash
# Clear vector database only
node scripts/cleanupIngestion.js --vector

# Clear Redis cache only
node scripts/cleanupIngestion.js --cache

# Full system cleanup
node scripts/cleanupIngestion.js --all
```

## 🔌 API Endpoints

### Chat API

#### Send Message
```http
POST /api/chat/message
Content-Type: application/json

{
  "message": "What are the latest updates on Ukraine?",
  "sessionId": "session-uuid",
  "topK": 5
}
```

#### Streaming Chat
```http
POST /api/chat/stream
Content-Type: application/json

{
  "message": "Tell me about recent climate change news",
  "sessionId": "session-uuid"
}
```

### Session Management

#### Create Session
```http
POST /api/session/create
```

#### Get Session History
```http
GET /api/session/:sessionId/history
```

#### Clear Session
```http
DELETE /api/session/:sessionId
```

### Health Check
```http
GET /health
```

## 🌐 WebSocket Events

### Client → Server

```javascript
// Join a session
socket.emit('join-session', sessionId);

// Send message
socket.emit('send-message', {
  sessionId: 'session-uuid',
  message: 'Your question here'
});
```

### Server → Client

```javascript
// Bot response
socket.on('bot-response', (data) => {
  console.log(data.response.answer);
  console.log(data.response.sources);
});

// Error handling
socket.on('error', (error) => {
  console.error(error.message);
});
```

## 🗄️ Data Structure

### Article Schema
```javascript
{
  id: "uuid",
  title: "Article Title",
  content: "Full article content...",
  summary: "Brief summary...",
  url: "https://source.com/article",
  publishedAt: "2024-01-01T00:00:00Z",
  source: "Reuters",
  feedUrl: "https://feeds.reuters.com/...",
  categories: ["politics", "world"],
  author: "Author Name",
  imageUrl: "https://image.url",
  wordCount: 500,
  language: "en",
  createdAt: "2024-01-01T00:00:00Z",
  embedding: [0.1, 0.2, ...], // 768-dimensional vector
  embeddingModel: "text-embedding-004"
}
```

### Response Format
```javascript
{
  answer: "AI-generated response...",
  sources: [
    {
      title: "Article Title",
      url: "https://source.com/article"
    }
  ],
  hasRelevantContext: true,
  fromCache: false,
  timestamp: "2024-01-01T00:00:00Z"
}
```

## 🛠️ Configuration

### RSS Feeds
Add RSS feeds to your `.env` file:
```env
RSS_FEEDS=https://feeds.reuters.com/reuters/topNews,https://rss.cnn.com/rss/edition.rss,https://feeds.bbci.co.uk/news/rss.xml
```

### Vector Database Settings
```env
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION_NAME=news_articles
```

### AI Model Configuration
The system uses:
- **Embeddings**: `text-embedding-004` (768 dimensions)
- **Generation**: `gemini-1.5-flash-latest`
- **Vector Distance**: Cosine similarity

### Performance Tuning
```env
# Retrieval settings
TOP_K_RESULTS=5              # Number of articles to retrieve
SIMILARITY_THRESHOLD=0.7     # Minimum similarity score
MAX_CONTEXT_LENGTH=4000      # Maximum context for AI

# Caching
CACHE_TTL=3600              # Cache TTL in seconds
SESSION_TTL=86400           # Session TTL in seconds

# Batch processing
BATCH_SIZE=100              # Articles per batch
MAX_CONCURRENT_BATCHES=3    # Concurrent processing limit
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Qdrant Connection Failed
```bash
# Check if Qdrant is running
curl http://localhost:6333/collections

# Restart Qdrant
docker restart qdrant
```

#### 2. Redis Connection Failed
```bash
# Check Redis status
redis-cli ping

# Restart Redis
docker restart redis
```

#### 3. Empty Search Results
```bash
# Verify articles were ingested
node scripts/monitorIngestion.js

# Check collection status
curl http://localhost:6333/collections/news_articles
```

#### 4. API Rate Limits
- The system includes built-in rate limiting and retry logic
- Batch processing includes delays between requests
- Check your Google AI API quotas

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm start

# Run health check with verbose output
node scripts/healthCheck.js --verbose
```

## 📊 Monitoring & Analytics

### System Metrics
- Vector database size and health
- Cache hit rates and memory usage
- Session activity and message counts
- Ingestion success rates and timing

### Performance Monitoring
```bash
# Real-time system monitor
npm run monitor

# Get system status
curl http://localhost:5000/health
```

## 🧪 Testing

### Run Tests
```bash
# Test ingestion pipeline
npm run test-ingestion

# Test with sample data
node scripts/testIngestion.js

# Validate data consistency
node scripts/validateIngestion.js
```

## 🚀 Deployment

### Docker Deployment
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - REDIS_URL=redis://redis:6379
      - QDRANT_URL=http://qdrant:6333
    depends_on:
      - redis
      - qdrant

  redis:
    image: redis:latest
    ports:
      - "6379:6379"

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
```

### Production Considerations
- Set up proper SSL certificates
- Configure production-grade Redis (Redis Cluster)
- Use managed Qdrant or scale horizontally
- Implement proper logging and monitoring
- Set up automated backups

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Google AI for Gemini and embedding models
- Qdrant for vector database capabilities
- Redis for caching and session management
- All RSS feed providers for news content

---

For more detailed information, check out the inline code documentation and script help commands using `--help` flag.
