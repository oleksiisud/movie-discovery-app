import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';

// enum for watch status
export type WatchStatus = 'saved' | 'watched';

export interface WatchlistMovie {
  id: number;
  title: string;
  overview: string;
  release_year: number;
  tmdb_id: number;
}

export interface WatchlistEntry {
  id: number;
  movie_id: number;
  status: WatchStatus;
  created_at: string;
  movies: WatchlistMovie | null;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly platformId = inject(PLATFORM_ID);
  private client!: SupabaseClient;

  private _session$ = new BehaviorSubject<Session | null | undefined>(undefined);
  readonly session$ = this._session$.asObservable();

  readonly sessionReady: Promise<Session | null>;

  get currentUser(): User | null {
    return this._session$.value ? this._session$.value.user : null;
  }

  constructor() {
    if (!isPlatformBrowser(this.platformId) || !environment.supabaseUrl || !environment.supabaseAnonKey) {
      this._session$.next(null);
      this.sessionReady = Promise.resolve(null);
      return;
    }

    this.client = createClient(environment.supabaseUrl, environment.supabaseAnonKey);

    this.sessionReady = this.client.auth.getSession().then(({ data }) => {
      this._session$.next(data.session);
      return data.session;
    });

    this.client.auth.onAuthStateChange((_event, session) => {
      this._session$.next(session);
    });
  }

  // Auth

  async signInWithEmail(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signUpWithEmail(email: string, password: string) {
    return this.client.auth.signUp({ email, password });
  }

  async signOut() {
    return this.client.auth.signOut();
  }

  // Watchlist

  async getWatchlist(): Promise<WatchlistEntry[]> {
    if (!this.client || !this.currentUser) return [];
    const { data, error } = await this.client
      .from('watchlist')
      .select('id, movie_id, status, created_at, movies(id, title, overview, release_year, tmdb_id)')
      .eq('user_id', this.currentUser.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const entries = (data ?? []).map((row: any) => ({
      ...row,
      movies: Array.isArray(row.movies) ? row.movies[0] ?? null : row.movies,
    }));

    return entries as WatchlistEntry[];
  }

  async getWatchlistMap(): Promise<Record<number, WatchStatus>> {
    if (!this.client || !this.currentUser) return {};
    const { data, error } = await this.client
      .from('watchlist')
      .select('movie_id, status')
      .eq('user_id', this.currentUser.id);
    if (error) throw error;
    const map: Record<number, WatchStatus> = {};
    (data ?? []).forEach((item: { movie_id: number; status: WatchStatus }) => {
      map[item.movie_id] = item.status;
    });
    return map;
  }

  async upsertWatchlist(movieId: number, status: WatchStatus): Promise<void> {
    if (!this.client || !this.currentUser) return;
    const { error } = await this.client
      .from('watchlist')
      .upsert(
        { user_id: this.currentUser.id, movie_id: movieId, status },
        { onConflict: 'user_id,movie_id' }
      );
    if (error) throw error;
  }

  async removeFromWatchlist(movieId: number): Promise<void> {
    if (!this.client || !this.currentUser) return;
    const { error } = await this.client
      .from('watchlist')
      .delete()
      .eq('user_id', this.currentUser.id)
      .eq('movie_id', movieId);
    if (error) throw error;
  }
}
