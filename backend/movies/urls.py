from django.urls import path
from .views import search
from .config import get_supabase_config

urlpatterns = [
    path("search/", search, name="movie-search"),
    path("config/supabase/", get_supabase_config, name="supabase-config"),
]