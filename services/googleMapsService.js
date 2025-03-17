import { scraper } from "google-maps-review-scraper";
import Review from '../models/review.js';

// Clean review text by removing extra spaces and trimming
const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

// Fetch reviews from Google Maps
export async function fetchReviews(googleMapsURL) {
  try {
    // Fetch reviews from Google Maps
    const reviews = await scraper(googleMapsURL, {
      sort_type: "newest",
      search_query: "",
      pages: 15,
      clean: true
    });
    
    // Parse JSON response
    let parsedReviews;
    try {
      parsedReviews = JSON.parse(reviews);
    } catch (parseError) {
      throw new Error(`Failed to parse reviews data: ${parseError.message}`);
    }
    
    // Filter and map reviews
    return parsedReviews
      .filter(review => 
        review.review?.text?.trim() && 
        ['id', 'en'].includes(review.review?.language)
      )
      .map(review => ({
        id: review.review_id,
        review: cleanText(review.review.text),
        time_published: new Date(review.time.published / 1000).toISOString().slice(0, 19).replace("T", " "),
        source: "Google Maps Reviews"
      })) || [];
  } catch (error) {
    console.error("Error fetching reviews:", error);
    throw new Error(`Failed to fetch reviews: ${error.message}`);
  }
}

// Save reviews to database
export async function saveReviewsToDatabase(reviews) {
  const result = { saved: 0, updated: 0, errors: 0, total: reviews.length };
  
  for (const reviewData of reviews) {
    try {
      const existingReview = await Review.findByPk(reviewData.id);
      
      if (existingReview) {
        await existingReview.update({
          review: reviewData.review,
          time_published: reviewData.time_published,
          source: reviewData.source,
          sentiment: existingReview.review !== reviewData.review ? null : existingReview.sentiment
        });
        result.updated++;
      } else {
        await Review.create({
          ...reviewData,
          sentiment: null
        });
        result.saved++;
      }
    } catch (error) {
      console.error(`Error saving review ${reviewData.id}:`, error);
      result.errors++;
    }
  }
  
  return result;
}

// Main function to crawl and save reviews
export async function crawlAndSaveReviews(googleMapsURL) {
  try {
    const reviews = await fetchReviews(googleMapsURL);
    return await saveReviewsToDatabase(reviews);
  } catch (error) {
    console.error("Error in crawl and save process:", error);
    throw error;
  }
}