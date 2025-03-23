from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import BertTokenizer, BertForSequenceClassification
import re
import nltk
import asyncio
import pandas as pd
import uvicorn
from deep_translator import GoogleTranslator
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory

# Initialize FastAPI app
app = FastAPI()

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
stemmer = StemmerFactory().create_stemmer()

# Load normalization dictionary (formerly slang dictionary)
normalize_dict_path = "./normal.csv"
normalize_dict = pd.read_csv(normalize_dict_path)
normalize_dict = dict(zip(normalize_dict['word'], normalize_dict['normal']))

# Helper function: Normalize words
def normalize_text(text: str) -> str:
    return ' '.join([normalize_dict.get(word, word) for word in text.split()])

# Async function: Translate English to Indonesian with retry
async def translate_text(text: str, target_language="id") -> str:
    retries = 3
    for _ in range(retries):
        try:
            return GoogleTranslator(source="en", target=target_language).translate(text)
        except Exception as e:
            print(f"Translation failed: {e}. Retrying...")
            await asyncio.sleep(2)
    return text  # Return original text if translation fails

# Async function: Preprocess text
async def preprocess_text(text):
    text = str(text).lower().strip()  # Convert to lowercase & remove extra spaces
    text = re.sub(r'@\w+|http\S+', ' ', text)  # Remove mentions & URLs
    text = re.sub(r'[^a-zA-Z ]', ' ', text)  # Keep only letters and spaces
    text = normalize_text(text)  # Normalize slang/abbreviations
    text = await translate_text(text)
    tokens = [stemmer.stem(token) for token in nltk.word_tokenize(text)]  # Tokenize & stem
    return ' '.join(tokens)  # Join words back into a sentence

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