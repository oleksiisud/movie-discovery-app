import os
import sys
import time
import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

TMDB_MOVIE_URL = "https://api.themoviedb.org/3/movie/"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# How many movies to fetch from Supabase per page
SUPABASE_PAGE_SIZE = 1000
# How many updates to batch into a single Supabase upsert
UPSERT_BATCH_SIZE = 50

def fetch_all_movies():
    """
    Retrieve all movies from Supabase, paging through the full table.

    :return: list of dicts with keys 'id', 'tmdb_id', 'runtime', 'original_language'
    """
    print("Fetching all movies from Supabase...")
    movies = []
    page = 0

    while True:
        response = (
            supabase
            .table("movies")
            .select("id, tmdb_id, runtime, original_language")
            .order("id")
            .range(page * SUPABASE_PAGE_SIZE, (page + 1) * SUPABASE_PAGE_SIZE - 1)
            .execute()
        )
        rows = response.data
        if not rows:
            break
        movies.extend(rows)
        page += 1

    print(f"Found {len(movies)} movies in database.")
    return movies

def fetch_tmdb_details(tmdb_id):
    """
    Fetch current movie details from TMDB.

    :param tmdb_id: TMDB movie ID
    :return: dict with 'popularity', 'vote_average', 'runtime', 'original_language',
             or None if the request failed
    """
    try:
        response = requests.get(
            TMDB_MOVIE_URL + str(tmdb_id),
            params={"api_key": TMDB_API_KEY},
            timeout=10,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data = response.json()

        runtime = data.get("runtime") or None
        if runtime == 0:
            runtime = None

        vote_average = data.get("vote_average") or None
        if vote_average == 0.0:
            vote_average = None

        return {
            "popularity": data.get("popularity"),
            "vote_average": vote_average,
            "runtime": runtime,
            "original_language": data.get("original_language"),
        }
    except requests.RequestException as e:
        print(f"WARNING: TMDB request failed for tmdb_id={tmdb_id}: {e}")
        return None

def build_update_payload(movie, tmdb_data):
    """
    Build the Supabase update dict for a movie, merging dynamic fields and
    backfilling NULL-only fields.

    :param movie: Row dict from Supabase (id, tmdb_id, runtime, original_language)
    :param tmdb_data: Dict returned by fetch_tmdb_details
    :return: dict to upsert into Supabase movies table
    """
    payload = {
        "id": movie["id"],
        # Always refresh these
        "popularity": tmdb_data["popularity"],
        "vote_average": tmdb_data["vote_average"],
    }

    # Backfill runtime / original_language only when the DB value is NULL
    if movie.get("runtime") is None and tmdb_data["runtime"] is not None:
        payload["runtime"] = tmdb_data["runtime"]

    if movie.get("original_language") is None and tmdb_data["original_language"]:
        payload["original_language"] = tmdb_data["original_language"]

    return payload

def run_update():
    """
    Main entry point: iterates all movies, fetches TMDB data, and batch-upserts
    updated fields back to Supabase.
    """
    movies = fetch_all_movies()
    total = len(movies)
    updated = 0
    skipped = 0

    pending_upserts = []

    for idx, movie in enumerate(movies, start=1):
        tmdb_id = movie["tmdb_id"]
        print(f"[{idx}/{total}] Fetching tmdb_id={tmdb_id}...", end=" ")

        tmdb_data = fetch_tmdb_details(tmdb_id)

        if tmdb_data is None:
            print("SKIPPED (fetch failed or 404)")
            skipped += 1
            time.sleep(0.05)
            continue

        payload = build_update_payload(movie, tmdb_data)
        pending_upserts.append(payload)
        print(
            f"popularity={tmdb_data['popularity']:.2f}  "
            f"vote_avg={tmdb_data['vote_average']}  "
            f"runtime={tmdb_data['runtime']}  "
            f"lang={tmdb_data['original_language']}"
        )

        # Flush batch when it reaches the configured size
        if len(pending_upserts) >= UPSERT_BATCH_SIZE:
            supabase.table("movies").upsert(pending_upserts).execute()
            updated += len(pending_upserts)
            print(f"Flushed {len(pending_upserts)} updates to Supabase (total so far: {updated})")
            pending_upserts = []

        time.sleep(0.05)

    # Flush any remaining records
    if pending_upserts:
        supabase.table("movies").upsert(pending_upserts).execute()
        updated += len(pending_upserts)
        print(f"Flushed final {len(pending_upserts)} updates to Supabase")

    print(f"\nDone. Updated={updated}, Skipped={skipped}, Total={total}")


if __name__ == "__main__":
    run_update()
