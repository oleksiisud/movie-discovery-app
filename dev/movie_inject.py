import os
import requests
import time
import numpy as np
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

TMDB_URL = "https://api.themoviedb.org/3/"
HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

headers = {
    "Authorization": f"Bearer {HF_TOKEN}"
}

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

PROGRESS_FILE = "injection_progress.txt"

# Resuming Logic

def get_last_completed_page():
    if not os.path.exists(PROGRESS_FILE):
        return 0
    with open(PROGRESS_FILE, "r") as f:
        return int(f.read().strip())

def save_progress(page):
    with open(PROGRESS_FILE, "w") as f:
        f.write(str(page))

#Fetch existing movies to skip duplicates

def fetch_existing_ids():
    print("Fetching existing tmdb_ids from Supabase...")
    existing = set()

    page = 0
    page_size = 1000

    while True:
        response = (
            supabase
            .table("movies")
            .select("tmdb_id")
            .range(page * page_size, (page + 1) * page_size - 1)
            .execute()
        )

        rows = response.data
        if not rows:
            break

        for row in rows:
            existing.add(row["tmdb_id"])

        page += 1

    print(f"Found {len(existing)} existing movies.")
    return existing

# TMDB Fetching

def fetch_movies_page(page):
    response = requests.get(
        TMDB_URL + "discover/movie",
        params={
            "api_key": TMDB_API_KEY,
            "language": "en-US",
            "sort_by": "vote_count.desc",
            "page": page,
        },
    )
    return response.json().get("results", [])

def fetch_keywords(tmdb_id):
    response = requests.get(
        TMDB_URL + f"movie/{tmdb_id}/keywords",
        params={"api_key": TMDB_API_KEY},
    )
    data = response.json()
    return [k["name"] for k in data.get("keywords", [])]

# Build text for embedding

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

def build_movie_text(title, keywords, overview):
    kw_string = ", ".join(keywords)
    return f"{kw_string}. {overview}"

# Hugging Face embeddings

def generate_embeddings(texts, retries=5, wait=20):
    payload = {"inputs": texts}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            result = response.json()
            # Handle different response formats from HF API
            embeddings = []
            if isinstance(result, list):
                for item in result:
                    if isinstance(item, (list, tuple)):
                        embeddings.append(normalize_embedding(item))
                    else:
                        embeddings.append(normalize_embedding(result))
                        break
            else:
                embeddings.append(normalize_embedding(result))
            return embeddings

        if response.status_code in (503, 504):
            print(f"Model unavailable (attempt {attempt + 1}/{retries}), retrying in {wait}s...")
            time.sleep(wait)
        else:
            raise Exception(f"Embedding API error {response.status_code}: {response.text}")

    raise Exception(f"Embedding API failed after {retries} retries.")

# Main injection loop

def run_injection(target_count=10000, batch_size=16):
    existing_ids = fetch_existing_ids()
    last_page = get_last_completed_page()

    print(f"Resuming from page {last_page + 1}")

    total_inserted = 0
    page = last_page + 1

    while total_inserted < target_count:
        print(f"\nProcessing page {page}")

        movies_raw = fetch_movies_page(page)
        if not movies_raw:
            print("No more movies available.")
            break

        new_movies = []

        for m in movies_raw:
            if not m.get("overview"):
                continue
            if m["id"] in existing_ids:
                continue
            new_movies.append(m)

        if not new_movies:
            save_progress(page)
            page += 1
            continue

        prepared = []

        for m in new_movies:
            keywords = fetch_keywords(m["id"])

            raw_year = m.get("release_date", "")
            release_year = int(raw_year[:4]) if raw_year and len(raw_year) >= 4 else None

            prepared.append({
                "tmdb_id": m["id"],
                "title": m["title"],
                "release_year": release_year,
                "overview": m["overview"],
                "keywords": keywords,
                "text": build_movie_text(m["title"], keywords, m["overview"])
            })
            time.sleep(0.05)

        for i in range(0, len(prepared), batch_size):
            batch = prepared[i:i + batch_size]
            texts = [m["text"] for m in batch]

            embeddings = generate_embeddings(texts)

            for movie, embedding in zip(batch, embeddings):

                movie_insert = supabase.table("movies").insert({
                    "tmdb_id": movie["tmdb_id"],
                    "title": movie["title"],
                    "release_year": movie["release_year"],
                    "overview": movie["overview"],
                    "embedding": embedding
                }).execute()

                movie_id = movie_insert.data[0]["id"]

                if movie["keywords"]:
                    keyword_rows = [
                        {"movie_id": movie_id, "keyword": kw}
                        for kw in movie["keywords"]
                    ]
                    supabase.table("movie_keywords").insert(keyword_rows).execute()

                existing_ids.add(movie["tmdb_id"])
                total_inserted += 1

                print(f"Inserted: {movie['title']} ({movie['release_year']}) — Total: {total_inserted}")

                if total_inserted >= target_count:
                    break

        save_progress(page)
        page += 1
        time.sleep(0.3)

    print("\nInjection complete.")

if __name__ == "__main__":
    run_injection(target_count=200)