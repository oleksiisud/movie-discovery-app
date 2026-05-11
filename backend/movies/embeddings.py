import os
import time
import logging
import requests
import numpy as np

HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

logger = logging.getLogger(__name__)

def get_embedding(texts, retries=5, wait=20):
    """
    Generate embeddings using Hugging Face Inference API
    
    :param texts: str or list of str
    :param retries: Number of retries for handling 503/504 errors
    :param wait: Wait time in seconds between retries
    :return: np.array of shape (n_texts, embedding_dim) or a single list of floats if texts is str
    """
    headers = {"Authorization": f"Bearer {os.getenv('HF_TOKEN')}"}
    is_single = isinstance(texts, str)
    payload = {"inputs": [texts] if is_single else texts}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            embeddings = response.json()
            
            # Ensure we have a list of lists (not a single embedding list)
            if embeddings and not isinstance(embeddings[0], (list, tuple)):
                embeddings = [embeddings]
            
            if not embeddings:
                raise Exception("No embedding data returned from API")
            
            # Verify embedding dimension
            for emb in embeddings:
                if len(emb) != 384:
                    raise Exception(f"Embedding dimension mismatch: expected 384, got {len(emb)}")
            
            return embeddings[0] if is_single else embeddings

        if response.status_code in (503, 504):
            logger.warning("Model unavailable (attempt %d/%d), retrying in %ds...", attempt + 1, retries, wait)
            time.sleep(wait)
        else:
            raise Exception(f"Embedding API error {response.status_code}: {response.text}")

    raise Exception(f"Embedding API failed after {retries} retries.")