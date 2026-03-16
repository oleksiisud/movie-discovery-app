import os
import json
import requests
import numpy as np
from time import sleep
from dotenv import load_dotenv
from sklearn.metrics.pairwise import cosine_similarity
from supabase import create_client
import nltk
from nltk.corpus import wordnet

load_dotenv()
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
HF_TOKEN = os.getenv("HF_TOKEN")
TMDB_URL = "https://api.themoviedb.org/3/"
HF_MODEL_URL = "https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction"

HF_HEADERS = {
    "Authorization": f"Bearer {HF_TOKEN}"
}

# Initialize Supabase client
SUPABASE_CLIENT = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)

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

def fetch_movies_from_supabase(limit=200):
    """
    Fetch movies with embeddings from Supabase.

    :param limit: Maximum number of movies to fetch
    :return: Tuple of (movies list, embeddings array)
    """
    try:
        response = SUPABASE_CLIENT.table("movies").select(
            "id, tmdb_id, title, overview, release_year, popularity, embedding"
        ).limit(limit).execute()
        
        movies = []
        embeddings = []
        
        for m in response.data:
            movies.append({
                "id": m["tmdb_id"],
                "title": m["title"],
                "year": m.get("release_year", "N/A"),
                "overview": m["overview"],
                "popularity": 0 if m.get("popularity") is None else m.get("popularity"),
                "keywords": []
            })
            if m.get("embedding"):
                embedding = m["embedding"]
                # Parse embedding if it's a string (JSON or numpy string representation)
                if isinstance(embedding, str):
                    # Try parsing as JSON first
                    try:
                        embedding = json.loads(embedding)
                    except json.JSONDecodeError:
                        # If JSON fails, it might be a numpy string like "np.array([...])"
                        # Try eval as last resort (be careful with unfamiliar data)
                        import re
                        match = re.search(r'\[([\d\s.,\-e]+)\]', embedding)
                        if match:
                            embedding = [float(x) for x in match.group(1).split(',')]
                        else:
                            raise ValueError(f"Cannot parse embedding format: {embedding[:50]}")
                embeddings.append(embedding)
            else:
                raise ValueError(f"Movie {m['title']} has no embedding")
        
        return movies, np.array(embeddings)
    except Exception as e:
        raise Exception(f"Failed to fetch movies from Supabase: {str(e)}")

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

def search_movies(query_embedding, movie_embeddings, movies, query_terms, top_k=5):
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

    scored = []

    for idx, sim in enumerate(similarities):

        movie = movies[idx]

        k_score = keyword_score(movie, query_terms)
        p_score = movie["popularity"]

        final_score = (
            0.7 * sim +
            0.2 * k_score +
            0.1 * p_score
        )

        scored.append((movie, final_score, sim))

    scored.sort(key=lambda x: x[1], reverse=True)

    return scored[:top_k]

def expand_query_terms(inputs, max_synonyms=2):
    """
    Expand query terms using WordNet synonyms.
    Returns original terms + synonyms.

    :param inputs: List of query terms
    :param max_synonyms: Maximum number of synonyms to add per term
    :return: List of expanded query terms
    """
    expanded = set(inputs)

    for word in inputs:
        for syn in wordnet.synsets(word):
            for lemma in syn.lemmas():
                synonym = lemma.name().replace("_", " ").lower()
                if synonym != word:
                    expanded.add(synonym)

                if len(expanded) >= len(inputs) + max_synonyms:
                    break
            if len(expanded) >= len(inputs) + max_synonyms:
                break

    return list(expanded)

def keyword_score(movie, query_terms):
    """
    Score movie by keyword/text overlap with query terms.

    :param movie: Movie dict
    :param query_terms: List of query terms
    :return: Keyword score
    """
    text = (
        movie["title"] + " " +
        movie["overview"] + " " +
        " ".join(movie.get("keywords", []))
    ).lower()

    score = 0
    for term in query_terms:
        if term.lower() in text:
            score += 1

    return score / max(len(query_terms), 1)

def main():
    print("Fetching movies and embeddings from Supabase...")
    movies, movie_embeddings = fetch_movies_from_supabase(limit=1000)
    print(f"Loaded {len(movies)} movies")

    print("\nChoose mode:")
    print("1 - Word combinator search")
    print("2 - Emotion recommender")
    mode = input("> ").strip()

    if mode == "1":
        user_inputs = get_user_input()
        expanded_terms = expand_query_terms(user_inputs)
        print("Expanded query:", expanded_terms)
        # query_text = ", ".join(user_inputs)
        # query_embedding = generate_embeddings(query_text)[0]
        vectors = [generate_embeddings(x)[0] for x in expanded_terms]
        query_embedding = np.mean(vectors, axis=0)

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
    results = search_movies(
        query_embedding,
        movie_embeddings,
        movies,
        expanded_terms
    )

    for i, (movie, score, sim) in enumerate(results, 1):
        print(f"{i}. {movie['title']} ({movie['year']})")
        print(f"   score={score:.3f} similarity={sim:.3f}")
        print(f"   {movie['overview']}\n")

if __name__ == "__main__":
    main()
