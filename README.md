# CineMixer

A full-stack web application for discovering and picking movies to watch. Users enter a mix of descriptive words and CineMixer's vector-embedding search engine surfaces the most suitable films. Users with an account can save movies to a personal watchlist and mark them as watched, using watchlist's emotion recommendation system.

## 📋 Table of Contents

- [🎬 Project Overview](#-project-overview)
- [🛠️ Technology Stack](#️-technology-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Quick Start](#-quick-start)
- [🐳 Docker (Recommended)](#-docker-recommended)
- [💻 Manual Setup](#-manual-setup)
- [🔧 Environment Configuration](#-environment-configuration)
- [📦 Building for Production](#-building-for-production)
- [🧪 Testing](#-testing)
- [📝 License](#-license)
- [🤝 Contributing](#-contributing)
- [📞 Support](#-support)

## 🎬 Project Overview

CineMixer is a full-stack web application built for discovering movies using natural language processing. Key features include:

- **Word-combinator search** - enter 2–5 descriptive words/phrases; vector embeddings find the most semantically similar movies in the database.
- **Interactive Graph UI** - visual discovery of movies with an interactive graph, where similar movies form connections.
- **User authentication** - sign up, log in, and manage your account via Supabase Auth.
- **Watchlist & Settings** - save movies with a "Want to Watch" or "Watched" status, and manage profile settings.
- **Redis caching** - the Django backend caches search results to reduce redundant embedding lookups.
- **Docker Compose** - one command spins up Redis, Django, and Angular SSR together.

## 🛠️ Technology Stack

### Backend
| Layer | Technology |
|-------|------------|
| Framework | Django + Django REST Framework |
| Language | Python 3.x |
| Database | Supabase (PostgreSQL) |
| Cache | Redis 7 |
| Server | Gunicorn (production) |
| Embeddings | HuggingFace sentence-transformers (via API) |
| Key libraries | `django-cors-headers`, `requests`, `supabase`, `python-dotenv`, `numpy`, `regex` |
| Cloud App Platform | Heroku |

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | Angular 21.1.0 |
| Language | TypeScript 5.9.2 |
| Auth | Supabase Auth |
| Database client | Supabase JS 2.x |
| Build tool | Angular CLI 21.1.4 |
| Package manager | npm 11.2.0 |
| Cloud App Platform | Netlify |

### Infrastructure
| Service | Purpose |
|---------|---------|
| Supabase | PostgreSQL database + watchlist data + User authentication |
| Redis | Search result caching |
| Docker Compose | Local multi-service orchestration |

## 📁 Project Structure

```
movie-discovery-app/
├── backend/                  # Django REST API
│   ├── app/                  # Django project settings & URL routing
│   ├── movies/               # Movies app - search views, embeddings, Supabase client
│   ├── manage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── Procfile              # Gunicorn entry point
├── frontend/                 # Angular SSR web application
│   ├── src/
│   │   ├── app/
│   │   │   ├── search/       # Word-combinator search
│   │   │   ├── graph/        # Interactive movie discovery graph
│   │   │   ├── watchlist/    # Watchlist page (auth-guarded)
│   │   │   ├── account/      # Login / register / profile / settings
│   │   │   ├── navbar/       # Global navigation
│   │   │   ├── info/         # Persistent instruction modal
│   │   │   └── core/         # Auth guard, Supabase service, config service
│   │   ├── environments/     # environment.ts / environment.prod.ts
│   │   └── ...
│   ├── Dockerfile
│   ├── package.json
│   └── angular.json
├── dev/                      # Development utilities
│   ├── mvp.ipynb             # Jupyter notebook for dev/experimentation
│   ├── mvp1-6.py             # MVP prototypes of the word-combinator search
│   └── movie_inject.py       # Movie data injection script
├── docker-compose.yml        # Orchestrates Redis + Django + Angular SSR
├── .env                      # Root environment variables (gitignored)
└── README.md                 # This file
```

## 🚀 Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.8+ |
| Node.js | 18+ |
| npm | 11.2.0+ |
| Docker & Docker Compose | Latest (optional but recommended) |
| Git | Any |

You also need accounts / projects at:
- [Supabase](https://supabase.com) - for the database and watchlist table
- [HuggingFace](https://huggingface.co) - for the sentence-embedding API token
- [TMDB](https://www.themoviedb.org) - for movie metadata

## 🐳 Docker (Recommended)

The easiest way to run the full stack locally is with Docker Compose.

### 1. Create your `.env` file

```bash
cp .env.example .env   # then fill in all values - see Environment Configuration below
```

### 2. Build and start all services

```bash
docker compose up --build
```

This starts three containers:
- **redis** - Redis 7 cache on port `6379`
- **backend** - Django API on `http://localhost:8000`
- **frontend** - Angular SSR on `http://localhost:4200`

### 3. Stop services

```bash
docker compose down          # stop containers (database volume is preserved)
docker compose down -v       # also wipe the SQLite volume
```

## 💻 Manual Setup

### Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1   # Windows PowerShell
source venv/bin/activate       # Unix/macOS

# Install dependencies
pip install -r requirements.txt

# Apply database migrations
python manage.py migrate

# Start the development server
python manage.py runserver
```

Django API is usually available at `http://localhost:8000`.

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Generate environment files from .env
npm run env

# Start the development server (auto-runs npm run env first)
npm start
```

Angular app is usually available at `http://localhost:4200`.

For detailed setup guides, see:
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)

## 🔧 Environment Configuration

Create a `.env` file at the **project root**:

```env
# HuggingFace - sentence-transformer embedding API
HF_TOKEN=<your HuggingFace token>

# TMDB - movie metadata
TMDB_API_KEY=<your TMDB API key>

# Supabase - database & watchlist
SUPABASE_URL=<your Supabase project URL>
SUPABASE_KEY=<your Supabase anon/service key>

# Redis cache (defaults to localhost in dev; Docker sets this automatically)
REDIS_URL=redis://localhost:6379/0

# Django (backend only)
DEBUG=True
SECRET_KEY=<your Django secret key>
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:4200
```

## 📦 Building for Production

### Backend

```bash
cd backend
python manage.py migrate
python manage.py collectstatic
gunicorn app.wsgi:application --bind 0.0.0.0:8000
```

### Frontend

```bash
cd frontend
npm run build
```

Or use Docker Compose for a production-like environment - both Dockerfiles are production-ready.

## 🧪 Testing

### Backend

```bash
cd backend
python manage.py test
```

### Frontend

```bash
cd frontend
npm test
```

## 📝 License

This project is licensed under the MIT licence. Terms specified in the [LICENSE](./LICENSE) file.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues, questions, or suggestions, please open an issue on the GitHub repository.