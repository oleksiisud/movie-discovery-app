import { Component, ElementRef, OnInit, ViewChild, NgZone, HostListener, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { SupabaseService, Genre, WatchStatus } from '../core/services/supabase.service';
import * as d3 from 'd3';

export interface FilterState {
    genreIds: number[];
    language: string | null;
    yearFrom: number;
    yearTo: number;
    runtimeMin: number;
    runtimeMax: number;
    sortBy: 'similarity' | 'popularity' | 'vote_average';
}

export interface Movie {
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
    poster_path: string | null;
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

interface WebNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    type: 'element' | 'hub' | 'movie'; // Hub is the mix button
    stationId?: string; // Which hub this element belongs to
    movieData?: Movie;
    isLoading?: boolean;
}

interface WebLink extends d3.SimulationLinkDatum<WebNode> {
    id: string;
    type: 'loose' | 'spoke' | 'ring';
    source: string | WebNode;
    target: string | WebNode;
    n?: number; // Stores the number of nodes in the cluster to calculate perfect ring geometry
}

@Component({
    selector: 'app-graph',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './graph.component.html',
    styleUrl: './graph.component.css',
})
export class GraphComponent implements OnInit {
    @ViewChild('svgContainer', { static: true }) svgContainer!: ElementRef;
    @ViewChild('searchInput') searchInput!: ElementRef;

    private readonly http = inject(HttpClient);
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly supabase = inject(SupabaseService);
    private readonly router = inject(Router);

    inputOpen = false;
    filtersOpen = false;
    currentInput = '';
    isLoading = false;
    isMenuVisible = false;
    menuTop = 0;
    menuLeft = 0;
    selectedNode: WebNode | null = null;
    watchlistMap: Record<number, WatchStatus> = {};

    filters: FilterState = {
        genreIds: [],
        language: null,
        yearFrom: 1888,
        yearTo: 2030,
        runtimeMin: 0,
        runtimeMax: 300,
        sortBy: 'similarity',
    };
    genres: Genre[] = [];
    languages = LANGUAGES;

    nodes: WebNode[] = [];
    links: WebLink[] = [];

    private nodeMap = new Map<string, WebNode>();
    private simulation!: d3.Simulation<WebNode, WebLink>;
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private linkGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeElements!: d3.Selection<SVGGElement, WebNode, SVGGElement, unknown>;
    private linkElements!: d3.Selection<SVGLineElement, WebLink, SVGGElement, unknown>;
    private potentialLinkGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private activeDragNode: WebNode | null = null;

    // Performance Caches
    private viewWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    private viewHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;
    private hubCache = new Map<string, { sumX: number, sumY: number, count: number }>();

    constructor(private ngZone: NgZone) {
        this.supabase.getGenres().then(genres => {
            this.genres = genres;
            this.cdr.markForCheck();
        });

        this.supabase.session$.subscribe(session => {
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

    @HostListener('window:resize')
    onResize() {
        this.viewWidth = window.innerWidth;
        this.viewHeight = window.innerHeight;
    }

    ngOnInit() {
        this.ngZone.runOutsideAngular(() => {
            this.initGraph();
        });
    }

    openDropdown: string | null = null;

    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.custom-dropdown')) {
            this.openDropdown = null;
        }
        if (this.isMenuVisible) {
            this.closeMenu();
        }
    }

    toggleDropdown(dropdownName: string, event: Event) {
        event.stopPropagation();
        this.openDropdown = this.openDropdown === dropdownName ? null : dropdownName;
    }

    selectSort(value: 'similarity' | 'popularity' | 'vote_average') {
        this.filters.sortBy = value;
        this.openDropdown = null;
    }

    selectLanguage(value: string | null) {
        this.filters.language = value;
        this.openDropdown = null;
    }

    getLanguageLabel(code: string | null): string {
        if (!code) return 'Any';
        const lang = this.languages.find(l => l.code === code);
        return lang ? lang.label : 'Any';
    }

    constrainYearFrom(val: number): number {
        val = Number(val);
        if (val > this.filters.yearTo) return this.filters.yearTo;
        return val;
    }

    constrainYearTo(val: number): number {
        val = Number(val);
        if (val < this.filters.yearFrom) return this.filters.yearFrom;
        return val;
    }

    constrainRuntimeMin(val: number): number {
        val = Number(val);
        if (val > this.filters.runtimeMax) return this.filters.runtimeMax;
        return val;
    }

    constrainRuntimeMax(val: number): number {
        val = Number(val);
        if (val < this.filters.runtimeMin) return this.filters.runtimeMin;
        return val;
    }

    toggleInput() {
        if (!this.inputOpen) {
            this.inputOpen = true;
            setTimeout(() => {
                this.searchInput.nativeElement.focus();
            });
        } else if (this.currentInput.trim().length === 0) {
            this.inputOpen = false;
        } else {
            this.addNodeFromInput();
        }
    }

    toggleFilters() {
        this.filtersOpen = !this.filtersOpen;
    }

    addNodeFromInput() {
        const value = this.currentInput.trim().toLowerCase();
        if (!value) return;


        const node: WebNode = {
            id: this.generateId(),
            name: value,
            type: 'element',
            x: this.viewWidth / 2 + (Math.random() - 0.5) * 200,
            y: this.viewHeight / 2 + (Math.random() - 0.5) * 200,
            vx: 0,
            vy: 0
        };

        this.nodes.push(node);
        this.currentInput = '';
        this.updateGraph();
    }

    onMenuAction(action: string): void {
        if (!this.selectedNode) return;

        switch (action) {
            case 'Duplicate':
                const newNode: WebNode = {
                    ...this.selectedNode,
                    id: this.generateId(),
                    x: (this.selectedNode.x || 0) + 30,
                    y: (this.selectedNode.y || 0) + 30,
                    fx: undefined,
                    fy: undefined,
                    vx: 0,
                    vy: 0,
                    stationId: undefined // Don't duplicate station membership
                };
                this.nodes.push(newNode);
                break;

            case 'Delete':
                const idToDelete = this.selectedNode.id;
                this.nodes = this.nodes.filter(n => n.id !== idToDelete);
                this.links = this.links.filter(l =>
                    this.getLinkId(l.source) !== idToDelete &&
                    this.getLinkId(l.target) !== idToDelete
                );
                break;

            case 'Unbind All':
                const hubId = this.selectedNode.id;
                const elementIdsInHub = new Set(this.nodes.filter(n => n.stationId === hubId).map(n => n.id));

                // Release nodes
                this.nodes.forEach(n => {
                    if (n.stationId === hubId) {
                        n.stationId = undefined;
                    }
                });

                // Remove all links connected to hub OR ring links between elements of this hub
                this.links = this.links.filter(l => {
                    const s = this.getLinkId(l.source);
                    const t = this.getLinkId(l.target);
                    const isConnectedToHub = s === hubId || t === hubId;
                    const isRingLinkInHub = (l.type === 'ring') && elementIdsInHub.has(s) && elementIdsInHub.has(t);
                    return !isConnectedToHub && !isRingLinkInHub;
                });

                // Remove hub
                this.nodes = this.nodes.filter(n => n.id !== hubId);
                this.cdr.markForCheck();
                break;

            case 'Unbind':
                if (this.selectedNode.stationId) {
                    const currentHubId = this.selectedNode.stationId;
                    const nodeId = this.selectedNode.id;
                    this.selectedNode.stationId = undefined;

                    // Remove links between this node and the hub
                    this.links = this.links.filter(l => {
                        const s = this.getLinkId(l.source);
                        const t = this.getLinkId(l.target);
                        return !((s === nodeId && t === currentHubId) || (s === currentHubId && t === nodeId));
                    });

                    // Check if hub still has enough nodes
                    const remainingInHub = this.nodes.filter(n => n.stationId === currentHubId);
                    if (remainingInHub.length < 2) {
                        const remainingIds = new Set(remainingInHub.map(n => n.id));
                        // Dissolve the hub
                        remainingInHub.forEach(n => n.stationId = undefined);
                        this.nodes = this.nodes.filter(n => n.id !== currentHubId);

                        // Remove all links related to this hub and its ring
                        this.links = this.links.filter(l => {
                            const s = this.getLinkId(l.source);
                            const t = this.getLinkId(l.target);
                            const isConnectedToHub = s === currentHubId || t === currentHubId;
                            const isRingLinkInHub = (l.type === 'ring') && (remainingIds.has(s) || remainingIds.has(t) || s === nodeId || t === nodeId);
                            return !isConnectedToHub && !isRingLinkInHub;
                        });
                    } else {
                        // Rebuild structure for remaining nodes
                        this.rebuildHubStructure(currentHubId);
                    }
                }
                this.cdr.markForCheck();
                break;

            case 'Add to Watchlist':
                if (this.selectedNode?.movieData) {
                    this.toggleWatchlist(this.selectedNode.movieData, 'saved');
                }
                break;

            case 'Mark as Seen':
                if (this.selectedNode?.movieData) {
                    this.toggleWatchlist(this.selectedNode.movieData, 'watched');
                }
                break;
        }

        this.updateGraph();
        this.closeMenu();
    }

    closeMenu(): void {
        this.isMenuVisible = false;
        this.selectedNode = null;
        this.cdr.markForCheck();
    }

    getActiveClusterInputs(hubId: string): string[] {
        return this.nodes
            .filter(n => n.stationId === hubId && n.type === 'element')
            .map(n => n.name);
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
        if (this.filters.yearFrom !== 1888 || this.filters.yearTo !== 2030) count++;
        if (this.filters.runtimeMin !== 0 || this.filters.runtimeMax !== 300) count++;
        if (this.filters.sortBy !== 'similarity') count++;
        return count;
    }

    clearFilters(): void {
        this.filters = {
            genreIds: [],
            language: null,
            yearFrom: 1888,
            yearTo: 2030,
            runtimeMin: 0,
            runtimeMax: 300,
            sortBy: 'similarity',
        };
    }

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

    private generateId(): string {
        return Math.random().toString(36).substring(2, 11);
    }

    private rebuildNodeMap() {
        this.nodeMap.clear();
        for (const n of this.nodes) {
            this.nodeMap.set(n.id, n);
        }
    }

    private getLinkId(node: string | WebNode | undefined): string {
        if (!node) return '';
        return typeof node === 'string' ? node : node.id;
    }

    getRadius(n: number): number {
        return Math.max(160, (n * 180) / (2 * Math.PI));
    }

    rectCollide() {
        let nodes: WebNode[] = [];

        function force(alpha: number) {
            const padding = 10;
            const len = nodes.length;

            for (let i = 0; i < len; i++) {
                const a = nodes[i];
                const aIsHub = a.type === 'hub';
                const aIsMovie = a.type === 'movie' && !a.stationId;
                const aW = aIsHub ? 35 : 80;
                const aH = aIsHub ? 35 : aIsMovie ? 130 : 22;

                for (let j = i + 1; j < len; j++) {
                    const b = nodes[j];
                    const bIsHub = b.type === 'hub';

                    if (aIsHub && bIsHub) continue;

                    const bIsMovie = b.type === 'movie' && !b.stationId;
                    const bW = bIsHub ? 35 : 80;
                    const bH = bIsHub ? 35 : bIsMovie ? 130 : 22;

                    let dx = (a.x || 0) - (b.x || 0);
                    let dy = (a.y || 0) - (b.y || 0);

                    if (dx === 0) dx = (Math.random() - 0.5) * 0.1;
                    if (dy === 0) dy = (Math.random() - 0.5) * 0.1;

                    const absDx = Math.abs(dx);
                    const absDy = Math.abs(dy);

                    const minX = aW + bW + padding;
                    const minY = aH + bH + padding;

                    if (absDx < minX && absDy < minY) {
                        const overlapX = minX - absDx;
                        const overlapY = minY - absDy;

                        if (overlapX < overlapY) {
                            const moveX = (overlapX / 2) * Math.sign(dx) * alpha * 0.5;
                            a.vx = (a.vx || 0) + moveX;
                            b.vx = (b.vx || 0) - moveX;
                            a.x = (a.x || 0) + moveX;
                            b.x = (b.x || 0) - moveX;
                        } else {
                            const moveY = (overlapY / 2) * Math.sign(dy) * alpha * 0.5;
                            a.vy = (a.vy || 0) + moveY;
                            b.vy = (b.vy || 0) - moveY;
                            a.y = (a.y || 0) + moveY;
                            b.y = (b.y || 0) - moveY;
                        }
                    }
                }
            }
        }

        force.initialize = (_nodes: WebNode[]) => {
            nodes = _nodes;
        };

        return force;
    }

    initGraph() {
        this.rebuildNodeMap();

        this.svg = d3.select(this.svgContainer.nativeElement);
        this.potentialLinkGroup = this.svg.append('g').attr('class', 'potential-links');
        this.linkGroup = this.svg.append('g');
        this.nodeGroup = this.svg.append('g');

        this.simulation = d3.forceSimulation<WebNode>(this.nodes)
            .velocityDecay(0.8)
            .force('collide', this.rectCollide())
            .force('link', d3.forceLink<WebNode, WebLink>(this.links).id(d => d.id)
                .distance(d => {
                    const r = d.n || 3;
                    if (d.type === 'spoke') return this.getRadius(r);
                    if (d.type === 'ring') return 2 * this.getRadius(r) * Math.sin(Math.PI / r);

                    const sNode = typeof d.source === 'string' ? this.nodeMap.get(d.source) : d.source;
                    const tNode = typeof d.target === 'string' ? this.nodeMap.get(d.target) : d.target;

                    if (sNode?.type === 'movie' || tNode?.type === 'movie') return 420;
                    return 180;
                })
                .strength(d => d.type === 'loose' ? 0.5 : 1))
            .on('tick', () => this.ticked());

        this.updateGraph();
    }

    updateGraph() {
        this.rebuildNodeMap();
        this.renderLinks();
        this.renderNodes();

        this.linkElements = this.linkGroup.selectAll<SVGLineElement, WebLink>('line');
        this.nodeElements = this.nodeGroup.selectAll<SVGGElement, WebNode>('g.node');

        this.simulation.nodes(this.nodes);
        (this.simulation.force('link') as d3.ForceLink<WebNode, WebLink>).links(this.links);
        this.simulation.alphaTarget(0.5).restart();
    }

    private renderLinks() {
        const visibleLinks = this.links.filter(l => l.type !== 'spoke');
        const linkElems = this.linkGroup.selectAll<SVGLineElement, WebLink>('line')
            .data(visibleLinks, d => d.id);

        linkElems.enter()
            .append('line')
            .attr('stroke-width', 2)
            .attr('stroke', d => d.type === 'ring' ? 'var(--accent)' : 'var(--border-hover)')
            .style('filter', d => d.type === 'ring' ? 'drop-shadow(0 0 12px var(--accent-glow))' : 'none');

        linkElems.exit().remove();

        // Refresh the selection for ticked()
        this.linkElements = this.linkGroup.selectAll<SVGLineElement, WebLink>('line');
    }

    private renderNodes() {
        const nodeElems = this.nodeGroup.selectAll<SVGGElement, WebNode>('g.node')
            .data(this.nodes, d => d.id);

        const nodeEnter = nodeElems.enter()
            .append('g')
            .attr('class', 'node')
            .style('cursor', 'grab')
            .call(this.drag(this.simulation))
            .on('click', (event: MouseEvent, d: WebNode) => {
                if (event.defaultPrevented) return;
                if (d.type === 'hub') this.triggerMix(d);
            })
            .on('contextmenu', (event: MouseEvent, d: WebNode) => {
                event.preventDefault();
                event.stopPropagation();
                this.ngZone.run(() => {
                    this.selectedNode = d;
                    this.menuLeft = d.x! - 90;
                    this.menuTop = d.y! + 22;
                    this.isMenuVisible = true;
                    this.cdr.markForCheck();
                });
            });

        nodeEnter.each((d, i, nodes) => {
            const el = d3.select(nodes[i]);
            if (d.type === 'element') {
                this.renderElementNode(el, d);
            } else if (d.type === 'movie') {
                this.renderMovieNode(el, d);
            } else if (d.type === 'hub') {
                this.renderHubNode(el, d);
            }
        });

        // UPDATE Phase: Animate collapsed movies and handle loading hubs
        nodeElems.merge(nodeEnter).each((d, i, nodes) => {
            const el = d3.select(nodes[i]);

            if (d.type === 'movie') {
                const isCollapsed = !!d.stationId;
                const m = d.movieData;

                el.select('rect')
                    .transition().duration(300)
                    .attr('width', 160)
                    .attr('height', isCollapsed ? 44 : 260)
                    .attr('x', -80)
                    .attr('y', isCollapsed ? -22 : -130);

                el.select('foreignObject')
                    .transition().duration(300)
                    .attr('width', 160)
                    .attr('height', isCollapsed ? 44 : 260)
                    .attr('x', -80)
                    .attr('y', isCollapsed ? -22 : -130);

                el.select('.movie-poster')
                    .transition().duration(300)
                    .style('height', isCollapsed ? '0px' : '210px')
                    .style('opacity', isCollapsed ? '0' : '1');

            } else if (d.type === 'hub') {
                // Update loading state
                if (d.isLoading) {
                    el.select('text:not(.spinner-icon)').remove();
                    if (el.select('.spinner-icon').empty()) {
                        const spinner = el.append('text')
                            .attr('class', 'spinner-icon')
                            .attr('x', 0)
                            .attr('y', 0)
                            .attr('text-anchor', 'middle')
                            .attr('dy', 10)
                            .text('cyclone')
                            .style('fill', '#07070f')
                            .style('font-family', '"Material Symbols Rounded"')
                            .style('font-size', '28px')
                            .style('pointer-events', 'none');

                        spinner.append('animateTransform')
                            .attr('attributeName', 'transform')
                            .attr('type', 'rotate')
                            .attr('from', '0 0 0')
                            .attr('to', '360 0 0')
                            .attr('dur', '0.5s')
                            .attr('repeatCount', 'indefinite');
                    }
                } else {
                    el.select('.spinner-icon').remove();
                    if (el.select('text').empty()) {
                        el.append('text').text('Mix')
                            .attr('text-anchor', 'middle')
                            .attr('dy', 5)
                            .style('fill', '#07070f')
                            .style('font-family', 'var(--font-ui)')
                            .style('font-size', '14px')
                            .style('font-weight', '600')
                            .style('pointer-events', 'none');
                    }
                }
            }
        });

        nodeElems.exit().remove();
    }

    private renderElementNode(el: d3.Selection<SVGGElement, unknown, null, undefined>, d: WebNode) {
        el.append('rect')
            .attr('width', 160).attr('height', 44)
            .attr('rx', 12)
            .attr('x', -80).attr('y', -22)
            .attr('fill', 'transparent');

        const fo = el.append('foreignObject')
            .attr('width', 160).attr('height', 44)
            .attr('x', -80).attr('y', -22)
            .style('pointer-events', 'none');

        fo.append('xhtml:div')
            .attr('class', 'glass')
            .style('width', '100%')
            .style('height', '100%')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('border-radius', '12px')
            .style('color', 'var(--text)')
            .style('font-family', 'var(--font-ui)')
            .style('font-size', '14px')
            .style('font-weight', '500')
            .style('box-shadow', '0px 4px 16px rgba(0,0,0,0.5)')
            .style('box-sizing', 'border-box')
            .style('margin', '0')
            .text(d.name);
    }

    private renderMovieNode(el: d3.Selection<SVGGElement, unknown, null, undefined>, d: WebNode) {
        const w = 160;
        const h = 260;
        const posterH = 210;

        const m = d.movieData;
        console.log(m!);

        el.append('rect')
            .attr('width', w).attr('height', h)
            .attr('rx', 12)
            .attr('x', -w / 2).attr('y', -h / 2)
            .attr('fill', 'transparent');

        const fo = el.append('foreignObject')
            .attr('width', w).attr('height', h)
            .attr('x', -w / 2).attr('y', -h / 2)
            .style('pointer-events', 'none');

        const card = fo.append('xhtml:div')
            .attr('class', 'glass')
            .style('width', '100%').style('height', '100%')
            .style('display', 'flex')
            .style('flex-direction', 'column')
            .style('border-radius', '12px')
            .style('box-shadow', '0px 8px 24px rgba(0,0,0,0.6)')
            .style('box-sizing', 'border-box')
            .style('overflow', 'hidden')
            .style('margin', '0');

        if (m!.poster_path) {
            const posterDiv = card.append('xhtml:div')
                .attr('class', 'movie-poster')
                .style('width', '100%')
                .style('height', posterH + 'px')
                .style('background-image', `url(https://image.tmdb.org/t/p/w500${m!.poster_path})`)
                .style('background-size', 'cover')
                .style('border-bottom', '1px solid rgba(255,255,255,0.1)');
        } else {
            const posterDiv = card.append('xhtml:div')
                .attr('class', 'movie-poster')
                .style('width', '100%')
                .style('height', posterH + 'px')
                .style('background-image', `url(https://critics.io/img/movies/poster-placeholder.png)`)
                .style('background-size', 'cover')
                .style('border-bottom', '1px solid rgba(255,255,255,0.1)');
        }


        card.append('xhtml:div')
            .style('flex', '1')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('color', 'var(--accent)')
            .style('font-family', 'var(--font-ui)')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .style('text-align', 'center')
            .style('padding', '0 8px')
            .text(d.name);
    }

    private renderHubNode(el: d3.Selection<SVGGElement, unknown, null, undefined>, d: WebNode) {
        el.append('circle')
            .attr('r', 35)
            .attr('fill', 'url(#goldGrad)')
            .attr('stroke', 'var(--accent)')
            .attr('stroke-width', 1)
            .style('filter', 'drop-shadow(0px 0px 24px var(--accent-glow))');

        el.append('text').text('Mix')
            .attr('text-anchor', 'middle')
            .attr('dy', 5)
            .style('fill', '#07070f')
            .style('font-family', 'var(--font-ui)')
            .style('font-size', '14px')
            .style('font-weight', '600')
            .style('pointer-events', 'none');
    }

    ticked() {
        this.hubCache.clear();

        for (const c of this.nodes) {
            if (c.stationId) {
                let cache = this.hubCache.get(c.stationId);
                if (!cache) {
                    cache = { sumX: 0, sumY: 0, count: 0 };
                    this.hubCache.set(c.stationId, cache);
                }
                cache.sumX += c.x || 0;
                cache.sumY += c.y || 0;
                cache.count++;
            }
        }

        for (const hub of this.nodes) {
            if (hub.type === 'hub') {
                const cache = this.hubCache.get(hub.id);
                if (cache && cache.count > 0) {
                    hub.x = cache.sumX / cache.count;
                    hub.y = cache.sumY / cache.count;
                    hub.vx = 0;
                    hub.vy = 0;
                }
            }
        }

        for (const n of this.nodes) {
            const rX = n.type === 'hub' ? 35 : 80;
            const rY = n.type === 'hub' ? 35 : (n.type === 'movie' && !n.stationId) ? 130 : 22;

            if (n.x !== undefined && n.y !== undefined) {
                if (n.x < rX) { n.x = rX; n.vx = (n.vx || 0) * -0.5; }
                else if (n.x > this.viewWidth - rX) { n.x = this.viewWidth - rX; n.vx = (n.vx || 0) * -0.5; }

                if (n.y < rY) { n.y = rY; n.vy = (n.vy || 0) * -0.5; }
                else if (n.y > this.viewHeight - rY) { n.y = this.viewHeight - rY; n.vy = (n.vy || 0) * -0.5; }
            }
        }

        if (this.linkElements) {
            this.linkElements
                .attr('x1', d => (d.source as WebNode).x!)
                .attr('y1', d => (d.source as WebNode).y!)
                .attr('x2', d => (d.target as WebNode).x!)
                .attr('y2', d => (d.target as WebNode).y!);
        }

        if (this.nodeElements) {
            this.nodeElements
                .attr('transform', d => `translate(${d.x},${d.y})`);
        }

        let potentialLinksData: { source: WebNode, target: WebNode }[] = [];
        if (this.activeDragNode) {
            const myIds = this.getClusterIds(this.activeDragNode);

            for (const targetNode of this.nodes) {
                if (myIds.has(targetNode.id)) continue;

                let closestMyNode: WebNode | null = null;
                let minArea = Infinity;

                for (const myId of myIds) {
                    const myNode = this.nodeMap.get(myId);
                    if (!myNode) continue;

                    const dx = Math.abs((myNode.x || 0) - (targetNode.x || 0));
                    const dy = Math.abs((myNode.y || 0) - (targetNode.y || 0));

                    const isMovieA = myNode.type === 'movie' && !myNode.stationId;
                    const isMovieB = targetNode.type === 'movie' && !targetNode.stationId;
                    const isHubA = myNode.type === 'hub';
                    const isHubB = targetNode.type === 'hub';

                    const threshX = (isHubA ? 35 : 80) + (isHubB ? 35 : 80) + 60;
                    const threshY = (isHubA ? 35 : isMovieA ? 130 : 22) + (isHubB ? 35 : isMovieB ? 130 : 22) + 60;

                    if (dx < threshX && dy < threshY) {
                        const area = dx * dy;
                        if (area < minArea) {
                            minArea = area;
                            closestMyNode = myNode;
                        }
                    }
                }

                if (closestMyNode) {
                    potentialLinksData.push({ source: closestMyNode, target: targetNode });
                }
            }
        }

        if (this.potentialLinkGroup) {
            const pLinks = this.potentialLinkGroup.selectAll<SVGLineElement, { source: WebNode, target: WebNode }>('line')
                .data(potentialLinksData, d => `${d.source.id}-${d.target.id}`);

            pLinks.enter()
                .append('line')
                .attr('stroke', 'var(--text)')
                .attr('stroke-width', 2)
                .attr('stroke-dasharray', '6 6')
                .style('opacity', 0.2)
                .merge(pLinks)
                .attr('x1', d => d.source.x || 0)
                .attr('y1', d => d.source.y || 0)
                .attr('x2', d => d.target.x || 0)
                .attr('y2', d => d.target.y || 0);

            pLinks.exit().remove();
        }
    }

    drag(simulation: d3.Simulation<WebNode, WebLink>) {
        return d3.drag<SVGGElement, WebNode>()
            .on('start', (event: d3.D3DragEvent<SVGGElement, WebNode, WebNode>, d: WebNode) => {
                if (d.type === 'hub') return;
                this.activeDragNode = d;
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event: d3.D3DragEvent<SVGGElement, WebNode, WebNode>, d: WebNode) => {
                if (d.type === 'hub') return;
                const rX = (d.type === 'movie' && !d.stationId) ? 70 : 60;
                const rY = (d.type === 'movie' && !d.stationId) ? 130 : 22;
                d.fx = Math.max(rX, Math.min(this.viewWidth - rX, event.x));
                d.fy = Math.max(rY, Math.min(this.viewHeight - rY, event.y));
            })
            .on('end', (event: d3.D3DragEvent<SVGGElement, WebNode, WebNode>, d: WebNode) => {
                if (d.type === 'hub') return;
                this.activeDragNode = null;
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
                this.checkProximity(d);
            });
    }

    getClusterIds(startNode: WebNode): Set<string> {
        const cluster = new Set<string>();
        if (startNode.type === 'hub' || startNode.stationId) {
            const hubId = startNode.type === 'hub' ? startNode.id : startNode.stationId!;
            cluster.add(hubId);
            for (const n of this.nodes) {
                if (n.stationId === hubId) cluster.add(n.id);
            }
        } else {
            const findLinks = (nId: string) => {
                if (cluster.has(nId)) return;
                cluster.add(nId);
                for (const l of this.links) {
                    if (l.type === 'loose') {
                        const s = this.getLinkId(l.source);
                        const t = this.getLinkId(l.target);
                        if (s === nId) findLinks(t);
                        if (t === nId) findLinks(s);
                    }
                }
            };
            findLinks(startNode.id);
        }
        return cluster;
    }

    checkProximity(draggedNode: WebNode) {
        const myIds = this.getClusterIds(draggedNode);

        let targetHubId: string | null = null;
        const looseNodes = new Set<string>();

        for (const targetNode of this.nodes) {
            if (myIds.has(targetNode.id)) continue;

            let isClose = false;

            for (const myId of myIds) {
                const myNode = this.nodeMap.get(myId);
                if (!myNode) continue;

                const dx = Math.abs((myNode.x || 0) - (targetNode.x || 0));
                const dy = Math.abs((myNode.y || 0) - (targetNode.y || 0));

                const isMovieA = myNode.type === 'movie' && !myNode.stationId;
                const isMovieB = targetNode.type === 'movie' && !targetNode.stationId;
                const isHubA = myNode.type === 'hub';
                const isHubB = targetNode.type === 'hub';

                const threshX = (isHubA ? 35 : 80) + (isHubB ? 35 : 80) + 60;
                const threshY = (isHubA ? 35 : isMovieA ? 130 : 22) + (isHubB ? 35 : isMovieB ? 130 : 22) + 60;

                if (dx < threshX && dy < threshY) {
                    isClose = true;
                    break;
                }
            }

            if (!isClose) continue;

            if (targetNode.type === 'hub' || targetNode.stationId) {
                targetHubId = targetNode.type === 'hub' ? targetNode.id : targetNode.stationId!;
            } else {
                for (const id of this.getClusterIds(targetNode)) {
                    looseNodes.add(id);
                }
            }
        }

        const myHubId = draggedNode.type === 'hub' ? draggedNode.id : draggedNode.stationId;

        if (targetHubId && myHubId) {
            this.mergeTwoHubs(targetHubId, myHubId);
        } else if (targetHubId) {
            this.absorbLooseNodes(targetHubId, Array.from(myIds));
        } else if (myHubId && looseNodes.size > 0) {
            this.absorbLooseNodes(myHubId, Array.from(looseNodes));
        } else if (looseNodes.size > 0) {
            const combined = [...myIds, ...looseNodes];
            if (combined.length >= 2) {
                this.formMixStation(combined);
            }
        }
    }

    mergeTwoHubs(hubId1: string, hubId2: string) {
        const nodesFromHub2 = this.nodes.filter(n => n.stationId === hubId2).map(n => n.id);
        this.nodes = this.nodes.filter(n => n.id !== hubId2);
        this.absorbLooseNodes(hubId1, nodesFromHub2);
    }

    absorbLooseNodes(hubId: string, elementIds: string[]) {
        const elements = this.nodes.filter(n => elementIds.includes(n.id));
        elements.forEach(n => n.stationId = hubId);
        this.rebuildHubStructure(hubId);
    }

    formMixStation(elementIds: string[]) {
        const elements = this.nodes.filter(n => elementIds.includes(n.id));
        if (elements.length > 5) return;
        const cx = elements.reduce((sum, n) => sum + (n.x || 0), 0) / elements.length;
        const cy = elements.reduce((sum, n) => sum + (n.y || 0), 0) / elements.length;

        const hubId = 'hub-' + this.generateId();
        this.nodes.push({ id: hubId, type: 'hub', name: 'MIX', x: cx, y: cy, vx: 0, vy: 0 });

        elements.forEach(n => n.stationId = hubId);
        this.rebuildHubStructure(hubId);
    }

    rebuildHubStructure(hubId: string) {
        const hub = this.nodes.find(n => n.id === hubId)!;
        const elements = this.nodes.filter(n => n.stationId === hubId);
        const N = elements.length;
        const R = this.getRadius(N);

        const allIds = [hubId, ...elements.map(e => e.id)];
        this.links = this.links.filter(l => {
            const s = this.getLinkId(l.source);
            const t = this.getLinkId(l.target);
            return !(allIds.includes(s) || allIds.includes(t));
        });

        elements.sort((a, b) => Math.atan2((a.y || 0) - (hub.y || 0), (a.x || 0) - (hub.x || 0)) - Math.atan2((b.y || 0) - (hub.y || 0), (b.x || 0) - (hub.x || 0)));

        elements.forEach((n, i) => {
            const nextNode = elements[(i + 1) % N];
            this.links.push({ id: `spoke-${hubId}-${n.id}`, type: 'spoke', source: hubId, target: n.id, n: N });
            this.links.push({ id: `ring-${n.id}-${nextNode.id}`, type: 'ring', source: n.id, target: nextNode.id, n: N });
        });

        const t = d3.transition().duration(600).ease(d3.easeCubicOut);

        t.on('end', () => {
            elements.forEach(n => { n.fx = null; n.fy = null; });
        });

        elements.forEach((n, i) => {
            const angle = (i / N) * Math.PI * 2;
            const targetX = (hub.x || 0) + R * Math.cos(angle);
            const targetY = (hub.y || 0) + R * Math.sin(angle);

            const startX = n.x || 0;
            const startY = n.y || 0;

            n.fx = startX;
            n.fy = startY;

            t.tween(`form-${n.id}`, () => {
                const iX = d3.interpolate(startX, targetX);
                const iY = d3.interpolate(startY, targetY);
                return (time: number) => {
                    n.fx = iX(time);
                    n.fy = iY(time);
                    this.simulation.alpha(0.1).restart();
                };
            });
        });

        this.updateGraph();
    }

    triggerMix(hub: WebNode) {
        if (hub.isLoading) return;

        const inputs = this.getActiveClusterInputs(hub.id);
        if (inputs.length < 2) return;

        hub.isLoading = true;
        this.updateGraph();

        const payload = { inputs, ...this.buildFilterPayload() };

        this.http.post<{ results: Movie[] }>(
            `${environment.apiUrl}/api/search/`, payload
        ).subscribe({
            next: (res) => {
                hub.isLoading = false;
                const top = res.results?.[0];
                if (!top) { this.updateGraph(); return; }
                this.spawnMovieNode(hub, top);
            },
            error: () => {
                hub.isLoading = false;
                this.updateGraph();
            }
        });
    }

    spawnMovieNode(hub: WebNode, movie: Movie) {
        const elements = this.nodes.filter(n => n.stationId === hub.id);
        console.log('Movie:', movie);
        this.nodes = this.nodes.filter(n => n.id !== hub.id);
        this.links = this.links.filter(l => {
            const s = this.getLinkId(l.source);
            const t = this.getLinkId(l.target);
            return l.type === 'loose' || (!elements.find(e => e.id === s) && !elements.find(e => e.id === t));
        });

        this.simulation.velocityDecay(0.2);

        elements.forEach(n => {
            n.stationId = undefined;
            n.fx = null;
            n.fy = null;

            const dx = (n.x || 0) - (hub.x || 0);
            const dy = (n.y || 0) - (hub.y || 0);
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            n.vx = (dx / distance) * 15;
            n.vy = (dy / distance) * 15;
        });

        const newNode: WebNode = {
            id: this.generateId(),
            name: `${movie.title} (${movie.release_year})`,
            type: 'movie',
            movieData: movie,
            x: hub.x,
            y: hub.y,
            vx: 0,
            vy: 0
        };

        this.nodes.push(newNode);
        this.updateGraph();

        setTimeout(() => {
            this.simulation.velocityDecay(0.8);
        }, 500);
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
