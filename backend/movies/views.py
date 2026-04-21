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