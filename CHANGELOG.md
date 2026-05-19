# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] - 2026-05-19

### Added

- Info modal to display instructions for the graph.

### Changed

- Moved graph to a dedicated folder in the frontend.
- Improved search algorthm for better results.

## [0.7.0] - 2026-05-19

### Added

- Algorithmic numpy backround removal to sprite API.

### Removed

- Heavy transparent background library from backend.

## [0.6.0] - 2026-05-11

### Added

- Settings page for managing profile, display name, avatar, and password.
- Google OAuth integration for account linking.
- Password reset via email.
- Enhanced search with weighted element and movie inputs.
- Context menu for graph nodes with watchlist quick actions.
- Pixel sprite generation for search elements.

### Changed

- Redesigned account page with watchlist and saved content display.
- Improved cache performance with better hit tracking.
- Updated login page with password recovery option.
- Enhanced avatar display throughout the app.
- Better movie data display with posters and ratings.

## [0.5.0] - 2026-05-19

### Added

- Advanced search filters (genres, year/runtime ranges, original language) and sorting.
- Mood-based recommendations from the watchlist with scoped/all modes.
- Genre browsing via a dedicated genres fetch.

### Removed

- Appwrite integration.

## [0.3.0] - 2026-04-18

### Added

- User authentication using Supabase Auth.
- Watchlist functionality using Supabase.
- Account management page.
- Navbar with navigation links.

## [0.1.0] - 2026-03-24

### Added

- Caching for movie search results, improving performance on repeated queries.
- Dockerfile for production deployment.
- Procfile for production deployment.

### Changed

- Added validation for search input to ensure query quality.
- Enhanced configuration flexibility via environment variables.

## [0.0.2] - 03-02-26

### Added

- Movie injection script into the database.
- Set up the base django backend.
- Set up /api/search API.

### Changed

- Moved MVP prototypes to dev folder.
- Updated gitignore contents.
- Updated the base page frontend to combinator search UI.


## [0.0.1] - 02-18-26

### Added

- Four MVP prototypes.
- Base Angular frontend setup.