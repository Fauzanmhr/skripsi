import torch
import uvicorn
import pandas as pd
import re
import nltk
import sastrawi
import emoji
import time
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import BertTokenizer, BertForSequenceClassification
from deep_translator import DeeplTranslator
from nltk.tokenize import word_tokenize
from lingua import Language, LanguageDetectorBuilder

# Initialize FastAPI app
app = FastAPI()

# DeepL Configuration
DEEPL_API_KEY = "12ffed92-8918-46de-8423-78d91387c3c4:fx"  # api key
USE_FREE_API = True                 # Use DeepL Free API
MAX_RETRIES = 3                     # Max attempts per translation
DELAY_SUCCESS = 1.0                 # Seconds between requests
DELAY_FAILURE = 5                   # Seconds after failed requests

# Check if CUDA is available
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

# Load pre-trained BERT model and tokenizer
MODEL_PATH = "./saved_model"
tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
model.to(device)  # Move model to CUDA if available
model.eval()

# Sentiment label mapping
LABEL_MAPPING = {0: 'netral', 1: 'positif', 2: 'negatif', 3: 'puas', 4: 'kecewa'}

# Load NLP resources
nltk.download('punkt_tab', quiet=True)
stemmer = sastrawi.Stemmer()
SUPPORTED_LANGUAGES = [Language.ENGLISH, Language.INDONESIAN]
detector = LanguageDetectorBuilder.from_languages(*SUPPORTED_LANGUAGES).build()

# Load normalization dictionary
normalize_dict_path = "./normal.csv"
normalize_dict = pd.read_csv(normalize_dict_path)
normalize_dict = dict(zip(normalize_dict['word'], normalize_dict['normal']))

# Translation cache to avoid repeating requests
translation_cache = {}

async def translate(text: str) -> str:
    # Check cache first
    if text in translation_cache:
        return translation_cache[text]
    
    # Skip if already Indonesian
    detected_lang = detector.detect_language_of(text)
    if detected_lang == Language.INDONESIAN:
        translation_cache[text] = text
        return text
    
    # Attempt translation with retries
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
            time.sleep(DELAY_SUCCESS)  # Rate limiting
            print(f"Translated: '{text[:50]}...' → '{translated[:50]}...'")
            return translated
        except Exception as e:
            wait_time = DELAY_FAILURE * (attempt + 1)  # Exponential backoff
            print(f"Attempt {attempt+1} failed (Waiting {wait_time}s): {str(e)[:100]}...")
            time.sleep(wait_time)
    
    # Fallback to original text if all retries fail
    translation_cache[text] = text
    return text

# Preprocessing pipeline
async def preprocess_text(text):
    text = await translate_with_retry(text)  # Uses DeepL
    text = text.lower().strip()
    text = emoji.demojize(text, language='id')
    text = re.sub(r'(@\w+|http\S+)', ' ', text)  # Remove mentions & URLs
    text = re.sub(r'(.)\1+', r'\1', text)  # Remove repeated characters
    text = re.sub(r'[^a-zA-Z ]', ' ', text)  # Remove non-alphabetic
    text = re.sub(r'\s+', ' ', text).strip()  # Remove extra spaces
    tokens = word_tokenize(text)
    tokens = [normalize_dict.get(word, word) for word in tokens]  # Normalize slang
    tokens = [stemmer.stem(token) for token in tokens]  # Stem words
    tokens = [re.sub(r'(ku|mu|nya)$', '', word) for word in tokens]  # Remove suffixes
    tokens = [word for word in tokens if word]  # Remove empty words
    return ' '.join(tokens)

# Request model
class TextInput(BaseModel):
    text: str

@app.get("/")
def root():
    return {"message": "API is running"}

@app.post("/predict")
async def predict_sentiment(input_text: TextInput):
    processed_text = await preprocess_text(input_text.text)
    inputs = tokenizer(processed_text, return_tensors="pt", padding=True, truncation=True, max_length=256)
    inputs = {key: value.to(device) for key, value in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    prediction = torch.argmax(outputs.logits, dim=-1).item()
    return {"sentiment": LABEL_MAPPING[prediction]}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)