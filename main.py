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
from deepl import Translator
from nltk.tokenize import word_tokenize
from lingua import Language, LanguageDetectorBuilder
from dotenv import load_dotenv
import os

# Inisialisasi aplikasi FastAPI
load_dotenv()
app = FastAPI(
    title="Sentiment-API",
    description="API for analyzing sentiment in Indonesian text",
    version="1.0.0",
    contact={
        "name": "Fauzanmhr",
    }
)

# Inisialisasi DeepL Translator dengan API key dari environment variable
translator = Translator(auth_key=os.getenv("DEEPL_API_KEY"))

# Cache translate untuk menghindari permintaan berulang
translation_cache = {}

async def translate(text: str) -> str:
    # Cek cache terlebih dahulu
    if text in translation_cache:
        return translation_cache[text]
    
    # Lewati jika sudah bahasa Indonesia
    detected_lang = detector.detect_language_of(text)
    print(f"Detected: {detected_lang}")
    if detected_lang == Language.INDONESIAN:
        translation_cache[text] = text
        return text
    
    # translate text
    try:
        translated = translator.translate_text(text, target_lang="ID").text
        translation_cache[text] = translated
        print(f"Translated: '{text}' → '{translated}'")
        return translated
    except Exception as e:
        print(f"Translation failed: {str(e)[:100]}...")
        raise ValueError(f"Translation failed: {str(e)}")

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

# Inisialisasi detektor bahasa
SUPPORTED_LANGUAGES = [Language.INDONESIAN, Language.ENGLISH]
detector = LanguageDetectorBuilder.from_languages(*SUPPORTED_LANGUAGES).build()

# Memuat kamus normalisasi
normalize_dict_path = "./normal.csv"
normalize_dict = pd.read_csv(normalize_dict_path)
normalize_dict = dict(zip(normalize_dict['word'], normalize_dict['normal']))

# Fungsi preprocessing teks
async def preprocess_text(text):
    text = await translate(text)  # Menggunakan DeepL
    text = emoji.demojize(text, language='id') if all(char in emoji.EMOJI_DATA for char in text.strip()) else text # konversi emoji (jika hanya ada emoji dalam teks)
    text = unicodedata.normalize('NFKD', text).encode('ASCII', 'ignore').decode('utf-8') # konversi non utf8 (café -> cafe)
    text = text.lower().strip()  # Case folding dan stripping
    text = re.sub(r'(@\w+|http\S+)', ' ', text)  # Hapus mention & URL
    text = re.sub(r'(.)\1{2,}', r'\1', text)  # Normalisasi karakter berulang
    text = re.sub(r'[^a-zA-Z ]', ' ', text)  # Hapus karakter non-alphabet
    text = re.sub(r'\s+', ' ', text).strip()  # Normalisasi spasi
    tokens = word_tokenize(text)  # Tokenisasi
    tokens = [normalize_dict.get(word, word) for word in tokens]  # Normalisasi slang
    tokens = [stemmer.stem(token) for token in tokens]  # Stemming
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
    try:
        processed_text = await preprocess_text(input_text.text)
    except ValueError as e:
        return {"error": str(e)}

    inputs = tokenizer(processed_text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    prediction = torch.argmax(outputs.logits, dim=-1).item()
    print(f"Input: {input_text.text}")
    print(f"Processed: {processed_text}")
    print(f"Predicted: {LABEL_MAPPING[prediction]}")
    return {"sentiment": LABEL_MAPPING[prediction]}

# Menjalankan aplikasi
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)