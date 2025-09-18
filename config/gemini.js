const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure the model
const model = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash-latest",
  generationConfig: {
    temperature: 0.7,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 1024,
  },
  safetySettings: [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH", 
      threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
  ]
});

async function generateResponse(prompt, context = []) {
  try {
    const contextStr = context.length > 0 
      ? `Context from news articles:\n${context.join('\n\n')}\n\n`
      : '';
    
    const fullPrompt = `${contextStr}Question: ${prompt}\n\nAnswer based on the provided context. If the context doesn't contain relevant information, say so and provide a general response.`;
    
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error generating response:', error);
    throw new Error('Failed to generate response');
  }
}

async function generateStreamingResponse(prompt, context = []) {
  try {
    const contextStr = context.length > 0 
      ? `Context from news articles:\n${context.join('\n\n')}\n\n`
      : '';
    
    const fullPrompt = `${contextStr}Question: ${prompt}\n\nAnswer based on the provided context. If the context doesn't contain relevant information, say so and provide a general response.`;
    
    const result = await model.generateContentStream(fullPrompt);
    return result.stream;
  } catch (error) {
    console.error('Error generating streaming response:', error);
    throw new Error('Failed to generate streaming response');
  }
}

module.exports = {
  model,
  generateResponse,
  generateStreamingResponse
};