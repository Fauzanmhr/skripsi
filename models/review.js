import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false
  },
  review: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  time_published: {
    type: DataTypes.DATE,
    allowNull: false
  },
  language: {
    type: DataTypes.STRING,
    allowNull: false
  },
  source: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  sentiment: {
    type: DataTypes.ENUM('positif', 'negatif', 'netral', 'puas', 'kecewa'),
    allowNull: true
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  processing_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  // Enable timestamps for createdAt and updatedAt
  timestamps: true,
  // Add indexes for common queries
  indexes: [
    {
      name: 'idx_sentiment',
      fields: ['sentiment']
    },
    {
      name: 'idx_time_published',
      fields: ['time_published']
    },
    {
      name: 'idx_unprocessed',
      fields: ['sentiment'],
      where: {
        sentiment: null
      }
    }
  ]
});

export default Review;