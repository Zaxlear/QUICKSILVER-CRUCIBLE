/**
 * 系统视口、WebGL 着色器巡检台与 120Hz 时钟遥测快照纯类型定义
 * （src/core/SystemPayloads.ts）。
 */

export type ViewportTierId =
  | 'TIER_1_DESKTOP_FHD'
  | 'TIER_2_DESKTOP_HIRES'
  | 'TIER_3_MOBILE_EXPAND'
  | 'TIER_4_TABLET_EXPAND';

export interface ViewportSnapshotPayload {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly zoomFactor: number;
  readonly dpr: number;
  readonly tier: ViewportTierId;
  readonly safeInsets: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

export type ShowcaseShaderId =
  | 'hitFlash'
  | 'ashDissolve'
  | 'shieldRefract'
  | 'chromaticImpact'
  | 'vignetteBloom';

export interface ShowcaseStatePayload {
  readonly activeSceneKey: string;
  readonly heroAnimKey: string;
  readonly activeLights: number;
  readonly shaders: {
    readonly hitFlash: boolean;
    readonly ashDissolve: boolean;
    readonly shieldRefract: boolean;
    readonly chromaticImpact: boolean;
    readonly vignetteBloom: boolean;
  };
}

export interface BootTelemetryPayload {
  readonly rendererType: number;
  readonly isWebGL: boolean;
  readonly framebufferLit: boolean;
  readonly maxLights: number;
  readonly activeLights: number;
  readonly fixedSimHz: number;
  readonly totalFixedTicks: number;
  readonly isPaused: boolean;
  readonly trauma: number;
  readonly rngSeed: number;
}
