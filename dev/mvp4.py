import os
import requests
import numpy as np
from time import sleep
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

def fetch_movies(pages=10):
    movies = []

    for page in range(1, pages + 1):
        response = requests.get(
            TMDB_URL + "discover/movie",
            params={
                "api_key": TMDB_API_KEY,
                "language": "en-US",
                "sort_by": "vote_count.desc",
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
                    "overview": m["overview"],
                    "keywords": []
                })

    return movies

def fetch_keywords(movies):
    for movie in movies:
        response = requests.get(
            TMDB_URL + f"movie/{movie['id']}/keywords",
            params={"api_key": TMDB_API_KEY}
        )
        data = response.json()
        movie["keywords"] = [k["name"] for k in data.get("keywords", [])]
        sleep(0.1)

def build_movie_text(movie):
    keywords = ", ".join(movie.get("keywords", []))
    return f"{movie['title']}. {keywords}. {movie['overview']}"

EMOTION_MAP = {
    "mad": "wholesome calming uplifting feel-good movie",
    "sad": "happy lighthearted comedy warm funny movie",
    "short-tempered": "fast-paced energetic short fun movie",
    "anxious": "comforting grounded reassuring gentle movie",
    "well": "serious thoughtful emotional dramatic movie"
}

def get_emotion_input():
    print("\nHow are you feeling?")
    print("Options:", ", ".join(EMOTION_MAP.keys()))
    emotion = input("> ").strip().lower()

    if emotion not in EMOTION_MAP:
        raise ValueError("Unsupported emotion.")

    return emotion

def search_movies(query_embedding, movie_embeddings, movies, top_k=5):
    similarities = cosine_similarity(
        [query_embedding],
        movie_embeddings
    )[0]

    top_indices = np.argsort(similarities)[::-1][:top_k]

    results = []
    for idx in top_indices:
        results.append((movies[idx], similarities[idx]))

    return results

def main():
    print("Fetching movies...")
    movies = fetch_movies(pages=10)
    fetch_keywords(movies)

    print("Embedding movies...")
    movie_texts = [build_movie_text(m) for m in movies]
    movie_embeddings = model.encode(
        movie_texts,
        normalize_embeddings=True,
        show_progress_bar=True
    )

    print("\nChoose mode:")
    print("1 - Word combinator search")
    print("2 - Emotion recommender")
    mode = input("> ").strip()

    if mode == "1":
        user_inputs = get_user_input()
        query_text = ", ".join(user_inputs)
        query_embedding = model.encode(query_text, normalize_embeddings=True)

    elif mode == "2":
        emotion = get_emotion_input()
        emotion_text = EMOTION_MAP[emotion]
        query_embedding = model.encode(emotion_text, normalize_embeddings=True)

        print("\nUse opposite vector? (y/n)")
        if input("> ").strip().lower() == "y":
            query_embedding = -query_embedding

    else:
        print("Invalid mode.")
        return

    print("\nTop recommendations:\n")
    results = search_movies(query_embedding, movie_embeddings, movies)

    for i, (movie, score) in enumerate(results, 1):
        print(f"{i}. {movie['title']} ({movie['year']}) (score: {score:.3f})")
        print(f"   Keywords: {', '.join(movie.get('keywords', []))}")
        print(f"   {movie['overview']}\n")

if __name__ == "__main__":
    main()
