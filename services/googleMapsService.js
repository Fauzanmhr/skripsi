import { scraper } from "google-maps-review-scraper";
import Review from '../models/review.js';

// Define Google Maps URL from environment variable
const googleMapsURL = process.env.GOOGLE_MAPS_URL;

// Clean review text by removing extra spaces and trimming
const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

// Fetch reviews from Google Maps
export async function fetchReviews() {
  try {
    // Fetch reviews from Google Maps
    const reviews = await scraper(googleMapsURL, {
      sort_type: "newest",
      search_query: "",
      // pages: 10,
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
      .filter(review => review.review?.text?.trim())
      .map(review => ({
        id: review.review_id,
        review: cleanText(review.review.text),
        time_published: new Date(review.time.published / 1000)
      })) || [];
  } catch (error) {
    console.error("Error fetching reviews:", error);
    throw new Error(`Failed to fetch reviews: ${error.message}`);
  }
}

// Save reviews to database
export async function saveReviewsToDatabase(reviews) {
  const result = { saved: 0, updated: 0, skipped: 0, errors: 0, total: reviews.length };

  for (const reviewData of reviews) {
    try {
      const existingReview = await Review.findByPk(reviewData.id);

      if (existingReview) {
        // Check if the review text has actually changed
        if (existingReview.review !== reviewData.review) {
          // Text changed, update the review and reset sentiment
          await existingReview.update({
            review: reviewData.review,
            time_published: reviewData.time_published,
            sentiment: null // Reset sentiment if review text changed
          });
          result.updated++;
        } else {
          // Text is the same, skip the update
          result.skipped++;
        }
      } else {
        // New review, create it
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

  return result; // Return the result object including 'skipped'
}

// Main function to crawl and save reviews
export async function crawlAndSaveReviews() {
  try {
    const reviews = await fetchReviews();
    return await saveReviewsToDatabase(reviews);
  } catch (error) {
    console.error("Error in crawl and save process:", error);
    throw error;
  }
}