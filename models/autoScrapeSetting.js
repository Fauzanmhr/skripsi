import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const AutoScrapeSetting = sequelize.define('AutoScrapeSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  lastScrape: {
    type: DataTypes.DATE,
    allowNull: true
  },
  nextScrape: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'auto_scrape_settings',
  timestamps: true
});

export default AutoScrapeSetting;
