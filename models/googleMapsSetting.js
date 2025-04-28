import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const GoogleMapsSetting = sequelize.define(
  "googleMapsSetting",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: false,
    tableName: "google_maps_settings",
  },
);

export default GoogleMapsSetting;
