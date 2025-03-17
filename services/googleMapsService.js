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
            pages: 15,
            clean: true
        });
        
        let parsedReviews;
        try {
            parsedReviews = JSON.parse(reviews);
        } catch (parseError) {
            throw new Error("Failed to parse reviews data: " + parseError.message);
        }
        
        const filteredReviews = parsedReviews.filter(review =>
            review.review?.text?.trim() &&
            (review.review?.language === "id" || review.review?.language === "en")
        );
        
        if (filteredReviews.length === 0) {
            return [];
        }
        
        return filteredReviews.map(review => ({
            id: review.review_id,
            review: cleanText(review.review.text),
            time_published: new Date(review.time.published / 1000).toISOString().slice(0, 19).replace("T", " "),
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
            const existingReview = await Review.findByPk(reviewData.id);
            
            if (existingReview) {
                await existingReview.update({
                    review: reviewData.review,
                    time_published: reviewData.time_published,
                    source: reviewData.source,
                    sentiment: existingReview.review !== reviewData.review ? null : existingReview.sentiment
                });
                updatedCount++;
            } else {
                await Review.create({
                    ...reviewData,
                    sentiment: null
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