import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

const ScrapeStatus = sequelize.define(
  "ScrapeStatus",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    type: {
      type: DataTypes.ENUM("manual", "auto"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("idle", "running", "completed", "failed"),
      allowNull: false,
      defaultValue: "idle",
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "scrape_status",
    timestamps: true,
    indexes: [
      {
        fields: ["type", "status"],
      },
    ],
  },
);

export default ScrapeStatus;
