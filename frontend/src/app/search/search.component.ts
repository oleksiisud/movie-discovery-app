import { Component, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';
import { SupabaseService, WatchStatus } from '../core/supabase.service';

interface Movie {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string;
  release_year: number;
  similarity: number;
}

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

  inputs: string[] = [];
  currentInput = '';
  results: Movie[] = [];
  loading = false;
  error = '';
  watchlistMap: Record<number, WatchStatus> = {};

  constructor() {
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

  search(): void {
    if (this.inputs.length < 2) return;

    this.loading = true;
    this.error = '';
    this.results = [];

    this.http
      .post<{ results: Movie[] }>(`${environment.apiUrl}/api/search/`, {
        inputs: this.inputs,
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
}