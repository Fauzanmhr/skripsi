import axios from 'axios';
import csv from 'csv-parser';
import { Readable } from 'stream';
import Review from '../models/review.js';
import ReviewExtra from '../models/review_extra.js';

// Function to clean review text
function cleanText(text) {
  return text ? text.replace(/\s+/g, ' ').trim() : '';
}

// Function to fetch CSV data from Google Sheets
export async function fetchGoogleSheetsData(sheetsUrl) {
  try {
    const response = await axios({
      method: 'get',
      url: sheetsUrl,
      responseType: 'text'
    });
    
    return response.data;
  } catch (error) {
    console.error('Error fetching Google Sheets data:', error);
    throw new Error(`Failed to fetch Google Sheets data: ${error.message}`);
  }
}

// Function to parse CSV data
export async function parseCSVData(csvData) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    const stream = Readable.from(csvData);
    
    stream
      .pipe(csv({
        mapHeaders: ({ header }) => {
          const headerMap = {
            'ID': 'id',
            'Timestamp': 'timestamp',
            'Jenis Kelamin ': 'gender',
            'Usia': 'age_category',
            'Pekerjaan': 'occupation',
            'Apakah ini kunjungan pertama Anda ke De.u Coffee ?': 'first_visit',
            'Ceritakan ulasan atau pengalaman Anda terhadap De.u Coffee?': 'review_text'
          };
          return headerMap[header] || header;
        }
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Process the parsed data and transform it into our data model format
export function transformSheetData(parsedData) {
  return parsedData
    .map(row => {
      const reviewId = row.id && row.id.trim() !== '' ? row.id : `form-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

      let isFirstVisit = false;
      if (typeof row.first_visit === 'string') {
        isFirstVisit = row.first_visit.includes('Ya') || row.first_visit.includes('pertama');
      }

      let timePublished;
      try {
        const timestamp = row.timestamp || new Date().toISOString();
        timePublished = new Date(timestamp).toISOString().slice(0, 19).replace("T", " ");
      } catch (error) {
        timePublished = new Date().toISOString().slice(0, 19).replace("T", " ");
      }

      return {
        review: {
          id: reviewId,
          review: cleanText(row.review_text),  // Apply cleanText here
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
    .filter(item => item.review.review.trim() !== '');
}

// Save the transformed data to the database
export async function saveSheetDataToDatabase(transformedData) {
  let savedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  
  for (const data of transformedData) {
    try {
      const existingReview = await Review.findByPk(data.review.id);
      
      if (existingReview) {
        await existingReview.update({
          review: data.review.review,
          time_published: data.review.time_published,
          source: data.review.source,
          sentiment: existingReview.review !== data.review.review ? null : existingReview.sentiment
        });

        const existingExtra = await ReviewExtra.findOne({ where: { review_id: data.reviewExtra.review_id } });
        if (existingExtra) {
          await existingExtra.update(data.reviewExtra);
        } else {
          await ReviewExtra.create(data.reviewExtra);
        }

        updatedCount++;
      } else {
        await Review.create(data.review);
        await ReviewExtra.create(data.reviewExtra);
        savedCount++;
      }
    } catch (error) {
      console.error(`Error saving review data ${data.review.id}:`, error);
      errorCount++;
    }
  }
  
  return {
    saved: savedCount,
    updated: updatedCount,
    errors: errorCount,
    total: transformedData.length
  };
}

// Main function to fetch, process, and save data from Google Sheets
export async function processGoogleSheetsData(sheetsUrl) {
  try {
    const csvData = await fetchGoogleSheetsData(sheetsUrl);
    const parsedData = await parseCSVData(csvData);
    const transformedData = transformSheetData(parsedData);
    const result = await saveSheetDataToDatabase(transformedData);
    
    return result;
  } catch (error) {
    console.error("Error processing Google Sheets data:", error);
    throw error;
  }
}