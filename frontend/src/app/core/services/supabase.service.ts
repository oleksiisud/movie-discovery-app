import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';
import { BehaviorSubject, filter, firstValueFrom } from 'rxjs';
import { ConfigService } from './config.service';

// enum for watch status
export type WatchStatus = 'saved' | 'watched';

export interface Genre {
  id: number;
  name: string;
}

export interface WatchlistMovie {
  id: number;
  title: string;
  overview: string;
  release_year: number;
  tmdb_id: number;
  poster_path: string | null;
  vote_average: number | null;
  popularity: number | null;
  runtime: number | null;
  movie_genres?: {
    genres: Genre;
  }[];
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
  private readonly configService = inject(ConfigService);
  private client!: SupabaseClient;

  private _session$ = new BehaviorSubject<Session | null | undefined>(undefined);
  readonly session$ = this._session$.asObservable();

  readonly sessionReady: Promise<Session | null>;

  get currentUser(): User | null {
    return this._session$.value ? this._session$.value.user : null;
  }

  constructor() {
    this.sessionReady = this.initializeClient();
  }

  private async initializeClient(): Promise<Session | null> {
    if (!isPlatformBrowser(this.platformId)) {
      this._session$.next(null);
      return null;
    }

    try {
      const config = this.configService.getSupabaseConfig();
      if (!config || !config.supabaseUrl || !config.supabaseAnonKey) {
        console.error('Supabase config not loaded');
        this._session$.next(null);
        return null;
      }

      this.client = createClient(config.supabaseUrl, config.supabaseAnonKey);

      const { data } = await this.client.auth.getSession();
      this._session$.next(data.session);

      this.client.auth.onAuthStateChange((_event, session) => {
        this._session$.next(session);
      });

      return data.session;
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
      this._session$.next(null);
      return null;
    }
  }

  // Auth

  async signInWithEmail(email: string, password: string) {
    return this.client.auth.signInWithPassword({ email, password });
  }

  async signUpWithEmail(email: string, password: string) {
    return this.client.auth.signUp({ email, password });
  }

  async resetPassword(email: string) {
    return this.client.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    });
  }

  async signInWithGoogle() {
    return this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
  }

  async signOut() {
    return this.client.auth.signOut();
  }

  async updateUser(data: { password?: string; data?: any }) {
    return this.client.auth.updateUser(data);
  }

  // Watchlist

  async getWatchlist(): Promise<WatchlistEntry[]> {
    if (!this.client || !this.currentUser) return [];
    const { data, error } = await this.client
      .from('watchlist')
      .select(`
        id,
        movie_id,
        status,
        created_at,
        movies!watchlist_movie_id_fkey (
          id,
          title,
          overview,
          release_year,
          tmdb_id,
          poster_path,
          vote_average,
          popularity,
          runtime,
          movie_genres (
            genres (
              id,
              name
            )
          )
        )
      `)
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

  // Genres

  async getGenres(): Promise<Genre[]> {
    if (!this.client) return [];
    const { data, error } = await this.client
      .from('genres')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) {
      console.error('Failed to load genres:', error);
      return [];
    }
    return (data ?? []) as Genre[];
  }

  // Profiles & Storage

  async uploadAvatar(file: File): Promise<string> {
    if (!this.client || !this.currentUser) throw new Error('Not authenticated');

    const fileExt = file.name.split('.').pop();
    const fileName = `${this.currentUser.id}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await this.client.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    return filePath;
  }

  getPublicUrl(path: string): string {
    if (!this.client) return '';
    const { data } = this.client.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }

  async isDisplayNameUnique(displayName: string): Promise<boolean> {
    if (!this.client) return true;

    // Attempt to query profiles table. If it fails (e.g. doesn't exist), we fallback to true
    // but log the error for development awareness.
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('display_name')
        .eq('display_name', displayName)
        .maybeSingle();

      if (error) {
        console.warn('Profiles table check failed:', error.message);
        return true;
      }

      return !data;
    } catch (e) {
      return true;
    }
  }
}
