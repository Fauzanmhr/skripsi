import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const GoogleMapsUrl = sequelize.define('googleMapsUrl', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1
  },
  url: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true
});

export default GoogleMapsUrl;
