// server.js

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const connectedSessions = new Map();
const qdrant = require("./config/qdrant");
const embeddings = require("./config/embeddings");
const redisClient = require("./config/redis");
const { model: geminiModel } = require("./config/gemini");

// Import routes
const chatRoutes = require("./routes/chat");
const { router: sessionRoutes } = require("./routes/session");

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP",
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/chat", chatRoutes);
app.use("/api/session", sessionRoutes);

// Health check
app.get("/health", async (req, res) => {
  try {
    const redisOk = await redisClient.ping();
    const collections = await qdrant.client.getCollections();

    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      services: {
        redis: redisOk === "PONG",
        qdrant: collections.collections.length > 0,
      },
    });
  } catch (err) {
    res.status(500).json({
      status: "ERROR",
      error: err.message,
    });
  }
});

// ---- Safe Gemini call with retries ----
async function safeGenerateContent(model, prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (err.status === 503 && i < retries - 1) {
        console.warn(`⚠️ Gemini overloaded. Retrying in ${2 ** i}s...`);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
        continue;
      }
      if (i === retries - 1) {
        return "⚠️ Sorry, I couldn’t generate a response right now.";
      }
    }
  }
}

// ---- Main RAG query processor ----
async function processRAGQuery(query, sessionId) {
  console.log(`\n🔎 Processing RAG query: "${query}"`);

  // 1. Embed query
  const queryEmbedding = await embeddings.embedSingle(query);

  // 2. Search Qdrant
  const searchResults = await qdrant.client.search(qdrant.collectionName, {
    vector: queryEmbedding,
    limit: 3,
    score_threshold: 0.5, // relaxed for better recall
  });

  console.log(
    `📊 Found ${searchResults.length} relevant articles in vector DB.`
  );

  if (searchResults.length === 0) {
    return {
      answer:
        "I couldn’t find any relevant information from the stored news articles.",
      sources: [],
      hasRelevantContext: false,
    };
  }

  // 3. Build context
  const sources = searchResults.map((r) => ({
    title: r.payload.title,
    url: r.payload.url,
  }));

  const context = searchResults
    .map(
      (r, i) =>
        `Article ${i + 1}: ${r.payload.title}\nContent: ${r.payload.summary}`
    )
    .join("\n\n---\n\n");

  // 4. Prompt
  const prompt = `You are a helpful news assistant. Based on the following news articles, provide a concise answer to the user's question.
If the articles don't contain the answer, say that you couldn't find relevant information.

--- CONTEXT FROM NEWS ARTICLES ---
${context}
------------------------------------

User's Question: "${query}"

Answer:`;

  console.log(`🧠 Generating response with LLM...`);
  const answer = await safeGenerateContent(geminiModel, prompt);

  return { answer, sources, hasRelevantContext: true };
}

// ---- Socket.IO ----
// io.on("connection", (socket) => {
//   console.log(`✅ Client connected: ${socket.id}`);

//   socket.on("join-session", (sessionId) => {
//     socket.join(sessionId);
//     console.log(`🔗 Socket ${socket.id} joined session ${sessionId}`);
//   });

//   socket.on("send-message", async (data) => {
//     try {
//       const { sessionId, message } = data;
//       const response = await processRAGQuery(message, sessionId);

//       io.to(sessionId).emit("bot-response", {
//         sessionId,
//         response,
//         timestamp: new Date().toISOString(),
//       });
//     } catch (error) {
//       console.error("❌ Error processing message:", error);
//       io.to(data.sessionId).emit("bot-response", {
//         sessionId: data.sessionId,
//         response: {
//           answer: "⚠️ Something went wrong. Please try again later.",
//           sources: [],
//           hasRelevantContext: false,
//         },
//         timestamp: new Date().toISOString(),
//       });
//     }
//   });

//   socket.on("disconnect", () => {
//     console.log(`❌ Client disconnected: ${socket.id}`);
//   });
// });
// In your server.js, update the socket handling to prevent duplicates:


io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);
  
  socket.on('join-session', (sessionId) => {
    // Leave any previous rooms
    socket.rooms.forEach(room => {
      if (room !== socket.id) {
        socket.leave(room);
      }
    });
    
    // Check if session already has a socket
    if (connectedSessions.has(sessionId)) {
      const existingSocketId = connectedSessions.get(sessionId);
      console.log(`Replacing existing socket for session ${sessionId}`);
      
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.leave(sessionId);
      }
    }
    
    socket.join(sessionId);
    connectedSessions.set(sessionId, socket.id);
    console.log(`Socket ${socket.id} joined session ${sessionId}`);
  });

  socket.on('send-message', async (data) => {
    try {
      const { sessionId, message } = data;
      
      console.log(`Processing RAG query: "${message}"`);
      
      const response = await processRAGQuery(message, sessionId);
      
      // Send response only to the requesting socket (not the room)
      socket.emit('bot-response', {
        id: require('uuid').v4(),
        sessionId,
        response,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error processing message:', error);
      socket.emit('error', {
        message: 'Failed to process your message. Please try again.'
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    
    // Remove from session tracking
    for (const [sessionId, socketId] of connectedSessions.entries()) {
      if (socketId === socket.id) {
        connectedSessions.delete(sessionId);
        console.log(`Removed session ${sessionId} from tracking`);
        break;
      }
    }
  });
});
// Error middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;

// ---- Start server ----
async function startServer() {
  try {
    await redisClient.ping();
    console.log("✅ Redis connected");

    await qdrant.client.getCollections();
    console.log("✅ Qdrant connected");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");
  await redisClient.quit();
  server.close(() => {
    console.log("Process terminated");
  });
});

module.exports = { app, io };
