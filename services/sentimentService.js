import axios from 'axios';
import cron from 'node-cron';
import Review from '../models/review.js';

// Sentiment analysis API configuration
const API_URL = process.env.SENTIMENT_API_URL || 'http://localhost:8000/predict';

// Analyze sentiment for a single review
export async function analyzeSentiment(review) {
  try {
    const reviewText = typeof review === 'string' ? review : review.review;
    
    // Call the sentiment analysis API
    const response = await axios.post(API_URL, { text: reviewText });
    
    // Validate API response
    if (!response.data?.sentiment) {
      throw new Error('Invalid API response: missing sentiment prediction');
    }
    
    // If we received a review object (from database), update it
    if (typeof review !== 'string' && review.update) {
      await review.update({ sentiment: response.data.sentiment });
    }
    
    return response.data.sentiment;
  } catch (error) {
    throw error;
  }
}

// Process all unanalyzed reviews sequentially
async function processPendingReviews() {
  try {
    // Find all reviews with NULL sentiment
    const pendingReviews = await Review.findAll({
      where: { sentiment: null },
      order: [['createdAt', 'ASC']] // Process oldest reviews first
    });
    
    if (pendingReviews.length === 0) {
      return;
    }
    
    // Process reviews one by one (sequentially)
    for (const review of pendingReviews) {
      try {
        await analyzeSentiment(review);
      } catch (error) {
      }
    }
  } catch (error) {
  }
}

// Start the sentiment analysis background job
export function startSentimentAnalysisJob() {
  // cron schedule for every 5 minutes
  const cronSchedule = '*/5 * * * *';
  
  // Schedule the job
  cron.schedule(cronSchedule, async () => {
    await processPendingReviews();
  });
  
  // Run immediately on startup
  processPendingReviews().catch(() => {
  });
}