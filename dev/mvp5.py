import os
import requests
import numpy as np
from time import sleep
from dotenv import load_dotenv
from sklearn.metrics.pairwise import cosine_similarity

load_dotenv()
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")
TMDB_URL = "https://api.themoviedb.org/3/"
HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

HF_HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}"
}

def get_user_input():
    """
    Prompt the user to enter 2–5 words or phrases, which will be combined into a single query string.

    :return: List of user inputs
    """
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
    """
    Fetch movies from TMDB API, sorted by vote count, and filter out those without an overview.

    :param pages: Number of pages to fetch (20 movies per page)
    :return: List of movie dicts with id, title, year, overview, and keywords (initially empty)
    """
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
    """
    Fetch keywords for each movie using TMDB API and add them to the movie dicts.

    :param movies: List of movie dicts
    """
    for movie in movies:
        response = requests.get(
            TMDB_URL + f"movie/{movie['id']}/keywords",
            params={"api_key": TMDB_API_KEY}
        )
        data = response.json()
        movie["keywords"] = [k["name"] for k in data.get("keywords", [])]
        sleep(0.1)

def build_movie_text(movie):
    """
    Build a text representation of the movie by combining title, keywords, and overview.

    :param movie: Movie dict
    :return: Combined text string
    """
    keywords = ", ".join(movie.get("keywords", []))
    return f"{keywords}. {movie['overview']}"

def generate_embeddings(texts):
    """
    Generate embeddings using Hugging Face Inference API
    
    :param texts: str or list of str
    :return: np.array of shape (n_texts, embedding_dim)
    """
    if isinstance(texts, str):
        texts = [texts]
    
    payload = {
        "inputs": texts
    }
    response = requests.post(HF_MODEL_URL, headers=HF_HEADERS, json=payload)

    if response.status_code != 200:
        raise Exception(f"HF API Error: {response.text}")

    embeddings = response.json()
    return np.array(embeddings)

EMOTION_MAP = {
    "mad": "wholesome calming uplifting feel-good movie",
    "sad": "happy lighthearted comedy warm funny movie",
    "short-tempered": "fast-paced energetic short fun movie",
    "anxious": "comforting grounded reassuring gentle movie",
    "well": "serious thoughtful emotional dramatic movie"
}

def get_emotion_input():
    """
    Prompt the user to select an emotion from the predefined list and return the corresponding query text.
    
    :return: Selected emotion string
    """
    print("\nHow are you feeling?")
    print("Options:", ", ".join(EMOTION_MAP.keys()))
    emotion = input("> ").strip().lower()

    if emotion not in EMOTION_MAP:
        raise ValueError("Unsupported emotion.")

    return emotion

def search_movies(query_embedding, movie_embeddings, movies, top_k=5):
    """
    Search for movies by calculating cosine similarity between the query embedding and movie embeddings, and return the top results.

    :param query_embedding: np.array of shape (embedding_dim,)
    :param movie_embeddings: np.array of shape (n_movies, embedding_dim)
    :param movies: List of movie dicts
    :param top_k: Number of top results to return
    :return: List of tuples (movie_dict, similarity_score)
    """
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
    movie_embeddings = generate_embeddings(movie_texts)

    print("\nChoose mode:")
    print("1 - Word combinator search")
    print("2 - Emotion recommender")
    mode = input("> ").strip()

    if mode == "1":
        user_inputs = get_user_input()
        query_text = ", ".join(user_inputs)
        query_embedding = generate_embeddings(query_text)[0]

    elif mode == "2":
        emotion = get_emotion_input()
        emotion_text = EMOTION_MAP[emotion]
        query_embedding = generate_embeddings(emotion_text)[0]

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
