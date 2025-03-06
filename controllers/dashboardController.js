import Review from '../models/review.js';
import { sequelize } from '../config/database.js';
import { Op } from 'sequelize';

// Controller to render the dashboard page
export async function renderDashboard(req, res) {
    try {
        const { startDate, endDate } = req.query;

        // Function to get sentiment statistics within a date range
        async function getSentimentStats(startDate, endDate) {
            try {
                // Validate dates
                const start = startDate ? new Date(startDate) : new Date(0);
                const end = endDate ? new Date(endDate) : new Date();

                // Query for sentiment distribution
                const stats = await Review.findAll({
                    attributes: [
                        'sentiment',
                        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                    ],
                    where: {
                        sentiment: { [Op.not]: null },
                        time_published: {
                            [Op.between]: [start, end]
                        }
                    },
                    group: ['sentiment']
                });

                // Format the results
                const formattedStats = {
                    labels: ['positif', 'negatif', 'netral', 'puas', 'kecewa'],
                    counts: {}
                };

                // Initialize all sentiment counts to 0
                formattedStats.labels.forEach(label => {
                    formattedStats.counts[label] = 0;
                });

                // Fill in actual counts
                stats.forEach(stat => {
                    formattedStats.counts[stat.sentiment] = parseInt(stat.getDataValue('count'));
                });

                return formattedStats;
            } catch (error) {
                console.error('Error getting sentiment stats:', error);
                throw error;
            }
        }

        // Get sentiment statistics for the selected date range
        const stats = await getSentimentStats(startDate, endDate);

        // Render the dashboard view with data
        res.render('dashboard', {
            title: 'Sentiment Analysis Dashboard',
            stats: JSON.stringify(stats),
            startDate: startDate || '',
            endDate: endDate || '',
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
