import json
import os
from embedding_classifier import EmbeddingClassifierFromFile
from chunking import chunk_text_per_sentence
from visualizer import generate_html_visualization


def load_input_entries(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def main():
    input_entries = load_input_entries('data/sample_input.json')


    classifier = EmbeddingClassifierFromFile(
        model_name='sentence-transformers/all-MiniLM-L6-v2',
        classifiers_file='data/sample_classifiers.json'
    )
    results = []
    for entry in input_entries:
        chunks = chunk_text_per_sentence(entry.get('transcript', ''))
        chunk_scores = []
        for chunk in chunks:
            chunk_result = classifier.classify(chunk)
            chunk_scores.append({'chunk': chunk, 'scores': chunk_result})
        results.append({
            'sessionId': entry.get('sessionId'),
            'timestamp': entry.get('timestamp'),
            'analysis': chunk_scores
        })
    generate_html_visualization(results, "my_visualizer.html")

if __name__ == '__main__':
    main()