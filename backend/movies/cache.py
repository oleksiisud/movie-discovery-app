import hashlib
import logging
import json
from django.core.cache import cache
from django.conf import settings

logger = logging.getLogger(__name__)

# Prefix so the key space is clear when inspecting Redis directly
_KEY_PREFIX = "movie_search"


def make_cache_key(inputs: list, filters: dict | None = None) -> str:
    """
    Build a deterministic cache key from query inputs and optional filters.

    :param inputs: List of query input dicts
    :param filters: Optional dict of active filters (genre_ids, language, etc.)
    :return: Cache key string
    """

    input_strs = []
    for i in inputs:
        typ = i.get("type")
        weight = i.get("weight", 1)
        if typ == "element":
            word = i.get("word", "").lower().strip()
            input_strs.append(f"element:{word}:{weight}")
        elif typ == "movie":
            input_strs.append(f"movie:{i.get('id')}:{weight}")
            
    normalized = ",".join(sorted(input_strs))

    # Stable JSON representation of structural filters for hashing.
    filter_str = ""
    if filters:
        clean = {}
        for k, v in sorted(filters.items()):
            if v is not None and k != "sort_by":
                if isinstance(v, (list, tuple, set)):
                    clean[k] = sorted(list(set(v)))
                else:
                    clean[k] = v
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

def get_and_increment_hit_count(key: str) -> int:
    """
    Increment and return the hit count for a cache key.
    """
    counter_key = f"{key}_counter"
    val = cache.get(counter_key)
    if val is None:
        val = 0
    val += 1
    ttl = getattr(settings, "CACHE_TTL", 3600)
    cache.set(counter_key, val, timeout=ttl)
    return val

def reset_hit_count(key: str) -> None:
    """
    Reset the hit count for a cache key.
    """
    counter_key = f"{key}_counter"
    ttl = getattr(settings, "CACHE_TTL", 3600)
    cache.set(counter_key, 0, timeout=ttl)
