# CineMixer - Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.1.4.

A modern Angular web application for the CineMixer. This frontend features server-side rendering (SSR), responsive design, and integration with AppWrite authentication.

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
- **npm 11.2.0+** - Comes with Node.js
- **Angular CLI 21.1.4+** - Will be installed via npm
- **Git** - Version control
- **AppWrite account** - For authentication (optional for local development)

**Verify Installation:**
```bash
node --version
npm --version
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

This will install all required packages including:
- Angular 21.1.0
- Angular CLI
- TypeScript
- AppWrite SDK
- RxJS and other utilities

### 3. Environment Setup

The frontend uses environment configuration files. Check existing environment files:

```bash
# Development
cat src/environments/environment.ts

# Production
cat src/environments/environment.prod.ts
```
## ▶️ Running the Application

### Development Server

Start the development server with hot reload:

```bash
npm start
```

The application will be available at `http://localhost:4200`

**Features:**
- Automatic browser reload on file changes
- Source maps for debugging
- Fast compilation

### Access the Application

- **Main App:** `http://localhost:4200`
- **API Backend:** `http://localhost:8000` (ensure it's running)

### Stop the Server

Press `Ctrl + C` in the terminal

## 📁 Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── app.ts                # Main component
│   │   ├── app.routes.ts         # Route definitions
│   │   ├── app.config.ts         # App configuration
│   │   ├── app.css               # Global styles
│   │   ├── search/
│   │   │   ├── search.component.ts      # Search component
│   │   │   ├── search.component.html    # Search template
│   │   │   └── search.component.css     # Search styles
│   │   └── ... (other components)
│   ├── environments/
│   │   ├── environment.ts               # Dev environment config
│   │   ├── environment.prod.ts          # Prod environment config
│   │   └── environment.template.ts      # Template environment config
│   ├── main.ts                   # Bootstrap application
│   ├── main.server.ts            # SSR bootstrap
│   ├── server.ts                 # Express server (SSR)
│   ├── appwrite.ts               # AppWrite initialization
│   ├── index.html                # Main HTML file
│   ├── styles.css                # Global styles
│   └── ... (other core files)
├── public/                        # Static assets
├── angular.json                   # Angular CLI config
├── tsconfig.json                  # TypeScript config
├── tsconfig.app.json              # App TypeScript config
├── tsconfig.spec.json             # Test TypeScript config
├── package.json                   # Dependencies
└── README.md                      # This file
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

# Build with optimization flags
npm run build -- --optimization --aot

# Serve with SSR in production
npm run serve:ssr:movie-discovery-app
```

### Testing

```bash
# Run unit tests
npm test

# Run tests with coverage
npm test -- --code-coverage

# Run end-to-end tests (if configured)
npm run e2e
```

### Utilities

```bash
# Run Angular CLI commands
npm run ng -- [command]

# Example: Generate new component
npm run ng -- generate component components/my-component
```

## 🛠️ Technologies Used

| Technology | Version | Purpose |
|-----------|---------|---------|
| Angular | 21.1.0 | Frontend framework |
| TypeScript | 5.9.2 | Language |
| Angular Router | 21.1.0 | Navigation |
| Angular Forms | 21.1.0 | Form handling |
| Angular SSR | 21.1.4 | Server-side rendering |
| AppWrite | 22.4.1 | Authentication |
| RxJS | 7.8.0 | Reactive programming |
| Express | 5.1.0 | Node.js server (SSR) |
| Node | 20.19.33+ | Runtime environment |

## 💻 Development

### Creating a New Component

```bash
npm run ng -- generate component components/my-component
```

This creates:
- Component class
- Template file
- Stylesheet
- Spec file for testing

### Creating a New Service

```bash
npm run ng -- generate service services/my-service
```

### Routing

Edit `src/app/app.routes.ts` to add new routes:

```typescript
export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'search', component: SearchComponent },
  { path: 'movie/:id', component: MovieDetailComponent },
];
```

### Integration with Backend API

Use Angular's `HttpClient` in services:

```typescript
import { HttpClient } from '@angular/common/http';

@Injectable()
export class MovieService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getMovies() {
    return this.http.get(`${this.apiUrl}/movies/`);
  }
}
```

### AppWrite Authentication

Initialize AppWrite in `src/appwrite.ts`:

```typescript
import { Client, Account } from 'appwrite';
import { environment } from './environments/environment';

const client = new Client()
  .setEndpoint(environment.appwriteEndpoint)
  .setProject(environment.appwriteProjectId);

export const account = new Account(client);
```

Use in components:

```typescript
import { account } from '../appwrite';

export class LoginComponent {
  login(email: string, password: string) {
    account.createEmailPasswordSession(email, password);
  }
}
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
# Clear node_modules and cache
rm -rf node_modules package-lock.json

# Reinstall
npm install
```

### Compilation Errors

1. Check TypeScript types:
   ```bash
   npm run ng -- build --aot
   ```

2. Ensure backend is running:
   ```bash
   # Check if backend API is accessible
   curl http://localhost:8000/api/
   ```

3. Clear Angular cache:
   ```bash
   rm -rf .angular
   npm start
   ```

### AppWrite Connection Issues

- Verify AppWrite endpoint in `.env`
- Check AppWrite project ID
- Ensure AppWrite instance is accessible
- Check browser console for CORS errors

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

- [Angular Documentation](https://angular.io/docs)
- [Angular CLI Guide](https://angular.io/cli)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [AppWrite Documentation](https://appwrite.io/docs)
- [RxJS Documentation](https://rxjs.dev/)
- [Angular SSR Guide](https://angular.io/guide/universal)

