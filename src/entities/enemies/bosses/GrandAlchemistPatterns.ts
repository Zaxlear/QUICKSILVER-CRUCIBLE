/**
 * 钙化至高炼金师·帕拉塞尔苏斯（Boss 2）三阶段招式选取、浑天星盘激光角度与血海剑林纯解算器
 * （src/entities/enemies/bosses/GrandAlchemistPatterns.ts）。
 */

import { BOSS_COMBAT_SPECS } from '../../../data/dialogue.data';

export type ParacelsusMoveState =
  | 'IDLE_DECIDE'
  | 'P2_FUSION_TRANSITION'
  | 'AWAITING_CHOICE_STASIS'
  | 'P3_AWAKEN_TRANSITION'
  | 'A1_VOLLEY_CHARGE' | 'A1_VOLLEY_FIRE'
  | 'A2_SLASH1_WINDUP' | 'A2_SLASH1_STRIKE'
  | 'A2_SLASH2_WINDUP' | 'A2_SLASH2_STRIKE'
  | 'A2_RED3_WINDUP' | 'A2_RED3_STRIKE'
  | 'A3_LASER_AIM' | 'A3_LASER_SWEEP'
  | 'A4_BLACKHOLE_PULL' | 'A4_BLACKHOLE_BLAST'
  | 'A5_MATRIX_WARN' | 'A5_MATRIX_BURN'
  | 'A6_MIRROR_WINDUP' | 'A6_MIRROR_THRUSTS'
  | 'A7_SEA_SUBMERGE' | 'A7_SEA_BLADES'
  | 'A8_SUN_CHARGE' | 'A8_SUN_DIVE'
  | 'RECOVER';

const P = BOSS_COMBAT_SPECS.PARACELSUS;

export function pickNextParacelsusMove(
  phase: 1 | 2 | 3,
  cycle: number,
  hpRatio: number,
  desperationUsed: boolean
): { readonly state: ParacelsusMoveState; readonly durationMs: number; readonly labelZh: string; readonly markDesperation: boolean } {
  if (phase === 1) {
    return cycle % 3 === 0
      ? { state: 'A4_BLACKHOLE_PULL', durationMs: P.a4BlackholePullMs, labelZh: 'A4 · 原初质黑洞引力场', markDesperation: false }
      : { state: 'A1_VOLLEY_CHARGE', durationMs: P.a1ChargeMs, labelZh: 'A1 · 四象炼金齐射', markDesperation: false };
  }
  if (phase === 2) {
    const slot = cycle % 4;
    if (slot === 1) return { state: 'A2_SLASH1_WINDUP', durationMs: P.a2Slash1WindupMs, labelZh: 'A2 · 水银圣剑三连斩', markDesperation: false };
    if (slot === 2) return { state: 'A3_LASER_AIM', durationMs: P.a3LaserAimMs, labelZh: 'A3 · 浑天星盘扫射激光', markDesperation: false };
    if (slot === 3) return { state: 'A5_MATRIX_WARN', durationMs: P.a5MatrixWarnMs, labelZh: 'A5 · 炼金矩阵地板转化', markDesperation: false };
    return { state: 'A4_BLACKHOLE_PULL', durationMs: P.a4BlackholePullMs, labelZh: 'A4 · 原初质黑洞坍缩', markDesperation: false };
  }
  // Phase 3: The Great Alkahest (True Ending Exclusive)
  if (!desperationUsed && hpRatio < P.a8DesperationRatio) {
    return { state: 'A8_SUN_CHARGE', durationMs: P.a8CalcinationChargeMs, labelZh: 'A8 · 终焉大煅烧（宿命决死）', markDesperation: true };
  }
  return cycle % 2 === 1
    ? { state: 'A6_MIRROR_WINDUP', durationMs: P.a6MirrorThrustWindupMs, labelZh: 'A6 · 镜像瞬步五连刺', markDesperation: false }
    : { state: 'A7_SEA_SUBMERGE', durationMs: 360, labelZh: 'A7 · 剥离之痛·血海穿刺', markDesperation: false };
}

/** 计算 A3 浑天星盘顺时针 120°（30° -> 150°）扫射激光弧角与命中判定 */
export function computeAstrolabeLaserAngleRad(progress01: number): number {
  const startRad = (30 * Math.PI) / 180;
  const sweepSpanRad = (120 * Math.PI) / 180;
  return startRad + Math.max(0, Math.min(1, progress01)) * sweepSpanRad;
}

export function doesLaserIntersectPlayer(
  originX: number,
  originY: number,
  angleRad: number,
  playerX: number,
  playerY: number
): boolean {
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const px = playerX - originX;
  const py = playerY - 16 - originY;
  const proj = px * dx + py * dy;
  if (proj < 16 || proj > 560) return false;
  const perpDist = Math.abs(px * dy - py * dx);
  return perpDist <= 18;
}

export function mapParacelsusPoseSuffix(state: ParacelsusMoveState, phase: 1 | 2 | 3, animClockMs: number): string {
  if (phase === 1) {
    if (state === 'A1_VOLLEY_CHARGE' || state === 'A4_BLACKHOLE_PULL') return 'p1_windup_0';
    if (state === 'A1_VOLLEY_FIRE' || state === 'A4_BLACKHOLE_BLAST') return 'p1_attack_0';
    return (Math.floor(animClockMs / 240) & 1) === 0 ? 'p1_idle_0' : 'p1_idle_1';
  }
  if (phase === 2) {
    if (state === 'A3_LASER_AIM' || state === 'A3_LASER_SWEEP') return 'p2_laser_0';
    if (state.includes('WINDUP') || state === 'A5_MATRIX_WARN') return 'p2_windup_0';
    if (state === 'A2_RED3_STRIKE') return 'p2_slam_0';
    if (state.includes('STRIKE') || state === 'A5_MATRIX_BURN') return 'p2_slash_0';
    return 'p2_idle_0';
  }
  // Phase 3
  if (state === 'A7_SEA_SUBMERGE' || state === 'A7_SEA_BLADES') return 'p3_submerge_0';
  if (state === 'A8_SUN_CHARGE' || state === 'A8_SUN_DIVE') return 'p3_sun_0';
  if (state === 'A6_MIRROR_WINDUP') return 'p3_windup_0';
  if (state === 'A6_MIRROR_THRUSTS') return 'p3_thrust_0';
  return (Math.floor(animClockMs / 180) & 1) === 0 ? 'p3_idle_0' : 'p3_move_0';
}
