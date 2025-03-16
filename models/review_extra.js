import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import Review from './review.js';

const ReviewExtra = sequelize.define('review_extra', {
  id: {
    type: DataTypes.STRING,
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
    type: DataTypes.ENUM('Laki-laki', 'Perempuan'),
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

Review.hasOne(ReviewExtra, { foreignKey: 'review_id', onDelete: 'CASCADE' });
ReviewExtra.belongsTo(Review, { foreignKey: 'review_id' });

export default ReviewExtra;