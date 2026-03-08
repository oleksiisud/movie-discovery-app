# CineMixer

A full-stack web application for discovering and picking movies to watch. This project combines a Django REST API backend with an Angular frontend, powered by Supabase for data management and AppWrite for authentication.

## 📋 Table of Contents

- [🎬 Project Overview](#-project-overview)
- [🛠️ Technology Stack](#️-technology-stack)
- [📁 Project Structure](#-project-structure)
- [🚀 Quick Start](#-quick-start)
- [💻 Development](#-development)
- [🔧 Environment Configuration](#-environment-configuration)
- [📦 Building for Production](#-contributing)
- [🧪 Testing](#-testing)
- [📝 License](#-license)
- [🤝 Contributing](#-contributing)
- [📞 Support](#-support)

## 🎬 Project Overview

CineMixer is a modern web application that helps users discover, search, and pick movies. It features:

- Advanced movie search and filtering capabilities
- User authentication and profile management
- Movie recommendations based on user preferences
- Responsive design for desktop and mobile devices
- Server-side rendering for improved performance and SEO

## 🛠️ Technology Stack

### Backend
- **Framework**: Django 6.0.2 + Django REST Framework
- **Database**: PostgreSQL (via Supabase)
- **Language**: Python 3.x
- **Additional Libraries**:
  - `django-cors-headers` - CORS support
  - `requests` - HTTP library
  - `supabase` - Supabase Python client
  - `python-dotenv` - Environment variable management

### Frontend
- **Framework**: Angular 21.1.0
- **Language**: TypeScript 5.9.2
- **Build Tool**: Angular CLI
- **Runtime**: Node.js with Express (for SSR)
- **Backend Services**: AppWrite (authentication)
- **Package Manager**: npm 11.2.0

### Infrastructure
- **Database**: Supabase (PostgreSQL)
- **Authentication**: AppWrite
- **Deployment**: AppWrite

## 📁 Project Structure

```
movie-discovery-app/
├── backend/                # Django REST API backend
│   ├── app/                # Main Django application
│   ├── movies/             # Movies app with views and embeddings for word combinator search
│   ├── manage.py           # Django management script
│   ├── requirements.txt    # Python dependencies
│   └── db.sqlite3          # Local SQLite database
├── frontend/               # Angular web application
│   ├── src/                # TypeScript/Angular source code
│   ├── public/             # Static assets
│   ├── package.json        # Node dependencies
│   └── angular.json        # Angular configuration
├── dev/                    # Development utilities and notebooks
│   ├── app.ipynb           # Jupyter notebook for development
│   ├── app1-4.py           # MVP Prototypes of the word combinator search and emotion recommendation search
│   └── movie_inject.py     # Movie data injection scripts
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites

- Python 3.8+ (for backend)
- Node.js 18+ (for frontend)
- npm 11.2.0 or higher
- Git

### Installation & Running

For detailed instructions, see:
- [Backend Setup Guide](./backend/README.md)
- [Frontend Setup Guide](./frontend/README.md)

**Quick Backend Setup:**
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate  # Windows
source venv/bin/activate # Unix/macOS
pip install -r requirements.txt
python manage.py runserver
```

**Quick Frontend Setup:**
```bash
cd frontend
npm install
npm start
```

The frontend will be available at `http://localhost:4200` and the backend API at `http://localhost:8000`.

## 💻 Development

### Backend Development

The backend is a Django REST API that serves movie data and handles authentication. Key features:

- RESTful API endpoints for movie fetching
- Vector embeddings for movie recommendations
- Supabase integration for data persistence
- CORS support for frontend communication

See [Backend README](./backend/README.md) for detailed development instructions.

### Frontend Development

The frontend is an Angular single-page application with server-side rendering support. Key features:

- Component-based architecture
- Reactive forms for user input
- AppWrite integration for authentication
- Responsive design with modern CSS

See [Frontend README](./frontend/README.md) for detailed development instructions.

### Development Tools

The `dev/` folder contains utility scripts for development:
- `movie_inject.py` - Script for injecting movie data
- `app.ipynb` - Development and experimentation notebook
- Python MVPs of various stages and improvements of the search feature

## 🔧 Environment Configuration

Create a `.env` file in the root:

```
HF_TOKEN = <your huggingface token>

TMDB_API_KEY = <your TMDB API key>

APPWRITE_PROJECT_ID = <your AppWrite project id>
APPWRITE_API_ENDPOINT = <your AppWrite endpoint url>

SUPABASE_URL = <your Supabase project url>
SUPABASE_KEY = <your Supabase project key>
```

## 📦 Building for Production

### Backend
```bash
cd backend
# Update settings.py for production
# Configure environment variables
# Run migrations
python manage.py migrate
# Collect static files
python manage.py collectstatic
# Deploy using your preferred method
```

### Frontend
```bash
cd frontend
# Build for production
npm run build
# Serve with SSR
npm run serve:ssr:movie-discovery-app
```

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