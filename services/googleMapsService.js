import { scraper } from "google-maps-review-scraper";
import Review from '../models/review.js';
import GoogleMapsUrl from '../models/googleMapsUrl.js';

// Clean review text by removing extra spaces and trimming
const cleanText = (text) => text.replace(/\s+/g, ' ').trim();

// Extract place name from Google Maps URL
export function extractPlaceName(url) {
  if (!url) return '';
  
  try {
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch && placeMatch[1]) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
    }
    return '';
  } catch (error) {
    return '';
  }
}

export async function getGoogleMapsUrl() {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url: '' }
    });

    return record.url;
  } catch (error) {
    return '';
  }
}

export async function updateGoogleMapsUrl(url) {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url }
    });

    if (record.url !== url) {
      record.url = url;
      await record.save();
    }

    return record;
  } catch (error) {
    throw error;
  }
}

export async function initializeGoogleMapsUrl() {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url: '' }
    });
    return record.url;
  } catch (error) {
    return '';
  }
}

// Fetch reviews from Google Maps
export async function fetchReviews() {
  try {
    // Get Google Maps URL from database
    const googleMapsURL = await getGoogleMapsUrl();

    if (!googleMapsURL) {
      throw new Error('URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.');
    }

    // Fetch reviews from Google Maps
    const reviews = await scraper(googleMapsURL, {
      sort_type: "newest",
      search_query: "",
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
      result.errors++;
    }
  }

  return result;
}

// Main function to crawl and save reviews
export async function crawlAndSaveReviews() {
  try {
    // Check if Google Maps URL is configured
    const googleMapsURL = await getGoogleMapsUrl();
    if (!googleMapsURL) {
      throw new Error('Google Maps URL is not configured. Please set it in the settings.');
    }

    const reviews = await fetchReviews();
    return await saveReviewsToDatabase(reviews);
  } catch (error) {
    throw error;
  }
}