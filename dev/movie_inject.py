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
    """
    Read the last completed page number from the progress file. If the file doesn't exist, return 0.

    :return: Last completed page number
    """
    if not os.path.exists(PROGRESS_FILE):
        return 0
    with open(PROGRESS_FILE, "r") as f:
        return int(f.read().strip())

def save_progress(page):
    """
    Save the last completed page number to the progress file.

    :param page: Page number to save
    """
    with open(PROGRESS_FILE, "w") as f:
        f.write(str(page))

def fetch_existing_ids():
    """
    Fetch existing tmdb_ids from the Supabase database to avoid duplicates during injection. This function paginates through the movies table and collects all tmdb_ids into a set.

    :return: Set of existing tmdb_ids
    """
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

def fetch_movies_page(page):
    """
    Fetch a single page of movies from TMDB API, sorted by vote count, and return the results. Each page contains 20 movies.

    :param page: Page number to fetch
    :return: List of movie dicts from the API response
    """
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

def fetch_movie_details(tmdb_id):
    """
    Fetch full movie details from TMDB, including runtime and keywords.
    Combines two API calls that were previously separate to reduce overhead.

    :param tmdb_id: TMDB movie ID
    :return: dict with keys 'runtime' (int|None) and 'keywords' (list[str])
    """
    # Fetch main details (includes runtime)
    detail_resp = requests.get(
        TMDB_URL + f"movie/{tmdb_id}",
        params={
            "api_key": TMDB_API_KEY,
            "append_to_response": "keywords",
        },
        timeout=10,
    )
    detail_resp.raise_for_status()
    try:
        data = detail_resp.json()
    except ValueError as e:
        raise Exception(f"Failed to parse JSON for movie {tmdb_id}: {e}")

    runtime = data.get("runtime") or None
    if runtime == 0:
        runtime = None

    keywords_data = data.get("keywords", {}).get("keywords", [])
    keywords = [k["name"] for k in keywords_data]

    return {
        "runtime": runtime,
        "keywords": keywords,
    }


def build_movie_text(title, keywords, overview):
    """
    Build a text representation of the movie by combining title, keywords, and overview.

    :param title: Movie title
    :param keywords: List of keyword names
    :param overview: Movie overview text
    :return: Combined text string
    """
    kw_string = ", ".join(keywords)
    return f"{kw_string}. {overview}"


def generate_embeddings(texts, retries=5, wait=20):
    """
    Generate embeddings using Hugging Face Inference API

    :param texts: str or list of str
    :param retries: Number of retries for handling 503/504 errors
    :param wait: Wait time in seconds between retries
    :return: np.array of shape (n_texts, embedding_dim)
    """
    # Ensure texts is always a list
    if isinstance(texts, str):
        texts = [texts]

    payload = {"inputs": texts}

    for attempt in range(retries):
        response = requests.post(HF_MODEL_URL, headers=headers, json=payload)

        if response.status_code == 200:
            embeddings = response.json()

            # Ensure we have a list of lists (not a single embedding list)
            if embeddings and not isinstance(embeddings[0], (list, tuple)):
                embeddings = [embeddings]

            # Verify we got embeddings for all texts
            if len(embeddings) != len(texts):
                raise Exception(f"Embedding count mismatch: got {len(embeddings)} embeddings for {len(texts)} texts")

            return embeddings

        if response.status_code in (503, 504):
            print(f"Model unavailable (attempt {attempt + 1}/{retries}), retrying in {wait}s...")
            time.sleep(wait)
        else:
            raise Exception(f"Embedding API error {response.status_code}: {response.text}")

    raise Exception(f"Embedding API failed after {retries} retries.")

def run_injection(target_count=10000, batch_size=16):
    """
    Main function to run the movie injection process. It fetches movies from TMDB, generates embeddings, and inserts them into Supabase while keeping track of progress for resuming.

    Populates the following fields per movie:
      - tmdb_id, title, release_year, overview, popularity, vote_average
      - original_language, runtime
      - embedding (384-dim)
    
    Also inserts rows into:
      - movie_keywords (many to many)
      - movie_genres (many to many)

    :param target_count: Total number of movies to inject
    :param batch_size: Number of movies to process in each batch for embedding generation
    """
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
            details = fetch_movie_details(m["id"])

            raw_year = m.get("release_date", "")
            release_year = int(raw_year[:4]) if raw_year and len(raw_year) >= 4 else None

            vote_average = m.get("vote_average") or None
            if vote_average == 0.0:
                vote_average = None

            prepared.append({
                "tmdb_id": m["id"],
                "title": m["title"],
                "release_year": release_year,
                "overview": m["overview"],
                "popularity": m.get("popularity"),
                "vote_average": vote_average,
                "original_language": m.get("original_language"),
                "runtime": details["runtime"],
                "genre_ids": m.get("genre_ids", []),
                "keywords": details["keywords"],
                "text": build_movie_text(m["title"], details["keywords"], m["overview"]),
                "poster_path": m.get("poster_path"),
            })
            time.sleep(0.05)

        for i in range(0, len(prepared), batch_size):
            batch = prepared[i:i + batch_size]
            texts = [m["text"] for m in batch]

            embeddings = generate_embeddings(texts)

            print(f"Generated {len(embeddings)} embeddings for batch of {len(batch)} movies")

            for movie, embedding in zip(batch, embeddings):
                # Verify embedding is valid
                if not embedding or not isinstance(embedding, (list, tuple)):
                    raise Exception(f"Invalid embedding for {movie['title']}")

                if len(embedding) != 384:
                    raise Exception(f"Embedding dimension mismatch for {movie['title']}: expected 384, got {len(embedding)}")

                movie_insert = supabase.table("movies").insert({
                    "tmdb_id": movie["tmdb_id"],
                    "title": movie["title"],
                    "release_year": movie["release_year"],
                    "overview": movie["overview"],
                    "popularity": movie["popularity"],
                    "vote_average": movie["vote_average"],
                    "original_language": movie["original_language"],
                    "runtime": movie["runtime"],
                    "embedding": embedding,
                    "poster_path": movie["poster_path"],
                }).execute()

                movie_id = movie_insert.data[0]["id"]

                # Insert keywords
                if movie["keywords"]:
                    keyword_rows = [
                        {"movie_id": movie_id, "keyword": kw}
                        for kw in movie["keywords"]
                    ]
                    supabase.table("movie_keywords").insert(keyword_rows).execute()

                # Insert genre links
                if movie["genre_ids"]:
                    genre_rows = [
                        {"movie_id": movie_id, "genre_id": gid}
                        for gid in movie["genre_ids"]
                    ]
                    supabase.table("movie_genres").insert(genre_rows).execute()

                existing_ids.add(movie["tmdb_id"])
                total_inserted += 1

                print(
                    f"Inserted: {movie['title']} ({movie['release_year']}) "
                    f"[{movie['original_language']}] "
                    f"runtime={movie['runtime']} "
                    f"vote_avg={movie['vote_average']} "
                    f"genres={movie['genre_ids']} "
                    f"[embedding dim: {len(embedding)}] — Total: {total_inserted}"
                )

                if total_inserted >= target_count:
                    break

        save_progress(page)
        page += 1
        time.sleep(0.3)

    print("\nInjection complete.")

if __name__ == "__main__":
    run_injection(target_count=int(input("Target count: ")))