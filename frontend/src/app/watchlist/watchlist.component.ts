import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService, WatchlistEntry, WatchStatus } from '../core/supabase.service';

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

  activeTab: 'saved' | 'watched' = 'saved';
  entries: WatchlistEntry[] = [];
  loading = true;
  error = '';

  get savedEntries(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'saved');
  }

  get watchedEntries(): WatchlistEntry[] {
    return this.entries.filter(e => e.status === 'watched');
  }

  get activeEntries(): WatchlistEntry[] {
    return this.activeTab === 'saved' ? this.savedEntries : this.watchedEntries;
  }

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
      // Update locally to avoid a full reload
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
}
