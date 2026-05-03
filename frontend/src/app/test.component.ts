import { Component, ElementRef, OnInit, ViewChild, NgZone, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

interface WebNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    type: 'element' | 'hub' | 'movie'; // Hub is the mix button
    stationId?: string; // Which hub this element belongs to
}

interface WebLink extends d3.SimulationLinkDatum<WebNode> {
    id: string;
    type: 'loose' | 'spoke' | 'ring';
    source: string | WebNode;
    target: string | WebNode;
    n?: number; // Stores the number of nodes in the cluster to calculate perfect ring geometry
}

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule],
    template: `
    <svg #svgContainer class="canvas">
        <defs>
            <!-- A gorgeous gold gradient for the Mix Hubs -->
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#e8c97d" />
                <stop offset="100%" stop-color="#c9983a" />
            </linearGradient>

            <filter id='noise' x='0%' y='0%' width='100%' height='100%'>
                <feTurbulence type="fractalNoise" baseFrequency="0.005" numOctaves="3" stitchTiles="stitch" result="clouds" />
                <feColorMatrix type="saturate" values="0" in="clouds" result="grayClouds" />
                <feComponentTransfer in="grayClouds" result="contrastClouds">
                    <feFuncR type="linear" slope="2" intercept="-0.5"/>
                    <feFuncG type="linear" slope="2" intercept="-0.5"/>
                    <feFuncB type="linear" slope="2" intercept="-0.5"/>
                </feComponentTransfer>
                <!-- Multiply the SourceGraphic by the B&W clouds -->
                <feBlend mode="multiply" in="SourceGraphic" in2="contrastClouds" />
            </filter>
        </defs>
        
        <!-- Apply the filter to a solid gold rect to get purely golden noise -->
        <rect x="0" y="0" width="100%" height="100%" fill="var(--accent)" filter="url(#noise)" class="noise-rect" />
    </svg>
  `,
    styles: [`
        :host { display: block; width: 100vw; height: 100vh; overflow: hidden; }
        .canvas {
            background-color: var(--bg);
            background-image: var(--grad-bg);
            display: block;
            width: 100%;
            height: 100%;
            user-select: none;
        }
        .noise-rect {
            mix-blend-mode: screen; 
            opacity: 0.05; /* Made it very faint as requested */
            pointer-events: none;
        }
    `]
})
export class TestComponent implements OnInit {
    @ViewChild('svgContainer', { static: true }) svgContainer!: ElementRef;

    nodes: WebNode[] = [
        { id: '1', name: 'Fire 🔥', type: 'element' },
        { id: '2', name: 'Water 💧', type: 'element' },
        { id: '3', name: 'Earth 🪨', type: 'element' },
        { id: '4', name: 'Wind 💨', type: 'element' },
        { id: '5', name: 'Life 🌱', type: 'element' },
        { id: '6', name: 'Energy ⚡', type: 'element' },
        { id: '7', name: 'Metal ⚙️', type: 'element' }
    ];
    links: WebLink[] = [];

    private nodeMap = new Map<string, WebNode>();
    private simulation!: d3.Simulation<WebNode, WebLink>;
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private linkGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeElements!: d3.Selection<SVGGElement, WebNode, SVGGElement, unknown>;
    private linkElements!: d3.Selection<SVGLineElement, WebLink, SVGGElement, unknown>;

    // Performance Caches
    private viewWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    private viewHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;
    private hubCache = new Map<string, { sumX: number, sumY: number, count: number }>();

    constructor(private ngZone: NgZone) { }

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
        return Math.max(130, (n * 140) / (2 * Math.PI));
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
                const aW = aIsHub ? 35 : aIsMovie ? 70 : 56;
                const aH = aIsHub ? 35 : aIsMovie ? 130 : 18;

                for (let j = i + 1; j < len; j++) {
                    const b = nodes[j];
                    const bIsHub = b.type === 'hub';

                    if (aIsHub && bIsHub) continue;

                    const bIsMovie = b.type === 'movie' && !b.stationId;
                    const bW = bIsHub ? 35 : bIsMovie ? 70 : 56;
                    const bH = bIsHub ? 35 : bIsMovie ? 130 : 18;

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
        for (const n of this.nodes) {
            n.x = Math.random() * (this.viewWidth - 100) + 50;
            n.y = Math.random() * (this.viewHeight - 100) + 50;
        }

        this.rebuildNodeMap();

        this.svg = d3.select(this.svgContainer.nativeElement);
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

                    if (sNode?.type === 'movie' || tNode?.type === 'movie') return 380;
                    return 140;
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
            .attr('stroke-width', 3)
            .attr('stroke', d => d.type === 'ring' ? 'var(--accent)' : 'var(--border-hover)')
            .style('filter', d => d.type === 'ring' ? 'drop-shadow(0 0 12px var(--accent-glow))' : 'none');

        linkElems.exit().remove();
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

        // UPDATE Phase: Animate collapsed movies
        nodeElems.merge(nodeEnter).each((d, i, nodes) => {
            if (d.type === 'movie') {
                const el = d3.select(nodes[i]);
                const isCollapsed = !!d.stationId;

                el.select('rect')
                    .transition().duration(300)
                    .attr('width', isCollapsed ? 120 : 140)
                    .attr('height', isCollapsed ? 44 : 260)
                    .attr('x', isCollapsed ? -60 : -70)
                    .attr('y', isCollapsed ? -22 : -130);

                el.select('foreignObject')
                    .transition().duration(300)
                    .attr('width', isCollapsed ? 120 : 140)
                    .attr('height', isCollapsed ? 44 : 260)
                    .attr('x', isCollapsed ? -60 : -70)
                    .attr('y', isCollapsed ? -22 : -130);

                el.select('.movie-poster')
                    .transition().duration(300)
                    .style('height', isCollapsed ? '0px' : '210px')
                    .style('opacity', isCollapsed ? '0' : '1');
            }
        });

        nodeElems.exit().remove();
    }

    private renderElementNode(el: d3.Selection<SVGGElement, unknown, null, undefined>, d: WebNode) {
        el.append('rect')
            .attr('width', 120).attr('height', 44)
            .attr('rx', 12)
            .attr('x', -60).attr('y', -22)
            .attr('fill', 'transparent');

        const fo = el.append('foreignObject')
            .attr('width', 120).attr('height', 44)
            .attr('x', -60).attr('y', -22)
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
        const w = 140;
        const h = 260;
        const posterH = 210;

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

        card.append('xhtml:div')
            .attr('class', 'movie-poster')
            .style('width', '100%')
            .style('height', posterH + 'px')
            .style('background', 'rgba(255,255,255,0.05)')
            .style('border-bottom', 'var(--glass-border)');

        card.append('xhtml:div')
            .style('flex', '1')
            .style('display', 'flex')
            .style('align-items', 'center')
            .style('justify-content', 'center')
            .style('color', 'var(--teal)')
            .style('font-family', 'var(--font-ui)')
            .style('font-size', '14px')
            .style('font-weight', '600')
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
            const rX = n.type === 'hub' ? 35 : (n.type === 'movie' && !n.stationId) ? 70 : 60;
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
    }

    drag(simulation: d3.Simulation<WebNode, WebLink>) {
        return d3.drag<SVGGElement, WebNode>()
            .on('start', (event: d3.D3DragEvent<SVGGElement, WebNode, WebNode>, d: WebNode) => {
                if (d.type === 'hub') return;
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
        const thresholdSq = 140 * 140;
        const myIds = this.getClusterIds(draggedNode);

        let targetHubId: string | null = null;
        const looseNodes = new Set<string>();

        for (const targetNode of this.nodes) {
            if (myIds.has(targetNode.id)) continue;

            let isClose = false;

            for (const myId of myIds) {
                const myNode = this.nodeMap.get(myId);
                if (!myNode) continue;

                const dx = (myNode.x || 0) - (targetNode.x || 0);
                const dy = (myNode.y || 0) - (targetNode.y || 0);

                if (dx * dx + dy * dy < thresholdSq) {
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
        const elements = this.nodes.filter(n => n.stationId === hub.id);

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
            name: 'Movie 🎥',
            type: 'movie',
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
}
