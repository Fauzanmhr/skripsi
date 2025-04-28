import { scraper } from "google-maps-review-scraper";
import Review from "../models/review.js";
import GoogleMapsSetting from "../models/googleMapsSetting.js";

const cleanText = (text) => text.replace(/\s+/g, " ").trim();

export function extractPlaceName(url) {
  if (!url) return "";

  try {
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch && placeMatch[1]) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }
    return "";
  } catch (error) {
    return "";
  }
}

export async function getGoogleMapsSetting() {
  try {
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url: "" },
    });

    return record.url;
  } catch (error) {
    return "";
  }
}

export async function updateGoogleMapsSetting(url) {
  try {
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url },
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

export async function initializeGoogleMapsSetting() {
  try {
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url: "" },
    });
    return record.url;
  } catch (error) {
    return "";
  }
}

export async function fetchReviews() {
  try {
    const googleMapsURL = await getGoogleMapsSetting();

    if (!googleMapsURL) {
      throw new Error(
        "URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.",
      );
    }

    const reviews = await scraper(googleMapsURL, {
      sort_type: "newest",
      search_query: "",
      clean: true,
    });

    let parsedReviews;
    try {
      parsedReviews = JSON.parse(reviews);
    } catch (parseError) {
      throw new Error(`Failed to parse reviews data: ${parseError.message}`);
    }

    return (
      parsedReviews
        .filter((review) => review.review?.text?.trim())
        .map((review) => ({
          id: review.review_id,
          review: cleanText(review.review.text),
          time_published: new Date(review.time.published / 1000),
        })) || []
    );
  } catch (error) {
    throw new Error(`Failed to fetch reviews: ${error.message}`);
  }
}

export async function saveReviewsToDatabase(reviews) {
  const result = {
    saved: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    total: reviews.length,
  };

  for (const reviewData of reviews) {
    try {
      const existingReview = await Review.findByPk(reviewData.id);

      if (existingReview) {
        if (existingReview.review !== reviewData.review) {
          await existingReview.update({
            review: reviewData.review,
            time_published: reviewData.time_published,
            sentiment: null,
          });
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        await Review.create({
          ...reviewData,
          sentiment: null,
        });
        result.saved++;
      }
    } catch (error) {
      result.errors++;
    }
  }

  return result;
}

export async function crawlAndSaveReviews() {
  try {
    const googleMapsURL = await getGoogleMapsSetting();
    if (!googleMapsURL) {
      throw new Error(
        "Google Maps URL is not configured. Please set it in the settings.",
      );
    }

    const reviews = await fetchReviews();
    return await saveReviewsToDatabase(reviews);
  } catch (error) {
    throw error;
  }
}
