import { Component, ElementRef, OnInit, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as d3 from 'd3';

interface WebNode extends d3.SimulationNodeDatum {
    id: string;
    name: string;
    color: string;
    type: 'element' | 'hub'; // Hub is the mix button
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
    <svg #svgContainer style="width: 100%; height: 100%;" class="canvas">
        
    </svg>
  `,
    styles: [`.canvas {background: #ffffff; display: block; }`]
})
export class TestComponent implements OnInit {
    @ViewChild('svgContainer', { static: true }) svgContainer!: ElementRef;

    nodes: WebNode[] = [
        { id: '1', name: 'Fire 🔥', color: '#ffcccb', type: 'element' },
        { id: '2', name: 'Water 💧', color: '#cce5ff', type: 'element' },
        { id: '3', name: 'Earth 🪨', color: '#e2c2a3', type: 'element' },
        { id: '4', name: 'Wind 💨', color: '#e6e6e6', type: 'element' },
        { id: '5', name: 'Life 🌱', color: '#d4edda', type: 'element' },
        { id: '6', name: 'Energy ⚡', color: '#fff3cd', type: 'element' },
        { id: '7', name: 'Metal ⚙️', color: '#d6d8db', type: 'element' }
    ];
    links: WebLink[] = [];

    private nodeMap = new Map<string, WebNode>();
    private simulation!: d3.Simulation<WebNode, WebLink>;
    private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private linkGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeGroup!: d3.Selection<SVGGElement, unknown, null, undefined>;
    private nodeElements!: d3.Selection<SVGGElement, WebNode, SVGGElement, unknown>;
    private linkElements!: d3.Selection<SVGLineElement, WebLink, SVGGElement, unknown>;

    constructor(private ngZone: NgZone) { }

    ngOnInit() {
        this.ngZone.runOutsideAngular(() => {
            this.initGraph();
        });
    }

    private rebuildNodeMap() {
        this.nodeMap.clear();
        for (const n of this.nodes) this.nodeMap.set(n.id, n);
    }

    // Calculates how long the invisible hub spoke needs to be so the boxes don't overlap
    getRadius(n: number): number {
        return Math.max(130, (n * 140) / (2 * Math.PI));
    }

    // Custom rectangular collision force to fix vertical gaps
    rectCollide() {
        let nodes: WebNode[] = [];

        function force(alpha: number) {
            const padding = 10;
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i];
                    const b = nodes[j];

                    // Hubs don't collide with other hubs
                    if (a.type === 'hub' && b.type === 'hub') continue;

                    // Elements are 120x44 (half: 60x22). Hubs are treated as 35x35 boxes for collision.
                    const aW = a.type === 'hub' ? 35 : 56;
                    const aH = a.type === 'hub' ? 35 : 18;
                    const bW = b.type === 'hub' ? 35 : 56;
                    const bH = b.type === 'hub' ? 35 : 18;

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

                        // Resolve on axis of least penetration
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
        const width = window.innerWidth;
        const height = window.innerHeight;

        for (const n of this.nodes) {
            n.x = Math.random() * (width - 100) + 50;
            n.y = Math.random() * (height - 100) + 50;
        }

        this.rebuildNodeMap();

        this.svg = d3.select(this.svgContainer.nativeElement);
        this.linkGroup = this.svg.append('g');
        this.nodeGroup = this.svg.append('g');

        this.simulation = d3.forceSimulation<WebNode>(this.nodes)
            .velocityDecay(0.8) // Stationary drift
            .force('collide', this.rectCollide())
            .force('link', d3.forceLink<WebNode, WebLink>(this.links).id(d => d.id)
                .distance(d => {
                    const r = d.n || 3
                    if (d.type === 'spoke') return this.getRadius(r);
                    if (d.type === 'ring') return 2 * this.getRadius(r) * Math.sin(Math.PI / r);
                    return 140; // Loose link
                })
                .strength(d => d.type === 'loose' ? 0.5 : 1)) // Make Rings/Spokes extremely rigid (1.0)
            .on('tick', () => this.ticked());

        this.updateGraph();
    }

    updateGraph() {
        this.rebuildNodeMap();
        // 1. Render Visible Links (Hide the invisible spokes!)
        const visibleLinks = this.links.filter(l => l.type !== 'spoke');
        const LinkElems = this.linkGroup.selectAll<SVGLineElement, WebLink>('line')
            .data(visibleLinks, d => d.id);

        LinkElems.enter()
            .append('line')
            .attr('stroke-width', 4)
            .attr('stroke', d => d.type === 'ring' ? '#ff9800' : '#a0aec0');

        LinkElems.exit().remove();

        // 2. Render Nodes (Both Elements and Hubs)
        const NodeElems = this.nodeGroup.selectAll<SVGGElement, WebNode>('g.node').data(this.nodes, d => d.id);

        const nodeEnter = NodeElems.enter()
            .append('g')
            .attr('class', 'node')
            .style('cursor', 'grab')
            .call(this.drag(this.simulation))
            .on('click', (event: any, d: WebNode) => {
                if (event.defaultPrevented) return; // Ignore click if we were dragging
                if (d.type === 'hub') this.triggerMix(d);
            });

        nodeEnter.each((d, i, nodes) => {
            const el = d3.select(nodes[i]);
            if (d.type === 'element') {
                el.append('rect').attr('width', 120).attr('height', 44).attr('rx', 6).attr('x', -60).attr('y', -22).attr('fill', d.color).attr('stroke', '#4a5568').attr('stroke-width', 2);
                el.append('text').text(d.name).attr('text-anchor', 'middle').attr('dy', 5).style('fill', '#1a202c').style('font-family', 'sans-serif').style('font-size', '14px').style('font-weight', 'bold').style('pointer-events', 'none');
            } else if (d.type === 'hub') {
                el.append('circle').attr('r', 35).attr('fill', '#ff9800').attr('stroke', '#e65100').attr('stroke-width', 3).style('filter', 'drop-shadow(0px 4px 4px rgba(0,0,0,0.2))');
                el.append('text').text('Mix').attr('text-anchor', 'middle').attr('dy', 5).style('fill', 'white').style('font-weight', 'bold').style('pointer-events', 'none');
            }
        });

        NodeElems.exit().remove();

        // 3. Cache Selections for ticked() performance
        this.linkElements = this.linkGroup.selectAll<SVGLineElement, WebLink>('line');
        this.nodeElements = this.nodeGroup.selectAll<SVGGElement, WebNode>('g.node');

        // 4. Restart Physics Engine
        this.simulation.nodes(this.nodes);
        (this.simulation.force('link') as d3.ForceLink<WebNode, WebLink>).links(this.links);
        this.simulation.alphaTarget(0.5).restart();
    }

    ticked() {
        // O(N) Hub centering calculation using a Cache map
        const hubCache = new Map<string, { sumX: number, sumY: number, count: number }>();

        // 1. Accumulate node positions into the cache
        for (let i = 0; i < this.nodes.length; i++) {
            const c = this.nodes[i];
            if (c.stationId) {
                let cache = hubCache.get(c.stationId);
                if (!cache) {
                    cache = { sumX: 0, sumY: 0, count: 0 };
                    hubCache.set(c.stationId, cache);
                }
                cache.sumX += c.x || 0;
                cache.sumY += c.y || 0;
                cache.count++;
            }
        }

        // 2. Apply the cached averages to center the hubs
        for (let i = 0; i < this.nodes.length; i++) {
            const hub = this.nodes[i];
            if (hub.type === 'hub') {
                const cache = hubCache.get(hub.id);
                if (cache && cache.count > 0) {
                    hub.x = cache.sumX / cache.count;
                    hub.y = cache.sumY / cache.count;
                    hub.vx = 0;
                    hub.vy = 0;
                }
            }
        }

        const width = window.innerWidth;
        const height = window.innerHeight;

        // Bounding box collision
        for (let i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i];
            const rX = n.type === 'hub' ? 35 : 60; // Element half-width is 60, Hub is 35
            const rY = n.type === 'hub' ? 35 : 22; // Element half-height is 22, Hub is 35

            if (n.x !== undefined && n.y !== undefined) {
                if (n.x < rX) { n.x = rX; n.vx = (n.vx || 0) * -0.5; }
                else if (n.x > width - rX) { n.x = width - rX; n.vx = (n.vx || 0) * -0.5; }

                if (n.y < rY) { n.y = rY; n.vy = (n.vy || 0) * -0.5; }
                else if (n.y > height - rY) { n.y = height - rY; n.vy = (n.vy || 0) * -0.5; }
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

    // --- DRAG HANDLERS ---
    drag(simulation: d3.Simulation<WebNode, WebLink>) {
        return d3.drag<SVGGElement, WebNode>()
            .on('start', (event, d) => {
                if (d.type === 'hub') return; // Ignore dragging on the MIX button entirely!
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => {
                if (d.type === 'hub') return;
                const width = window.innerWidth;
                const height = window.innerHeight;
                d.fx = Math.max(60, Math.min(width - 60, event.x));
                d.fy = Math.max(22, Math.min(height - 22, event.y));
            })
            .on('end', (event, d) => {
                if (d.type === 'hub') return;

                if (!event.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
                this.checkProximity(d);
            });
    }

    // --- THE NEW CLUSTER MERGE LOGIC ---

    // Gets all node IDs related to a dragged piece (the whole circle, or a loose chain)
    getClusterIds(startNode: WebNode): Set<string> {
        const cluster = new Set<string>();
        if (startNode.type === 'hub' || startNode.stationId) {
            const hubId = startNode.type === 'hub' ? startNode.id : startNode.stationId!;
            cluster.add(hubId);
            this.nodes.forEach(n => { if (n.stationId === hubId) cluster.add(n.id); });
        } else {
            const findLinks = (nId: string) => {
                if (cluster.has(nId)) return;
                cluster.add(nId);
                this.links.forEach(l => {
                    if (l.type === 'loose') {
                        const s = (l.source as any).id || l.source;
                        const t = (l.target as any).id || l.target;
                        if (s === nId) findLinks(t);
                        if (t === nId) findLinks(s);
                    }
                });
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
                const myNode = this.nodeMap.get(myId)!;

                const dx = (myNode.x || 0) - (targetNode.x || 0);
                const dy = (myNode.y || 0) - (targetNode.y || 0);

                if (dx * dx + dy * dy < thresholdSq) {
                    isClose = true;
                    break;
                }
            }

            if (!isClose) continue;

            if (targetNode.type === 'hub' || targetNode.stationId) {
                targetHubId = targetNode.type === 'hub'
                    ? targetNode.id
                    : targetNode.stationId!;
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

    // --- HUB STRUCTURAL BUILDERS ---

    mergeTwoHubs(hubId1: string, hubId2: string) {
        const nodesFromHub2 = this.nodes.filter(n => n.stationId === hubId2).map(n => n.id);
        this.nodes = this.nodes.filter(n => n.id !== hubId2); // Delete Hub 2
        this.absorbLooseNodes(hubId1, nodesFromHub2);
    }

    absorbLooseNodes(hubId: string, elementIds: string[]) {
        // Assign new nodes to the hub
        const elements = this.nodes.filter(n => elementIds.includes(n.id));
        elements.forEach(n => n.stationId = hubId);
        this.rebuildHubStructure(hubId);
    }

    formMixStation(elementIds: string[]) {
        const elements = this.nodes.filter(n => elementIds.includes(n.id));
        const cx = elements.reduce((sum, n) => sum + (n.x || 0), 0) / elements.length;
        const cy = elements.reduce((sum, n) => sum + (n.y || 0), 0) / elements.length;

        // Spawn Hub Node
        const hubId = 'hub-' + Math.random().toString(36).substr(2, 9);
        this.nodes.push({ id: hubId, type: 'hub', name: 'MIX', color: '', x: cx, y: cy, vx: 0, vy: 0 });

        elements.forEach(n => n.stationId = hubId);
        this.rebuildHubStructure(hubId);
    }

    rebuildHubStructure(hubId: string) {
        const hub = this.nodes.find(n => n.id === hubId)!;
        const elements = this.nodes.filter(n => n.stationId === hubId);
        const N = elements.length;
        const R = this.getRadius(N);

        // 1. Delete all existing loose links involving these nodes
        const allIds = [hubId, ...elements.map(e => e.id)];
        this.links = this.links.filter(l => {
            const s = (l.source as any).id || l.source;
            const t = (l.target as any).id || l.target;
            return !(allIds.includes(s) || allIds.includes(t));
        });

        // 2. Sort nodes by angle to prevent tangled springs
        elements.sort((a, b) => Math.atan2((a.y || 0) - (hub.y || 0), (a.x || 0) - (hub.x || 0)) - Math.atan2((b.y || 0) - (hub.y || 0), (b.x || 0) - (hub.x || 0)));

        // 3. Forge the Physical Springs immediately (they will pull the structure together behind the scenes)
        elements.forEach((n, i) => {
            const nextNode = elements[(i + 1) % N];
            this.links.push({ id: `spoke-${hubId}-${n.id}`, type: 'spoke', source: hubId, target: n.id, n: N });
            this.links.push({ id: `ring-${n.id}-${nextNode.id}`, type: 'ring', source: n.id, target: nextNode.id, n: N });
        });

        // --- NEW: THE CINEMATIC ANIMATION ---

        // Create a 600ms transition with a smooth deceleration
        const t = d3.transition().duration(600).ease(d3.easeCubicOut);

        // When the animation finishes, release the nodes back to the physical springs!
        t.on('end', () => {
            elements.forEach(n => { n.fx = null; n.fy = null; });
        });

        // Animate each node to its perfect spot in the circle
        elements.forEach((n, i) => {
            const angle = (i / N) * Math.PI * 2;
            const targetX = (hub.x || 0) + R * Math.cos(angle);
            const targetY = (hub.y || 0) + R * Math.sin(angle);

            const startX = n.x || 0;
            const startY = n.y || 0;

            // Lock the node exactly where it currently is so physics can't move it
            n.fx = startX;
            n.fy = startY;

            // Tween the X/Y coordinates to the target
            t.tween(`form-${n.id}`, () => {
                const iX = d3.interpolate(startX, targetX);
                const iY = d3.interpolate(startY, targetY);
                return (time: number) => {
                    n.fx = iX(time);
                    n.fy = iY(time);

                    // Keep the simulation awake so the visible lines draw on every frame of the animation
                    this.simulation.alpha(0.1).restart();
                };
            });
        });

        this.updateGraph();
    }

    // --- EXPLOSION LOGIC ---

    triggerMix(hub: WebNode) {
        const elements = this.nodes.filter(n => n.stationId === hub.id);

        // 1. Destroy Hub and all related springs
        this.nodes = this.nodes.filter(n => n.id !== hub.id);
        this.links = this.links.filter(l => {
            const s = (l.source as any).id || l.source;
            const t = (l.target as any).id || l.target;
            return l.type === 'loose' || (!elements.find(e => e.id === s) && !elements.find(e => e.id === t));
        });

        // 2. THE SHOCKWAVE: Temporarily make the board slippery!
        this.simulation.velocityDecay(0.2);

        // 3. Release elements and apply a smooth outward slide
        elements.forEach(n => {
            n.stationId = undefined;
            n.fx = null;
            n.fy = null;

            const dx = (n.x || 0) - (hub.x || 0);
            const dy = (n.y || 0) - (hub.y || 0);
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;

            // A gentle speed of 15 + slippery friction = a beautiful, smooth slide
            n.vx = (dx / distance) * 15;
            n.vy = (dy / distance) * 15;
        });

        // 4. Spawn Super Node in the exact center
        const newNode: WebNode = {
            id: Math.random().toString(36).substr(2, 9),
            name: 'Super Node ✨',
            color: '#c2f0c2',
            type: 'element',
            x: hub.x,
            y: hub.y,
            vx: 0,
            vy: 0
        };

        this.nodes.push(newNode);
        this.updateGraph();

        // 5. Restore the thick friction after half a second so things stop floating
        setTimeout(() => {
            this.simulation.velocityDecay(0.8);
        }, 500);
    }
}