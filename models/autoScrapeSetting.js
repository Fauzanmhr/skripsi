import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const AutoScrapeSetting = sequelize.define('AutoScrapeSetting', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    defaultValue: 1
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
