import Review from "../models/review.js";
import { sequelize } from "../config/database.js";
import { Op } from "sequelize";
import {
  getGoogleMapsSetting,
  extractPlaceName,
} from "../services/googleMapsService.js";

export async function renderDashboard(req, res) {
  try {
    const allTimeData = await Review.findAll({
      attributes: [
        "sentiment",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: {
        sentiment: { [Op.not]: null },
      },
      group: ["sentiment"],
      raw: true,
    });

    // Fetch the latest bad reviews (negative or kecewa sentiment)
    const latestBadReviews = await Review.findAll({
      where: {
        sentiment: {
          [Op.in]: ['negatif', 'kecewa']
        }
      },
      order: [['time_published', 'DESC']],
      limit: 5
    });

    const sentimentLabels = ["positif", "negatif", "netral", "puas", "kecewa"];
    const allTimeCounts = Object.fromEntries(
      sentimentLabels.map((label) => [label, 0]),
    );

    allTimeData.forEach(
      (item) => (allTimeCounts[item.sentiment] = parseInt(item.count)),
    );

    const googleMapsUrl = await getGoogleMapsSetting();
    const placeName = extractPlaceName(googleMapsUrl);

    res.render("dashboard", {
      title: "Dasbor Analisis Sentimen",
      stats: {
        labels: sentimentLabels,
        allTimeCounts,
      },
      latestBadReviews,
      page: "dashboard",
      googleMapsUrl: googleMapsUrl,
      placeName: placeName,
    });
  } catch (error) {
    console.error("Dashboard rendering error:", error);
    res.status(500).render("error", {
      message: "Gagal memuat dasbor",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
}
