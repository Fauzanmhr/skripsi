// Layanan untuk menganalisis sentimen dari ulasan menggunakan API eksternal
import ky from "ky";
import cron from "node-cron";
import Review from "../models/review.js";

// URL API sentimen analisis, menggunakan nilai default jika tidak diset di environment
const API_URL = process.env.SENTIMENT_API_URL || "http://localhost:8000";
const SENTIMENT_ENDPOINT = "/sentiment";

// Fungsi untuk menganalisis sentimen satu ulasan, dapat menerima string atau objek review
export async function analyzeSentiment(review) {
  // Ekstrak teks ulasan dari parameter input
  const reviewText = typeof review === "string" ? review : review.review;

  // Kirim request ke API analisis sentimen
  const response = await ky.post(`${API_URL}${SENTIMENT_ENDPOINT}`, {
    json: {
      text: reviewText,
    }
  }).json();

  // Validasi respons dari API
  if (!response?.sentiment) {
    throw new Error("Invalid API response: missing sentiment");
  }

  // Jika input adalah objek review, update sentiment di database
  if (typeof review !== "string" && review.update) {
    await review.update({ sentiment: response.sentiment });
  }

  // Kembalikan hasil analisis sentimen
  return response.sentiment;
}

// Fungsi untuk memproses ulasan yang belum dianalisis (sentiment = null)
async function processPendingReviews() {
  try {
    // Cari semua ulasan yang belum dianalisis
    const pendingReviews = await Review.findAll({
      where: { sentiment: null },
      order: [["time_published", "ASC"]],
    });

    // Jika tidak ada ulasan yang perlu diproses, keluar dari fungsi
    if (pendingReviews.length === 0) {
      return;
    }

    // Proses setiap ulasan satu per satu
    for (const review of pendingReviews) {
      try {
        await analyzeSentiment(review);
      } catch (error) {
        // Lanjutkan ke ulasan berikutnya jika terjadi error
      }
    }
  } catch (error) {
    // Tangani error tanpa menghentikan proses
  }
}

// Memulai background job untuk menganalisis sentimen ulasan secara otomatis
export function startSentimentAnalysisJob() {
  // Jadwalkan job untuk berjalan setiap 5 menit
  const cronSchedule = "*/5 * * * *";

  // Daftarkan job ke node-cron
  cron.schedule(cronSchedule, async () => {
    await processPendingReviews();
  });

  // Jalankan job pertama kali saat aplikasi dimulai
  processPendingReviews().catch(() => {});
}
