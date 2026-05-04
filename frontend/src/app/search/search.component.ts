import { Component, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { SupabaseService, WatchStatus, Genre } from '../core/services/supabase.service';

export interface FilterState {
  genreIds: number[];
  language: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  runtimeMin: number | null;
  runtimeMax: number | null;
  sortBy: 'similarity' | 'popularity' | 'vote_average';
}

interface Movie {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string;
  release_year: number;
  popularity: number | null;
  vote_average: number | null;
  runtime: number | null;
  original_language: string | null;
  similarity: number;
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'es', label: 'Spanish' },
  { code: 'it', label: 'Italian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },
];

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css'],
})
export class SearchComponent {
  @ViewChild('wordInput') wordInputRef!: ElementRef<HTMLInputElement>;

  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // Search inputs
  inputs: string[] = [];
  currentInput = '';
  results: Movie[] = [];
  loading = false;
  error = '';
  watchlistMap: Record<number, WatchStatus> = {};

  // Filter panel
  filtersOpen = false;
  genres: Genre[] = [];
  languages = LANGUAGES;

  filters: FilterState = {
    genreIds: [],
    language: null,
    yearFrom: null,
    yearTo: null,
    runtimeMin: null,
    runtimeMax: null,
    sortBy: 'similarity',
  };

  constructor() {
    this.supabase.getGenres().then(genres => {
      this.genres = genres;
      this.cdr.markForCheck();
    });

    // Reload watchlist map whenever auth state changes
    this.supabase.session$.pipe(takeUntilDestroyed()).subscribe(session => {
      if (session) {
        this.loadWatchlistMap();
      } else {
        this.watchlistMap = {};
        this.cdr.markForCheck();
      }
    });
  }

  private async loadWatchlistMap(): Promise<void> {
    try {
      this.watchlistMap = await this.supabase.getWatchlistMap();
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to load watchlist map:', err);
    }
  }

  addInput(): void {
    const trimmed = this.currentInput.trim();
    if (!trimmed || this.inputs.length >= 5) return;
    this.inputs.push(trimmed);
    this.currentInput = '';
    setTimeout(() => this.wordInputRef?.nativeElement.focus(), 0);
  }

  removeInput(index: number): void {
    this.inputs.splice(index, 1);
  }

  toggleFilters(): void {
    this.filtersOpen = !this.filtersOpen;
  }

  toggleGenre(id: number): void {
    const idx = this.filters.genreIds.indexOf(id);
    if (idx === -1) {
      this.filters.genreIds = [...this.filters.genreIds, id];
    } else {
      this.filters.genreIds = this.filters.genreIds.filter(g => g !== id);
    }
  }

  isGenreSelected(id: number): boolean {
    return this.filters.genreIds.includes(id);
  }

  get activeFilterCount(): number {
    let count = 0;
    if (this.filters.genreIds.length > 0) count++;
    if (this.filters.language) count++;
    if (this.filters.yearFrom || this.filters.yearTo) count++;
    if (this.filters.runtimeMin || this.filters.runtimeMax) count++;
    if (this.filters.sortBy !== 'similarity') count++;
    return count;
  }

  clearFilters(): void {
    this.filters = {
      genreIds: [],
      language: null,
      yearFrom: null,
      yearTo: null,
      runtimeMin: null,
      runtimeMax: null,
      sortBy: 'similarity',
    };
  }

  // Build the filter body for the API request, omitting null/empty values
  private buildFilterPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      sort_by: this.filters.sortBy,
    };

    if (this.filters.genreIds.length > 0) {
      payload['genre_ids'] = this.filters.genreIds;
    }
    if (this.filters.language) {
      payload['language'] = this.filters.language;
    }
    if (this.filters.yearFrom != null) {
      payload['year_from'] = this.filters.yearFrom;
    }
    if (this.filters.yearTo != null) {
      payload['year_to'] = this.filters.yearTo;
    }
    if (this.filters.runtimeMin != null) {
      payload['runtime_min'] = this.filters.runtimeMin;
    }
    if (this.filters.runtimeMax != null) {
      payload['runtime_max'] = this.filters.runtimeMax;
    }

    return payload;
  }

  search(): void {
    if (this.inputs.length < 2) return;

    this.loading = true;
    this.error = '';
    this.results = [];

    this.http
      .post<{ results: Movie[] }>(`${environment.apiUrl}/api/search/`, {
        inputs: this.inputs,
        ...this.buildFilterPayload(),
      })
      .subscribe({
        next: (res) => {
          this.results = res.results;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = err?.error?.error || 'Something went wrong. Please try again.';
          this.loading = false;
        },
      });
  }

  async toggleWatchlist(movie: Movie, status: WatchStatus): Promise<void> {
    if (!this.supabase.currentUser) {
      this.router.navigate(['/account']);
      return;
    }

    try {
      if (this.watchlistMap[movie.id] === status) {
        // Clicking the active status removes it
        await this.supabase.removeFromWatchlist(movie.id);
        const updated = { ...this.watchlistMap };
        delete updated[movie.id];
        this.watchlistMap = updated;
      } else {
        await this.supabase.upsertWatchlist(movie.id, status);
        this.watchlistMap = { ...this.watchlistMap, [movie.id]: status };
      }
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Watchlist error:', err);
    }
  }

  formatRuntime(minutes: number | null): string {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}