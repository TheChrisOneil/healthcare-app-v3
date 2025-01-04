import json
from src.logger import logger
from sentence_transformers import SentenceTransformer, util

class EmbeddingClassifierFromFile:
    def __init__(self, model_name: str, classifiers_file: str):
        self.model = SentenceTransformer(model_name)
        with open(classifiers_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        self.classifiers = []
        for item in data:
            emb = self.model.encode(item['text'], convert_to_tensor=True)
            self.classifiers.append({'label': item['label'], 'embedding': emb})

    def classify(self, text):
        text_emb = self.model.encode(text, convert_to_tensor=True)
        scores = []
        for c in self.classifiers:
            sim = util.cos_sim(text_emb, c['embedding']).item()
            scores.append({'label': c['label'], 'score': sim})
        scores.sort(key=lambda x: x['score'], reverse=True)
        return scores