import {
  Component,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  inject,
  OnInit,
  OnDestroy,
  NgZone,
  AfterViewInit,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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

interface DotParticle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  radius: number;
  opacity: number;
  speed: number;
}

const EMOJIS = [
  '🎬', '🎭', '🌑', '🌃', '🦇', '🔭', '🤖', '⚔️', '🧩', '🌊', '🔥', '❄️', '🌙',
  '🎪', '🕵️', '🦁', '🌀', '💀', '🌺', '🎯', '🚀', '🧪', '👁️', '🎸', '🧿', '🪐',
];

// Component

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css'],
  host: { ngSkipHydration: 'true' },
})
export class SearchComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('wordInput') wordInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('bgCanvas') bgCanvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasArea') canvasAreaRef!: ElementRef<HTMLDivElement>;

  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly supabase = inject(SupabaseService);
  private readonly router = inject(Router);

  // State
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
    this.cards = [...this.cards, card];
    this.cdr.detectChanges(); // Force immediate render

    // Auto-join nearest cluster after render settles
    setTimeout(() => {
      this.zone.run(() => {
        this.tryAutoJoinCluster(card);
        this.cdr.detectChanges();
      });
    }, 60);

    setTimeout(() => inputEl?.focus(), 0);
  }

  spawnFromHistory(label: string): void {
    const area = this.canvasAreaRef?.nativeElement;
    const areaH = area?.clientHeight ?? window.innerHeight - 200;
    const areaW = area?.clientWidth ?? window.innerWidth;

    const card: WordCard = {
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      label,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      x: 80 + Math.random() * (areaW - 280),
      y: 80 + Math.random() * (areaH - 200),
      clusterId: null,
      isDragging: false,
      width: 160,
      height: 62,
    };

    this.cards = [...this.cards, card];
    this.tryAutoJoinCluster(card);
    this.cdr.detectChanges();
  }

  clearHistory(): void {
    this.history = [];
  }

  // Drag Logic

  startDrag(event: MouseEvent, card: WordCard): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragCard = card;
    this.dragOffsetX = event.clientX - card.x;
    this.dragOffsetY = event.clientY - card.y;
    card.isDragging = true;

    // detach from cluster while dragging
    if (card.clusterId) {
      this.removeCardFromCluster(card);
    }
  }

  private onGlobalMouseUp(): void {
    if (!this.dragCard) return;
    this.zone.run(() => {
      this.dragCard!.isDragging = false;
      this.tryProximityCluster(this.dragCard!);
      this.dragCard = null;
      this.cdr.detectChanges();
    });
  }

  // Cluster Logic

  private cardCenter(c: WordCard) {
    return { cx: c.x + c.width / 2, cy: c.y + c.height / 2 };
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }

  private tryAutoJoinCluster(card: WordCard): void {
    const { cx, cy } = this.cardCenter(card);
    let nearest: { dist: number; cluster?: Cluster; card?: WordCard } = { dist: Infinity };

    for (const cluster of this.clusters) {
      const d = this.distance(cx, cy, cluster.x + 90, cluster.y + 31);
      if (d < nearest.dist) nearest = { dist: d, cluster };
    }
    for (const other of this.cards) {
      if (other.id === card.id || other.clusterId) continue;
      const { cx: ox, cy: oy } = this.cardCenter(other);
      const d = this.distance(cx, cy, ox, oy);
      if (d < nearest.dist) nearest = { dist: d, card: other };
    }

    if (nearest.dist < 200) {
      if (nearest.cluster) {
        this.addCardToCluster(card, nearest.cluster);
      } else if (nearest.card) {
        this.mergeIntoNewCluster(card, nearest.card);
      }
    }
  }

  private tryProximityCluster(card: WordCard): void {
    const SNAP = 120;
    const { cx, cy } = this.cardCenter(card);

    // check existing clusters
    for (const cluster of this.clusters) {
      const d = this.distance(cx, cy, cluster.x + 90, cluster.y + 31);
      if (d < SNAP) {
        this.addCardToCluster(card, cluster);
        return;
      }
    }

    // check lone cards
    for (const other of this.cards) {
      if (other.id === card.id || other.isDragging || other.clusterId) continue;
      const { cx: ox, cy: oy } = this.cardCenter(other);
      if (this.distance(cx, cy, ox, oy) < SNAP) {
        this.mergeIntoNewCluster(card, other);
        return;
      }
    }
  }

  private addCardToCluster(card: WordCard, cluster: Cluster): void {
    card.clusterId = cluster.id;
    if (!cluster.cardIds.includes(card.id)) cluster.cardIds = [...cluster.cardIds, card.id];
    this.recalcClusterPosition(cluster);
  }

  private mergeIntoNewCluster(a: WordCard, b: WordCard): void {
    const cluster: Cluster = {
      id: 'c_' + Date.now(),
      cardIds: [a.id, b.id],
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      loading: false,
      error: '',
      result: null,
    };
    a.clusterId = cluster.id;
    b.clusterId = cluster.id;
    this.clusters = [...this.clusters, cluster];
    this.recalcClusterPosition(cluster);
  }

  private recalcClusterPosition(cluster: Cluster): void {
    const clusterCards = this.cardsInCluster(cluster);
    if (!clusterCards.length) return;
    const avgX = clusterCards.reduce((s, c) => s + c.x, 0) / clusterCards.length;
    const avgY = clusterCards.reduce((s, c) => s + c.y, 0) / clusterCards.length;
    cluster.x = avgX - 90;
    cluster.y = avgY - 31;
  }

  private removeCardFromCluster(card: WordCard): void {
    const cluster = this.clusters.find(c => c.id === card.clusterId);
    if (!cluster) { card.clusterId = null; return; }
    cluster.cardIds = cluster.cardIds.filter(id => id !== card.id);
    card.clusterId = null;
    if (cluster.cardIds.length < 2) {
      // dissolve cluster
      this.cardsInCluster(cluster).forEach(c => c.clusterId = null);
      this.clusters = this.clusters.filter(c => c.id !== cluster.id);
    }
  }

  cardsInCluster(cluster: Cluster): WordCard[] {
    return this.cards.filter(c => cluster.cardIds.includes(c.id));
  }

  loneCards(): WordCard[] {
    return this.cards.filter(c => !c.clusterId);
  }

  // Generate Movie

  generateMovie(cluster: Cluster): void {
    if (cluster.cardIds.length < 2 || cluster.loading) return;
    const inputs = this.cardsInCluster(cluster).map(c => c.label);
    cluster.loading = true;
    cluster.error = '';
    cluster.result = null;

    this.http
      .post<{ results: MovieResult[] }>(`${environment.apiUrl}/api/search/`, { inputs })
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