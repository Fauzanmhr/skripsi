import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';
import moment from 'moment';

// Controller to render the dashboard page
export async function renderDashboard(req, res) {
  try {
    // Get sentiment stats for all data
    const sentimentData = await Review.findAll({
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
    
    // Get sentiment by day
    const sentimentByDay = await Review.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('time_published')), 'date'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: [sequelize.fn('DATE', sequelize.col('time_published')), 'sentiment'],
      order: [[sequelize.fn('DATE', sequelize.col('time_published')), 'ASC']],
      raw: true
    });
    
    // Get sentiment by week
    const sentimentByWeek = await Review.findAll({
      attributes: [
        [sequelize.fn('YEARWEEK', sequelize.col('time_published'), 1), 'yearweek'],
        [sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%u'), 'week_label'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: ['yearweek', 'sentiment'],
      order: [[sequelize.fn('YEARWEEK', sequelize.col('time_published'), 1), 'ASC']],
      raw: true
    });
    
    // Get sentiment by month
    const sentimentByMonth = await Review.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'), 'month'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'), 'sentiment'],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'), 'ASC']],
      raw: true
    });
    
    // Get sentiment by year
    const sentimentByYear = await Review.findAll({
      attributes: [
        [sequelize.fn('YEAR', sequelize.col('time_published')), 'year'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: [sequelize.fn('YEAR', sequelize.col('time_published')), 'sentiment'],
      order: [[sequelize.fn('YEAR', sequelize.col('time_published')), 'ASC']],
      raw: true
    });

    // Get detailed monthly data (for each day of each month)
    const monthlyDetailData = await Review.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'), 'year_month'],
        [sequelize.fn('DAY', sequelize.col('time_published')), 'day'],
        'sentiment',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      where: {
        sentiment: { [Op.not]: null }
      },
      group: [
        sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'),
        sequelize.fn('DAY', sequelize.col('time_published')),
        'sentiment'
      ],
      order: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('time_published'), '%Y-%m'), 'ASC'],
        [sequelize.fn('DAY', sequelize.col('time_published')), 'ASC']
      ],
      raw: true
    });
    
    // Process data for charts
    const sentimentLabels = ['positif', 'negatif', 'netral', 'puas', 'kecewa'];
    const counts = Object.fromEntries(sentimentLabels.map(label => [label, 0]));
    
    // Fill in actual counts
    sentimentData.forEach(item => counts[item.sentiment] = parseInt(item.count));
    
    // Process time series data (daily)
    const dates = [...new Set(sentimentByDay.map(item => item.date))].sort();
    const dailyData = {};
    
    // Initialize the daily data structure
    sentimentLabels.forEach(sentiment => {
      dailyData[sentiment] = dates.map(() => 0);
    });
    
    // Fill in the daily data
    sentimentByDay.forEach(item => {
      const dateIndex = dates.indexOf(item.date);
      if (dateIndex !== -1 && sentimentLabels.includes(item.sentiment)) {
        dailyData[item.sentiment][dateIndex] = parseInt(item.count);
      }
    });
    
    // Format dates for display
    const formattedDates = dates.map(date => moment(date).format('MMM DD, YYYY'));
    
    // Process weekly data
    const weeks = [...new Set(sentimentByWeek.map(item => item.week_label))].sort();
    const weeklyData = {};
    
    // Initialize the weekly data structure
    sentimentLabels.forEach(sentiment => {
      weeklyData[sentiment] = weeks.map(() => 0);
    });
    
    // Fill in the weekly data
    sentimentByWeek.forEach(item => {
      const weekIndex = weeks.indexOf(item.week_label);
      if (weekIndex !== -1 && sentimentLabels.includes(item.sentiment)) {
        weeklyData[item.sentiment][weekIndex] = parseInt(item.count);
      }
    });
    
    // Format weeks for display
    const formattedWeeks = weeks.map(week => {
      const [year, weekNum] = week.split('-');
      return `Week ${weekNum}, ${year}`;
    });
    
    // Process monthly data
    const months = [...new Set(sentimentByMonth.map(item => item.month))].sort();
    const monthlyData = {};
    
    // Initialize the monthly data structure
    sentimentLabels.forEach(sentiment => {
      monthlyData[sentiment] = months.map(() => 0);
    });
    
    // Fill in the monthly data
    sentimentByMonth.forEach(item => {
      const monthIndex = months.indexOf(item.month);
      if (monthIndex !== -1 && sentimentLabels.includes(item.sentiment)) {
        monthlyData[item.sentiment][monthIndex] = parseInt(item.count);
      }
    });
    
    // Format months for display
    const formattedMonths = months.map(month => {
      const [year, monthNum] = month.split('-');
      return moment(`${year}-${monthNum}-01`).format('MMM YYYY');
    });
    
    // Process yearly data
    const years = [...new Set(sentimentByYear.map(item => item.year))].sort();
    const yearlyData = {};
    
    // Initialize the yearly data structure
    sentimentLabels.forEach(sentiment => {
      yearlyData[sentiment] = years.map(() => 0);
    });
    
    // Fill in the yearly data
    sentimentByYear.forEach(item => {
      const yearIndex = years.indexOf(item.year);
      if (yearIndex !== -1 && sentimentLabels.includes(item.sentiment)) {
        yearlyData[item.sentiment][yearIndex] = parseInt(item.count);
      }
    });
    
    // Format years for display (no formatting needed)
    const formattedYears = years;
    const latestYear = formattedYears.length > 0 ? formattedYears[formattedYears.length - 1] : new Date().getFullYear();
    
    // Render the dashboard
    res.render('dashboard', {
      title: 'Sentiment Analysis Dashboard',
      stats: { labels: sentimentLabels, counts },
      timeSeriesData: {
        dates: formattedDates,
        series: dailyData
      },
      weeklyData: {
        labels: formattedWeeks,
        series: weeklyData
      },
      monthlyData: {
        labels: formattedMonths,
        series: monthlyData
      },
      yearlyData: {
        labels: formattedYears,
        series: yearlyData
      },
      monthlyDetailData: monthlyDetailData,
      availableYears: formattedYears,
      latestYear: latestYear,
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