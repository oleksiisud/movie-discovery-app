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
import { environment } from '../../environments/environment';

// Models

interface WordCard {
  id: string;
  label: string;
  emoji: string;
  x: number;
  y: number;
  clusterId: string | null;
  isDragging: boolean;
  width: number;
  height: number;
}

interface Cluster {
  id: string;
  cardIds: string[];
  x: number;
  y: number;
  loading: boolean;
  error: string;
  result: MovieResult | null;
}

interface MovieResult {
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

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  // State
  currentInput = '';
  cards: WordCard[] = [];
  clusters: Cluster[] = [];
  history: string[] = [];

  historyOpen = false;
  showHistoryHint = true;

  private dragCard: WordCard | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private mouseX = 0;
  private mouseY = 0;

  // Particle bg
  private dots: DotParticle[] = [];
  private animFrame = 0;
  private ctx: CanvasRenderingContext2D | null = null;

  // Lifecycle

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.setupCanvas();
    this.zone.runOutsideAngular(() => this.animateCanvas());
    this.bindGlobalMouseMove();
  }

  ngOnDestroy(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  // Particle Canvas

  private setupCanvas(): void {
    const canvas = this.bgCanvasRef?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();
    this.spawnDots();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    const canvas = this.bgCanvasRef?.nativeElement;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    this.spawnDots();
  }

  private spawnDots(): void {
    const canvas = this.bgCanvasRef?.nativeElement;
    if (!canvas) return;
    const count = Math.floor((canvas.width * canvas.height) / 8000);
    this.dots = Array.from({ length: count }, () => {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      return {
        x, y, baseX: x, baseY: y,
        radius: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.25 + 0.05,
        speed: Math.random() * 0.3 + 0.1,
      };
    });
  }

  private animateCanvas(): void {
    const canvas = this.bgCanvasRef?.nativeElement;
    if (!canvas || !this.ctx) return;

    this.ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const dot of this.dots) {
      const dx = this.mouseX - dot.baseX;
      const dy = this.mouseY - dot.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = 180;
      const force = Math.max(0, (maxDist - dist) / maxDist);

      dot.x += (dot.baseX + dx * force * 0.06 - dot.x) * dot.speed * 0.12;
      dot.y += (dot.baseY + dy * force * 0.06 - dot.y) * dot.speed * 0.12;

      this.ctx.beginPath();
      this.ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(232,201,125,${dot.opacity})`;
      this.ctx.fill();
    }

    this.animFrame = requestAnimationFrame(() => this.animateCanvas());
  }

  private bindGlobalMouseMove(): void {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('mousemove', (e) => {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
        if (this.dragCard) {
          this.zone.run(() => {
            this.dragCard!.x = e.clientX - this.dragOffsetX;
            this.dragCard!.y = e.clientY - this.dragOffsetY;
          });
        }
      });
      window.addEventListener('mouseup', () => {
        if (this.dragCard) {
          this.zone.run(() => this.onGlobalMouseUp());
        }
      });
    });
  }

  // Add Word

  addWord(): void {
    // Always read from the native element — bypasses any ngModel/hydration issue
    const inputEl = this.wordInputRef?.nativeElement;
    const label = (inputEl?.value ?? this.currentInput).trim();
    if (!label) return;

    const area = this.canvasAreaRef?.nativeElement;
    const areaW = Math.max(area?.clientWidth ?? window.innerWidth, 400);
    const areaH = Math.max(area?.clientHeight ?? window.innerHeight - 200, 300);

    const x = 80 + Math.random() * Math.max(areaW - 280, 100);
    const y = 60 + Math.random() * Math.max(areaH - 160, 100);

    const card: WordCard = {
      id: 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      label,
      emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
      x, y,
      clusterId: null,
      isDragging: false,
      width: 160,
      height: 62,
    };

    if (!this.history.includes(label)) {
      this.history = [label, ...this.history];
    }

    // Clear both the native element and the model
    if (inputEl) inputEl.value = '';
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
          cluster.loading = false;
          cluster.result = res.results?.[0] ?? null;
          this.cdr.detectChanges();
        },
        error: (err) => {
          cluster.loading = false;
          cluster.error = err?.error?.error || 'Something went wrong.';
          this.cdr.detectChanges();
        },
      });
  }

  dismissResult(cluster: Cluster): void {
    cluster.result = null;
    cluster.error = '';
  }

  // History Drawer

  toggleHistory(): void {
    this.historyOpen = !this.historyOpen;
    this.showHistoryHint = false;
  }
}