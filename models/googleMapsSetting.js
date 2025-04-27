import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const GoogleMapsSetting = sequelize.define('googleMapsSetting', {
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
  timestamps: true,
  tableName: 'google_maps_settings' // Also renaming the table for consistency
});

export default GoogleMapsSetting;
