import os
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify
from pymongo import MongoClient
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
import joblib
import nltk
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from dotenv import load_dotenv

load_dotenv(dotenv_path="../.env")

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Download VADER lexicon on startup
try:
    nltk.data.find('sentiment/vader_lexicon')
except LookupError:
    nltk.download('vader_lexicon', quiet=True)

sia = SentimentIntensityAnalyzer()

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017/dp_di")
client = MongoClient(MONGODB_URI)
db = client.get_database()
decisions_collection = db.assistantdecisions
registry_collection = db.modelregistries

MODELS = {} # In-memory cache

def get_vader_label(text):
    if not text or not isinstance(text, str):
        return 'Neutral'
    score = sia.polarity_scores(text)['compound']
    if score > 0.2:
        return 'Good'
    elif score < -0.2:
        return 'Bad'
    return 'Neutral'

@app.route('/train', methods=['POST'])
def train_model():
    data = request.json
    workspace_id = data.get('workspaceId')
    
    if not workspace_id:
        return jsonify({'error': 'workspaceId required'}), 400
        
    cursor = decisions_collection.find({
        'workspaceId': workspace_id,
        'status': 'resolved'
    })
    
    rows = list(cursor)
    if len(rows) < 3:
        return jsonify({'error': 'Not enough resolved decisions for training'}), 400
        
    df = pd.DataFrame(rows)
    df['target'] = df['actualOutcome'].apply(get_vader_label)
    
    features = ['priceChangeType', 'demandChange', 'product']
    for feat in features:
        if feat not in df.columns:
            df[feat] = 'unknown'
            
    X = df[features].fillna('unknown')
    y = df['target']
    
    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), features)
        ])
        
    pipeline = Pipeline(steps=[
        ('preprocessor', preprocessor),
        ('classifier', RandomForestClassifier(n_estimators=50, random_state=42))
    ])
    
    pipeline.fit(X, y)
    
    model_dir = "../generated/ml/chatbot_models"
    os.makedirs(model_dir, exist_ok=True)
    model_path = os.path.join(model_dir, f"{workspace_id}.joblib")
    
    joblib.dump(pipeline, model_path)
    MODELS[workspace_id] = pipeline
    
    registry_collection.update_one(
        {'workspaceId': workspace_id, 'modelType': 'chatbot'},
        {'$set': {
            'modelPath': model_path,
            'trainedAt': datetime.utcnow(),
            'decisionCount': len(df),
            'accuracy': None
        }},
        upsert=True
    )
    
    return jsonify({
        'success': True,
        'message': f"Model trained on {len(df)} rows."
    })

@app.route('/predict', methods=['POST'])
def predict_decision():
    data = request.json
    workspace_id = data.get('workspaceId')
    decision = data.get('decision')
    
    if not workspace_id or not decision:
        return jsonify({'error': 'workspaceId and decision required'}), 400
        
    if workspace_id not in MODELS:
        registry = registry_collection.find_one({'workspaceId': workspace_id, 'modelType': 'chatbot'})
        if not registry or not os.path.exists(registry['modelPath']):
            return jsonify({'error': 'No trained model found'}), 404
        MODELS[workspace_id] = joblib.load(registry['modelPath'])
        
    pipeline = MODELS[workspace_id]
    
    df = pd.DataFrame([{
        'priceChangeType': decision.get('priceChangeType', 'unknown'),
        'demandChange': decision.get('demandChange', 'unknown'),
        'product': decision.get('product', 'unknown')
    }])
    
    prediction = pipeline.predict(df)[0]
    probabilities = pipeline.predict_proba(df)[0]
    max_prob = float(max(probabilities))
    
    advice = {
        'title': f"ML Predicted Outcome: {prediction}",
        'recommendation': f"The ML model indicates this decision will likely have a {prediction} outcome.",
        'rationale': f"Calculated from your historical {decision.get('product', 'product')} pricing patterns with {int(max_prob * 100)}% confidence.",
        'nextStep': "Monitor the outcome.",
        'severity': 'positive' if prediction == 'Good' else 'warning' if prediction == 'Bad' else 'caution'
    }
    
    return jsonify({
        'success': True,
        'advice': advice,
        'prediction': prediction,
        'confidence': max_prob
    })

if __name__ == '__main__':
    app.run(port=5001, debug=True)
