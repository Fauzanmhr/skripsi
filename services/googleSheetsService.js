import axios from 'axios';
import csv from 'csv-parser';
import { Readable } from 'stream';
import Review from '../models/review.js';
import ReviewExtra from '../models/review_extra.js';

// Mapping headers from CSV to database fields
const HEADER_MAP = {
  'ID': 'id',
  'Timestamp': 'timestamp',
  'Jenis Kelamin ': 'gender',
  'Usia': 'age_category',
  'Pekerjaan': 'occupation',
  'Apakah ini kunjungan pertama Anda ke De.u Coffee ?': 'first_visit',
  'Ceritakan ulasan atau pengalaman Anda terhadap De.u Coffee?': 'review_text'
};

// Function to clean review text by trimming and removing extra spaces
const cleanText = (text) => text ? text.replace(/\s+/g, ' ').trim() : '';

// Fetch CSV data from Google Sheets
export async function fetchGoogleSheetsData(sheetsUrl) {
  try {
    const response = await axios.get(sheetsUrl, { responseType: 'text' });
    return response.data;
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    throw new Error(`Failed to fetch Google Sheets data: ${error.message}`);
  }
}

// Parse CSV data into JSON format
export function parseCSVData(csvData) {
  return new Promise((resolve, reject) => {
    const results = [];
    Readable.from(csvData)
      .pipe(csv({
        mapHeaders: ({ header }) => HEADER_MAP[header] || header
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Format timestamp into SQL-compatible format
function formatTimestamp(timestamp) {
  try {
    return new Date(timestamp || Date.now()).toISOString().slice(0, 19).replace("T", " ");
  } catch (error) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }
}

// Transform parsed CSV data into structured database format
export function transformSheetData(parsedData) {
  return parsedData
    .map(row => {
      const reviewId = row.id?.trim() || `form-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const isFirstVisit = typeof row.first_visit === 'string' && 
                          (row.first_visit.includes('Ya') || row.first_visit.includes('pertama'));
      const timePublished = formatTimestamp(row.timestamp);
      
      return {
        review: {
          id: reviewId,
          review: cleanText(row.review_text),
          time_published: timePublished,
          source: 'Google Forms'
        },
        reviewExtra: {
          review_id: reviewId,
          gender: row.gender || '',
          age_category: row.age_category || '',
          occupation: row.occupation || '',
          first_visit: isFirstVisit
        }
      };
    })
    .filter(item => item.review.review.trim() !== ''); // Filter out empty reviews
}

// Save transformed data to database, avoiding duplicate ReviewExtra entries
export async function saveSheetDataToDatabase(transformedData) {
  const result = { saved: 0, updated: 0, errors: 0, total: transformedData.length };
  
  for (const data of transformedData) {
    try {
      const existingReview = await Review.findByPk(data.review.id);
      
      if (existingReview) {
        // Update existing review if found
        await existingReview.update({
          review: data.review.review,
          time_published: data.review.time_published,
          source: data.review.source,
          sentiment: existingReview.review !== data.review.review ? null : existingReview.sentiment
        });
        
        // Check if ReviewExtra already exists
        const existingReviewExtra = await ReviewExtra.findOne({ where: { review_id: data.review.id } });
        if (existingReviewExtra) {
          await existingReviewExtra.update(data.reviewExtra); // Update if exists
        } else {
          await ReviewExtra.create(data.reviewExtra); // Create new entry if not exists
        }

        result.updated++;
      } else {
        // Create new review and associated ReviewExtra
        await Review.create(data.review);
        await ReviewExtra.create(data.reviewExtra);
        result.saved++;
      }
    } catch (error) {
      console.error(`Error saving review data ${data.review.id}:`, error);
      result.errors++;
    }
  }
  
  return result;
}

// Main function to process Google Sheets data
export async function processGoogleSheetsData(sheetsUrl) {
  try {
    const csvData = await fetchGoogleSheetsData(sheetsUrl);
    const parsedData = await parseCSVData(csvData);
    const transformedData = transformSheetData(parsedData);
    return await saveSheetDataToDatabase(transformedData);
  } catch (error) {
    console.error("Error processing Google Sheets data:", error);
    throw error;
  }
}