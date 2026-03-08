# CineMixer - Backend

A Django REST API backend for the CineMixer. This service handles all movie data operations, user authentication integration, and vector embeddings for movie recommendations.

## 📋 Table of Contents

- [📋 Prerequisites](#-prerequisites)
- [🔧 Installation](#-installation)
- [▶️ Running the Server](#️-running-the-server)
- [📁 Project Structure](#-project-structure)
- [🔌 API Endpoints](#-api-endpoints)
- [🗄️ Database](#️-database)
- [🛠️ Technologies Used](#️-technologies-used)
- [💻 Development](#-development)
- [🧪 Testing](#-testing)
- [🔧 Troubleshooting](#-troubleshooting)
- [📚 Additional Resources](#-additional-resources)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Python 3.8+** - [Download here](https://www.python.org/downloads/)
- **pip** - Python package manager (comes with Python)
- **Git** - Version control
- **Supabase account** - For database (optional for local development)

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
# Django Settings
DEBUG=True
SECRET_KEY=your-secret-key-here
ALLOWED_HOSTS=localhost,127.0.0.1

# Supabase Configuration (if using)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_API_KEY=your-supabase-key
SUPABASE_SERVICE_KEY=your-service-key

# Database (optional, uses SQLite by default)
DATABASE_URL=sqlite:///db.sqlite3

# Cors Settings
CORS_ALLOWED_ORIGINS=http://localhost:4200,http://localhost:3000
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

### 3. Start the Development Server

```bash
python manage.py runserver
```

The API will be available at `http://localhost:8000`

**View Django Admin:**
- URL: `http://localhost:8000/admin`
- Login with the superuser credentials you created

### 4. Verify Installation

Test the API with a simple request:

```bash
curl http://localhost:8000/api/search/
```

Or visit `http://localhost:8000/api/` in your browser to see the API root.

## 📁 Project Structure

```
backend/
├── app/                    # Main Django project configuration
│   ├── settings.py        # Django settings
│   ├── urls.py            # Main URL routing
│   ├── wsgi.py            # WSGI application
│   ├── asgi.py            # ASGI application
│   └── __init__.py
├── movies/                # Movies Django app
│   ├── models.py          # Database models
│   ├── views.py           # API views and viewsets
│   ├── urls.py            # App-specific routing
│   ├── serializers.py     # DRF serializers (if exists)
│   ├── embeddings.py      # Vector embeddings logic
│   ├── supabase_client.py # Supabase integration
│   ├── apps.py
│   └── __init__.py
├── manage.py              # Django management command
├── requirements.txt       # Python dependencies
├── db.sqlite3             # SQLite database (local dev)
└── .env                   # Environment variables (create this)
```

## 🔌 API Endpoints

### Movies API

**Base URL:** `http://localhost:8000/api/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search/` | Return top 10 movies based on use input |

### Admin Interface

- **URL:** `http://localhost:8000/admin/`
- Manage movies, users, and application data through the Django admin panel

## 🗄️ Database

### Default Configuration (SQLite)

By default, the app uses SQLite for local development. Data is stored in `db.sqlite3`.

### Production Configuration (PostgreSQL/Supabase)

For production, configure PostgreSQL via Supabase:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Add credentials to `.env`
3. Update `settings.py` if needed to use PostgreSQL
4. Run migrations: `python manage.py migrate`

### Reset Database (Development Only)

```bash
# Delete the database file
rm db.sqlite3  # Unix/macOS
# or
del db.sqlite3  # Windows

# Recreate migrations and database
python manage.py migrate

# Create a new superuser if needed
python manage.py createsuperuser
```

## 🛠️ Technologies Used

| Technology | Version | Purpose |
|-----------|---------|---------|
| Django | 6.0.2 | Web framework |
| Django REST Framework | Latest | RESTful API |
| django-cors-headers | Latest | CORS support |
| Supabase | Latest | Database & Auth |
| requests | Latest | HTTP requests |
| python-dotenv | Latest | Environment config |

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
coverage html
```

## 🔧 Troubleshooting

### Port Already in Use

If port 8000 is already in use:

```bash
python manage.py runserver 8001
```

### Database Errors

Clear and reset the database:

```bash
# Remove old database
rm db.sqlite3  # Unix/macOS

# Create fresh database
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

## 📚 Additional Resources

- [Django Documentation](https://docs.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Supabase Documentation](https://supabase.com/docs)
- [Django CORS Headers](https://github.com/adamchainz/django-cors-headers)
