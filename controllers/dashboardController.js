// Controller untuk halaman dashboard dengan statistik sentimen dan ulasan terbaru
import Review from "../models/review.js";
import { sequelize } from "../config/database.js";
import { Op } from "sequelize";
import {
  getGoogleMapsSetting,
  extractPlaceName,
} from "../services/googleMapsService.js";

// Render halaman dashboard dengan data statistik dan ulasan negatif
export async function renderDashboard(req, res) {
  try {
    // Ambil data statistik sentimen untuk semua waktu
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

    // Ambil 5 ulasan buruk terbaru (negatif atau kecewa)
    const latestBadReviews = await Review.findAll({
      where: {
        sentiment: {
          [Op.in]: ['negatif', 'kecewa']
        }
      },
      order: [['time_published', 'DESC']],
      limit: 5
    });

    // Label sentimen untuk pengelompokan data
    const sentimentLabels = ["positif", "negatif", "netral", "puas", "kecewa"];
    
    // Menginisialisasi objek jumlah sentimen dengan nilai 0
    const allTimeCounts = Object.fromEntries(
      sentimentLabels.map((label) => [label, 0]),
    );

    // Memetakan data jumlah setiap sentimen
    allTimeData.forEach(
      (item) => (allTimeCounts[item.sentiment] = parseInt(item.count)),
    );

    // Mendapatkan URL Google Maps untuk informasi lokasi
    const googleMapsUrl = await getGoogleMapsSetting();
    const placeName = extractPlaceName(googleMapsUrl);

    // Render halaman dashboard dengan data yang diperlukan
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
    // Handling error rendering dashboard
    console.error("Dashboard rendering error:", error);
    res.status(500).render("error", {
      message: "Gagal memuat dasbor",
      error: process.env.NODE_ENV === "development" ? error : {},
    });
  }
}
