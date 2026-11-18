/**
 * 标准 8 邻域 47-Tile Blob Autotile 位掩码纯函数解析器。
 * 严格遵循单向依赖铁律（不依赖任何场景或渲染实例），供瓦片烘焙与拼接器复用。
 */

export const AUTOTILE_BIT_N = 1 << 0; // 1
export const AUTOTILE_BIT_NE = 1 << 1; // 2
export const AUTOTILE_BIT_E = 1 << 2; // 4
export const AUTOTILE_BIT_SE = 1 << 3; // 8
export const AUTOTILE_BIT_S = 1 << 4; // 16
export const AUTOTILE_BIT_SW = 1 << 5; // 32
export const AUTOTILE_BIT_W = 1 << 6; // 64
export const AUTOTILE_BIT_NW = 1 << 7; // 128

/** 瓦片集特殊结构扩展槽位（紧随 0..46 标准 47-Tile 之后，组成 8x7 = 56 格图集） */
export const SPECIAL_TILE_INDEX = {
  SOLID_ALT_MASONRY: 47,
  FURNACE_MOLTEN_GRATE: 48,
  ONEWAY_GRATE_LEFT: 49,
  ONEWAY_GRATE_MID: 50,
  ONEWAY_GRATE_RIGHT: 51,
  CLIMB_WALL_LEFT: 52,
  CLIMB_WALL_RIGHT: 53,
  BREAKABLE_SLAG_LEFT: 54,
  BREAKABLE_SLAG_RIGHT: 55,
} as const;

export const TILESET_COLUMNS = 8;
export const TILESET_ROWS = 7;

/**
 * 裁剪无效对角邻域位：唯有相邻两个正交方向同时为实心时，该对角线内凹角才有效。
 * 此约束将 2^8 = 256 种原始掩码精确收敛至 47 种拓扑等价类。
 */
export function gateBlobBitmask(rawMask8: number): number {
  const n = (rawMask8 & AUTOTILE_BIT_N) !== 0;
  const e = (rawMask8 & AUTOTILE_BIT_E) !== 0;
  const s = (rawMask8 & AUTOTILE_BIT_S) !== 0;
  const w = (rawMask8 & AUTOTILE_BIT_W) !== 0;

  let gated = rawMask8 & (AUTOTILE_BIT_N | AUTOTILE_BIT_E | AUTOTILE_BIT_S | AUTOTILE_BIT_W);
  if (n && e && (rawMask8 & AUTOTILE_BIT_NE) !== 0) gated |= AUTOTILE_BIT_NE;
  if (s && e && (rawMask8 & AUTOTILE_BIT_SE) !== 0) gated |= AUTOTILE_BIT_SE;
  if (s && w && (rawMask8 & AUTOTILE_BIT_SW) !== 0) gated |= AUTOTILE_BIT_SW;
  if (n && w && (rawMask8 & AUTOTILE_BIT_NW) !== 0) gated |= AUTOTILE_BIT_NW;
  return gated;
}

function buildCanonical47Masks(): {
  readonly masks: readonly number[];
  readonly maskToIndex: ReadonlyMap<number, number>;
} {
  const unique = new Set<number>();
  for (let raw = 0; raw < 256; raw++) {
    unique.add(gateBlobBitmask(raw));
  }
  const sorted = Array.from(unique).sort((a, b) => a - b);
  const lookup = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    lookup.set(sorted[i]!, i);
  }
  return { masks: sorted, maskToIndex: lookup };
}

const CANONICAL_DATA = buildCanonical47Masks();

/** 升序排列的全部 47 个标准门控位掩码（与 generate_sprite.py 生成器 1:1 严格同序） */
export const CANONICAL_BLOB_47_MASKS: readonly number[] = CANONICAL_DATA.masks;

/** 将任意 0..255 原始 8 邻域位掩码映射为 0..46 瓦片索引 */
export function resolveAutotile47Index(rawMask8: number): number {
  const gated = gateBlobBitmask(rawMask8 & 0xff);
  return CANONICAL_DATA.maskToIndex.get(gated) ?? 0;
}

/**
 * 对二维布尔实心网格中的 (tx, ty) 采样 8 邻域并返回 0..46 自动瓦片索引。
 * 网格越界位置可按 outOfBoundsSolid 指定（墙体封闭边界默认视作实心或空心）。
 */
export function computeGridAutotileIndex(
  isSolidAt: (tx: number, ty: number) => boolean,
  tx: number,
  ty: number
): number {
  let raw = 0;
  if (isSolidAt(tx, ty - 1)) raw |= AUTOTILE_BIT_N;
  if (isSolidAt(tx + 1, ty - 1)) raw |= AUTOTILE_BIT_NE;
  if (isSolidAt(tx + 1, ty)) raw |= AUTOTILE_BIT_E;
  if (isSolidAt(tx + 1, ty + 1)) raw |= AUTOTILE_BIT_SE;
  if (isSolidAt(tx, ty + 1)) raw |= AUTOTILE_BIT_S;
  if (isSolidAt(tx - 1, ty + 1)) raw |= AUTOTILE_BIT_SW;
  if (isSolidAt(tx - 1, ty)) raw |= AUTOTILE_BIT_W;
  if (isSolidAt(tx - 1, ty - 1)) raw |= AUTOTILE_BIT_NW;
  return resolveAutotile47Index(raw);
}
