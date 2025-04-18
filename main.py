# Impor library
import torch
import uvicorn
import pandas as pd
import re
import nltk
import sastrawi
import unicodedata
import emoji
import asyncio
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import BertTokenizer, BertForSequenceClassification
from deep_translator import DeeplTranslator
from nltk.tokenize import word_tokenize
from lingua import Language, LanguageDetectorBuilder
import os

# Inisialisasi aplikasi FastAPI
app = FastAPI()

# Konfigurasi DeepL
DEEPL_API_KEY = "12ffed92-8918-46de-8423-78d91387c3c4:fx"  # api key
USE_FREE_API = True                 # Menggunakan API Gratis DeepL
MAX_RETRIES = 3                     # Maksimal percobaan per translasi
DELAY_SUCCESS = 1.0                 # Delay antara request sukses (detik)
DELAY_FAILURE = 5                   # Delay setelah request gagal (detik)

# Cek ketersediaan CUDA
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Menggunakan device: {device}")

# Memuat model BERT dan tokenizer yang sudah dilatih sebelumnya
MODEL_PATH = "./sentiment_model"
tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
model.to(device)  # Pindahkan model ke CUDA jika tersedia
model.eval()

# label sentimen
LABEL_MAPPING = {0: 'netral', 1: 'positif', 2: 'negatif', 3: 'puas', 4: 'kecewa'}

# Memuat resource NLP
nltk.download('punkt_tab', quiet=True)
stemmer = sastrawi.Stemmer()
SUPPORTED_LANGUAGES = [Language.ENGLISH, Language.INDONESIAN]
detector = LanguageDetectorBuilder.from_languages(*SUPPORTED_LANGUAGES).build()

# Memuat kamus normalisasi
normalize_dict_path = "./normal.csv"
normalize_dict = pd.read_csv(normalize_dict_path)
normalize_dict = dict(zip(normalize_dict['word'], normalize_dict['normal']))

# Cache translasi untuk menghindari permintaan berulang
translation_cache = {}

async def translate(text: str) -> str:
    # Cek cache terlebih dahulu
    if text in translation_cache:
        return translation_cache[text]
    
    # Lewati jika sudah bahasa Indonesia
    detected_lang = detector.detect_language_of(text)
    if detected_lang == Language.INDONESIAN:
        translation_cache[text] = text
        return text
    
    # Mencoba translasi dengan mekanisme retry
    for attempt in range(MAX_RETRIES):
        try:
            translator = DeeplTranslator(
                api_key=DEEPL_API_KEY,
                source="en",
                target="id",
                use_free_api=USE_FREE_API
            )
            translated = translator.translate(text)
            translation_cache[text] = translated
            await asyncio.sleep(DELAY_SUCCESS)  # Pembatasan rate
            print(f"Translated: '{text[:50]}...' → '{translated[:50]}...'")
            return translated
        except Exception as e:
            wait_time = DELAY_FAILURE * (attempt + 1)
            print(f"Percobaan {attempt+1} gagal (Menunggu {wait_time}s): {str(e)[:100]}...")
            await asyncio.sleep(wait_time)
    
    # Kembalikan teks asli jika semua percobaan gagal
    translation_cache[text] = text
    return text

# Pipeline preprocessing teks
async def preprocess_text(text):
    text = await translate(text)  # Menggunakan DeepL
    text = emoji.demojize(text, language='id') if all(char in emoji.EMOJI_DATA for char in text.strip()) else text # konversi emoji
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8')
    text = text.lower().strip()  # Konversi ke huruf kecil dan hapus spasi
    text = re.sub(r'(@\w+|http\S+)', ' ', text)  # Hapus mention & URL
    text = re.sub(r'(.)\1{2,}', r'\1', text)  # Hapus karakter berulang
    text = re.sub(r'[^a-zA-Z ]', ' ', text)  # Hapus non-alfabet
    text = re.sub(r'\s+', ' ', text).strip()  # Hapus spasi berlebih
    tokens = word_tokenize(text)  # Tokenisasi
    tokens = [normalize_dict.get(word, word) for word in tokens]  # Normalisasi slang
    tokens = [stemmer.stem(token) for token in tokens]  # Stemming kata
    tokens = [word for word in tokens if word]  # Hapus tokens kosong
    return ' '.join(tokens)

# Model untuk request input
class TextInput(BaseModel):
    text: str

@app.head("/")
async def head():
    return {"message": "API berjalan"}

# Endpoint root
@app.get("/")
async def root():
    return {"message": "API berjalan"}

# Endpoint untuk prediksi sentimen
@app.post("/predict")
async def predict_sentiment(input_text: TextInput):
    processed_text = await preprocess_text(input_text.text)
    inputs = tokenizer(processed_text, return_tensors="pt", padding=True, truncation=True, max_length=256)
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    prediction = torch.argmax(outputs.logits, dim=-1).item()
    return {"sentiment": LABEL_MAPPING[prediction]}

# Menjalankan aplikasi
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
