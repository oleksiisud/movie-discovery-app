import os
import time
import requests
import numpy as np

HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

def get_embedding(text, retries=5, wait=20):
    """
    Generate embeddings using Hugging Face Inference API
    
    :param texts: str or list of str
    :param retries: Number of retries for handling 503/504 errors
    :param wait: Wait time in seconds between retries
    :return: np.array of shape (n_texts, embedding_dim)
    """
    headers = {"Authorization": f"Bearer {os.getenv('HF_TOKEN')}"}
    payload = {"inputs": [text]}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            embeddings = response.json()
            
            # Ensure we have a list of lists (not a single embedding list)
            if embeddings and not isinstance(embeddings[0], (list, tuple)):
                embedding = [embeddings]
            else:
                embedding = embeddings[0] if embeddings else None
            
            if not embedding:
                raise Exception("No embedding data returned from API")
            
            # Verify embedding dimension
            if len(embedding) != 384:
                raise Exception(f"Embedding dimension mismatch: expected 384, got {len(embedding)}")
            
            return embedding

        if response.status_code in (503, 504):
            print(f"Model unavailable (attempt {attempt + 1}/{retries}), retrying in {wait}s...")
            time.sleep(wait)
        else:
            raise Exception(f"Embedding API error {response.status_code}: {response.text}")

    raise Exception(f"Embedding API failed after {retries} retries.")