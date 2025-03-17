import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import Review from './review.js';

const ReviewExtra = sequelize.define('review_extra', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  review_id: {
    type: DataTypes.STRING,
    allowNull: false,
    references: {
      model: Review,
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  gender: {
    type: DataTypes.STRING,
    allowNull: false
  },
  age_category: {
    type: DataTypes.STRING,
    allowNull: false
  },
  occupation: {
    type: DataTypes.STRING,
    allowNull: false
  },
  first_visit: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  }
}, {
  timestamps: true
});

// Define associations
Review.hasOne(ReviewExtra, { foreignKey: 'review_id', onDelete: 'CASCADE' });
ReviewExtra.belongsTo(Review, { foreignKey: 'review_id' });

export default ReviewExtra;