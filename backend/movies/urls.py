from django.urls import path
from .views import search, recommend, generate_pixel_sprite
from .config import get_supabase_config

urlpatterns = [
    path("search/", search, name="movie-search"),
    path("recommend/", recommend, name="movie-recommend"),
    path("config/supabase/", get_supabase_config, name="supabase-config"),
    path("sprite/", generate_pixel_sprite, name="generate_sprite"),
]