import json
import os
from src.oaf.embedding_classifier import EmbeddingClassifierFromFile
from src.oaf.chunking import chunk_text_per_sentence
from src.oaf.visualizer import generate_html_visualization
from src.logger import logger

def analyze_transcript(transcript, session_id, timestamp):
    """
    Analyze a single transcript and return results as an array of dictionaries.
    Each dictionary contains session information and analysis results.
    """
    
    # Construct the path dynamically
    classifiers_file = os.path.join(os.path.dirname(__file__), 'data', 'sample_classifiers.json')

    # Check if the file exists
    if not os.path.exists(classifiers_file):
        logger.error(f"Classifier file not found at {classifiers_file}.")
        raise FileNotFoundError(f"Classifier file not found at {classifiers_file}.")

    # Use the dynamically constructed path
    classifier = EmbeddingClassifierFromFile(
        model_name='sentence-transformers/all-MiniLM-L6-v2',
        classifiers_file=classifiers_file  # Pass the correct path
    )
    # Chunk the transcript by sentence
    chunks = chunk_text_per_sentence(transcript)
    chunk_scores = []

    # Analyze each chunk
    for chunk in chunks:
        chunk_result = classifier.classify(chunk)
        chunk_scores.append({
            'chunk': chunk,
            'scores': chunk_result
        })

    # Return the results array
    results = [{
        'sessionId': session_id,
        'timestamp': timestamp,
        'analysis': chunk_scores
    }]
    return results

def generate_visualization(results, output_file="my_visualizer.html"):
    """Generate HTML visualization for the analysis results."""
    generate_html_visualization(results, output_file)