import json
from unittest.mock import MagicMock, patch

from django.test import TestCase, override_settings
from django.core.cache import cache

from movies.cache import make_cache_key, get_cached_results, set_cached_results
from movies.views import serialize_movie

# Fixtures

INPUTS = [
    {"type": "element", "word": "action", "weight": 1},
    {"type": "element", "word": "comedy", "weight": 1}
]
RESULTS = [
    {
        "id": 1,
        "tmdb_id": 1,
        "title": "Hot Fuzz",
        "overview": "A top London cop is transferred to a rural town.",
        "release_year": 2007,
        "similarity": 0.91,
    }
]

# Use Django's dummy (in-memory) cache so no Redis is needed during tests
DUMMY_CACHE_SETTINGS = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
    }
}

# Cache helper tests

class MakeCacheKeyTests(TestCase):
    """
    make_cache_key() must be deterministic and order-independent.
    """

    def test_same_key_regardless_of_order(self):
        """
        Test that make_cache_key() returns the same key for the same inputs regardless of order.
        """
        key1 = make_cache_key([
            {"type": "element", "word": "action", "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ])
        key2 = make_cache_key([
            {"type": "element", "word": "comedy", "weight": 1},
            {"type": "element", "word": "action", "weight": 1}
        ])
        self.assertEqual(key1, key2)

    def test_different_inputs_give_different_keys(self):
        """
        Test that make_cache_key() returns different keys for different inputs.
        """
        key1 = make_cache_key([
            {"type": "element", "word": "action", "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ])
        key2 = make_cache_key([
            {"type": "element", "word": "drama", "weight": 1},
            {"type": "element", "word": "thriller", "weight": 1}
        ])
        self.assertNotEqual(key1, key2)

    def test_key_starts_with_prefix(self):
        """
        Test that make_cache_key() returns a key that starts with the prefix "movie_search:".
        """
        key = make_cache_key([
            {"type": "element", "word": "horror", "weight": 1}
        ])
        self.assertTrue(key.startswith("movie_search:"))


@override_settings(CACHES=DUMMY_CACHE_SETTINGS)
class CacheGetSetTests(TestCase):
    """
    get_cached_results / set_cached_results round-trip.
    """

    def setUp(self):
        """
        Set up the test.
        """
        cache.clear()

    def test_miss_returns_none(self):
        """
        Test that get_cached_results() returns None for a non-existent key.
        """
        result = get_cached_results("non_existent_key")
        self.assertIsNone(result)

    def test_set_then_get_returns_data(self):
        """
        Test that set_cached_results() followed by get_cached_results() returns the same data.
        """
        key = make_cache_key(INPUTS)
        set_cached_results(key, RESULTS, ttl=60)
        result = get_cached_results(key)
        self.assertEqual(result, RESULTS)

    def test_set_with_default_ttl(self):
        """
        Test that set_cached_results() with ttl=None uses settings.CACHE_TTL.
        """
        with self.settings(CACHE_TTL=120):
            key = make_cache_key([
                {"type": "element", "word": "sci-fi", "weight": 1}
            ])
            set_cached_results(key, RESULTS)  # no explicit ttl
            self.assertEqual(get_cached_results(key), RESULTS)

# Search view tests

@override_settings(CACHES=DUMMY_CACHE_SETTINGS, CACHE_TTL=3600)
class SearchViewCacheTests(TestCase):
    """
    Integration tests for POST /api/search/ with caching.

    self.client has enforce_csrf_checks=False by default so @csrf_protect
    does not block test requests.
    """

    def setUp(self):
        cache.clear()

    def _post(self, inputs):
        """
        Helper method to make a POST request to the search endpoint.
        
        :param inputs: List of query inputs
        :return: Django HttpRequest object
        """
        return self.client.post(
            "/api/search/",
            data=json.dumps({"inputs": inputs}),
            content_type="application/json",
        )

    @patch("movies.views.set_cached_results")
    @patch("movies.views.get_cached_results", return_value=None)  # force MISS
    @patch("movies.views.get_client")
    @patch("movies.views.get_embedding", return_value=[[0.1] * 384, [0.1] * 384])
    def test_cache_miss_calls_embedding_and_supabase(
        self, mock_embed, mock_client, mock_cache_get, mock_cache_set
    ):
        """
        On a cache miss, the view calls HuggingFace + Supabase and caches the result.

        :param mock_embed: Mock for get_embedding()
        :param mock_client: Mock for get_client()
        :param mock_cache_get: Mock for get_cached_results()
        :param mock_cache_set: Mock for set_cached_results()
        """
        mock_rpc = MagicMock()
        mock_rpc.rpc.return_value.execute.return_value.data = [
            {
                "id": 1, "tmdb_id": 1, "title": "Hot Fuzz", "overview": "...",
                "release_year": 2007, "similarity": 0.91,
            }
        ]
        mock_client.return_value = mock_rpc

        response = self._post(INPUTS)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["cached"])
        self.assertEqual(len(body["results"]), 1)

        mock_embed.assert_called_once()
        mock_client.assert_called_once()
        mock_cache_set.assert_called_once()

    @patch("movies.views.get_embedding")   # must NOT be called on a HIT
    @patch("movies.views.get_cached_results", return_value=RESULTS)
    def test_cache_hit_skips_embedding_and_supabase(self, mock_cache_get, mock_embed):
        """
        On a cache hit, the view returns immediately without calling any external APIs.

        :param mock_cache_get: Mock for get_cached_results()
        :param mock_embed: Mock for get_embedding()
        """
        response = self._post(INPUTS)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["cached"])
        self.assertEqual(body["results"], [serialize_movie(m) for m in RESULTS])

        mock_embed.assert_not_called()

    @patch("movies.views.set_cached_results")
    @patch("movies.views.get_cached_results", return_value=None)
    @patch("movies.views.get_client")
    @patch("movies.views.get_embedding", return_value=[[0.5] * 384, [0.5] * 384])
    def test_redis_down_still_returns_results(
        self, mock_embed, mock_client, mock_cache_get, mock_cache_set
    ):
        """
        Simulate Redis being down: set_cached_results is a silent no-op.
        The view should still return valid results (graceful fallback).

        :param mock_embed: Mock for get_embedding()
        :param mock_client: Mock for get_client()
        :param mock_cache_get: Mock for get_cached_results()
        :param mock_cache_set: Mock for set_cached_results()
        """
        mock_cache_set.side_effect = None   # silently does nothing

        mock_rpc = MagicMock()
        mock_rpc.rpc.return_value.execute.return_value.data = [
            {
                "id": 2, "tmdb_id": 2, "title": "Shaun of the Dead", "overview": "...",
                "release_year": 2004, "similarity": 0.88,
            }
        ]
        mock_client.return_value = mock_rpc

        response = self._post(INPUTS)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["title"], "Shaun of the Dead")

    @patch("movies.views.set_cached_results")
    @patch("movies.views.get_cached_results", return_value=None)
    @patch("movies.views.get_client")
    @patch("movies.views.get_embedding", return_value=[[0.1] * 384])
    def test_input_movie_is_filtered_from_results(
        self, mock_embed, mock_client, mock_cache_get, mock_cache_set
    ):
        """
        Input movies must be filtered out of the returned search results on a cache miss.
        """
        mock_rpc = MagicMock()
        mock_rpc.rpc.return_value.execute.return_value.data = [
            {
                "id": 10, "tmdb_id": 10, "title": "Input Movie", "overview": "...",
                "release_year": 2010, "similarity": 0.95,
            },
            {
                "id": 11, "tmdb_id": 11, "title": "Other Movie", "overview": "...",
                "release_year": 2011, "similarity": 0.90,
            }
        ]
        mock_client.return_value = mock_rpc

        # Pass "Input Movie" (ID 10) as one of the inputs
        inputs = [
            {"type": "movie", "id": 10, "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ]

        # Mock the Supabase movies table lookup for embedding retrieval
        mock_table = MagicMock()
        mock_table.select.return_value.in_.return_value.execute.return_value.data = [
            {"id": 10, "embedding": [0.1] * 384}
        ]
        mock_client.return_value.table.return_value = mock_table

        response = self._post(inputs)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["id"], 11)
        self.assertEqual(body["results"][0]["title"], "Other Movie")

    @patch("movies.views.get_embedding")
    @patch("movies.views.get_cached_results")
    def test_input_movie_is_filtered_from_cache_hits(self, mock_cache_get, mock_embed):
        """
        Input movies must be filtered out of results even on a cache hit.
        """
        mock_cache_get.return_value = [
            {
                "id": 10, "tmdb_id": 10, "title": "Input Movie", "overview": "...",
                "release_year": 2010, "similarity": 0.95,
            },
            {
                "id": 11, "tmdb_id": 11, "title": "Other Movie", "overview": "...",
                "release_year": 2011, "similarity": 0.90,
            }
        ]

        inputs = [
            {"type": "movie", "id": 10, "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ]

        response = self._post(inputs)

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["cached"])
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["id"], 11)
        self.assertEqual(body["results"][0]["title"], "Other Movie")

    @patch("movies.views.set_cached_results")
    @patch("movies.views.get_cached_results", return_value=None)
    @patch("movies.views.get_client")
    @patch("movies.views.get_embedding", return_value=[[0.1] * 384])
    def test_exclude_ids_is_filtered_from_results_on_cache_miss(
        self, mock_embed, mock_client, mock_cache_get, mock_cache_set
    ):
        """
        Movies listed in exclude_ids must be filtered out of results on a cache miss.
        """
        mock_rpc = MagicMock()
        mock_rpc.rpc.return_value.execute.return_value.data = [
            {
                "id": 10, "tmdb_id": 10, "title": "Excluded Movie", "overview": "...",
                "release_year": 2010, "similarity": 0.95,
            },
            {
                "id": 11, "tmdb_id": 11, "title": "Other Movie", "overview": "...",
                "release_year": 2011, "similarity": 0.90,
            }
        ]
        mock_client.return_value = mock_rpc

        inputs = [
            {"type": "movie", "id": 12, "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ]

        mock_table = MagicMock()
        mock_table.select.return_value.in_.return_value.execute.return_value.data = [
            {"id": 12, "embedding": [0.1] * 384}
        ]
        mock_client.return_value.table.return_value = mock_table

        # Send request with exclude_ids = [10]
        response = self.client.post(
            "/api/search/",
            data=json.dumps({"inputs": inputs, "exclude_ids": [10]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["id"], 11)
        self.assertEqual(body["results"][0]["title"], "Other Movie")

    @patch("movies.views.get_embedding")
    @patch("movies.views.get_cached_results")
    def test_exclude_ids_is_filtered_from_results_on_cache_hit(self, mock_cache_get, mock_embed):
        """
        Movies listed in exclude_ids must be dynamically filtered out of results even on a cache hit.
        """
        mock_cache_get.return_value = [
            {
                "id": 10, "tmdb_id": 10, "title": "Excluded Movie", "overview": "...",
                "release_year": 2010, "similarity": 0.95,
            },
            {
                "id": 11, "tmdb_id": 11, "title": "Other Movie", "overview": "...",
                "release_year": 2011, "similarity": 0.90,
            }
        ]

        inputs = [
            {"type": "movie", "id": 12, "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ]

        # Send request with exclude_ids = [10]
        response = self.client.post(
            "/api/search/",
            data=json.dumps({"inputs": inputs, "exclude_ids": [10]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["cached"])
        self.assertEqual(len(body["results"]), 1)
        self.assertEqual(body["results"][0]["id"], 11)
        self.assertEqual(body["results"][0]["title"], "Other Movie")

    def test_invalid_exclude_ids_returns_400(self):
        """
        If exclude_ids is not a list of integers, return a 400 error.
        """
        inputs = [
            {"type": "movie", "id": 12, "weight": 1},
            {"type": "element", "word": "comedy", "weight": 1}
        ]

        response = self.client.post(
            "/api/search/",
            data=json.dumps({"inputs": inputs, "exclude_ids": ["invalid"]}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        body = response.json()
        self.assertEqual(body["error"], "exclude_ids must be a list of integers.")
