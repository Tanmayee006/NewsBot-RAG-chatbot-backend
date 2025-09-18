const express = require('express');
const { updateSessionActivity } = require('./session');
const { processRAGQuery, getRelevantContext } = require('../services/ragService');
const { generateStreamingResponse } = require('../config/gemini');

const router = express.Router();

// Process chat message (non-streaming)
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, topK = 5 } = req.body; // allow topK param

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Message and sessionId are required'
      }); 
    }

    // Update session with user message
    await updateSessionActivity(sessionId, message);

    // Process through RAG pipeline
    const response = await processRAGQuery(message, sessionId, { topK });

    // Update session with bot response
    await updateSessionActivity(sessionId, null, response);

    res.json({
      success: true,
      response,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process message'
    });
  }
});

// Streaming chat endpoint
router.post('/stream', async (req, res) => {
  try {
    const { message, sessionId, topK = 5 } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Message and sessionId are required'
      });
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Update session with user message
    await updateSessionActivity(sessionId, message);

    // Get context from RAG
    const context = await getRelevantContext(message, { topK });
    
    // Generate streaming response
    const stream = await generateStreamingResponse(message, context);
    let fullResponse = '';

    for await (const chunk of stream) {
      const chunkText = chunk.text();
      fullResponse += chunkText;
      res.write(chunkText);
    }

    res.end();

    // Update session with complete response
    await updateSessionActivity(sessionId, null, fullResponse);

  } catch (error) {
    console.error('Error in streaming chat:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process streaming message'
    });
  }
});

module.exports = router;
