import { PLAYER_RADIUS } from './constants';
import { MAP_H, MAP_W } from './map';
import { collides, createColliders, type ColliderIndex } from './physics';

/**
 * Grid A* over walkable positions. Used by bots, load tests and automated
 * playtests — never by the authoritative movement code.
 */
const RES = 4; // nodes per tile
const W = MAP_W * RES;
const H = MAP_H * RES;
let walk: Uint8Array | null = null;

function ensure(cols: ColliderIndex) {
  if (walk) return walk;
  walk = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const wx = (x + 0.5) / RES;
      const wy = (y + 0.5) / RES;
      walk[y * W + x] = collides(cols, wx, wy, PLAYER_RADIUS + 0.04) ? 0 : 1;
    }
  return walk;
}

export function isWalkable(x: number, y: number, cols: ColliderIndex = createColliders()): boolean {
  const g = ensure(cols);
  const gx = Math.floor(x * RES);
  const gy = Math.floor(y * RES);
  return gx >= 0 && gy >= 0 && gx < W && gy < H && g[gy * W + gx] === 1;
}

function nearestWalkable(g: Uint8Array, gx: number, gy: number): [number, number] | null {
  for (let r = 0; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const x = gx + dx;
        const y = gy + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && g[y * W + x]) return [x, y];
      }
  return null;
}

export function findPath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cols: ColliderIndex = createColliders(),
): [number, number][] | null {
  const g = ensure(cols);
  const s = nearestWalkable(g, Math.floor(ax * RES), Math.floor(ay * RES));
  const e = nearestWalkable(g, Math.floor(bx * RES), Math.floor(by * RES));
  if (!s || !e) return null;
  const start = s[1] * W + s[0];
  const goal = e[1] * W + e[0];
  const gScore = new Float32Array(W * H).fill(Infinity);
  const came = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  gScore[start] = 0;
  // simple binary heap
  const heap: [number, number][] = [[0, start]];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const h = (n: number) => Math.hypot((n % W) - e[0], Math.floor(n / W) - e[1]);
  while (heap.length) {
    const [, cur] = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (!g[n] || closed[n]) continue;
        if (dx && dy && (!g[cy * W + nx] || !g[ny * W + cx])) continue;
        const cost = gScore[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (cost < gScore[n]) {
          gScore[n] = cost;
          came[n] = cur;
          push([cost + h(n), n]);
        }
      }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const path: [number, number][] = [];
  for (let n = goal; n !== -1; n = came[n])
    path.push([((n % W) + 0.5) / RES, (Math.floor(n / W) + 0.5) / RES]);
  path.reverse();
  // string-pull: drop collinear points
  const out: [number, number][] = [];
  for (let i = 0; i < path.length; i++) {
    if (i === 0 || i === path.length - 1 || i % 2 === 0) out.push(path[i]);
  }
  out.push([bx, by]);
  return out;
}
