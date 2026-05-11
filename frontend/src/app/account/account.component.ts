import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService, WatchlistEntry } from '../core/services/supabase.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './account.component.html',
  styleUrl: './account.component.css',
})
export class AccountComponent implements OnInit {
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly session$ = this.supabase.session$;

  entries: WatchlistEntry[] = [];
  loading = true;
  seenExpanded = false;

  get savedMovies(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'saved');
  }

  get seenMovies(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'watched');
  }

  get seenMoviesPreview(): WatchlistEntry[] {
    return this.seenExpanded ? this.seenMovies : this.seenMovies.slice(0, 6);
  }

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.entries = await this.supabase.getWatchlist();
    } catch (err) {
      console.error('Failed to load account data:', err);
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }

  getUserDisplayName(): string {
    return this.supabase.currentUser?.user_metadata?.['display_name'] ?? this.supabase.currentUser?.email ?? '';
  }

  getAvatarUrl(): string | null {
    const path = this.supabase.currentUser?.user_metadata?.['avatar_url'];
    return path ? this.supabase.getPublicUrl(path) : null;
  }

  getUserInitials(): string {
    const displayName = this.getUserDisplayName();
    if (displayName && !displayName.includes('@')) {
      return displayName.slice(0, 2).toUpperCase();
    }
    const email = this.supabase.currentUser?.email ?? '';
    if (!email) return '?';
    return email.slice(0, 2).toUpperCase();
  }
}
