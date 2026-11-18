/**
 * 零 GC 静态/准静态矩形网格空间哈希索引（src/core/SpatialRectIndex.ts）。
 *
 * 将全图 70~170 个拼接地形碰撞体按 256×256px 网格分桶，使 120Hz 扫掠碰撞、
 * 投射物穿墙检测与怪物视线射线步进（LOS）从全图线性遍历降为 O(1) 局部桶查询。
 */

export interface SpatialRectLike {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

const CELL_PX = 256;
const CELL_OFFSET = 4096;
const CELL_STRIDE = 8192;
const SMALL_ARRAY_THRESHOLD = 12;
const EMPTY_BUCKET: readonly never[] = [];

export function packSpatialCellKey(cx: number, cy: number): number {
  return (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);
}

export function worldToSpatialCell(coordPx: number): number {
  return Math.floor(coordPx / CELL_PX);
}

export class SpatialRectIndex<T extends SpatialRectLike = SpatialRectLike> {
  public readonly sourceLength: number;
  public readonly firstRef: T | undefined;
  public readonly lastRef: T | undefined;
  private readonly cells = new Map<number, T[]>();

  public constructor(rects: readonly T[]) {
    this.sourceLength = rects.length;
    this.firstRef = rects[0];
    this.lastRef = rects[rects.length - 1];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i]!;
      const cx0 = Math.floor(r.x / CELL_PX);
      const cy0 = Math.floor(r.y / CELL_PX);
      const cx1 = Math.floor((r.x + r.w) / CELL_PX);
      const cy1 = Math.floor((r.y + r.h) / CELL_PX);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = packSpatialCellKey(cx, cy);
          let bucket = this.cells.get(key);
          if (!bucket) {
            bucket = [];
            this.cells.set(key, bucket);
          }
          bucket.push(r);
        }
      }
    }
  }

  public getCellBucket(cx: number, cy: number): readonly T[] {
    return this.cells.get(packSpatialCellKey(cx, cy)) ?? EMPTY_BUCKET;
  }
}

const indexCache = new WeakMap<readonly SpatialRectLike[], SpatialRectIndex<SpatialRectLike>>();

export function getSpatialRectIndex<T extends SpatialRectLike>(
  rects: readonly T[]
): SpatialRectIndex<T> | null {
  if (rects.length <= SMALL_ARRAY_THRESHOLD) return null;
  let cached = indexCache.get(rects) as SpatialRectIndex<T> | undefined;
  if (
    !cached ||
    cached.sourceLength !== rects.length ||
    cached.firstRef !== rects[0] ||
    cached.lastRef !== rects[rects.length - 1]
  ) {
    cached = new SpatialRectIndex<T>(rects);
    indexCache.set(rects, cached as SpatialRectIndex<SpatialRectLike>);
  }
  return cached;
}

export function invalidateSpatialRectIndex(rects: readonly SpatialRectLike[]): void {
  indexCache.delete(rects);
}

/**
 * 零 GC 查询与给定 AABB 重叠的局部候选矩形列表：
 * - 小数组（<=12）直接返回原数组；
 * - 单网格命中（>85% 场景）直接返回只读桶引用，零拷贝；
 * - 跨网格边界时写入调用方预分配 scratch 缓冲区并返回。
 */
export function selectRectCandidates<T extends SpatialRectLike>(
  rects: readonly T[],
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  scratch: T[]
): readonly T[] {
  const idx = getSpatialRectIndex(rects);
  if (!idx) return rects;
  const cx0 = Math.floor(minX / CELL_PX);
  const cx1 = Math.floor(maxX / CELL_PX);
  const cy0 = Math.floor(minY / CELL_PX);
  const cy1 = Math.floor(maxY / CELL_PX);
  if (cx0 === cx1 && cy0 === cy1) {
    return idx.getCellBucket(cx0, cy0);
  }
  scratch.length = 0;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = idx.getCellBucket(cx, cy);
      for (let i = 0; i < bucket.length; i++) scratch.push(bucket[i]!);
    }
  }
  return scratch;
}

export function pointHitsIndexedRects(
  x: number,
  y: number,
  rects: readonly SpatialRectLike[]
): boolean {
  const idx = getSpatialRectIndex(rects);
  const list = idx
    ? idx.getCellBucket(Math.floor(x / CELL_PX), Math.floor(y / CELL_PX))
    : rects;
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

export function paddedPointHitsIndexedRects(
  x: number,
  y: number,
  padPx: number,
  rects: readonly SpatialRectLike[]
): boolean {
  const idx = getSpatialRectIndex(rects);
  if (!idx) {
    for (let i = 0; i < rects.length; i++) {
      const w = rects[i]!;
      if (x + padPx > w.x && x - padPx < w.x + w.w && y + padPx > w.y && y - padPx < w.y + w.h) {
        return true;
      }
    }
    return false;
  }

  const cx0 = Math.floor((x - padPx) / CELL_PX);
  const cx1 = Math.floor((x + padPx) / CELL_PX);
  const cy0 = Math.floor((y - padPx) / CELL_PX);
  const cy1 = Math.floor((y + padPx) / CELL_PX);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const bucket = idx.getCellBucket(cx, cy);
      for (let i = 0; i < bucket.length; i++) {
        const w = bucket[i]!;
        if (x + padPx > w.x && x - padPx < w.x + w.w && y + padPx > w.y && y - padPx < w.y + w.h) {
          return true;
        }
      }
    }
  }
  return false;
}
