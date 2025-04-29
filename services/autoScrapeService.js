// Layanan untuk mengelola setelan dan penjadwalan scraping otomatis ulasan Google Maps
import cron from "node-cron";
import {
  crawlAndSaveReviews,
  getGoogleMapsSetting,
} from "./googleMapsService.js";
import AutoScrapeSetting from "../models/autoScrapeSetting.js";
import ScrapeStatus from "../models/scrapeStatus.js";
import { io } from "../app.js";

// Setelan default untuk scraping otomatis
const DEFAULT_SETTINGS = {
  enabled: false,
  nextScrape: null,
};

// Ekspresi cron untuk menjalankan scrape setiap tengah malam
const CRON_EXPRESSION = "0 0 * * *";

// Variabel untuk menyimpan job scrape saat ini dan settings
let currentJob = null;
let settings = { ...DEFAULT_SETTINGS };

// Mendapatkan waktu tengah malam berikutnya
const getNextMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight;
};

// Mengambil setelan scrape otomatis dari database
export async function loadSettings() {
  try {
    // Mencari atau membuat record setelan dengan id=1
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: DEFAULT_SETTINGS,
    });

    // Menyiapkan setelan dengan nilai dari database
    settings = {
      enabled: record.enabled,
      nextScrape: record.nextScrape || getNextMidnight(),
    };

    // Jika waktu scrape berikutnya sudah lewat, atur ke tengah malam berikutnya
    if (settings.nextScrape < new Date()) {
      settings.nextScrape = getNextMidnight();
    }

    // Jika fitur diaktifkan, jadwalkan scrape
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

// Menyimpan setelan scrape otomatis ke database
export async function saveSettings(newSettings) {
  try {
    // Gabungkan setelan baru dengan yang ada
    settings = { ...settings, ...newSettings };

    // Atur waktu scrape berikutnya jika fitur diaktifkan
    if (settings.enabled) {
      if (!settings.nextScrape || settings.nextScrape < new Date()) {
        settings.nextScrape = getNextMidnight();
      }
    } else {
      // Batalkan job jika fitur dinonaktifkan
      cancelAutoScrape();
      settings.nextScrape = null;
    }

    // Siapkan data untuk disimpan
    const settingsToSave = {
      enabled: settings.enabled,
      nextScrape: settings.nextScrape,
    };

    // Cari atau buat record setelan
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: settingsToSave,
    });

    // Update record dengan setelan baru
    await record.update(settingsToSave);

    // Jadwalkan scrape jika fitur diaktifkan
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    throw error;
  }
}

// Mendapatkan setelan scrape otomatis saat ini
export function getSettings() {
  return { ...settings };
}

// Membatalkan job scrape otomatis yang sedang berjalan
function cancelAutoScrape() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }
}

// Menjadwalkan job scrape otomatis dengan node-cron
function scheduleAutoScrape() {
  // Batalkan job yang sedang berjalan (jika ada)
  cancelAutoScrape();

  // Jadwalkan job baru dengan cron
  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    let scrapeRecord = null;
    const startTime = new Date();

    try {
      // Cek apakah ada scrape otomatis yang sedang berjalan
      const runningAutoScrape = await ScrapeStatus.findOne({
        where: {
          status: "running",
          type: "auto",
        },
      });

      // Jika ada, jangan jalankan scrape baru
      if (runningAutoScrape) {
        return;
      }

      // Hapus catatan scrape otomatis lama untuk menjaga database tetap bersih
      await ScrapeStatus.destroy({ where: { type: "auto" } });

      // Buat catatan untuk scrape yang akan dimulai
      scrapeRecord = await ScrapeStatus.create({
        type: "auto",
        status: "running",
        startTime: startTime,
      });

      // Kirim event Socket.io untuk memulai scrape
      io.emit("scrapeStatusUpdate", scrapeRecord.toJSON());

      // Ambil URL Google Maps dan validasi
      const googleMapsURL = await getGoogleMapsSetting();
      if (!googleMapsURL) {
        throw new Error(
          "URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.",
        );
      }

      // Jalankan proses scraping
      const result = await crawlAndSaveReviews(googleMapsURL);
      const endTime = new Date();
      const message = `Auto scrape selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

      // Update catatan scrape menjadi completed
      await scrapeRecord.update({
        status: "completed",
        endTime: endTime,
        message: message,
      });

      // Kirim event Socket.io untuk scrape selesai
      io.emit("scrapeStatusUpdate", scrapeRecord.toJSON());

      // Perbarui waktu scrape berikutnya
      settings.nextScrape = getNextMidnight();

      // Simpan waktu scrape berikutnya ke database
      const [settingRecord] = await AutoScrapeSetting.findOrCreate({
        where: { id: 1 },
      });
      await settingRecord.update({ nextScrape: settings.nextScrape });
    } catch (error) {
      // Handling error saat proses scraping
      const endTime = new Date();
      const errorMessage = `Auto scrape failed: ${error.message}`;
      let finalStatus = null;

      // Update status scrape menjadi failed jika record sudah ada
      if (scrapeRecord) {
        try {
          await scrapeRecord.update({
            status: "failed",
            endTime: endTime,
            message: errorMessage,
          });
          finalStatus = scrapeRecord.toJSON();

          // Kirim event Socket.io untuk status scrape gagal
          io.emit("scrapeStatusUpdate", finalStatus);
        } catch (updateError) {
          finalStatus = {
            type: "auto",
            status: "failed",
            startTime: scrapeRecord.startTime,
            endTime: endTime,
            message: errorMessage + " (DB update failed)",
          };

          // Kirim event Socket.io untuk status scrape gagal meskipun pembuatan database gagal
          io.emit("scrapeStatusUpdate", finalStatus);
        }
      } else {
        // Buat record failed baru jika belum ada
        try {
          const failedRecord = await ScrapeStatus.create({
            type: "auto",
            status: "failed",
            startTime: startTime,
            endTime: endTime,
            message: `Failed to even start scrape process: ${error.message}`,
          });
          finalStatus = failedRecord.toJSON();

          // Kirim event Socket.io untuk scrape gagal
          io.emit("scrapeStatusUpdate", finalStatus);
        } catch (createError) {
          finalStatus = {
            type: "auto",
            status: "failed",
            startTime: startTime,
            endTime: endTime,
            message: errorMessage + " (DB creation failed)",
          };

          // Kirim event Socket.io untuk status scrape gagal meskipun pembuatan database gagal
          io.emit("scrapeStatusUpdate", finalStatus);
        }
      }
    }
  });
}

// Reset status scrape yang terganggu (running) saat aplikasi dimulai ulang
export async function resetStaleScrapesOnStartup() {
  try {
    // Update semua status running menjadi failed dengan pesan error
    const interruptedCount = await ScrapeStatus.update(
      {
        status: "failed",
        message: "ERROR: Masalah pada server",
        endTime: new Date(),
      },
      { where: { status: "running" } },
    );
  } catch (error) {}
}

// Inisialisasi layanan scrape otomatis
export function initAutoScrapeService() {
  loadSettings().catch(() => {});
}
