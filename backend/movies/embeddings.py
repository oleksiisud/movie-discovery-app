import os
import time
import requests
import numpy as np

HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

def normalize_embedding(embedding):
    """
    Normalize embedding using L2 normalization (unit vector).
    Matches the normalize_embeddings=True behavior from SentenceTransformer.
    """
    embedding_array = np.array(embedding, dtype=np.float32)
    norm = np.linalg.norm(embedding_array)
    if norm > 0:
        embedding_array = embedding_array / norm
    return embedding_array.tolist()

def get_embedding(text, retries=5, wait=20):
    """
    Sends a single string to the HuggingFace inference API and returns
    the embedding vector as a plain Python list (normalized).
    Retries on 503/504 to handle cold-start model loading.
    """
    headers = {"Authorization": f"Bearer {os.getenv('HF_TOKEN')}"}
    structured = f"{text}."
    payload = {"inputs": structured}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            result = response.json()
            # Handle different response formats from HF API
            if isinstance(result, list) and len(result) > 0:
                embedding = result[0] if isinstance(result[0], (list, tuple)) else result
            else:
                embedding = result
            return normalize_embedding(embedding)

        if response.status_code in (503, 504):
            print(f"HF model unavailable (attempt {attempt + 1}/{retries}), retrying in {wait}s...")
            time.sleep(wait)
        else:
            raise Exception(f"HF embedding error {response.status_code}: {response.text}")

    raise Exception("HF embedding API failed after max retries.")