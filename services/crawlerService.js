import { scraper } from "google-maps-review-scraper";
import Review from '../models/review.js';

// Function to clean review text
function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

// Function to fetch and filter reviews
export async function fetchReviews(googleMapsURL) {
    try {
        const reviews = await scraper(googleMapsURL, {
            sort_type: "newest",
            search_query: "",
            pages: 12,
            clean: true
        });
        
        // Parse the reviews string into a JavaScript object
        let parsedReviews;
        try {
            parsedReviews = JSON.parse(reviews);
        } catch (parseError) {
            throw new Error("Failed to parse reviews data: " + parseError.message);
        }
        
        // Filter reviews: Only include reviews with actual text in Indonesian ("id") or English ("en")
        const filteredReviews = parsedReviews.filter(review =>
            review.review?.text?.trim() && // Exclude reviews without text
            (review.review?.language === "id" || review.review?.language === "en")
        );
        
        // If no valid reviews are found, return an empty array
        if (filteredReviews.length === 0) {
            return [];
        }
        
        // Transform and clean the reviews
        return filteredReviews.map(review => ({
            id: review.review_id,
            name: review.author.name,
            rating: review.review.rating,
            review: cleanText(review.review.text),
            time_published: new Date(review.time.published / 1000).toISOString().slice(0, 19).replace("T", " "), // ✅ FIXED
            time_edited: review.time.last_edited 
                ? new Date(review.time.last_edited / 1000).toISOString().slice(0, 19).replace("T", " ") 
                : null,
            language: review.review.language,
            source: "Google Maps Reviews"
        }));
        
    } catch (error) {
        console.error("Error fetching reviews:", error);
        throw new Error("Failed to fetch reviews: " + error.message);
    }
}

// Function to save reviews to database
export async function saveReviewsToDatabase(reviews) {
    let savedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const reviewData of reviews) {
        try {
            // Check if review already exists
            const existingReview = await Review.findByPk(reviewData.id);
            
            if (existingReview) {
                // Update existing review
                await existingReview.update({
                    name: reviewData.name,
                    rating: reviewData.rating,
                    review: reviewData.review,
                    time_published: reviewData.time_published,
                    time_edited: reviewData.time_edited,
                    language: reviewData.language,
                    source: reviewData.source,
                    // Reset sentiment only if the review text has changed
                    sentiment: existingReview.review !== reviewData.review ? null : existingReview.sentiment,
                    processed_at: existingReview.review !== reviewData.review ? null : existingReview.processed_at,
                    processing_attempts: existingReview.review !== reviewData.review ? 0 : existingReview.processing_attempts
                });
                updatedCount++;
            } else {
                // Create new review
                await Review.create({
                    ...reviewData,
                    sentiment: null,
                    processed_at: null
                });
                savedCount++;
            }
        } catch (error) {
            console.error(`Error saving review ${reviewData.id}:`, error);
            errorCount++;
        }
    }
    
    return {
        saved: savedCount,
        updated: updatedCount,
        errors: errorCount,
        total: reviews.length
    };
}

// Main function to crawl and save reviews
export async function crawlAndSaveReviews(googleMapsURL) {
    try {
        const reviews = await fetchReviews(googleMapsURL);
        const result = await saveReviewsToDatabase(reviews);
        return result;
    } catch (error) {
        console.error("Error in crawl and save process:", error);
        throw error;
    }
}