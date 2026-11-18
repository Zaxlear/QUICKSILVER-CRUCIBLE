/**
 * 双多阶段 Boss 竞技场机关、激光、浮台与水银海交互契约（src/entities/enemies/bosses/BossTypes.ts）。
 * 100% 纯接口与轻量状态结构，支持 BossArenaScene 实机渲染与 Vitest 无头帧级验证。
 */

import type { BossHudSnapshot, BossId, EndingOutcomeId } from '../../../data/dialogue.data';

export type GrateStateKind = 'IDLE' | 'WARN' | 'ERUPT';

export interface FurnaceGrateSlotState {
  readonly gateIndex: 0 | 1 | 2 | 3;
  readonly centerX: number;
  readonly widthPx: number;
  state: GrateStateKind;
}

export interface SlidingFlameWave {
  x: number;
  readonly y: number;
  readonly vx: number;
  remainingMs: number;
}

export interface AstrolabeLaserState {
  active: boolean;
  isHotBeam: boolean;
  originX: number;
  originY: number;
  angleRad: number;
}

export interface QuicksilverBladeWave {
  readonly waveIndex: number;
  readonly safeGapCenterX: number;
  readonly safeGapHalfWidthPx: number;
  state: 'RIPPLE_WARN' | 'BLADE_ERUPT';
  remainingMs: number;
}

export interface BossArenaCallbacks {
  onPhaseTransition?: (bossId: BossId, nextPhase: 1 | 2 | 3, trauma: number) => void;
  onSyncFurnaceGrates?: (activePair: readonly (0 | 1 | 2 | 3)[], state: GrateStateKind) => void;
  onSpawnSulfurWave?: (originX: number, floorY: number, dirX: -1 | 1) => void;
  onElevatePorcelainPlatforms?: (elevated: boolean) => void;
  onSyncAstrolabeLaser?: (laser: AstrolabeLaserState) => void;
  onApplyBlackholePull?: (centerX: number, centerY: number, pullSpeedPxS: number, active: boolean) => void;
  onSyncMatrixFloor?: (state: 'OFF' | 'WARN' | 'BURN', safeZoneCenterX: number) => void;
  onActivateQuicksilverSea?: () => void;
  onSyncQuicksilverBlades?: (wave: QuicksilverBladeWave | null) => void;
  onSyncCalcinationSun?: (active: boolean, x: number, y: number, chargeRatio: number) => void;
  onParacelsusP2ZeroHp?: () => EndingOutcomeId;
  onParacelsusP3Defeated?: () => void;
  onTriggerChromaticClash?: (worldX: number, worldY: number, hitStopMs: number) => void;
}

export interface IBossCombatEntity {
  readonly bossId: BossId;
  readonly phase: 1 | 2 | 3;
  readonly activeMoveLabelZh: string;
  readonly isTransitioning: boolean;
  buildBossHudSnapshot(): BossHudSnapshot;
}
