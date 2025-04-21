import cron from 'node-cron';
import { crawlAndSaveReviews } from './googleMapsService.js';
import AutoScrapeSetting from '../models/autoScrapeSetting.js';
import ScrapeStatus from '../models/scrapeStatus.js'; // Import ScrapeStatus
import { Op } from 'sequelize'; // Import Op

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  nextScrape: null
};

// Cron job expression (daily at midnight)
const CRON_EXPRESSION = '0 0 * * *'; 

let currentJob = null;
let settings = { ...DEFAULT_SETTINGS };

// Placeholder for the broadcast function to be injected
let notifyStatusUpdate = (statusRecord) => {
  console.warn("notifyStatusUpdate function not injected into autoScrapeService yet.");
};

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

    // Adjust nextScrape if it’s in the past
    if (settings.nextScrape < new Date()) {
      settings.nextScrape = getNextMidnight();
    }

    // Reschedule the job if enabled
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    console.error('Failed to load auto scrape settings:', error);
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
    console.log('Auto scrape settings saved:', settingsToSave);

    // Reschedule the job if enabled
    if (settings.enabled) {
      scheduleAutoScrape();
    }

    return settings;
  } catch (error) {
    console.error('Failed to save auto scrape settings:', error);
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
    console.log('Auto scrape job cancelled');
  }
}

// Schedule the auto scrape job
function scheduleAutoScrape() {
  cancelAutoScrape();  // Cancel any existing job

  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    let scrapeRecord = null;
    const startTime = new Date(); // Define startTime early

    try {
      console.log(`Checking auto scrape conditions at ${new Date().toLocaleString()}`);

      // Check if another scrape is already running
      const runningScrape = await ScrapeStatus.findOne({ where: { status: 'running' } });
      if (runningScrape) {
        console.log(`Auto scrape skipped: Another scrape (${runningScrape.type}) is already running.`);
        return;
      }

      // Clean up old 'auto' logs before starting
      await ScrapeStatus.destroy({ where: { type: 'auto' } });
      console.log("Cleaned up previous 'auto' scrape logs.");

      // Record start in ScrapeStatus
      scrapeRecord = await ScrapeStatus.create({
        type: 'auto',
        status: 'running',
        startTime: startTime
      });
      console.log(`Running auto scrape at ${startTime.toLocaleString()}`);
      notifyStatusUpdate(scrapeRecord.toJSON()); // Broadcast 'running'

      const googleMapsURL = process.env.GOOGLE_MAPS_URL;
      const result = await crawlAndSaveReviews(googleMapsURL); // result now includes 'skipped'
      const endTime = new Date();
      // Update the message format
      const message = `Auto scrape selesai. Baru disimpan: ${result.saved}, Diperbarui: ${result.updated}, Tidak berubah: ${result.skipped}, Error: ${result.errors}`;
      console.log(message);

      // Update ScrapeStatus to completed
      await scrapeRecord.update({
        status: 'completed',
        endTime: endTime,
        message: message
      });
      notifyStatusUpdate(scrapeRecord.toJSON()); // Broadcast 'completed'

      // Update next scrape time in settings
      settings.nextScrape = getNextMidnight();

      // Save updated nextScrape time to the database
      const [settingRecord] = await AutoScrapeSetting.findOrCreate({ where: { id: 1 } });
      await settingRecord.update({ nextScrape: settings.nextScrape });

    } catch (error) {
      const endTime = new Date();
      const errorMessage = `Auto scrape failed: ${error.message}`;
      console.error(errorMessage);
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
      notifyStatusUpdate(finalStatus); // Broadcast 'failed'
    }
  });

  console.log(`Auto scrape scheduled at midnight. Next run: ${settings.nextScrape ? settings.nextScrape.toLocaleString() : 'Not scheduled'}`);
}

/**
 * Resets any scrape statuses that were left in 'running' state,
 * likely due to a server restart or crash.
 * Should be called once on application startup.
 */
export async function resetStaleScrapesOnStartup() {
  try {
    const interruptedCount = await ScrapeStatus.update(
      { status: 'failed', message: 'Scrape interrupted due to server restart.', endTime: new Date() },
      { where: { status: 'running' } }
    );
    if (interruptedCount[0] > 0) {
      console.log(`Reset ${interruptedCount[0]} stale 'running' scrape statuses.`);
    } else {
      console.log('No stale scrape statuses found to reset.');
    }
  } catch (error) {
    console.error('Error resetting stale scrape statuses:', error);
    // Decide if this error should prevent server start or just be logged
  }
}

// Initialize the auto scrape service - Inject the broadcast function
export function initAutoScrapeService(broadcastFunction) { // Accept the function
  if (typeof broadcastFunction === 'function') {
    notifyStatusUpdate = broadcastFunction; // Assign it
    console.log("SSE broadcast function injected into autoScrapeService.");
  } else {
    console.error("Failed to inject SSE broadcast function into autoScrapeService.");
  }
  loadSettings().catch(error => {
    console.error('Error initializing auto scrape service:', error);
  });
}
