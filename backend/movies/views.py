import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .embeddings import get_embedding
from .supabase_client import get_client


@csrf_exempt
@require_POST
def search(request):
    """
    POST /api/search/
    Body: { "inputs": ["word1", "phrase2", ...] }   (2–5 items)

    1. Concatenates inputs into a single query string
    2. Sends to HuggingFace inference API → 384-dim vector
    3. Calls Supabase match_movies RPC
    4. Returns top 10 results
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

    # Build query string and embed via HuggingFace API
    query_text = ", ".join(inputs)

    try:
        embedding = get_embedding(query_text)
    except Exception as e:
        return JsonResponse({"error": f"Embedding failed: {str(e)}"}, status=502)

    # Debug: Check embedding validity
    if not embedding or len(embedding) == 0:
        return JsonResponse({"error": "Embedding is empty"}, status=502)
    
    print(f"DEBUG: Query: {query_text}")
    print(f"DEBUG: Embedding length: {len(embedding)}, first 5: {embedding[:5]}")
    
    # Try as JSON string cast to vector
    import json as json_module
    embedding_json_str = json_module.dumps(embedding)
    print(f"DEBUG: Embedding as JSON string: {embedding_json_str[:80]}...")
    
    # Query Supabase via RPC
    supabase = get_client()
    
    response = (
        supabase
        .rpc("match_movies", {
            "query_embedding": embedding,  # Try both ways
            "match_count": 20,
            "match_threshold": -1.0,
        })
        .execute()
    )

    print(f"DEBUG: RPC response: {response}")
    if response.data:
        print(f"DEBUG: RPC returned {len(response.data)} results")
    else:
        print(f"DEBUG: RPC returned no data")
    
    movies = response.data or []

    results = [
        {
            "id":           m["tmdb_id"],
            "title":        m["title"],
            "overview":     m["overview"],
            "release_year": m["release_year"],
            "similarity":   round(m["similarity"], 4),
        }
        for m in movies[:10]
    ]

    return JsonResponse({"results": results})