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
import io
import os
import requests
from PIL import Image, ImageOps
from ddgs import DDGS

try:
    from transparent_background import Remover
    remover = Remover()
except Exception as e:
    remover = None

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

PALETTE = [
    251, 185,  84,   46,  34,  47,   62,  53,  70,  249, 194,  43,
    247, 150,  23,  255, 244, 224,   98,  85, 101,  127, 112, 138,
    123, 182,  78,  110, 156, 240,  213,   7,   7,  137,  58, 170,
    230, 109, 110,   84, 143, 251,  161, 174, 251,  221, 161, 251,
     84, 183, 251,  243, 133, 133,   94,  34, 119,  105,  79,  98,
    241, 100,  43,   38,  34,  47,  198, 109,  56,  129,  91,  73,
    225, 195, 189,   40,  47,  47,   38,  47,  34,   40,  47,  41,
    133,  69, 139,   23,  17,  24,  213,  69,  71,  101, 155,  55,
    201, 194, 182,   91, 170,  58,  210,  91,  68,  134, 134, 134,
    238, 133, 112,    0, 193, 255,  141, 141, 141,  245, 189, 162,
    132, 210,  72,  167, 100, 196,  255, 252, 245,  158,  40,  17,
    228,  65,  34,  213,  61,  32,  182,  88, 235,  255,  12, 200,
    110, 187, 240,  151, 185, 248,  138, 140, 249,   43, 139, 249,
    227, 138, 249,   87,  61,  49,  230, 152, 137,  171,  90,  42,
    188, 162, 150,   23, 165, 247,  126, 148, 247,  203, 126, 247,
    228,  77,  11,   64, 124, 235,  111, 191, 245
]

def add_border(img, border_color=(0, 0, 0, 255)):
    width, height = img.size
    new_img = img.copy()
    pixels = img.load()
    new_pixels = new_img.load()

    for y in range(height):
        for x in range(width):
            if pixels[x, y][3] == 0:
                for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < width and 0 <= ny < height:
                        if pixels[nx, ny][3] > 0:
                            new_pixels[x, y] = border_color
                            break
    return new_img


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
        "poster_path":       m.get("poster_path"),
    }


@csrf_exempt
@require_POST
def search(request):
    """
    POST /api/search/

    1. Validates and normalises the `inputs` list (2–5 dicts with type/weight)
    2. Parses optional filter/sort parameters
    3. Checks Redis cache — returns immediately on a HIT
    4. On a MISS: fetches embeddings for elements via HF and movies via Supabase
    5. Combines them via a weighted centroid calculation
    6. Calls Supabase match_movies RPC with filter params
    7. Stores the result in Redis and returns it

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
            {"error": "Provide between 2 and 5 unique inputs."},
            status=400,
        )

    for item in inputs:
        if not isinstance(item, dict):
            return JsonResponse({"error": "Each input must be an object."}, status=400)
        type = item.get("type")
        if type not in ("element", "movie"):
            return JsonResponse({"error": "Invalid input type. Must be 'element' or 'movie'."}, status=400)
        
        if type == "element":
            word = item.get("word")
            if not isinstance(word, str) or len(word) > 100:
                return JsonResponse({"error": "Element word must be a string of 100 characters or fewer."}, status=400)
            if re.search(r'\W ', word):
                return JsonResponse({"error": "Element word contains invalid characters"}, status=400)
        elif type == "movie":
            m_id = item.get("id")
            if not isinstance(m_id, int):
                return JsonResponse({"error": "Movie id must be an integer."}, status=400)

        weight = item.get("weight", 1)
        if not isinstance(weight, int) or weight < 0:
            return JsonResponse({"error": "Weight must be a non-negative integer."}, status=400)

    # Parse filter params
    filters, filter_error = parse_filters(body)
    if filter_error:
        return JsonResponse({"error": filter_error}, status=400)

    # Cache check
    cache_key = make_cache_key(inputs, filters)
    sort_by = filters.get("sort_by", "similarity")
    cached = get_cached_results(cache_key)
    if cached is not None:
        sorted_cached = sort_movies(cached, sort_by)
        
        from .cache import get_and_increment_hit_count
        hit_count = get_and_increment_hit_count(cache_key)
        
        if len(sorted_cached) > 0:
            offset = hit_count % len(sorted_cached)
            rotated = sorted_cached[offset:] + sorted_cached[:offset]
        else:
            rotated = sorted_cached
            
        return JsonResponse({"results": [serialize_movie(m) for m in rotated[:10]], "cached": True})

    # Cache MISS — fetch embeddings
    element_words = []
    movie_ids = []

    for item in inputs:
        if item.get("type") == "element":
            element_words.append(item.get("word").strip())
        elif item.get("type") == "movie":
            movie_ids.append(item.get("id"))

    # Embed elements
    element_embeddings = []
    if element_words:
        try:
            element_embeddings = get_embedding(element_words)
            if element_embeddings and not isinstance(element_embeddings[0], (list, tuple)):
                element_embeddings = [element_embeddings]
        except Exception as e:
            logger.error("Embedding failed for elements %r: %s", element_words, e)
            return JsonResponse({"error": f"Embedding failed: {str(e)}"}, status=502)

    # Fetch movie embeddings
    movie_embeddings_map = {}
    supabase = get_client()
    if movie_ids:
        try:
            response = supabase.table("movies").select("id, embedding").in_("id", movie_ids).execute()
            for row in response.data:
                if row.get("embedding"):
                    emb = row["embedding"]
                    if isinstance(emb, str):
                        emb = json.loads(emb)
                    movie_embeddings_map[row["id"]] = emb
        except Exception as e:
            logger.error("Failed to fetch movie embeddings: %s", e)
            return JsonResponse({"error": "Database error fetching movie embeddings."}, status=502)

        # Check if all requested movies had embeddings
        for m_id in movie_ids:
            if m_id not in movie_embeddings_map:
                return JsonResponse({"error": f"Movie embedding not found for id {m_id}."}, status=404)

    # Combine embeddings
    total_weight = sum(item.get("weight", 1) for item in inputs)
    if total_weight == 0:
        return JsonResponse({"error": "Total weight must be greater than 0."}, status=400)

    combined_embedding = [0.0] * 384
    
    element_idx = 0
    for item in inputs:
        weight = item.get("weight", 1)
        normalized_w = weight / total_weight
        
        vec = None
        if item.get("type") == "element":
            vec = element_embeddings[element_idx]
            element_idx += 1
        elif item.get("type") == "movie":
            vec = movie_embeddings_map[item.get("id")]
            
        for i in range(384):
            combined_embedding[i] += vec[i] * normalized_w

    embedding = combined_embedding

    logger.debug("Combined embedding calculated")

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
    
    from .cache import reset_hit_count
    reset_hit_count(cache_key)

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


@csrf_exempt
def generate_pixel_sprite(request):
    prompt = request.GET.get('prompt', 'a simple red potion bottle, white background')
    supabase = get_client()
    
    try:
        # Check Supabase cache
        resp = supabase.table("sprites").select("image_data").eq("prompt", prompt).execute()
        if resp.data and len(resp.data) > 0:
            return JsonResponse({"image_data": resp.data[0]["image_data"]})
    except Exception as e:
        logger.warning("Supabase cache check failed: %s", e)

    try:
        # STEP 1: Search Image via DuckDuckGo
        with DDGS() as ddgs:
            results = list(ddgs.images(prompt + " clip art", max_results=1))
            if not results:
                return JsonResponse({"error": "No image found"}, status=404)
            image_url = results[0]["image"]
        
        # Download image
        img_res = requests.get(image_url, timeout=10)
        img_res.raise_for_status()
        
        original_img = Image.open(io.BytesIO(img_res.content)).convert("RGB")
        
        # Crop to 1:1 aspect ratio
        min_dim = min(original_img.size)
        original_img = ImageOps.fit(original_img, (min_dim, min_dim))

        
        # STEP 2: Remove Background
        if remover:
            img_no_bg = remover.process(original_img)
        else:
            img_no_bg = original_img.convert("RGBA")
            
        # STEP 3: Downscale to 18x18
        small_img = img_no_bg.resize((18, 18), resample=Image.NEAREST)

        # STEP 4: Add Border
        final_img = add_border(small_img, border_color=(0, 0, 0, 255))

        # STEP 5: Apply Palette
        palette_img = Image.new('P', (1, 1))
        palette_img.putpalette(PALETTE + [0]*(768 - len(PALETTE))) 
        
        alpha = final_img.getchannel('A')
        final_img = final_img.convert("RGB").quantize(palette=palette_img, dither=Image.NONE).convert("RGBA")
        final_img.putalpha(alpha)

        buffer = io.BytesIO()
        final_img.save(buffer, format="PNG")
        import base64
        img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        try:
            # Save to Supabase cache
            supabase.table("sprites").insert({"prompt": prompt, "image_data": img_b64}).execute()
        except Exception as e:
            logger.warning("Supabase cache save failed: %s", e)
            
        return JsonResponse({"image_data": img_b64})

    except Exception as e:
        logger.error("Failed to generate sprite: %s", e)
        return JsonResponse({"error": str(e)}, status=500)