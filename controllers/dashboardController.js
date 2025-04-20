import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';

// Controller to render the dashboard page
export async function renderDashboard(req, res) {
  try {
    // Parse filter parameters (default to current month/year)
    const currentDate = new Date();
    const selectedMonth = parseInt(req.query.month) || currentDate.getMonth() + 1; // 1-12
    const selectedYear = parseInt(req.query.year) || currentDate.getFullYear();

    // Create date range for filtering
    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 0, 23, 59, 59, 999); // Last day of month
    
    // Get sentiment stats for filtered data
    const sentimentData = await Review.findAll({
      attributes: [
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null },
        time_published: {
          [Op.between]: [startDate, endDate]
        }
      },
      group: ['sentiment'],
      raw: true
    });
    
    // Get sentiment stats for all data (for comparison/total)
    const allTimeData = await Review.findAll({
      attributes: [
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: ['sentiment'],
      raw: true
    });
    
    // Process data for charts
    const sentimentLabels = ['positif', 'negatif', 'netral', 'puas', 'kecewa'];
    const counts = Object.fromEntries(sentimentLabels.map(label => [label, 0]));
    const allTimeCounts = Object.fromEntries(sentimentLabels.map(label => [label, 0]));
    
    // Fill in actual counts for filtered data
    sentimentData.forEach(item => counts[item.sentiment] = parseInt(item.count));
    
    // Fill in all-time counts
    allTimeData.forEach(item => allTimeCounts[item.sentiment] = parseInt(item.count));
    
    // Generate month and year options for filters
    const currentYear = currentDate.getFullYear();
    const years = Array.from({length: 5}, (_, i) => currentYear - i);
    const months = [
      {value: 1, name: 'Januari'}, {value: 2, name: 'Februari'},
      {value: 3, name: 'Maret'}, {value: 4, name: 'April'},
      {value: 5, name: 'Mei'}, {value: 6, name: 'Juni'},
      {value: 7, name: 'Juli'}, {value: 8, name: 'Agustus'},
      {value: 9, name: 'September'}, {value: 10, name: 'Oktober'},
      {value: 11, name: 'November'}, {value: 12, name: 'Desember'}
    ];
    
    // Render the dashboard
    res.render('dashboard', {
      title: 'Dasbor Analisis Sentimen',
      stats: { 
        labels: sentimentLabels, 
        counts, 
        allTimeCounts 
      },
      filters: {
        selectedMonth,
        selectedYear,
        months,
        years
      },
      page: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard rendering error:', error);
    res.status(500).render('error', {
      message: 'Gagal memuat dasbor',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
}