import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';

// Format date for HTML input
function formatDate(date) {
  return date ? new Date(date).toISOString().split('T')[0] : '';
}

// Controller to render the dashboard page
export async function renderDashboard(req, res) {
  try {
    const { startDate, endDate } = req.query;
    
    // Get min and max dates from the database
    const dateRanges = await Review.findAll({
      attributes: [
        [sequelize.fn('MIN', sequelize.col('time_published')), 'minDate'],
        [sequelize.fn('MAX', sequelize.col('time_published')), 'maxDate']
      ],
      raw: true
    });
    
    const dbMinDate = formatDate(dateRanges[0].minDate);
    const dbMaxDate = formatDate(dateRanges[0].maxDate);
    
    // Set date range (user input or null if not provided)
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    // Get sentiment stats
    const sentimentData = await Review.findAll({
      attributes: [
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null },
        ...(start && end && { time_published: { [Op.between]: [start, end] } })
      },
      group: ['sentiment'],
      raw: true
    });
    
    // Format results
    const sentimentLabels = ['positif', 'negatif', 'netral', 'puas', 'kecewa'];
    const counts = {};
    
    // Initialize counts with zeros
    sentimentLabels.forEach(label => counts[label] = 0);
    
    // Fill in actual counts
    sentimentData.forEach(item => counts[item.sentiment] = parseInt(item.count));
    
    // Render the dashboard
    res.render('dashboard', {
      title: 'Sentiment Analysis Dashboard',
      stats: JSON.stringify({ labels: sentimentLabels, counts }),
      startDate: startDate || null,
      endDate: endDate || null,
      dbMinDate,
      dbMaxDate,
      page: 'dashboard',
      body: ''
    });
  } catch (error) {
    console.error('Dashboard rendering error:', error);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}