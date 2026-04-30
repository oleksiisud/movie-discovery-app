import hashlib
import logging
import json
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)

# Prefix so the key space is clear when inspecting Redis directly
_KEY_PREFIX = "movie_search"


def make_cache_key(inputs: list[str], filters: dict | None = None) -> str:
    """
    Build a deterministic cache key from query inputs and optional filters.

    :param inputs: List of query inputs
    :param filters: Optional dict of active filters (genre_ids, language, etc.)
    :return: Cache key string
    """

    normalized = ",".join(sorted(s.lower().strip() for s in inputs))

    # Stable JSON representation of structural filters for hashing.
    filter_str = ""
    if filters:
        clean = {
            k: v for k, v in sorted(filters.items())
            if v is not None and k != "sort_by"
        }
        if clean:
            filter_str = json.dumps(clean, sort_keys=True)

    raw = f"{normalized}|{filter_str}"
    digest = hashlib.sha1(raw.encode()).hexdigest()  # noqa: S324 — not crypto
    return f"{_KEY_PREFIX}:{digest}"


def get_cached_results(key: str) -> list | None:
    """
    Return cached results or None on a miss / Redis error.
    
    :param key: Cache key
    :return: Cached results or None
    """
    value = cache.get(key)
    if value is not None:
        logger.debug("Cache HIT  key=%s", key)
    else:
        logger.debug("Cache MISS key=%s", key)
    return value


def set_cached_results(key: str, data: list, ttl: int | None = None) -> None:
    """
    Store results in Redis with the configured TTL.
    
    :param key: Cache key
    :param data: Data to store
    :param ttl: Time to live in seconds
    """
    if ttl is None:
        ttl = getattr(settings, "CACHE_TTL", 3600)
    cache.set(key, data, timeout=ttl)
    logger.debug("Cache SET  key=%s ttl=%ss len=%d", key, ttl, len(data))
