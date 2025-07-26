# Sistem Analisis Sentimen Berbasis Web

## Teknologi yang Digunakan

* **Framework Web**: Express.js (JavaScript)
* **Frontend Web**: Bootstrap 5
* **Framework API**: FastAPI (Python)
* **Database**: MariaDB 11.8.2
* **Containerization**: Docker

## Fitur Utama

* **Google Maps Review Scraper** – Mengambil review dari Google Maps secara otomatis
* **Sentiment Analysis** – Analisis sentimen otomatis
* **Auto Scrape** – scraping otomatis
* **Dashboard** – Visualisasi data dan statistik analisis
* **Upload CSV** – Impor data dari file CSV atau Excel
* **Export Data** – Ekspor hasil analisis ke format Excel

---

## Cara Menjalankan API (FastAPI)

### 1. Persiapan Awal

#### Instalasi Dependencies

```bash
pip install -r requirements.txt
```

#### Konfigurasi Environment

1. Salin file `example.env` menjadi `.env`
2. Atur API key untuk DeepL di file `.env`

### 2. Menjalankan Aplikasi

#### Mode Development

```bash
python3 start main.py
```

#### Mode Production

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

API akan berjalan di:
`http://localhost:8000`

---

## Cara Menjalankan Aplikasi Web (Express.js)

### 1. Persiapan Awal

#### Instalasi Dependencies

```bash
npm install
```

#### Konfigurasi Environment

1. Salin file `example.env` menjadi `.env`
2. Sesuaikan konfigurasi database dan variabel lainnya di `.env`

#### Setup Database

1. Pastikan MariaDB/MySQL telah terinstall dan berjalan
2. Buat database sesuai dengan konfigurasi di `.env`
3. Tabel akan dibuat secara otomatis saat aplikasi pertama kali dijalankan

### 2. Menjalankan Aplikasi

#### Mode Development

```bash
npm run dev
```

#### Mode Production

```bash
npm start
```

Aplikasi web akan berjalan di:
`http://localhost:3000` *(atau sesuai port yang dikonfigurasi di `.env`)*