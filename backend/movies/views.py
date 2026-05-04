import json
import logging

import regex as re
import httpx
from postgrest.exceptions import APIError as PostgrestException
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

# Valid sort_by values accepted by both RPCs
VALID_SORT_BY = {"similarity", "popularity", "vote_average"}


def parse_filters(body: dict) -> tuple[dict, str | None]:
    """
    Extract and validate optional filter parameters from the request body.

    genre_ids – list[int] Movies must belong to ALL listed genres
    language – str ISO-639-1 code, e.g. 'en'
    year_from – int Minimum release year (inclusive)
    year_to – int Maximum release year (inclusive)
    runtime_min – int Minimum runtime in minutes (inclusive)
    runtime_max – int Maximum runtime in minutes (inclusive)
    sort_by – str 'similarity' | 'popularity' | 'vote_average'

    :param body: Parsed JSON request body
    :return: (filters dict, error_message or None)
    """
    filters = {}

    # genre_ids
    genre_ids = body.get("genre_ids", None)
    if genre_ids is not None:
        if not isinstance(genre_ids, list) or not all(isinstance(g, int) for g in genre_ids):
            return {}, "genre_ids must be a list of integers."
        filters["genre_ids"] = genre_ids or None  # empty list → no filter

    # language
    language = body.get("language", None)
    if language is not None:
        if not isinstance(language, str) or len(language) > 10:
            return {}, "language must be a short string (ISO-639-1 code)."
        filters["language"] = language.strip().lower() or None

    # year_from / year_to
    try:
        year_from = int(body.get("year_from")) if body.get("year_from") is not None else None
        year_to = int(body.get("year_to")) if body.get("year_to") is not None else None
    except (ValueError, TypeError):
        return {}, "year_from and year_to must be integers."

    for key, val in (("year_from", year_from), ("year_to", year_to)):
        if val is not None:
            if val < 1888 or val > 2100:
                return {}, f"{key} must be an integer year between 1888 and 2100."

    if year_from is not None and year_to is not None and year_from > year_to:
        return {}, "year must have year_from ≤ year_to"

    if year_from is not None:
        filters["year_from"] = year_from
    if year_to is not None:
        filters["year_to"] = year_to

    # runtime_min / runtime_max
    try:
        runtime_min = int(body.get("runtime_min")) if body.get("runtime_min") is not None else None
        runtime_max = int(body.get("runtime_max")) if body.get("runtime_max") is not None else None
    except (ValueError, TypeError):
        return {}, "runtime_min and runtime_max must be integers."

    for key, val in (("runtime_min", runtime_min), ("runtime_max", runtime_max)):
        if val is not None:
            if val < 0:
                return {}, f"{key} must be a non-negative integer."

    if runtime_min is not None and runtime_max is not None and runtime_min > runtime_max:
        return {}, "runtime must have runtime_min ≤ runtime_max"

    if runtime_min is not None:
        filters["runtime_min"] = runtime_min
    if runtime_max is not None:
        filters["runtime_max"] = runtime_max

    # sort_by
    sort_by = body.get("sort_by", "similarity")
    if sort_by not in VALID_SORT_BY:
        return {}, f"sort_by must be one of: {', '.join(sorted(VALID_SORT_BY))}."
    filters["sort_by"] = sort_by

    return filters, None


def build_rpc_filter_params(filters: dict) -> dict:
    """
    Map validated filter dict to the parameter names expected by the Supabase RPCs.

    :param filters: Validated filter dict from parse_filters
    :return: Dict of kwargs to merge into the RPC params
    """
    params = {}

    genre_ids = filters.get("genre_ids")
    if genre_ids:
        params["p_genre_ids"] = genre_ids

    language = filters.get("language")
    if language:
        params["p_language"] = language

    year_from = filters.get("year_from")
    if year_from is not None:
        params["p_year_from"] = year_from

    year_to = filters.get("year_to")
    if year_to is not None:
        params["p_year_to"] = year_to

    runtime_min = filters.get("runtime_min")
    if runtime_min is not None:
        params["p_runtime_min"] = runtime_min

    runtime_max = filters.get("runtime_max")
    if runtime_max is not None:
        params["p_runtime_max"] = runtime_max

    return params


def sort_movies(movies: list, sort_by: str) -> list:
    """
    Re-order a list of movie dicts that were already retrieved by similarity.
    Sorting is applied as a secondary ranking on the candidate set, so the
    pool of relevant movies never changes — only their display order does.

    :param movies: List of movie dicts from the Supabase RPC
    :param sort_by: 'similarity' | 'popularity' | 'vote_average'
    :return: Sorted list
    """
    if sort_by == "popularity":
        return sorted(movies, key=lambda m: m.get("popularity") or 0, reverse=True)
    if sort_by == "vote_average":
        return sorted(movies, key=lambda m: m.get("vote_average") or 0, reverse=True)
    # Default: similarity order as returned by Postgres
    return movies


def serialize_movie(m: dict) -> dict:
    """
    Serialize a movie row returned from the Supabase RPC into the API response format.

    :param m: Raw movie dict from Supabase
    :return: Serialized dict for JSON response
    """
    return {
        "id":                m["id"],
        "tmdb_id":           m["tmdb_id"],
        "title":             m["title"],
        "overview":          m["overview"],
        "release_year":      m["release_year"],
        "popularity":        m.get("popularity"),
        "vote_average":      m.get("vote_average"),
        "runtime":           m.get("runtime"),
        "original_language": m.get("original_language"),
        "similarity":        round(m["similarity"], 4),
    }


@csrf_exempt
@require_POST
def search(request):
    """
    POST /api/search/

    1. Validates and normalises the `inputs` list (2–5 words/phrases)
    2. Parses optional filter/sort parameters
    3. Checks Redis cache — returns immediately on a HIT
    4. On a MISS: embeds the query via HuggingFace → 384-dim vector
    5. Calls Supabase match_movies RPC with filter params
    6. Stores the result in Redis and returns it

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

    # Parse filter params
    filters, filter_error = parse_filters(body)
    if filter_error:
        return JsonResponse({"error": filter_error}, status=400)

    # Build query string for the embedding model
    query_text = ", ".join(inputs)

    # Cache check — skip expensive HuggingFace + Supabase calls on a HIT.
    cache_key = make_cache_key(inputs, filters)
    sort_by = filters.get("sort_by", "similarity")
    cached = get_cached_results(cache_key)
    if cached is not None:
        sorted_cached = sort_movies(cached, sort_by)
        return JsonResponse({"results": [serialize_movie(m) for m in sorted_cached[:10]], "cached": True})

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

    rpc_params = {
        "query_embedding": embedding,
        "match_count": 20,
        "match_threshold": -1.0,
        **build_rpc_filter_params(filters),
    }

    response = supabase.rpc("match_movies", rpc_params).execute()

    movies = response.data or []
    logger.debug("Supabase RPC returned %d results", len(movies))

    # Store the raw similarity-ordered candidates in cache before sorting.
    # This lets future requests with a different sort_by reuse the same entry.
    set_cached_results(cache_key, movies)

    # Sort and slice for the current response
    movies = sort_movies(movies, sort_by)
    results = [serialize_movie(m) for m in movies[:10]]

    return JsonResponse({"results": results, "cached": False})


@csrf_exempt
@require_POST
def recommend(request):
    """
    POST /api/recommend/

    Returns a single movie recommendation based on the user's selected emotion.
    Supports the same filter/sort parameters as /api/search/.
    Optionally scoped to a watchlist subset via `movie_ids`.

    Body parameters:
    emotion – one of the 20 known emotion names
    movie_ids – internal Supabase movie IDs to filter against
    genre_ids – list of genre IDs
    language – ISO-639-1 code
    year_from – minimum release year
    year_to – maximum release year
    runtime_min – minimum runtime in minutes
    runtime_max – maximum runtime in minutes
    sort_by – 'similarity' | 'popularity' | 'vote_average'

    :param request: Django HttpRequest object
    :return: JsonResponse with a single movie or null
    """
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    emotion = body.get("emotion", "").strip().lower()
    movie_ids = body.get("movie_ids", None)
    exclude_ids = body.get("exclude_ids", None)

    logger.debug(movie_ids)

    if not emotion or emotion not in KNOWN_EMOTIONS:
        return JsonResponse(
            {"error": f"Unknown emotion. Valid emotions: {sorted(KNOWN_EMOTIONS)}"},
            status=400,
        )

    if movie_ids is not None:
        if not isinstance(movie_ids, list) or not all(isinstance(i, int) for i in movie_ids):
            return JsonResponse({"error": "movie_ids must be a list of integers."}, status=400)

    if exclude_ids is not None:
        if not isinstance(exclude_ids, list) or not all(isinstance(i, int) for i in exclude_ids):
            return JsonResponse({"error": "exclude_ids must be a list of integers."}, status=400)
        exclude_ids_set = set(exclude_ids)
    else:
        exclude_ids_set = set()

    # Parse filter params (same as search)
    filters, filter_error = parse_filters(body)
    if filter_error:
        return JsonResponse({"error": filter_error}, status=400)

    supabase = get_client()

    # Fetch pre-computed emotion embedding
    try:
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
        match_count = 5 + len(exclude_ids_set)
        rpc_params: dict = {
            "query_embedding": embedding,
            "match_count": match_count,
            "match_threshold": -1.0,
            **build_rpc_filter_params(filters),
        }

        scoped = bool(movie_ids)
        if scoped:
            rpc_params["filter_ids"] = movie_ids

        response = supabase.rpc("match_movies_by_emotion", rpc_params).execute()
        movies = response.data or []
        if exclude_ids_set:
            movies = [m for m in movies if m["id"] not in exclude_ids_set]

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
            if exclude_ids_set:
                movies = [m for m in movies if m["id"] not in exclude_ids_set]
            fell_back = True

    except (httpx.ConnectError, httpx.RemoteProtocolError, PostgrestException) as e:
        logger.error("Database or network error during recommend: %s", e)
        return JsonResponse({"error": "Service unavailable"}, status=502)

    if not movies:
        return JsonResponse({"result": None, "scope": "none"})

    sort_by = filters.get("sort_by", "similarity")
    movies = sort_movies(movies, sort_by)

    m = movies[0]
    result = serialize_movie(m)

    # `scope` tells the frontend whether the result came from the watchlist or all movies.
    scope = "all" if (not scoped or fell_back) else "watchlist"
    return JsonResponse({"result": result, "scope": scope})