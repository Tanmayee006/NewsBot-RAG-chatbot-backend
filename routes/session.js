const express = require('express');
const { v4: uuidv4 } = require('uuid');
const redisClient = require('../config/redis');

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const sessionId = uuidv4();
    const sessionData = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      messages: []
    };

    // Store session in Redis with TTL
    const ttl = parseInt(process.env.SESSION_TTL) || 86400; // 24 hours
    await redisClient.setEx(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(sessionData)
    );

    res.json({
      success: true,
      sessionId,
      expiresIn: ttl
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
});

// Get session history
router.get('/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = await redisClient.get(`session:${sessionId}`);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or expired'
      });
    }

    const session = JSON.parse(sessionData);
    res.json({
      success: true,
      history: session.messages,
      messageCount: session.messageCount,
      lastActivity: session.lastActivity
    });
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session history'
    });
  }
});

// Clear session history
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionData = await redisClient.get(`session:${sessionId}`);
    
    if (!sessionData) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Reset session but keep the session ID
    const session = JSON.parse(sessionData);
    session.messages = [];
    session.messageCount = 0;
    session.lastActivity = new Date().toISOString();

    const ttl = parseInt(process.env.SESSION_TTL) || 86400;
    await redisClient.setEx(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(session)
    );

    res.json({
      success: true,
      message: 'Session cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear session'
    });
  }
});

// Update session activity
async function updateSessionActivity(sessionId, userMessage, botResponse) {
  try {
    const sessionData = await redisClient.get(`session:${sessionId}`);
    if (!sessionData) return false;

    const session = JSON.parse(sessionData);
    session.messages.push({
      id: uuidv4(),
      type: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    });

    if (botResponse) {
      session.messages.push({
        id: uuidv4(),
        type: 'bot',
        content: botResponse,
        timestamp: new Date().toISOString()
      });
    }

    session.messageCount = session.messages.length;
    session.lastActivity = new Date().toISOString();

    const ttl = parseInt(process.env.SESSION_TTL) || 86400;
    await redisClient.setEx(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(session)
    );

    return true;
  } catch (error) {
    console.error('Error updating session:', error);
    return false;
  }
}

module.exports = { router, updateSessionActivity };