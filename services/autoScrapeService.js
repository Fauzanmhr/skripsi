import cron from 'node-cron';
import { crawlAndSaveReviews } from './googleMapsService.js';
import AutoScrapeSetting from '../models/autoScrapeSetting.js';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  lastScrape: null,
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
      lastScrape: record.lastScrape,
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
      settings.nextScrape = getNextMidnight();
    } else {
      cancelAutoScrape();
      settings.nextScrape = null;
    }

    // Save settings to the database
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: settings
    });

    await record.update(settings);
    console.log('Auto scrape settings saved:', settings);

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

  // Schedule new job for midnight every day
  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    try {
      console.log(`Running auto scrape at ${new Date().toLocaleString()}`);
      
      const googleMapsURL = process.env.GOOGLE_MAPS_URL;
      const result = await crawlAndSaveReviews(googleMapsURL);
      console.log(`Auto scrape completed. Saved: ${result.saved}, Updated: ${result.updated}`);

      // Update last scrape time and next scrape time
      const now = new Date();
      settings.lastScrape = now;
      settings.nextScrape = getNextMidnight();

      // Save updated times to the database
      const [record] = await AutoScrapeSetting.findOrCreate({
        where: { id: 1 },
        defaults: settings
      });
      await record.update({
        lastScrape: now,
        nextScrape: settings.nextScrape
      });

    } catch (error) {
      console.error('Auto scrape failed:', error);
    }
  });

  console.log(`Auto scrape scheduled at midnight. Next run: ${settings.nextScrape.toLocaleString()}`);
}

// Initialize the auto scrape service
export function initAutoScrapeService() {
  loadSettings().catch(error => {
    console.error('Error initializing auto scrape service:', error);
  });
}
