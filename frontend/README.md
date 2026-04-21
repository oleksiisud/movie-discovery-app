# CineMixer - Frontend

An Angular 21 web application for CineMixer featuring responsive design, Supabase-backed watchlist, and Supabase authentication.

## 📋 Table of Contents

- [📋 Prerequisites](#-prerequisites)
- [🔧 Installation](#-installation)
- [▶️ Running the Application](#️-running-the-application)
- [📁 Project Structure](#-project-structure)
- [📝 Available Scripts](#-available-scripts)
- [🛠️ Technologies Used](#️-technologies-used)
- [💻 Development](#-development)
- [🧪 Testing](#-testing)
- [🔧 Troubleshooting](#-troubleshooting)
- [📚 Additional Resources](#-additional-resources)

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **npm 11.2.0+** - comes with Node.js
- **Angular CLI 21.1.4+** - installed automatically via npm scripts
- **Git** - [Download here](https://git-scm.com/downloads)
- **Supabase project** - for watchlist data and authentication ([supabase.com](https://supabase.com))

**Verify Installation:**
```bash
node --version   # 18+
npm --version    # 11+
```

## 🔧 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd movie-discovery-app/frontend
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- Angular 21
- Supabase JS 2.x
- RxJS, TypeScript, Express, and associated tooling

### 3. Environment Setup

The frontend uses environment configuration files. Check existing environment files:

```bash
# Development
cat src/environments/environment.ts

# Production
cat src/environments/environment.prod.ts
```

Required `.env` keys (at the project root):
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
```

## ▶️ Running the Application

### Development Server

Start the development server with hot reload:

```bash
npm start
```

The application will usually be available at `http://localhost:4200`

### Access the Application

- **Main App:** `http://localhost:4200`
- **API Backend:** `http://localhost:8000` (ensure it's running)

### Stop the Server

Press `Ctrl + C` in the terminal.

## 📁 Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── search/                   # Word-combinator search page
│   │   │   ├── search.component.ts   # API calls + watchlist toggling
│   │   │   ├── search.component.html
│   │   │   └── search.component.css
│   │   ├── watchlist/                # Watchlist page (auth-guarded)
│   │   │   ├── watchlist.component.ts
│   │   │   ├── watchlist.component.html
│   │   │   └── watchlist.component.css
│   │   ├── account/                  # Login / register / profile
│   │   │   ├── account.component.ts
│   │   │   ├── account.component.html
│   │   │   └── account.component.css
│   │   ├── navbar/                   # Global navigation bar
│   │   │   ├── navbar.component.ts
│   │   │   ├── navbar.component.html
│   │   │   └── navbar.component.css
│   │   ├── core/
│   │   │   ├── auth.guard.ts         # Route guard - redirects to /account if not logged in
│   │   │   ├── supabase.service.ts   # Watchlist CRUD + session management
│   │   │   └── services/
│   │   │       └── config.service.ts # Runtime environment config (API_URL, etc.)
│   │   ├── app.routes.ts             # Route definitions
│   │   ├── app.config.ts             # App-level providers (HttpClient, Router, etc.)
│   │   ├── app.ts                    # Root component
│   │   └── app.html                  # Root template
│   ├── environments/
│   │   ├── environment.ts            # Dev environment
│   │   ├── environment.prod.ts       # Prod environment
│   │   └── environment.template.ts   # Template environment
│   ├── main.ts                       # Browser bootstrap
│   ├── appwrite.ts                   # AppWrite client initialisation
│   ├── styles.css                    # Global stylesheet
│   └── index.html                    # Main HTML shell
├── public/                           # Static assets (favicon, etc.)
├── set-env.ts                        # Script: reads .env → generates environment files
├── Dockerfile                        # Multi-stage production image
├── netlify.toml                      # Netlify deployment config
├── angular.json                      # Angular CLI configuration
├── tsconfig.json                     # TypeScript base config
├── tsconfig.app.json                 # App TypeScript config
├── tsconfig.spec.json                # Test TypeScript config
├── package.json                      # Dependencies & npm scripts
└── README.md                         # This file
```

## 📝 Available Scripts

### Development

```bash
# Start dev server with hot reload
npm start

# Build for development
npm run build

# Watch for changes during development
npm run watch
```

### Production

```bash
# Build for production
npm run build
```

### Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm test -- --code-coverage

# Test a specific file
npm test -- --include='**/search.component.spec.ts'
```

### Utilities

```bash
# Run Angular CLI commands
npm run ng -- [command]

# Examples:
npm run ng -- generate component components/my-component
npm run ng -- generate service services/my-service
```

## 🛠️ Technologies Used

| Technology | Version | Purpose |
|-----------|---------|---------|
| Angular | 21.1.0 | Frontend framework |
| TypeScript | 5.9.2 | Language |
| Angular Router | 21.1.0 | Client-side navigation |
| Angular Forms | 21.1.0 | Reactive & template-driven forms |
| Angular SSR | 21.1.4 | Server-side rendering |
| Supabase JS | 2.x | Watchlist database client |
| RxJS | 7.8.0 | Reactive streams |

## 💻 Development

### Application Routes

| Path | Component | Guard |
|------|-----------|-------|
| `/` | `SearchComponent` | None |
| `/account` | `AccountComponent` | None |
| `/watchlist` | `WatchlistComponent` | `authGuard` |
| `/**` | Redirects to `/` | - |

### Search Feature

The `SearchComponent` accepts 2–5 descriptive words/phrases. On search:

1. Words are sent as `POST /api/search/` to the Django backend.
2. The backend generates a combined sentence embedding and queries Supabase for the top 10 most similar movies.
3. Results are displayed as cards with **Want to Watch** / **Watched** action buttons.
4. If the user is not authenticated, clicking a watchlist button redirects to `/account`.

### Watchlist Feature

`SupabaseService` (`core/supabase.service.ts`) exposes:

```typescript
// Add or update a movie's watch status
upsertWatchlist(movieId: number, status: 'want_to_watch' | 'watched')

// Remove a movie from the watchlist
removeFromWatchlist(movieId: number)

// Returns a { [movieId]: WatchStatus } map for the current user
getWatchlistMap(): Promise<Record<number, WatchStatus>>

// Observable of the current Supabase session
session$: Observable<Session | null>
```

### Supabase Authentication

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

// Initialize Supabase
export const supabase: SupabaseClient = createClient(
  environment.supabaseUrl,
  environment.supabaseKey
);
```

### Adding a New Component

```bash
npm run ng -- generate component components/my-component
```

### Adding a New Service

```bash
npm run ng -- generate service services/my-service
```

### Backend API Integration

Use Angular's `HttpClient`:

```typescript
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

this.http.post<{ results: Movie[] }>(`${environment.apiUrl}/api/search/`, {
  inputs: ['heist', 'comedy', 'europe'],
}).subscribe(res => console.log(res.results));
```

## 🧪 Testing

### Run Unit Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm test -- --code-coverage
```

Coverage report is generated in `coverage/` directory.

### Test a Specific Component

```bash
npm test -- --include='**/search.component.spec.ts'
```

## 🔧 Troubleshooting

### Port 4200 Already in Use

```bash
npm start -- --port 4201
```

Or kill the existing process:

```bash
# Windows
netstat -ano | findstr :4200
taskkill /PID <PID> /F

# Unix/macOS
lsof -i :4200
kill -9 <PID>
```

### Dependencies Not Installed

```bash
# Remove cache and reinstall
rm -rf node_modules package-lock.json   # Unix/macOS
rd /s /q node_modules & del package-lock.json   # Windows
npm install
```

### Compilation Errors

1. Check TypeScript types:
```bash
npm run ng -- build --aot
```

2. Ensure backend is running:
```bash
curl http://localhost:8000/api/
```

3. Clear Angular cache:
```bash
rm -rf .angular
npm start
```

### CORS Errors from API

- Ensure backend has CORS enabled
- Add frontend origin to `CORS_ALLOWED_ORIGINS` in backend `.env`
- Restart backend server

### Hot Reload Not Working

```bash
# Stop the server
# Clear cache
rm -rf .angular
# Restart
npm start
```

## 📚 Additional Resources

- [Angular Documentation](https://angular.dev/docs)
- [Angular CLI Reference](https://angular.dev/cli)
- [Supabase JS Reference](https://supabase.com/docs/reference/javascript/introduction)
- [RxJS Documentation](https://rxjs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Netlify Documentation](https://docs.netlify.com/)
