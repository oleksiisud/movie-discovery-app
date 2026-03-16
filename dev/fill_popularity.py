import os
import requests
import time
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

TMDB_URL = "https://api.themoviedb.org/3/movie/"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_movies_missing_popularity(limit=100):

    response = (
        supabase
        .table("movies")
        .select("id, tmdb_id")
        .is_("popularity", "null")
        .limit(limit)
        .execute()
    )

    return response.data


def fetch_popularity(tmdb_id):

    response = requests.get(
        TMDB_URL + str(tmdb_id),
        params={"api_key": TMDB_API_KEY}
    )

    data = response.json()

    return data.get("popularity")


def update_popularity(movie_id, popularity):

    supabase.table("movies").update({
        "popularity": popularity
    }).eq("id", movie_id).execute()


def run_backfill():

    while True:

        movies = fetch_movies_missing_popularity()

        if not movies:
            print("No more movies missing popularity.")
            break

        for m in movies:

            pop = fetch_popularity(m["tmdb_id"])

            if pop is None:
                print(f"Skipping {m['tmdb_id']} (no popularity)")
                continue

            update_popularity(m["id"], pop)

            print(f"Updated {m['tmdb_id']} → popularity {pop}")
            time.sleep(0.1)


if __name__ == "__main__":
    run_backfill()