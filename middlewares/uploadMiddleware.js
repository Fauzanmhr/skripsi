// Middleware untuk validasi dan penyimpanan file yang diunggah
import multer from "multer";

// Konfigurasi penyimpanan file dalam memori (tidak menyimpan ke disk)
const storage = multer.memoryStorage();

// Filter jenis file yang diperbolehkan (CSV dan Excel)
const fileFilter = (req, file, cb) => {
  if (
    file.mimetype === "text/csv" ||
    file.mimetype.includes("spreadsheet") ||
    file.originalname.endsWith(".csv") ||
    file.originalname.endsWith(".xlsx")
  ) {
    cb(null, true); // File diterima
  } else {
    cb(new Error("Invalid file type"), false); // File ditolak
  }
};

// Inisialisasi multer dengan konfigurasi yang telah ditentukan
const upload = multer({
  storage,
  fileFilter,
});

export default upload;
