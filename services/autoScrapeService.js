import cron from "node-cron";
import {
  crawlAndSaveReviews,
  getGoogleMapsSetting,
} from "./googleMapsService.js";
import AutoScrapeSetting from "../models/autoScrapeSetting.js";
import ScrapeStatus from "../models/scrapeStatus.js";

const DEFAULT_SETTINGS = {
  enabled: false,
  nextScrape: null,
};

const CRON_EXPRESSION = "0 0 * * *";

let currentJob = null;
let settings = { ...DEFAULT_SETTINGS };

const getNextMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight;
};

export async function loadSettings() {
  try {
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: DEFAULT_SETTINGS,
    });

    settings = {
      enabled: record.enabled,
      nextScrape: record.nextScrape || getNextMidnight(),
    };

    if (settings.nextScrape < new Date()) {
      settings.nextScrape = getNextMidnight();
    }

    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(newSettings) {
  try {
    settings = { ...settings, ...newSettings };

    if (settings.enabled) {
      if (!settings.nextScrape || settings.nextScrape < new Date()) {
        settings.nextScrape = getNextMidnight();
      }
    } else {
      cancelAutoScrape();
      settings.nextScrape = null;
    }

    const settingsToSave = {
      enabled: settings.enabled,
      nextScrape: settings.nextScrape,
    };

    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: settingsToSave,
    });

    await record.update(settingsToSave);

    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    throw error;
  }
}

export function getSettings() {
  return { ...settings };
}

function cancelAutoScrape() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }
}

function scheduleAutoScrape() {
  cancelAutoScrape();

  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    let scrapeRecord = null;
    const startTime = new Date();

    try {
      const runningAutoScrape = await ScrapeStatus.findOne({
        where: {
          status: "running",
          type: "auto",
        },
      });

      if (runningAutoScrape) {
        return;
      }

      await ScrapeStatus.destroy({ where: { type: "auto" } });

      scrapeRecord = await ScrapeStatus.create({
        type: "auto",
        status: "running",
        startTime: startTime,
      });

      const googleMapsURL = await getGoogleMapsSetting();
      if (!googleMapsURL) {
        throw new Error(
          "URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.",
        );
      }

      const result = await crawlAndSaveReviews(googleMapsURL);
      const endTime = new Date();
      const message = `Auto scrape selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

      await scrapeRecord.update({
        status: "completed",
        endTime: endTime,
        message: message,
      });

      settings.nextScrape = getNextMidnight();

      const [settingRecord] = await AutoScrapeSetting.findOrCreate({
        where: { id: 1 },
      });
      await settingRecord.update({ nextScrape: settings.nextScrape });
    } catch (error) {
      const endTime = new Date();
      const errorMessage = `Auto scrape failed: ${error.message}`;
      let finalStatus = null;

      if (scrapeRecord) {
        try {
          await scrapeRecord.update({
            status: "failed",
            endTime: endTime,
            message: errorMessage,
          });
          finalStatus = scrapeRecord.toJSON();
        } catch (updateError) {
          finalStatus = {
            type: "auto",
            status: "failed",
            startTime: scrapeRecord.startTime,
            endTime: endTime,
            message: errorMessage + " (DB update failed)",
          };
        }
      } else {
        try {
          const failedRecord = await ScrapeStatus.create({
            type: "auto",
            status: "failed",
            startTime: startTime,
            endTime: endTime,
            message: `Failed to even start scrape process: ${error.message}`,
          });
          finalStatus = failedRecord.toJSON();
        } catch (createError) {
          finalStatus = {
            type: "auto",
            status: "failed",
            startTime: startTime,
            endTime: endTime,
            message: errorMessage + " (DB creation failed)",
          };
        }
      }
    }
  });
}

export async function resetStaleScrapesOnStartup() {
  try {
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

export function initAutoScrapeService() {
  loadSettings().catch(() => {});
}
