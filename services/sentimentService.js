import axios from "axios";
import cron from "node-cron";
import Review from "../models/review.js";

const API_URL =
  process.env.SENTIMENT_API_URL || "http://localhost:8000/predict";

export async function analyzeSentiment(review) {
  try {
    const reviewText = typeof review === "string" ? review : review.review;

    const response = await axios.post(API_URL, { text: reviewText });

    if (!response.data?.sentiment) {
      throw new Error("Invalid API response: missing sentiment prediction");
    }

    if (typeof review !== "string" && review.update) {
      await review.update({ sentiment: response.data.sentiment });
    }

    return response.data.sentiment;
  } catch (error) {
    throw error;
  }
}

async function processPendingReviews() {
  try {
    const pendingReviews = await Review.findAll({
      where: { sentiment: null },
      order: [["createdAt", "ASC"]],
    });

    if (pendingReviews.length === 0) {
      return;
    }

    for (const review of pendingReviews) {
      try {
        await analyzeSentiment(review);
      } catch (error) {}
    }
  } catch (error) {}
}

export function startSentimentAnalysisJob() {
  const cronSchedule = "*/5 * * * *";

  cron.schedule(cronSchedule, async () => {
    await processPendingReviews();
  });

  processPendingReviews().catch(() => {});
}
