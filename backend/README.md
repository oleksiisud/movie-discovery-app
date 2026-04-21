# CineMixer - Backend

A Django REST API backend for CineMixer. This service handles movie search using vector embeddings, Redis caching, and Supabase for data persistence.

## 📋 Table of Contents

- [📋 Prerequisites](#-prerequisites)   
- [🔧 Installation](#-installation)
- [▶️ Running the Server](#️-running-the-server)
- [📁 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
- [🗄️ Database](#️-database)
- [⚡ Redis Cache](#-redis-cache)
- [🛠️ Technologies Used](#️-technologies-used)
- [💻 Development](#-development)
- [🧪 Testing](#-testing)
- [🔧 Troubleshooting](#-troubleshooting)
- [📚 Additional Resources](#-additional-resources)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.8+** - [Download here](https://www.python.org/downloads/)
- **pip** - Python package manager (comes with Python)
- **Redis** - for local caching ([Download here](https://redis.io/downloads/) or use Docker)
- **Supabase account** - for the movie database ([supabase.com](https://supabase.com))
- **HuggingFace account** - for the embedding API ([huggingface.co](https://huggingface.co))
- **Git**

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd movie-discovery-app/backend
```

### 2. Create a Virtual Environment

**Windows (PowerShell):**
```bash
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```bash
python -m venv venv
venv\Scripts\activate.bat
```

**Unix/macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Environment Setup

Create a `.env` file in the backend directory:

```bash
# Linux/macOS
touch .env

# Windows PowerShell
New-Item -Path ".env" -ItemType "file"
```

Add the following configuration:

```env
# HuggingFace - sentence-transformer embedding API
HF_TOKEN=your-huggingface-token

# TMDB - movie metadata
TMDB_API_KEY=your-tmdb-api-key

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-key

# Django Settings
DEBUG=True
SECRET_KEY=your-django-secret-key
ALLOWED_HOSTS=localhost,127.0.0.1

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:4200,http://localhost:3000

# Redis Settings
REDIS_URL=redis://localhost:6379/0
```

## ▶️ Running the Server

### 1. Apply Database Migrations

```bash
python manage.py migrate
```

### 2. Create a Superuser (Optional)

```bash
python manage.py createsuperuser
```

Follow the prompts to create an admin account.

### 3. Start Redis

If you're not using Docker, start a local Redis instance:

```bash
redis-server
```

### 4. Start the Development Server

```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000`.

**View Django Admin:**
- URL: `http://localhost:8000/admin`
- Login with the superuser credentials you created

### 5. Verify Installation

Test the API with a simple request:

```bash
curl http://localhost:8000/api/search/
```

Or visit `http://localhost:8000/api/` in your browser to see the API root.

## 📁 Project Structure

```
backend/
├── app/                      # Django project configuration
│   ├── settings.py           # Settings (CORS, Redis cache, Supabase, etc.)
│   ├── urls.py               # Root URL routing
│   ├── wsgi.py               # WSGI application
│   ├── asgi.py               # ASGI application
│   └── __init__.py
├── movies/                   # Movies Django app
│   ├── views.py              # /api/search/ view - handles word-combinator search
│   ├── urls.py               # App-level routing
│   ├── embeddings.py         # Vector embedding generation via HuggingFace API
│   ├── supabase_client.py    # Supabase connection helper
│   ├── models.py             # Django models (SQLite for admin, Supabase for movies)
│   ├── apps.py
│   └── __init__.py
├── manage.py                 # Django management script
├── requirements.txt          # Python dependencies
├── Procfile                  # Gunicorn command (production / Heroku)
├── Dockerfile                # Production Docker image
└── db.sqlite3                # SQLite database (local dev / admin only)
```

## 🔌 API Endpoints

### Movies API

**Base URL:** `http://localhost:8000/api/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/search/` | Returns top 10 movies semantically closest to the combined input words |

### `POST /api/search/`

**Request body:**
```json
{
  "inputs": ["heist", "comedy", "europe"]
}
```

**Response:**
```json
{
  "results": [
    {
      "id": 42,
      "tmdb_id": 12345,
      "title": "Ocean's Twelve",
      "overview": "...",
      "release_year": 2004,
      "similarity": 0.87
    }
  ]
}
```

- `inputs` must be an array of 2–5 strings.
- Results are ordered by cosine similarity (descending).
- Responses are cached in Redis to reduce redundant HuggingFace API calls.

## 🗄️ Database

### Local Development (SQLite)

By default, Django uses SQLite (`db.sqlite3`) for the admin interface and migrations.

### Production (Supabase / PostgreSQL)

Movie data lives in Supabase. The `movies/supabase_client.py` module handles the connection:

```python
from movies.supabase_client import get_supabase_client

client = get_supabase_client()
rows = client.table("movies").select("*").execute()
```

### Populating Movie Data

Use the injection script in the `dev/` folder:

```bash
# From the project root
python dev/movie_inject.py
```

### Reset Local Database

```bash
del db.sqlite3           # Windows
rm db.sqlite3            # Unix/macOS
python manage.py migrate
```

## ⚡ Redis Cache

Search results are cached by the combined input key to avoid redundant embedding API calls.

**Configuration** (in `app/settings.py`):
```python
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    }
}
```

Redis runs automatically when using Docker Compose. For manual dev, start it separately with `redis-server`.

## 🛠️ Technologies Used

| Technology | Purpose |
|-----------|---------|
| Django | Web framework |
| Django REST Framework | RESTful API layer |
| django-cors-headers | CORS support for frontend |
| django-redis | Redis cache backend |
| redis / redis[hiredis] | High-performance Redis client |
| Supabase Python SDK | Movie database access |
| requests | HuggingFace embedding API calls |
| numpy | Cosine similarity computation |
| python-dotenv | `.env` variable loading |
| gunicorn | Production WSGI server |
| regex | Text pre-processing |

## 💻 Development

### Creating a New Endpoint

1. Define a model in `movies/models.py` (if needed)
2. Create a serializer in `movies/serializers.py`
3. Create a viewset in `movies/views.py`
4. Register the route in `movies/urls.py`

Example:
```python
# movies/views.py
from rest_framework import viewsets
from .models import Movie
from .serializers import MovieSerializer

class MovieViewSet(viewsets.ModelViewSet):
    queryset = Movie.objects.all()
    serializer_class = MovieSerializer
```

### Using Vector Embeddings

The `embeddings.py` module provides functionality for generating and working with movie embeddings:

```python
from movies.embeddings import generate_embedding

embedding = generate_embedding("user input")
```

### Supabase Integration

The `supabase_client.py` module handles Supabase connections:

```python
from movies.supabase_client import get_supabase_client

client = get_supabase_client()
result = client.table("movies").select("*").limit(10).execute()
print(result.data)
```

### Adding Dependencies

To add a new Python package:

```bash
pip install package-name
pip freeze > requirements.txt
```

Then commit the updated `requirements.txt`.

## 🧪 Testing

### Run All Tests

```bash
python manage.py test
```

### Run Specific App Tests

```bash
python manage.py test movies
```

### Run with Coverage

```bash
pip install coverage
coverage run --source='.' manage.py test
coverage report
coverage html   # Open htmlcov/index.html in a browser
```

## 🔧 Troubleshooting

### Port Already in Use

If port 8000 is already in use:

```bash
python manage.py runserver 8001
```

### Redis Connection Refused

Ensure Redis is running:
```bash
redis-server          # start locally
redis-cli ping        # should return PONG
```

Or use Docker Compose which starts Redis automatically.

### Database Errors

Clear and reset the SQLite database:

```bash
del db.sqlite3        # Windows
rm db.sqlite3         # Unix/macOS

python manage.py migrate
```

### Import Errors

Ensure the virtual environment is activated:

```bash
# Check activation
which python  # Unix/macOS (should show venv path)
where python  # Windows (should show venv path)

# If not, reactivate
.\venv\Scripts\Activate.ps1  # Windows
source venv/bin/activate     # Unix/macOS
```

### Module Not Found

Reinstall dependencies:

```bash
pip install -r requirements.txt
```

### CORS Errors from Frontend

- Ensure `CORS_ALLOWED_ORIGINS` in `.env` includes `http://localhost:4200`.
- Restart the Django server after changing `.env`.

## 📚 Additional Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Supabase Python Docs](https://supabase.com/docs/reference/python/introduction)
- [HuggingFace Inference API](https://huggingface.co/docs/api-inference/index)
- [django-redis](https://github.com/jazzband/django-redis)
- [django-cors-headers](https://github.com/adamchainz/django-cors-headers)
- [Gunicorn](https://gunicorn.org/)
- [Heroku] (https://devcenter.heroku.com/categories/reference)
- [Docker](https://docs.docker.com/get-started/overview/)
- [Supabase](https://supabase.com/docs/guides/getting-started/quickstarts/python)
- [HuggingFace](https://huggingface.co/docs/api-inference/index)
- [Redis](https://redis.io/documentation/)

