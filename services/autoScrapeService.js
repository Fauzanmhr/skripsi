import cron from 'node-cron';
import { crawlAndSaveReviews, getGoogleMapsSetting } from './googleMapsService.js'; // Renamed import
import AutoScrapeSetting from '../models/autoScrapeSetting.js';
import ScrapeStatus from '../models/scrapeStatus.js';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  nextScrape: null
};

// Cron job expression (daily at midnight)
const CRON_EXPRESSION = '0 0 * * *'; 

let currentJob = null;
let settings = { ...DEFAULT_SETTINGS };

// Helper function to get the current time at midnight
const getNextMidnight = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0); // Set to next midnight
  return nextMidnight;
};

// Load settings from the database
export async function loadSettings() {
  try {
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: DEFAULT_SETTINGS
    });

    // Update in-memory settings
    settings = { 
      enabled: record.enabled,
      nextScrape: record.nextScrape || getNextMidnight() // Fallback if nextScrape is null
    };

    // Adjust nextScrape if it's in the past
    if (settings.nextScrape < new Date()) {
      settings.nextScrape = getNextMidnight();
    }

    // Reschedule the job if enabled
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

// Save settings to the database
export async function saveSettings(newSettings) {
  try {
    settings = { ...settings, ...newSettings };

    // Recalculate next scrape if enabled
    if (settings.enabled) {
      if (!settings.nextScrape || settings.nextScrape < new Date()) {
        settings.nextScrape = getNextMidnight();
      }
    } else {
      cancelAutoScrape();
      settings.nextScrape = null;
    }

    // Prepare data for saving
    const settingsToSave = {
      enabled: settings.enabled,
      nextScrape: settings.nextScrape
    };

    // Save settings to the database
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: settingsToSave
    });

    await record.update(settingsToSave);

    // Reschedule the job if enabled
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    throw error;
  }
}

// Get current settings
export function getSettings() {
  return { ...settings };
}

// Cancel the current auto scrape job
function cancelAutoScrape() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
  }
}

// Schedule the auto scrape job
function scheduleAutoScrape() {
  cancelAutoScrape();  // Cancel any existing job

  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    let scrapeRecord = null;
    const startTime = new Date();

    try {
      // Check if another AUTO scrape is already running
      const runningAutoScrape = await ScrapeStatus.findOne({
        where: {
          status: 'running',
          type: 'auto'
        }
      });
      
      if (runningAutoScrape) {
        return; // Exit if another auto scrape is running
      }

      // Clean up old 'auto' logs before starting
      await ScrapeStatus.destroy({ where: { type: 'auto' } });

      // Record start in ScrapeStatus
      scrapeRecord = await ScrapeStatus.create({
        type: 'auto',
        status: 'running',
        startTime: startTime
      });

      // Check if Google Maps URL is configured
      const googleMapsURL = await getGoogleMapsSetting(); // Renamed function call
      if (!googleMapsURL) {
        throw new Error('URL Google Maps belum dikonfigurasi. Silakan atur di pengaturan.');
      }

      const result = await crawlAndSaveReviews(googleMapsURL);
      const endTime = new Date();
      const message = `Auto scrape selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;

      // Update ScrapeStatus to completed
      await scrapeRecord.update({
        status: 'completed',
        endTime: endTime,
        message: message
      });

      // Update next scrape time in settings
      settings.nextScrape = getNextMidnight();

      // Save updated nextScrape time to the database
      const [settingRecord] = await AutoScrapeSetting.findOrCreate({ where: { id: 1 } });
      await settingRecord.update({ nextScrape: settings.nextScrape });

    } catch (error) {
      const endTime = new Date();
      const errorMessage = `Auto scrape failed: ${error.message}`;
      let finalStatus = null;

      // Update ScrapeStatus to failed
      if (scrapeRecord) {
        try {
          await scrapeRecord.update({ status: 'failed', endTime: endTime, message: errorMessage });
          finalStatus = scrapeRecord.toJSON();
        } catch (updateError) {
          finalStatus = { type: 'auto', status: 'failed', startTime: scrapeRecord.startTime, endTime: endTime, message: errorMessage + " (DB update failed)" };
        }
      } else {
        try {
          const failedRecord = await ScrapeStatus.create({ type: 'auto', status: 'failed', startTime: startTime, endTime: endTime, message: `Failed to even start scrape process: ${error.message}` });
          finalStatus = failedRecord.toJSON();
        } catch (createError) {
          finalStatus = { type: 'auto', status: 'failed', startTime: startTime, endTime: endTime, message: errorMessage + " (DB creation failed)" };
        }
      }
    }
  });
}

/**
 * Resets any scrape statuses that were left in 'running' state,
 * likely due to a server restart or crash.
 */
export async function resetStaleScrapesOnStartup() {
  try {
    const interruptedCount = await ScrapeStatus.update(
      { status: 'failed', message: 'ERROR: Masalah pada server', endTime: new Date() },
      { where: { status: 'running' } }
    );
  } catch (error) {
    // Continue execution even if this fails
  }
}

// Initialize the auto scrape service
export function initAutoScrapeService() {
  loadSettings().catch(() => {
    // Silent catch to prevent startup failure
  });
}
