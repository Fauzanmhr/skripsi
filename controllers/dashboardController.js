import Review from "../models/review.js";
import { sequelize } from "../config/database.js";
import { Op } from "sequelize";
import {
  getGoogleMapsSetting,
  extractPlaceName,
} from "../services/googleMapsService.js";

export async function renderDashboard(req, res) {
  try {
    const currentDate = new Date();
    const selectedMonth =
      parseInt(req.query.month) || currentDate.getMonth() + 1;
    const selectedYear = parseInt(req.query.year) || currentDate.getFullYear();

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999);

    const sentimentData = await Review.findAll({
      attributes: [
        "sentiment",
        [sequelize.fn("COUNT", sequelize.col("id")), "count"],
      ],
      where: {
        sentiment: { [Op.not]: null },
        time_published: {
          [Op.between]: [startDate, endDate],
        },
      },
      group: ["sentiment"],
      raw: true,
    });

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

    const sentimentLabels = ["positif", "negatif", "netral", "puas", "kecewa"];
    const counts = Object.fromEntries(
      sentimentLabels.map((label) => [label, 0]),
    );
    const allTimeCounts = Object.fromEntries(
      sentimentLabels.map((label) => [label, 0]),
    );

    sentimentData.forEach(
      (item) => (counts[item.sentiment] = parseInt(item.count)),
    );

    allTimeData.forEach(
      (item) => (allTimeCounts[item.sentiment] = parseInt(item.count)),
    );

    const currentYear = currentDate.getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const months = [
      { value: 1, name: "Januari" },
      { value: 2, name: "Februari" },
      { value: 3, name: "Maret" },
      { value: 4, name: "April" },
      { value: 5, name: "Mei" },
      { value: 6, name: "Juni" },
      { value: 7, name: "Juli" },
      { value: 8, name: "Agustus" },
      { value: 9, name: "September" },
      { value: 10, name: "Oktober" },
      { value: 11, name: "November" },
      { value: 12, name: "Desember" },
    ];

    const googleMapsUrl = await getGoogleMapsSetting();

    const placeName = extractPlaceName(googleMapsUrl);

    res.render("dashboard", {
      title: "Dasbor Analisis Sentimen",
      stats: {
        labels: sentimentLabels,
        counts,
        allTimeCounts,
      },
      filters: {
        selectedMonth,
        selectedYear,
        months,
        years,
      },
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
