import GoogleMapsUrl from '../models/googleMapsUrl.js';

export async function getGoogleMapsUrl() {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url: '' }
    });
    
    return record.url;
  } catch (error) {
    console.error('Error getting Google Maps URL:', error);
    return '';
  }
}

export async function updateGoogleMapsUrl(url) {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url }
    });
    
    if (record.url !== url) {
      record.url = url;
      await record.save();
    }
    
    return record;
  } catch (error) {
    console.error('Error updating Google Maps URL:', error);
    throw error;
  }
}

export async function initializeGoogleMapsUrl() {
  try {
    const [record] = await GoogleMapsUrl.findOrCreate({
      where: { id: 1 },
      defaults: { url: '' }
    });
    
    console.log(`Google Maps URL initialized: ${record.url ? record.url.substring(0, 30) + '...' : 'Not configured'}`);
    return record.url;
  } catch (error) {
    console.error('Error initializing Google Maps URL:', error);
    return '';
  }
}
