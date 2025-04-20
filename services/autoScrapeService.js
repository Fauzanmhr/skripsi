import cron from 'node-cron';
import { crawlAndSaveReviews } from './googleMapsService.js';
import AutoScrapeSetting from '../models/autoScrapeSetting.js';

// Default settings
const DEFAULT_SETTINGS = {
  enabled: false,
  lastScrape: null,
  nextScrape: null
};

// Daily job configuration (midnight)
const CRON_EXPRESSION = '0 0 * * *'; 

let currentJob = null;
let settings = { ...DEFAULT_SETTINGS };

// Load settings from database
export async function loadSettings() {
  try {
    // Get the settings record (create if it doesn't exist)
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: DEFAULT_SETTINGS
    });
    
    // Update the in-memory settings
    settings = {
      enabled: record.enabled,
      lastScrape: record.lastScrape,
      nextScrape: record.nextScrape
    };
    
    // If nextScrape is in the past, reset it
    const now = new Date();
    if (settings.nextScrape && new Date(settings.nextScrape) < now) {
      settings.nextScrape = calculateNextScrapeTime();
    }

    // Re-schedule job if enabled
    if (settings.enabled) {
      scheduleAutoScrape();
    }
    
    return settings;
  } catch (error) {
    console.error('Failed to load auto scrape settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

// Save settings to database
export async function saveSettings(newSettings) {
  try {
    // Update settings in memory
    settings = {
      ...settings,
      ...newSettings
    };
    
    // Handle job scheduling/cancellation
    if (settings.enabled) {
      // Calculate next scrape time
      settings.nextScrape = calculateNextScrapeTime();
    } else {
      cancelAutoScrape();
      settings.nextScrape = null;
    }
    
    // Save to database
    const [record] = await AutoScrapeSetting.findOrCreate({
      where: { id: 1 },
      defaults: settings
    });
    
    // Update the record with new settings
    await record.update(settings);
    console.log('Auto scrape settings saved to database:', settings);
    
    // Handle job scheduling/cancellation
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

// Cancel current auto scrape job if any
function cancelAutoScrape() {
  if (currentJob) {
    currentJob.stop();
    currentJob = null;
    console.log('Auto scrape job cancelled');
  }
}

// Calculate the next scrape time
function calculateNextScrapeTime() {
  const now = new Date();
  const nextDate = new Date(now);
  
  // If the current time is past midnight, set it to the next day's midnight
  nextDate.setHours(24, 0, 0, 0); // Set to next day at midnight
  
  console.log(`Next scrape scheduled for (system time): ${nextDate.toLocaleString()}`);
  return nextDate;
}

// Schedule auto scrape job
function scheduleAutoScrape() {
  // Cancel existing job if any
  cancelAutoScrape();
  
  // Schedule new job (midnight system time)
  currentJob = cron.schedule(CRON_EXPRESSION, async () => {
    try {
      console.log(`Running auto scrape at ${new Date().toLocaleString()}`);
      const googleMapsURL = process.env.GOOGLE_MAPS_URL;
      const result = await crawlAndSaveReviews(googleMapsURL);
      console.log(`Auto scrape completed. Saved: ${result.saved}, Updated: ${result.updated}`);
      
      // Update last scrape time and calculate next scrape time
      const now = new Date();
      settings.lastScrape = now;
      settings.nextScrape = calculateNextScrapeTime();
      
      // Save updated times to database
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
  
  console.log(`Auto scrape scheduled to run daily at midnight. Next run: ${settings.nextScrape.toLocaleString()}`);
}

// Initialize service
export function initAutoScrapeService() {
  loadSettings().catch(error => {
    console.error('Error initializing auto scrape service:', error);
  });
}
