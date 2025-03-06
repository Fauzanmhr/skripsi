import axios from 'axios';
import cron from 'node-cron';
import Review from '../models/review.js';
import { Op } from 'sequelize';

// Sentiment analysis API configuration
const API_URL = process.env.SENTIMENT_API_URL || 'http://localhost:5000/predict';
const RETRY_DELAY = parseInt(process.env.SENTIMENT_API_RETRY_DELAY || 5000);
const MAX_ATTEMPTS = 5;

// Function to analyze sentiment for a single review
export async function analyzeSentiment(review) {
    try {
        // Call the sentiment analysis API
        const response = await axios.post(API_URL, {
            text: review.review
        });
        
        // Update the review with the sentiment result
        if (response.data && response.data.sentiment) {
            await review.update({
                sentiment: response.data.sentiment,
                processed_at: new Date(),
                processing_attempts: review.processing_attempts + 1
            });
            
            console.log(`Successfully analyzed review ${review.id}: ${response.data.sentiment}`);
            return response.data.sentiment;
        } else {
            throw new Error('Invalid API response: missing sentiment prediction');
        }
    } catch (error) {
        // Increment processing attempts
        await review.update({
            processing_attempts: review.processing_attempts + 1
        });
        
        console.error(`Error analyzing review ${review.id}:`, error.message);
        throw error;
    }
}

// Function to process a batch of unanalyzed reviews
async function processPendingReviews() {
    try {
        // Find reviews with NULL sentiment
        const pendingReviews = await Review.findAll({
            where: {
                sentiment: null,
                processing_attempts: { [Op.lt]: MAX_ATTEMPTS }
            },
            order: [['createdAt', 'ASC']],
            limit: 10  // Process in small batches
        });
        
        if (pendingReviews.length === 0) {
            return;
        }
        
        console.log(`Processing ${pendingReviews.length} pending reviews`);
        
        // Process each review sequentially
        for (const review of pendingReviews) {
            try {
                await analyzeSentiment(review);
                // Small delay between requests to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Failed to process review ${review.id}:`, error.message);
                // Continue with next review
            }
        }
    } catch (error) {
        console.error('Error in processPendingReviews:', error);
    }
}

// Function to start the sentiment analysis background job
export function startSentimentAnalysisJob() {
    // Run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        console.log('Running sentiment analysis job at', new Date());
        await processPendingReviews();
    });
    
    // Also run immediately on startup
    processPendingReviews().catch(error => {
        console.error('Initial processing failed:', error);
    });
    
    console.log('Sentiment analysis background job scheduled');
}