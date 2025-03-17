import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';
import moment from 'moment';

// Format date for HTML input
const formatDate = date => date ? new Date(date).toISOString().split('T')[0] : '';

// Controller to render the dashboard page
export async function renderDashboard(req, res) {
  try {
    const { startDate, endDate } = req.query;
    
    // Get min and max dates from the database
    const [dateRange] = await Review.findAll({
      attributes: [
        [sequelize.fn('MIN', sequelize.col('time_published')), 'minDate'],
        [sequelize.fn('MAX', sequelize.col('time_published')), 'maxDate']
      ],
      raw: true
    });
    
    const dbMinDate = formatDate(dateRange.minDate);
    const dbMaxDate = formatDate(dateRange.maxDate);
    
    // Set date range filter if provided
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.time_published = { 
        [Op.between]: [new Date(startDate), new Date(endDate)] 
      };
    }
    
    // Get sentiment stats
    const sentimentData = await Review.findAll({
      attributes: [
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null },
        ...dateFilter
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
        ...dateFilter
      },
      group: ['date', 'sentiment'],
      order: [[sequelize.fn('DATE', sequelize.col('time_published')), 'ASC']],
      raw: true
    });
    
    // Process data for charts
    const sentimentLabels = ['positif', 'negatif', 'netral', 'puas', 'kecewa'];
    const counts = Object.fromEntries(sentimentLabels.map(label => [label, 0]));
    
    // Fill in actual counts
    sentimentData.forEach(item => counts[item.sentiment] = parseInt(item.count));
    
    // Process time series data
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
      page: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard rendering error:', error);
    res.status(500).render('error', {
      message: 'Failed to load dashboard',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}