import { Component, inject, OnInit, ChangeDetectorRef, HostListener } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SupabaseService, WatchlistEntry, WatchStatus } from '../core/services/supabase.service';
import { environment } from '../../environments/environment';

// Emotion definitions (display layer only — names must match Supabase rows)
export interface Emotion {
  name: string;
  emoji: string;
  label: string;
}

export const EMOTIONS: Emotion[] = [
  { name: 'happy', emoji: '/emoji/01happy.png', label: 'Happy' },
  { name: 'sad', emoji: '/emoji/02sad.png', label: 'Sad' },
  { name: 'angry', emoji: '/emoji/03angry.png', label: 'Angry' },
  { name: 'anxious', emoji: '/emoji/04anxious.png', label: 'Anxious' },
  { name: 'bored', emoji: '/emoji/05bored.png', label: 'Bored' },
  { name: 'excited', emoji: '/emoji/06excited.png', label: 'Excited' },
  { name: 'playful', emoji: '/emoji/07playful.png', label: 'Playful' },
  { name: 'lost', emoji: '/emoji/08lost.png', label: 'Lost' },
  { name: 'reflective', emoji: '/emoji/09reflective.png', label: 'Reflective' },
  { name: 'brave', emoji: '/emoji/10brave.png', label: 'Brave' },
  { name: 'scared', emoji: '/emoji/11scared.png', label: 'Scared' },
  { name: 'hopeful', emoji: '/emoji/12hopeful.png', label: 'Hopeful' },
  { name: 'nostalgic', emoji: '/emoji/13nostalgic.png', label: 'Nostalgic' },
  { name: 'curious', emoji: '/emoji/14curious.png', label: 'Curious' },
  { name: 'frustrated', emoji: '/emoji/15frustrated.png', label: 'Frustrated' },
  { name: 'romantic', emoji: '/emoji/16romantic.png', label: 'Romantic' },
  { name: 'lonely', emoji: '/emoji/17lonely.png', label: 'Lonely' },
  { name: 'depressed', emoji: '/emoji/18depressed.png', label: 'Depressed' },
  { name: 'jealous', emoji: '/emoji/19jealous.png', label: 'Jealous' },
  { name: 'overwhelmed', emoji: '/emoji/20overwhelmed.png', label: 'Overwhelmed' },
];

export interface MovieResult {
  id: number;
  tmdb_id: number;
  title: string;
  overview: string;
  release_year: number;
  similarity: number;
  poster_path?: string | null;
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
  openMenuId: number | null = null;

  // Mood modal state
  readonly emotions = EMOTIONS;
  modalStep: 'closed' | 'pick' | 'result' = 'closed';
  selectedEmotion: Emotion | null = null;
  recommendation: MovieResult | null = null;
  recommendScope: 'watchlist' | 'all' | 'none' = 'none';
  recommendLoading = false;
  recommendError = '';
  seenRecommendationIds: number[] = [];

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
      this.openMenuId = null; // Close menu after action
    } catch (err: any) {
      console.error('Toggle error:', err);
    }
    this.cdr.markForCheck();
  }

  async remove(entry: WatchlistEntry): Promise<void> {
    try {
      await this.supabase.removeFromWatchlist(entry.movie_id);
      this.entries = this.entries.filter(e => e.id !== entry.id);
      this.openMenuId = null; // Close menu after action
    } catch (err: any) {
      console.error('Remove error:', err);
    }
  }

  toggleMenu(entryId: number, event: Event): void {
    event.stopPropagation();
    this.openMenuId = this.openMenuId === entryId ? null : entryId;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (this.openMenuId) {
      this.openMenuId = null;
    }
  }

  getGenresList(entry: WatchlistEntry): string {
    return entry.movies?.movie_genres?.map(mg => mg.genres.name).join(', ') ?? '';
  }

  formatRuntime(minutes: number | null | undefined): string {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Mood modal
  openMoodPicker(): void {
    this.selectedEmotion = null;
    this.recommendation = null;
    this.recommendError = '';
    this.recommendScope = 'none';
    this.seenRecommendationIds = [];
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
    this.seenRecommendationIds = [];
    const movieIds = this.entries.map(e => e.movie_id);
    await this.fetchRecommendation(this.selectedEmotion.name, movieIds.length ? movieIds : undefined);
  }

  // Re-run the recommendation scoped to the watchlist
  async recommendAnother(): Promise<void> {
    if (!this.selectedEmotion) return;
    if (this.recommendation) {
      this.seenRecommendationIds.push(this.recommendation.id);
    }
    const movieIds = this.entries.map(e => e.movie_id);
    await this.fetchRecommendation(this.selectedEmotion.name, movieIds.length ? movieIds : undefined, this.seenRecommendationIds);
  }

  // Re-run the recommendation across all movies ignoring watchlist
  async recommendFromAll(): Promise<void> {
    if (!this.selectedEmotion) return;
    if (this.recommendation) {
      this.seenRecommendationIds.push(this.recommendation.id);
    }
    await this.fetchRecommendation(this.selectedEmotion.name, undefined, this.seenRecommendationIds);
  }

  private async fetchRecommendation(emotion: string, movieIds?: number[], excludeIds?: number[]): Promise<void> {
    this.recommendLoading = true;
    this.recommendError = '';
    this.recommendation = null;
    this.recommendScope = 'none';
    this.modalStep = 'result';

    const body: { emotion: string; movie_ids?: number[]; exclude_ids?: number[] } = { emotion };
    if (movieIds?.length) body.movie_ids = movieIds;
    if (excludeIds?.length) body.exclude_ids = excludeIds;

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
