import torch
import asyncio
import uvicorn
import pandas as pd
import re
import nltk
import sastrawi
import emoji
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import BertTokenizer, BertForSequenceClassification
from deep_translator import GoogleTranslator
from nltk.tokenize import word_tokenize

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
stemmer = sastrawi.Stemmer()

# Load normalization dictionary (formerly slang dictionary)
normalize_dict_path = "./normal.csv"
normalize_dict = pd.read_csv(normalize_dict_path)
normalize_dict = dict(zip(normalize_dict['word'], normalize_dict['normal']))

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

# Preprocessing steps
async def preprocess_text(text):
    text = re.sub(r'(.)\1+', r'\1', text)
    text = await translate_text(text)
    text = text.lower().strip()
    text = emoji.demojize(text, language='id')
    text = re.sub(r'(@\w+|http\S+)', ' ', text)
    text = re.sub(r'[^a-zA-Z ]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    tokens = word_tokenize(text)
    tokens = [normalize_dict.get(word, word) for word in tokens]
    tokens = [stemmer.stem(token) for token in tokens]
    tokens = [re.sub(r'(ku|mu|nya)$', '', word) for word in tokens]
    tokens = [word for word in tokens if word]
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
