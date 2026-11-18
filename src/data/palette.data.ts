/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》全局锁定 48 色暗黑炼金主色板与 6 元素发光锚点。
 * 纯静态数据层（零运行时依赖），与 tools/asset-factory/quantize_palette.py 100% 镜像对齐。
 */

export type PaletteElementId =
  | 'oiled'
  | 'ignited'
  | 'bleeding'
  | 'frozen'
  | 'electrified'
  | 'poisoned';

export type LightPresetId =
  | 'TORCH_AMBER'
  | 'VITRIOL_VAT_GREEN'
  | 'VOLTAIC_CYAN'
  | 'FURNACE_CRIMSON'
  | 'MERCURY_SILVER';

export interface ElementGlowAnchorSpec {
  readonly id: PaletteElementId;
  readonly coreHex: string;
  readonly coreNum: number;
  readonly lightHex: string;
  readonly lightNum: number;
  readonly bloomEdgeHex: string;
  readonly bloomEdgeNum: number;
  readonly badge: string;
}

export interface LightAnchorPresetColor {
  readonly colorHex: string;
  readonly colorNum: number;
  readonly baseIntensity: number;
}

/** 1. 深渊冷灰阶 (8 色) — 背景暗部、铸铁阴影、石墙背光面 */
export const VOID_SLATE_RAMP = [
  '#0B0C10',
  '#11131C',
  '#161824',
  '#1E2233',
  '#272C42',
  '#323954',
  '#414A6B',
  '#556085',
] as const;

/** 2. 白瓷与活态水银阶 (6 色) — 主角白瓷骨甲、水银核高光、刀刃锋口 */
export const PORCELAIN_MERCURY_RAMP = [
  '#7C8599',
  '#9AA5B8',
  '#B8C4D4',
  '#D4DEE8',
  '#E8EFF5',
  '#F8FAFC',
] as const;

/** 3. 腐化黄铜与星盘金阶 (8 色) — 发条齿轮、香炉、镀金颅骨、传说装备描边 */
export const CORRUPTED_BRASS_RAMP = [
  '#291A0E',
  '#3D2817',
  '#593A1E',
  '#7A5128',
  '#9E6B34',
  '#C28B42',
  '#E0AE53',
  '#FBBF24',
] as const;

/** 4. 矿渣赤铁与腐肉阶 (8 色) — 赤化武器、铁锈、畸变血肉、受击飙血 */
export const SLAG_CRIMSON_RAMP = [
  '#240B12',
  '#3B121E',
  '#591B2B',
  '#7D2438',
  '#A62B44',
  '#CF3650',
  '#E11D48',
  '#FB7185',
] as const;

/** 5. 铜绿与矾酸毒阶 (8 色) — 暗渠铜管、苔藓、藤蔓符文、酸液高光 */
export const VERDIGRIS_VITRIOL_RAMP = [
  '#0B1F1D',
  '#12332F',
  '#1B4D46',
  '#266B60',
  '#328F7D',
  '#22C55E',
  '#3CE682',
  '#A3E635',
] as const;

/** 6. 熔炉余烬与以太阶 (10 色) — 锻炉火光、炼金紫火、高压电弧、诅咒黑雾 */
export const FURNACE_AETHER_RAMP = [
  '#431407',
  '#7C2D12',
  '#C2410C',
  '#EA580C',
  '#FF5E2B',
  '#FDBA74',
  '#3B0764',
  '#6D28D9',
  '#A855F7',
  '#38BDF8',
] as const;

/** 全局锁定 48 色 HEX 主色板（严格按色阶拼接） */
export const LOCKED_PALETTE_48_HEX = [
  ...VOID_SLATE_RAMP,
  ...PORCELAIN_MERCURY_RAMP,
  ...CORRUPTED_BRASS_RAMP,
  ...SLAG_CRIMSON_RAMP,
  ...VERDIGRIS_VITRIOL_RAMP,
  ...FURNACE_AETHER_RAMP,
] as const;

export type LockedPaletteHex = (typeof LOCKED_PALETTE_48_HEX)[number];

export const LOCKED_PALETTE_SET: ReadonlySet<string> = new Set<string>(LOCKED_PALETTE_48_HEX);

export const LOCKED_PALETTE_48_RGB: readonly (readonly [number, number, number])[] =
  LOCKED_PALETTE_48_HEX.map((hex) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ] as const);

/** 六大元素异常状态标准发光色锚点（着色器、动态光源与 UI 状态徽标统一引用） */
export const ELEMENT_STATUS_GLOW: Readonly<Record<PaletteElementId, ElementGlowAnchorSpec>> = {
  oiled: {
    id: 'oiled',
    coreHex: '#4C1D95',
    coreNum: 0x4c1d95,
    lightHex: '#A855F7',
    lightNum: 0xa855f7,
    bloomEdgeHex: '#C084FC',
    bloomEdgeNum: 0xc084fc,
    badge: 'OIL / NPLM',
  },
  ignited: {
    id: 'ignited',
    coreHex: '#FF5E2B',
    coreNum: 0xff5e2b,
    lightHex: '#FB923C',
    lightNum: 0xfb923c,
    bloomEdgeHex: '#FBBF24',
    bloomEdgeNum: 0xfbbf24,
    badge: 'BRN',
  },
  bleeding: {
    id: 'bleeding',
    coreHex: '#E11D48',
    coreNum: 0xe11d48,
    lightHex: '#F43F5E',
    lightNum: 0xf43f5e,
    bloomEdgeHex: '#881337',
    bloomEdgeNum: 0x881337,
    badge: 'BLD',
  },
  frozen: {
    id: 'frozen',
    coreHex: '#67E8F9',
    coreNum: 0x67e8f9,
    lightHex: '#22D3EE',
    lightNum: 0x22d3ee,
    bloomEdgeHex: '#ECFEFF',
    bloomEdgeNum: 0xecfeff,
    badge: 'FRZ',
  },
  electrified: {
    id: 'electrified',
    coreHex: '#38BDF8',
    coreNum: 0x38bdf8,
    lightHex: '#60A5FA',
    lightNum: 0x60a5fa,
    bloomEdgeHex: '#E0F2FE',
    bloomEdgeNum: 0xe0f2fe,
    badge: 'SHK',
  },
  poisoned: {
    id: 'poisoned',
    coreHex: '#3CE682',
    coreNum: 0x3ce682,
    lightHex: '#4ADE80',
    lightNum: 0x4ade80,
    bloomEdgeHex: '#BEF264',
    bloomEdgeNum: 0xbef264,
    badge: 'PSN',
  },
};

/** 房间动态光源锚点预设色表 */
export const LIGHT_ANCHOR_COLOR_PRESETS: Readonly<Record<LightPresetId, LightAnchorPresetColor>> = {
  TORCH_AMBER: { colorHex: '#FF8A3D', colorNum: 0xff8a3d, baseIntensity: 2.15 },
  VITRIOL_VAT_GREEN: { colorHex: '#3CE682', colorNum: 0x3ce682, baseIntensity: 1.75 },
  VOLTAIC_CYAN: { colorHex: '#38BDF8', colorNum: 0x38bdf8, baseIntensity: 2.0 },
  FURNACE_CRIMSON: { colorHex: '#FF5E2B', colorNum: 0xff5e2b, baseIntensity: 2.25 },
  MERCURY_SILVER: { colorHex: '#B8C4D4', colorNum: 0xb8c4d4, baseIntensity: 1.55 },
};

/** 第一层：矿渣蒸馏厂（biome_01_slag_retort）标准环境光照与视差速率参数 */
export const BIOME_01_SLAG_LIGHTING = {
  backdropHex: '#14161F',
  backdropNum: 0x14161f,
  ambientHex: '#2A2D3D',
  ambientNum: 0x2a2d3d,
  parallaxScrollFactors: [0.05, 0.15, 0.35, 0.65, 1.18] as const,
} as const;
