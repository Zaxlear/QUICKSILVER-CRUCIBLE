export const LOGICAL_BASE_WIDTH = 640;
export const LOGICAL_BASE_HEIGHT = 360;
export const LOGICAL_MAX_WIDTH = 800;
export const LOGICAL_MAX_HEIGHT = 460;
export const STANDARD_ASPECT_RATIO = LOGICAL_BASE_WIDTH / LOGICAL_BASE_HEIGHT;

export const TILE_SIZE_PX = 16;
export const PLAYER_COLLIDER_WIDTH_PX = 14;
export const PLAYER_COLLIDER_HEIGHT_PX = 30;
export const PLAYER_SPRITE_CELL_PX = 64;

export const FIXED_SIM_HZ = 120;
export const FIXED_STEP_SEC = 1 / FIXED_SIM_HZ;
export const FIXED_STEP_MS = 1000 / FIXED_SIM_HZ;
export const MAX_ACCUMULATOR_SEC = 0.05;

export const MAX_HARDWARE_LIGHTS = 24;
export const HERO_CORE_LIGHT_SLOTS = 1;
export const MAX_TRANSIENT_COMBAT_LIGHTS = 9;
export const MAX_AMBIENT_ANCHOR_LIGHTS = 14;
export const HERO_MERCURY_LIGHT_RADIUS_PX = 135;
export const HERO_MERCURY_LIGHT_INTENSITY = 1.35;

export const MAX_DPR_CAP = 3;
export const INTEGER_ZOOM_SNAP_TOLERANCE = 0.08;

export const DESKTOP_SAFE_PADDING_PX = 24;
export const MOBILE_LANDSCAPE_SAFE_X_PX = 59;
export const MOBILE_HOME_SAFE_BOTTOM_PX = 22;

export const PALETTE_VOID_HEX = '#0B0C10';
export const PALETTE_VOID_NUM = 0x0b0c10;
export const AMBIENT_SLATE_NUM = 0x272c42;
export const MERCURY_CORE_LIGHT_NUM = 0xb8c4d4;
export const TORCH_AMBER_LIGHT_NUM = 0xe0ae53;

export const DepthLayer = {
  PARALLAX_FAR: 0,
  PARALLAX_MID_FAR: 10,
  PARALLAX_MID: 20,
  PARALLAX_NEAR: 30,
  TILE_BACK: 40,
  PROPS_BACK: 50,
  TILE_MAIN: 60,
  TRAPS: 70,
  LOOT: 80,
  ENEMIES: 90,
  PLAYER_GHOST: 95,
  PLAYER: 100,
  PROJECTILES: 110,
  VFX_PARTICLES: 120,
  PARALLAX_FOREGROUND: 130,
  CRISP_TELEGRAPH: 200,
  CRISP_DAMAGE_NUMBER: 210,
} as const;

export type DepthLayerValue = (typeof DepthLayer)[keyof typeof DepthLayer];

export const HIT_FLASH_PIPELINE_KEY = 'HitFlashPipeline';
export const DATA_HIT_FLASH_AMOUNT = 'qc_hitFlashAmount';
export const DATA_HIT_FLASH_COLOR = 'qc_hitFlashColor';

export const ASH_DISSOLVE_PIPELINE_KEY = 'AshDissolvePipeline';
export const DATA_ASH_PROGRESS = 'qc_ashProgress';
export const DATA_ASH_NOISE_SCALE = 'qc_ashNoiseScale';

export function sampleHitFlashCurve(
  elapsedMs: number,
  elementRgb: readonly [number, number, number] = [1.0, 0.369, 0.169]
): { readonly amount: number; readonly rgb: readonly [number, number, number] } {
  if (elapsedMs <= 60) return { amount: 1.0, rgb: [1.0, 1.0, 1.0] };
  if (elapsedMs >= 100) return { amount: 0.0, rgb: elementRgb };
  const t = (elapsedMs - 60) / 40;
  return {
    amount: 1.0 - t,
    rgb: [
      1.0 + (elementRgb[0] - 1.0) * t,
      1.0 + (elementRgb[1] - 1.0) * t,
      1.0 + (elementRgb[2] - 1.0) * t,
    ],
  };
}

/**
 * 判定是否开启开发态 QA 调试坞与小地图跃迁调试面板：
 * - 生产构建（`!envDev`）下强制永久返回 `false`；
 * - 开发环境下默认保持纯净正式 UI，仅在 URL 携带 `?dev=1` / `?qa=1`（或按 `F9` 切换）时开启。
 */
export function isDevQaQueryEnabled(search?: string, envDev: boolean = import.meta.env.DEV): boolean {
  if (!envDev) return false;
  const raw = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (!raw) return false;
  const params = new URLSearchParams(raw);
  return params.get('dev') === '1' || params.get('qa') === '1';
}
