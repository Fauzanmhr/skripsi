// Layanan untuk interaksi dengan Google Maps - scraping ulasan dan manajemen URL
import { scraper } from "google-maps-review-scraper";
import Review from "../models/review.js";
import GoogleMapsSetting from "../models/googleMapsSetting.js";

// Membersihkan teks dari whitespace berlebih
const cleanText = (text) => text.replace(/\s+/g, " ").trim();

// Ekstrak nama tempat dari URL Google Maps
export function extractPlaceName(url) {
  if (!url) return "";

  try {
    // Mencari pola '/place/nama-tempat' dalam URL Google Maps
    const placeMatch = url.match(/\/place\/([^/@]+)/);
    if (placeMatch && placeMatch[1]) {
      // Decode URI component dan ganti tanda + dengan spasi
      return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
    }
    return "";
  } catch (error) {
    return "";
  }
}

// Mendapatkan URL Google Maps dari database
export async function getGoogleMapsSetting() {
  try {
    // Mencari atau membuat record setelan dengan ID=1
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url: "" },
    });

    return record.url;
  } catch (error) {
    return "";
  }
}

// Memperbarui URL Google Maps dalam database
export async function updateGoogleMapsSetting(url) {
  try {
    // Mencari atau membuat record setelan dengan ID=1
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url },
    });

    // Update URL jika berbeda dengan yang ada di database
    if (record.url !== url) {
      record.url = url;
      await record.save();
    }

    return record;
  } catch (error) {
    throw error;
  }
}

// Inisialisasi setelan Google Maps saat aplikasi pertama kali berjalan
export async function initializeGoogleMapsSetting() {
  try {
    // Mencari atau membuat record setelan dengan ID=1
    const [record] = await GoogleMapsSetting.findOrCreate({
      where: { id: 1 },
      defaults: { url: "" },
    });
    return record.url;
  } catch (error) {
    return "";
  }
}

// Mengambil ulasan dari Google Maps menggunakan scraper
export async function fetchReviews() {
  try {
    // Mendapatkan URL Google Maps dari database
    const googleMapsURL = await getGoogleMapsSetting();

    // Validasi URL Google Maps
    if (!googleMapsURL) {
      throw new Error(
        "URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.",
      );
    }

    // Scrape ulasan dengan menggunakan google-maps-review-scraper
    const reviews = await scraper(googleMapsURL, {
      sort_type: "newest", // Urutkan berdasarkan terbaru
      clean: true // Bersihkan output
    });

    // Parse hasil scraping dari JSON string
    let parsedReviews;
    try {
      parsedReviews = JSON.parse(reviews);
    } catch (parseError) {
      throw new Error(`Failed to parse reviews data: ${parseError.message}`);
    }

    // Format ulasan untuk disimpan ke database
    return (
      parsedReviews
        .filter(
          (review) =>
            review.review?.text?.trim() &&
            (review.review?.language === "id" || review.review?.language === "en")
        ) // Filter ulasan kosong dan hanya bahasa Indonesia/Inggris
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

// Menyimpan ulasan ke database dengan menghindari duplikasi
export async function saveReviewsToDatabase(reviews) {
  // Inisialisasi objek hasil untuk melacak status penyimpanan
  const result = {
    saved: 0, // Jumlah ulasan baru yang disimpan
    updated: 0, // Jumlah ulasan yang diupdate
    skipped: 0, // Jumlah ulasan yang dilewati (tidak berubah)
    errors: 0, // Jumlah error saat menyimpan/update
    total: reviews.length, // Total ulasan yang diproses
  };

  try {
    // Ambil semua review yang sudah ada dari database
    const existingReviews = await Review.findAll({
      where: { id: reviews.map((r) => r.id) },
    });

    // Buat Map dari review ID untuk lookup cepat
    const existingMap = new Map();
    existingReviews.forEach((r) => existingMap.set(r.id, r.review));

    // Filter review yang baru atau perlu diupdate
    const reviewsToUpsert = [];
    for (const review of reviews) {
      const existingText = existingMap.get(review.id);

      if (existingText === undefined) {
        // Review baru
        reviewsToUpsert.push({ ...review, sentiment: null });
        result.saved++;
      } else if (existingText !== review.review) {
        // Review sudah ada tapi berubah
        reviewsToUpsert.push({ ...review, sentiment: null });
        result.updated++;
      } else {
        // Review tidak berubah
        result.skipped++;
      }
    }

    // Simpan semua review baru dan yang berubah
    if (reviewsToUpsert.length > 0) {
      await Review.bulkCreate(reviewsToUpsert, {
        updateOnDuplicate: ["review", "time_published", "sentiment"],
      });
    }

    return result;
  } catch (error) {
    console.error("Error in saveReviewsToDatabase:", error);
    result.errors =
      result.total - result.saved - result.updated - result.skipped;
    return result;
  }
}

// Fungsi utama yang menggabungkan proses fetch dan save ulasan
export async function crawlAndSaveReviews() {
  try {
    // Validasi URL Google Maps
    const googleMapsURL = await getGoogleMapsSetting();
    if (!googleMapsURL) {
      throw new Error(
        "Google Maps URL is not configured. Please set it in the settings.",
      );
    }

    // Ambil ulasan dari Google Maps
    const reviews = await fetchReviews();

    // Simpan ulasan ke database dan kembalikan hasilnya
    return await saveReviewsToDatabase(reviews);
  } catch (error) {
    throw error;
  }
}
