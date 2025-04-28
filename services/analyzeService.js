import ExcelJS from "exceljs";
import csv from "csv-parser";
import { Readable } from "stream";
import { analyzeSentiment } from "./sentimentService.js";

export async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const stream = Readable.from(buffer.toString());

    stream
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

export async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  const rows = [];
  const headers = [];

  worksheet.getRow(1).eachCell((cell) => {
    headers.push(cell.value);
  });

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const rowData = {};

    row.eachCell((cell, colNumber) => {
      rowData[headers[colNumber - 1]] = cell.value;
    });

    rows.push(rowData);
  }

  return rows;
}

export async function generateCSV(rows) {
  const headers = Object.keys(rows[0]);
  let csvContent = headers.join(",") + "\n";

  rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      return typeof value === "string"
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    });
    csvContent += values.join(",") + "\n";
  });

  return Buffer.from(csvContent);
}

export async function generateExcel(rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ulasan Teranalisis");

  const headers = Object.keys(rows[0]);
  worksheet.addRow(headers);

  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
  });

  rows.forEach((row) => {
    const rowData = headers.map((header) => row[header]);
    worksheet.addRow(rowData);
  });

  return workbook.xlsx.writeBuffer();
}

export async function processFileContent(rows, column) {
  const processedRows = [];

  for (const row of rows) {
    const reviewText = row[column];
    if (!reviewText) continue;

    try {
      const sentiment = await analyzeSentiment(reviewText);
      processedRows.push({
        ...row,
        sentimen: sentiment,
      });
    } catch (error) {
      processedRows.push({
        ...row,
        sentimen: "GAGAL",
      });
    }
  }

  return processedRows;
}
