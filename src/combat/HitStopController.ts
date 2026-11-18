/**
 * 基于打击量级的分级冻结顿帧（Hit-Stop）、精灵受击微抖动与屏幕冲击参数控制器
 * （src/combat/HitStopController.ts）。
 *
 * 严格对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md 第 1.3 节数学模型：
 * HitStop_ms = clamp(BaseStop_weight + 14*I_crit + 22*I_breachStun + 8*ln(1 + N_extra), 16, 140)
 */

import type { ClockController } from '../core/ClockController';
import { COMBAT_CONSTANTS, type HitWeightClass } from '../data/weapons.data';

export interface HitImpactCue {
  readonly hitStopMs: number;
  readonly traumaDelta: number;
  readonly chromaticIntensity: number;
  readonly targetJitterAmplitudePx: number;
  readonly attackerJitterAmplitudePx: number;
}

/** 计算精确顿帧毫秒数（例如 HEAVY 75 + Crit 14 + BreachStun 22 = 111ms） */
export function computeHitStopDurationMs(
  weight: HitWeightClass,
  isCrit: boolean,
  triggeredBreachStun: boolean,
  extraTargetsCount = 0
): number {
  let baseMs: number;
  switch (weight) {
    case 'LIGHT':
      baseMs = COMBAT_CONSTANTS.HITSTOP_BASE_LIGHT_MS;
      break;
    case 'MEDIUM':
      baseMs = COMBAT_CONSTANTS.HITSTOP_BASE_MEDIUM_MS;
      break;
    case 'HEAVY':
      baseMs = COMBAT_CONSTANTS.HITSTOP_BASE_HEAVY_MS;
      break;
    case 'PARRY':
      baseMs = COMBAT_CONSTANTS.HITSTOP_BASE_PARRY_MS;
      break;
  }

  const critBonus = isCrit ? COMBAT_CONSTANTS.HITSTOP_CRIT_BONUS_MS : 0;
  const breachBonus = triggeredBreachStun ? COMBAT_CONSTANTS.HITSTOP_BREACH_BONUS_MS : 0;
  const multiBonus =
    COMBAT_CONSTANTS.HITSTOP_MULTI_TARGET_COEFF * Math.log(1 + Math.max(0, extraTargetsCount));

  const rawMs = Math.round(baseMs + critBonus + breachBonus + multiBonus);
  return Math.min(COMBAT_CONSTANTS.HITSTOP_MAX_MS, Math.max(COMBAT_CONSTANTS.HITSTOP_MIN_MS, rawMs));
}

export class HitStopController {
  private jitterPhase = 0;
  private activeTargetId: string | null = null;
  private targetAmplitudePx = 0;
  private attackerAmplitudePx = 0;

  public constructor(private readonly clock: ClockController) {}

  public get isFrozen(): boolean {
    return this.clock.isHitStopActive;
  }

  /**
   * 根据打击量级、暴击、破盾与多目标数量触发 ClockController 冻结帧，
   * 并返回对应的摄像机创伤度增量与色差撕裂脉冲强度。
   */
  public registerImpact(
    weight: HitWeightClass,
    isCrit: boolean,
    triggeredBreachStun: boolean,
    primaryTargetId: string | null,
    extraTargetsCount = 0
  ): HitImpactCue {
    const hitStopMs = computeHitStopDurationMs(
      weight,
      isCrit,
      triggeredBreachStun,
      extraTargetsCount
    );
    this.clock.triggerHitStop(hitStopMs);

    const targetAmp = weight === 'LIGHT' ? 2 : 3;
    const attackerAmp = weight === 'HEAVY' || weight === 'PARRY' ? 2 : 0;

    this.activeTargetId = primaryTargetId;
    this.targetAmplitudePx = Math.max(this.targetAmplitudePx, targetAmp);
    this.attackerAmplitudePx = Math.max(this.attackerAmplitudePx, attackerAmp);

    let traumaDelta = 0.06;
    if (weight === 'PARRY') {
      traumaDelta = 0.42;
    } else if (weight === 'HEAVY') {
      traumaDelta = isCrit ? 0.38 : 0.32;
    } else if (weight === 'MEDIUM') {
      traumaDelta = isCrit ? 0.22 : 0.12;
    } else if (isCrit) {
      traumaDelta = 0.12;
    }

    let chromaticIntensity = 0;
    if (weight === 'PARRY') {
      chromaticIntensity = 0.85;
    } else if (weight === 'HEAVY' && (isCrit || triggeredBreachStun)) {
      chromaticIntensity = 0.76;
    } else if (isCrit) {
      chromaticIntensity = 0.46;
    }

    return {
      hitStopMs,
      traumaDelta,
      chromaticIntensity,
      targetJitterAmplitudePx: targetAmp,
      attackerJitterAmplitudePx: attackerAmp,
    };
  }

  /** 在渲染帧（含顿帧冻结期间）采样目标与攻击者的瞬态高频水平震颤偏移 */
  public sampleRenderJitter(rawDeltaMs: number): {
    readonly targetId: string | null;
    readonly targetOffsetX: number;
    readonly attackerOffsetX: number;
  } {
    if (!this.clock.isHitStopActive) {
      this.activeTargetId = null;
      this.targetAmplitudePx = 0;
      this.attackerAmplitudePx = 0;
      return { targetId: null, targetOffsetX: 0, attackerOffsetX: 0 };
    }

    this.jitterPhase += rawDeltaMs * 0.18;
    const sign = (Math.floor(this.jitterPhase) & 1) === 0 ? 1 : -1;
    return {
      targetId: this.activeTargetId,
      targetOffsetX: sign * this.targetAmplitudePx,
      attackerOffsetX: -sign * this.attackerAmplitudePx,
    };
  }
}
