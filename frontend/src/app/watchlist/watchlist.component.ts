import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService, WatchlistEntry, WatchStatus } from '../core/supabase.service';
import { environment } from '../../environments/environment';

// Emotion definitions (display layer only — names must match Supabase rows)
export interface Emotion {
  name: string;
  emoji: string;
  label: string;
}

export const EMOTIONS: Emotion[] = [
  { name: 'happy', emoji: '😄', label: 'Happy' },
  { name: 'sad', emoji: '😢', label: 'Sad' },
  { name: 'angry', emoji: '😡', label: 'Angry' },
  { name: 'anxious', emoji: '😰', label: 'Anxious' },
  { name: 'bored', emoji: '😑', label: 'Bored' },
  { name: 'excited', emoji: '🤩', label: 'Excited' },
  { name: 'playful', emoji: '🎭', label: 'Playful' },
  { name: 'lost', emoji: '🤷', label: 'Lost' },
  { name: 'reflective', emoji: '🤔', label: 'Reflective' },
  { name: 'brave', emoji: '🦁', label: 'Brave' },
  { name: 'scared', emoji: '😱', label: 'Scared' },
  { name: 'hopeful', emoji: '🌱', label: 'Hopeful' },
  { name: 'nostalgic', emoji: '🌅', label: 'Nostalgic' },
  { name: 'curious', emoji: '🔍', label: 'Curious' },
  { name: 'frustrated', emoji: '😤', label: 'Frustrated' },
  { name: 'romantic', emoji: '💕', label: 'Romantic' },
  { name: 'lonely', emoji: '🚶🏻', label: 'Lonely' },
  { name: 'depressed', emoji: '😔', label: 'Depressed' },
  { name: 'jealous', emoji: '😒', label: 'Jealous' },
  { name: 'overwhelmed', emoji: '😵', label: 'Overwhelmed' },
];

export interface MovieResult {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string;
  release_year: number;
  similarity: number;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './watchlist.component.html',
  styleUrls: ['./watchlist.component.css'],
})
export class WatchlistComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly http = inject(HttpClient);

  // Watchlist state
  activeTab: 'saved' | 'watched' = 'saved';
  entries: WatchlistEntry[] = [];
  loading = true;
  error = '';

  // Mood modal state
  readonly emotions = EMOTIONS;
  modalStep: 'closed' | 'pick' | 'result' = 'closed';
  selectedEmotion: Emotion | null = null;
  recommendation: MovieResult | null = null;
  recommendScope: 'watchlist' | 'all' | 'none' = 'none';
  recommendLoading = false;
  recommendError = '';

  // Watchlist getters
  get savedEntries(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'saved');
  }

  get watchedEntries(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'watched');
  }

  get activeEntries(): WatchlistEntry[] {
    return this.activeTab === 'saved' ? this.savedEntries : this.watchedEntries;
  }

  // Lifecycle
  async ngOnInit(): Promise<void> {
    await this.loadWatchlist();
  }

  async loadWatchlist(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.entries = await this.supabase.getWatchlist();
    } catch (err: any) {
      this.error = err?.message ?? 'Failed to load watchlist.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async toggleStatus(entry: WatchlistEntry): Promise<void> {
    const newStatus: WatchStatus = entry.status === 'saved' ? 'watched' : 'saved';
    try {
      await this.supabase.upsertWatchlist(entry.movie_id, newStatus);
      const idx = this.entries.findIndex(e => e.id === entry.id);
      if (idx !== -1) {
        this.entries[idx] = { ...this.entries[idx], status: newStatus };
        this.entries = [...this.entries];
      }
    } catch (err: any) {
      console.error('Toggle error:', err);
    }
  }

  async remove(entry: WatchlistEntry): Promise<void> {
    try {
      await this.supabase.removeFromWatchlist(entry.movie_id);
      this.entries = this.entries.filter(e => e.id !== entry.id);
    } catch (err: any) {
      console.error('Remove error:', err);
    }
  }

  // Mood modal
  openMoodPicker(): void {
    this.selectedEmotion = null;
    this.recommendation = null;
    this.recommendError = '';
    this.recommendScope = 'none';
    this.modalStep = 'pick';
  }

  closeModal(): void {
    this.modalStep = 'closed';
  }

  selectEmotion(emotion: Emotion): void {
    this.selectedEmotion = emotion;
  }

  // Called when user confirms their emotion on the pick step
  async confirmEmotion(): Promise<void> {
    if (!this.selectedEmotion) return;
    const movieIds = this.entries.map(e => e.movie_id);
    await this.fetchRecommendation(this.selectedEmotion.name, movieIds.length ? movieIds : undefined);
  }

  // Re-run the recommendation scoped to the watchlist
  async recommendAnother(): Promise<void> {
    if (!this.selectedEmotion) return;
    const movieIds = this.entries.map(e => e.movie_id);
    await this.fetchRecommendation(this.selectedEmotion.name, movieIds.length ? movieIds : undefined);
  }

  // Re-run the recommendation across all movies ignoring watchlist
  async recommendFromAll(): Promise<void> {
    if (!this.selectedEmotion) return;
    await this.fetchRecommendation(this.selectedEmotion.name, undefined);
  }

  private async fetchRecommendation(emotion: string, movieIds?: number[]): Promise<void> {
    this.recommendLoading = true;
    this.recommendError = '';
    this.recommendation = null;
    this.recommendScope = 'none';
    this.modalStep = 'result';

    const body: { emotion: string; movie_ids?: number[] } = { emotion };
    if (movieIds?.length) body.movie_ids = movieIds;

    try {
      const res = await firstValueFrom(
        this.http.post<{ result: MovieResult | null; scope: 'watchlist' | 'all' | 'none' }>(
          `${environment.apiUrl}/api/recommend/`,
          body,
        )
      );
      this.recommendation = res.result;
      this.recommendScope = res.scope ?? 'none';
      if (!this.recommendation) {
        this.recommendError = 'No matching movie found. Try a different mood!';
      }
    } catch (err: any) {
      this.recommendError = err?.error?.error ?? 'Something went wrong. Please try again.';
    } finally {
      this.recommendLoading = false;
      this.cdr.markForCheck();
    }
  }
}
