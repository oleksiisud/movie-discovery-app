import os
import requests
import numpy as np
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_URL = "https://api.themoviedb.org/3/"

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
model = SentenceTransformer(MODEL_NAME)

def get_user_input():
    inputs = []
    print("Enter 2–5 words or phrases (type 'done' to finish):")

    while len(inputs) < 5:
        text = input("> ").strip()
        if text.lower() == "done":
            break
        if text:
            inputs.append(text)

    if len(inputs) < 2:
        raise ValueError("Please enter at least 2 inputs.")

    return inputs

def fetch_movies(pages=3):
    movies = []

    for page in range(1, pages + 1):
        response = requests.get(
            TMDB_URL+"discover/movie",
            params={
                "api_key": TMDB_API_KEY,
                "language": "en-US",
                "sort_by": "popularity.desc",
                "page": page,
            },
        )
        data = response.json()
        for m in data.get("results", []):
            if m.get("overview"):
                movies.append({
                    "id": m["id"],
                    "title": m["title"],
                    "year": m["release_date"][:4] if m.get("release_date") else "N/A",
                    "overview": m["overview"]
                })

    return movies

def fetch_keywords(movies):
    for movie in movies:
        response = requests.get(
            TMDB_URL+f"movie/{movie['id']}/keywords",
            params={"api_key": TMDB_API_KEY}
        )
        data = response.json()
        keywords = [k["name"] for k in data.get("keywords", [])]
        movie["keywords"] = keywords

def movie_text(movie):
    return ', '.join(movie.get("keywords", []))

def main():
    print("Fetching movies from TMDB...")
    movies = fetch_movies(pages=10)
    print(f"Fetched {len(movies)} movies.")
    fetch_keywords(movies)
    print("Fetched keywords for movies.")

    print("Embedding movies...")
    movie_texts = [movie_text(m) for m in movies]
    movie_embeddings = model.encode(
        movie_texts,
        normalize_embeddings=True,
        show_progress_bar=True
    )

    user_inputs = get_user_input()
    query = ", ".join(user_inputs)

    print(f"\nSearching for movies matching: '{query}'\n")

    query_embedding = model.encode(
        query,
        normalize_embeddings=True
    )

    similarities = cosine_similarity(
        [query_embedding],
        movie_embeddings
    )[0]

    top_indices = np.argsort(similarities)[::-1][:5]

    print("Top recommendations:\n")
    for rank, idx in enumerate(top_indices, start=1):
        movie = movies[idx]
        score = similarities[idx]
        print(f"{rank}. {movie['title']} ({movie['year']}) (score: {score:.3f})")
        print(f"   Keywords: {', '.join(movie.get('keywords', []))}")
        print(f"   {movie['overview']}\n")

if __name__ == "__main__":
    main()
