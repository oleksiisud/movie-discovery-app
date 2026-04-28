import json
import logging

import regex as re
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .cache import get_cached_results, make_cache_key, set_cached_results
from .embeddings import get_embedding
from .supabase_client import get_client

logger = logging.getLogger(__name__)

# Canonical emotion names
KNOWN_EMOTIONS = {
    "happy", "sad", "angry", "anxious", "bored", "excited",
    "playful", "lost", "reflective", "brave", "scared",
    "hopeful", "nostalgic", "curious", "frustrated", "romantic",
    "lonely", "depressed", "jealous", "overwhelmed"
}


@csrf_exempt
@require_POST
def search(request):
    """
    POST /api/search/

    1. Validates and normalises the `inputs` list (2–5 words/phrases)
    2. Checks Redis cache — returns immediately on a HIT
    3. On a MISS: embeds the query via HuggingFace → 384-dim vector
    4. Calls Supabase match_movies RPC
    5. Stores the result in Redis and returns it

    :param request: Django HttpRequest object
    :return: JsonResponse with search results or error message
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    inputs = body.get("inputs", [])

    if not isinstance(inputs, list) or not (2 <= len(inputs) <= 5):
        return JsonResponse(
            {"error": "Provide between 2 and 5 words or phrases."},
            status=400,
        )

    # Validate each input individually (the joined string contains ', ' separators
    # which are intentionally non-word characters, so we must not check the join).
    for term in inputs:
        if len(term) > 100:
            return JsonResponse({"error": "Each term must be 100 characters or fewer."}, status=400)
        if re.search(r'\W ', term):
            return JsonResponse({"error": "Query contains invalid characters"}, status=400)

    # Build query string for the embedding model
    query_text = ", ".join(inputs)

    # Cache check — skip expensive HuggingFace + Supabase calls on a HIT
    cache_key = make_cache_key(inputs)
    cached = get_cached_results(cache_key)
    if cached is not None:
        return JsonResponse({"results": cached, "cached": True})

    # Cache MISS — embed and query
    try:
        embedding = get_embedding(query_text)
    except Exception as e:
        logger.error("Embedding failed for query %r: %s", query_text, e)
        return JsonResponse({"error": f"Embedding failed: {str(e)}"}, status=502)

    if not embedding or len(embedding) == 0:
        return JsonResponse({"error": "Embedding is empty"}, status=502)

    logger.debug("Query: %r  embedding_dim=%d", query_text, len(embedding))

    supabase = get_client()

    response = (
        supabase
        .rpc("match_movies", {
            "query_embedding": embedding,
            "match_count": 20,
            "match_threshold": -1.0,
        })
        .execute()
    )

    movies = response.data or []
    logger.debug("Supabase RPC returned %d results", len(movies))

    results = [
        {
            "id":           m["id"],
            "tmdb_id":      m["tmdb_id"],
            "title":        m["title"],
            "overview":     m["overview"],
            "release_year": m["release_year"],
            "similarity":   round(m["similarity"], 4),
        }
        for m in movies[:10]
    ]

    # Store in cache for future identical queries
    set_cached_results(cache_key, results)

    return JsonResponse({"results": results, "cached": False})


@csrf_exempt
@require_POST
def recommend(request):
    """
    POST /api/recommend/

    Returns a single movie recommendation based on the user's selected emotion.
    Optionally scoped to a watchlist subset via `movie_ids`.

    1. one of the 20 known emotion names
    2. internal Supabase movie IDs to filter against (omit to search across all movies)

    :param request: Django HttpRequest object
    :return: JsonResponse with a single movie or null
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    emotion = body.get("emotion", "").strip().lower()
    movie_ids = body.get("movie_ids", None)

    logger.debug(movie_ids)

    if not emotion or emotion not in KNOWN_EMOTIONS:
        return JsonResponse(
            {"error": f"Unknown emotion. Valid emotions: {sorted(KNOWN_EMOTIONS)}"},
            status=400,
        )

    if movie_ids is not None:
        if not isinstance(movie_ids, list) or not all(isinstance(i, int) for i in movie_ids):
            return JsonResponse({"error": "movie_ids must be a list of integers."}, status=400)

    supabase = get_client()

    # Fetch pre-computed emotion embedding
    em_resp = (
        supabase.table("emotion_embeddings")
        .select("embedding")
        .eq("name", emotion)
        .single()
        .execute()
    )

    if not em_resp.data:
        logger.error("No embedding found for emotion: %s", emotion)
        return JsonResponse({"error": "Emotion embedding not found in database."}, status=404)

    embedding = em_resp.data["embedding"]

    # Build RPC params — filter_ids scopes results to the user's watchlist.
    rpc_params: dict = {
        "query_embedding": embedding,
        "match_count": 5,
        "match_threshold": -1.0,
    }

    scoped = bool(movie_ids)
    if scoped:
        rpc_params["filter_ids"] = movie_ids

    response = supabase.rpc("match_movies_by_emotion", rpc_params).execute()
    movies = response.data or []

    # If the watchlist-scoped query returned nothing (e.g. those movies have no
    # embedding stored), automatically fall back to all movies so the user
    # always gets a result. The response includes `scope` so the frontend can
    # surface a helpful message.
    fell_back = False
    if not movies and scoped:
        logger.info(
            "recommend: no results in watchlist scope for emotion=%r — falling back to all movies",
            emotion,
        )
        rpc_params.pop("filter_ids", None)
        response = supabase.rpc("match_movies_by_emotion", rpc_params).execute()
        movies = response.data or []
        fell_back = True

    if not movies:
        return JsonResponse({"result": None, "scope": "none"})

    m = movies[0]
    result = {
        "id":           m["id"],
        "tmdb_id":      m["tmdb_id"],
        "title":        m["title"],
        "overview":     m["overview"],
        "release_year": m["release_year"],
        "similarity":   round(m["similarity"], 4),
    }

    # `scope` tells the frontend whether the result came from the watchlist or all movies.
    scope = "all" if (not scoped or fell_back) else "watchlist"
    return JsonResponse({"result": result, "scope": scope})