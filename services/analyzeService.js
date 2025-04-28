// Layanan untuk parsing, analisis, dan ekspor file ulasan dalam format CSV dan Excel
import ExcelJS from "exceljs";
import csv from "csv-parser";
import { Readable } from "stream";
import { analyzeSentiment } from "./sentimentService.js";

// Mengubah buffer CSV menjadi array objek JavaScript
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

// Mengubah buffer Excel menjadi array objek JavaScript
export async function parseExcel(buffer) {
  // Buat workbook baru dari buffer
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Ambil worksheet pertama
  const worksheet = workbook.worksheets[0];
  const rows = [];
  const headers = [];

  // Ambil header dari baris pertama
  worksheet.getRow(1).eachCell((cell) => {
    headers.push(cell.value);
  });

  // Proses setiap baris data (mulai dari baris kedua)
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const rowData = {};

    // Proses setiap sel di baris ini
    row.eachCell((cell, colNumber) => {
      rowData[headers[colNumber - 1]] = cell.value;
    });

    rows.push(rowData);
  }

  return rows;
}

// Mengubah array objek menjadi file CSV
export async function generateCSV(rows) {
  // Mendapatkan header dari kunci objek baris pertama
  const headers = Object.keys(rows[0]);
  let csvContent = headers.join(",") + "\n";

  // Tambahkan baris data
  rows.forEach((row) => {
    const values = headers.map((header) => {
      const value = row[header];
      // Escape teks dengan tanda kutip jika tipe data string
      return typeof value === "string"
        ? `"${value.replace(/"/g, '""')}"`
        : value;
    });
    csvContent += values.join(",") + "\n";
  });

  return Buffer.from(csvContent);
}

// Mengubah array objek menjadi file Excel
export async function generateExcel(rows) {
  // Buat workbook dan worksheet baru
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Ulasan Teranalisis");

  // Tambahkan header
  const headers = Object.keys(rows[0]);
  worksheet.addRow(headers);

  // Format header dengan gaya khusus
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
  });

  // Tambahkan data baris
  rows.forEach((row) => {
    const rowData = headers.map((header) => row[header]);
    worksheet.addRow(rowData);
  });

  // Konversi workbook ke buffer
  return workbook.xlsx.writeBuffer();
}

// Memproses konten dari file yang diunggah dan menganalisis sentimen
export async function processFileContent(rows, column) {
  const processedRows = [];

  // Iterasi melalui setiap baris data
  for (const row of rows) {
    const reviewText = row[column];
    if (!reviewText) continue; // Lewati baris kosong

    try {
      // Analisis sentimen untuk teks ulasan di kolom yang dipilih
      const sentiment = await analyzeSentiment(reviewText);
      processedRows.push({
        ...row,
        sentimen: sentiment, // Tambahkan kolom sentimen baru dengan hasil analisis
      });
    } catch (error) {
      // Jika terjadi error, tetap tambahkan baris dengan status GAGAL
      processedRows.push({
        ...row,
        sentimen: "GAGAL",
      });
    }
  }

  return processedRows;
}
