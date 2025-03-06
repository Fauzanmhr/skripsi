from fastapi import FastAPI
from pydantic import BaseModel
import torch
from transformers import BertTokenizer, BertForSequenceClassification
import re
import nltk
import asyncio  # For adding delay
from nltk.corpus import stopwords
from Sastrawi.Stemmer.StemmerFactory import StemmerFactory
import pandas as pd
import uvicorn
from deep_translator import GoogleTranslator

# Initialize NLTK resources
nltk.download('stopwords', quiet=True)
nltk.download('punkt_tab', quiet=True)
stop_words = set(stopwords.words('indonesian'))
stemmer = StemmerFactory().create_stemmer()

# Load slang dictionary (https://github.com/nasalsabila/kamus-alay)
slang_dict = pd.read_csv("./colloquial-indonesian-lexicon.csv")
slang_dict = dict(zip(slang_dict['slang'], slang_dict['formal']))

# Function to normalize slang words
def normalize_text(text):
    return ' '.join([slang_dict.get(word, word) for word in text.split()])

# Function to always translate English to Indonesian with delay on failure
async def translate_text(text, target_language="id"):
    while True:  # Keep trying until translation succeeds
        try:
            translated_text = GoogleTranslator(source='en', target=target_language).translate(text)
            # print(f"Translated: {text} -> {translated_text}")
            return translated_text
        except Exception as e:
            print(f"Translation failed, retrying in 2 seconds... Error: {e}")
            await asyncio.sleep(2)  # Add delay before retrying

# Function to preprocess text
async def preprocess_text(text):
    # Always translate first
    text = await translate_text(text)
    text = text.lower()
    text = re.sub(r'@\w+|http\S+|[^a-zA-Z ]', ' ', text)  # Remove mentions, links, and special characters
    text = normalize_text(text)
    tokens = [stemmer.stem(token) for token in nltk.word_tokenize(text) if token not in stop_words]
    return ' '.join(tokens)

# Load pre-trained BERT model and tokenizer
model_path = "./saved_model"
tokenizer = BertTokenizer.from_pretrained(model_path)
model = BertForSequenceClassification.from_pretrained(model_path)
model.eval()

# Label mapping
label_mapping = {0: 'netral', 1: 'positif', 2: 'negatif', 3: 'puas', 4: 'kecewa'}

# FastAPI app initialization
app = FastAPI()

class TextInput(BaseModel):
    text: str

@app.get("/")
def root():
    return {"message": "ok"}

@app.post("/predict")
async def predict_sentiment(input_text: TextInput):
    processed_text = await preprocess_text(input_text.text)
    inputs = tokenizer(processed_text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    
    with torch.no_grad():
        outputs = model(**inputs)
    
    prediction = torch.argmax(outputs.logits, dim=-1).item()
    return {"sentiment": label_mapping[prediction]}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
