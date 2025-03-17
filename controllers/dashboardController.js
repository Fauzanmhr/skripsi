import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';
import moment from 'moment';

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
    
    // Get sentiment by time (grouped by day)
    const sentimentByTime = await Review.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('time_published')), 'date'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null },
        ...(start && end && { time_published: { [Op.between]: [start, end] } })
      },
      group: ['date', 'sentiment'],
      order: [[sequelize.fn('DATE', sequelize.col('time_published')), 'ASC']],
      raw: true
    });
    
    // Format results for sentiment distribution
    const sentimentLabels = ['positif', 'negatif', 'netral', 'puas', 'kecewa'];
    const counts = {};
    
    // Initialize counts with zeros
    sentimentLabels.forEach(label => counts[label] = 0);
    
    // Fill in actual counts
    sentimentData.forEach(item => counts[item.sentiment] = parseInt(item.count));
    
    // Process data for time series chart
    const dates = [...new Set(sentimentByTime.map(item => item.date))].sort();
    const timeSeriesData = {};
    
    // Initialize the time series data structure
    sentimentLabels.forEach(sentiment => {
      timeSeriesData[sentiment] = dates.map(() => 0);
    });
    
    // Fill in the data
    sentimentByTime.forEach(item => {
      const dateIndex = dates.indexOf(item.date);
      if (dateIndex !== -1 && sentimentLabels.includes(item.sentiment)) {
        timeSeriesData[item.sentiment][dateIndex] = parseInt(item.count);
      }
    });
    
    // Format dates for display
    const formattedDates = dates.map(date => moment(date).format('MMM DD, YYYY'));
    
    // Render the dashboard
    res.render('dashboard', {
      title: 'Sentiment Analysis Dashboard',
      stats: JSON.stringify({ labels: sentimentLabels, counts }),
      timeSeriesData: JSON.stringify({
        dates: formattedDates,
        series: timeSeriesData
      }),
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