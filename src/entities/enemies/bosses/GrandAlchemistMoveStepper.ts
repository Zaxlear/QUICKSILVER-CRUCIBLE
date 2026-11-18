/**
 * 钙化至高炼金师·帕拉塞尔苏斯（Boss 2）A1~A8 全招式帧级执行步进器
 * （src/entities/enemies/bosses/GrandAlchemistMoveStepper.ts）。
 */

import { BOSS_COMBAT_SPECS } from '../../../data/dialogue.data';
import type { BaseEnemy, EnemyStepContext } from '../BaseEnemy';
import { clampGroundX } from '../PerceptionSensor';
import type { BossArenaCallbacks } from './BossTypes';
import {
  computeAstrolabeLaserAngleRad,
  doesLaserIntersectPlayer,
  pickNextParacelsusMove,
  type ParacelsusMoveState,
} from './GrandAlchemistPatterns';

export interface ParacelsusRuntimeBag {
  state: ParacelsusMoveState;
  timerMs: number;
  subStepCounter: number;
  subStepTimerMs: number;
  strikeCommitted: boolean;
  moveCycle: number;
  desperationUsed: boolean;
  readonly floorY: number;
  readonly centerX: number;
  readonly arena: BossArenaCallbacks;
  enterState: (next: ParacelsusMoveState, durationMs: number, labelZh: string) => void;
}

const P = BOSS_COMBAT_SPECS.PARACELSUS;

export function stepParacelsusMoveState(
  host: BaseEnemy,
  phase: 1 | 2 | 3,
  bag: ParacelsusRuntimeBag,
  ctx: EnemyStepContext
): void {
  const dx = ctx.playerX - host.x;
  const dir: -1 | 1 = dx >= 0 ? 1 : -1;
  const astroY = bag.floorY - 196;

  switch (bag.state) {
    case 'AWAITING_CHOICE_STASIS':
      host.telegraph = 'NONE';
      return;
    case 'P2_FUSION_TRANSITION':
    case 'P3_AWAKEN_TRANSITION':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('IDLE_DECIDE', 220, phase === 3 ? '水银剑势对峙' : '神躯威压');
      return;
    case 'IDLE_DECIDE':
      host.facing = dir; host.telegraph = 'NONE';
      if (phase === 3 && Math.abs(dx) > 74) {
        host.x = clampGroundX(host.x + dir * 185 * host.speedScale * ctx.dtSec, host.patrolMinX, host.patrolMaxX);
      }
      if (bag.timerMs <= 0) {
        bag.moveCycle += 1;
        const pick = pickNextParacelsusMove(phase, bag.moveCycle, host.hp / Math.max(1, host.maxHp), bag.desperationUsed);
        if (pick.markDesperation) bag.desperationUsed = true;
        bag.enterState(pick.state, pick.durationMs, pick.labelZh);
      }
      return;
    case 'A1_VOLLEY_CHARGE':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) { bag.subStepCounter = 0; bag.subStepTimerMs = 0; bag.enterState('A1_VOLLEY_FIRE', P.a1VolleyIntervalMs * 4 + 80, 'A1 · 四象追踪齐射'); }
      return;
    case 'A1_VOLLEY_FIRE':
      host.telegraph = 'YELLOW_PARRIABLE';
      bag.subStepTimerMs -= ctx.dtMs;
      if (bag.subStepTimerMs <= 0 && bag.subStepCounter < 4) {
        const kinds = ['ENEMY_ASTRAL_BLADE', 'ENEMY_ACID_GLOB', 'ENEMY_ASTRAL_BLADE', 'ENEMY_FLASK'] as const;
        const ang = Math.atan2(ctx.playerY - 18 - (host.y - 24), ctx.playerX - host.x);
        ctx.onSpawnProjectile(host.id, host.x, host.y - 24, Math.cos(ang) * 320, Math.sin(ang) * 320, Math.round(30 * host.damageScale), 0, kinds[bag.subStepCounter]!);
        bag.subStepCounter += 1;
        bag.subStepTimerMs = P.a1VolleyIntervalMs;
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', 420, '法球回旋');
      return;
    case 'A2_SLASH1_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('A2_SLASH1_STRIKE', 90, 'A2 · 圣剑横斩 (1/3)');
      return;
    case 'A2_SLASH1_STRIKE':
      if (!bag.strikeCommitted) { bag.strikeCommitted = true; if (Math.abs(dx) <= 145 && Math.abs(ctx.playerY - bag.floorY) <= 72) ctx.onStrikePlayer(Math.round(42 * host.damageScale), dir, true, host); }
      if (bag.timerMs <= 0) bag.enterState('A2_SLASH2_WINDUP', P.a2Slash2WindupMs, 'A2 · 圣剑上挑 (2/3)');
      return;
    case 'A2_SLASH2_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('A2_SLASH2_STRIKE', 90, 'A2 · 圣剑挑斩');
      return;
    case 'A2_SLASH2_STRIKE':
      if (!bag.strikeCommitted) { bag.strikeCommitted = true; if (Math.abs(dx) <= 150 && Math.abs(ctx.playerY - bag.floorY) <= 84) ctx.onStrikePlayer(Math.round(44 * host.damageScale), dir, true, host); }
      if (bag.timerMs <= 0) bag.enterState('A2_RED3_WINDUP', P.a2DelayedRedMs, 'A2 · 延迟纵贯重劈 (破防!)');
      return;
    case 'A2_RED3_WINDUP':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('A2_RED3_STRIKE', 110, 'A2 · 圣剑灭世纵劈');
      return;
    case 'A2_RED3_STRIKE':
      host.telegraph = 'NONE';
      if (!bag.strikeCommitted) { bag.strikeCommitted = true; if (Math.abs(dx) <= 172 && Math.abs(ctx.playerY - bag.floorY) <= 88) ctx.onStrikePlayer(Math.round(58 * host.damageScale), dir, false, host); }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', 620, '圣剑归位');
      return;
    case 'A3_LASER_AIM':
      host.telegraph = 'RED_UNPARRIABLE';
      bag.arena.onElevatePorcelainPlatforms?.(true);
      bag.arena.onSyncAstrolabeLaser?.({ active: true, isHotBeam: false, originX: bag.centerX, originY: astroY, angleRad: computeAstrolabeLaserAngleRad(0) });
      if (bag.timerMs <= 0) bag.enterState('A3_LASER_SWEEP', P.a3LaserSweepMs, 'A3 · 天顶浑天星盘激光扫射！');
      return;
    case 'A3_LASER_SWEEP': {
      host.telegraph = 'RED_UNPARRIABLE';
      const prog = 1 - Math.max(0, bag.timerMs) / P.a3LaserSweepMs;
      const ang = computeAstrolabeLaserAngleRad(prog);
      bag.arena.onSyncAstrolabeLaser?.({ active: true, isHotBeam: true, originX: bag.centerX, originY: astroY, angleRad: ang });
      if (!bag.strikeCommitted && doesLaserIntersectPlayer(bag.centerX, astroY, ang, ctx.playerX, ctx.playerY)) {
        bag.strikeCommitted = true;
        ctx.onStrikePlayer(Math.round(50 * host.damageScale), dir, false, host);
      }
      if (bag.timerMs <= 0) {
        bag.arena.onSyncAstrolabeLaser?.({ active: false, isHotBeam: false, originX: bag.centerX, originY: astroY, angleRad: ang });
        bag.arena.onElevatePorcelainPlatforms?.(false);
        bag.enterState('RECOVER', 520, '星盘冷却');
      }
      return;
    }
    case 'A4_BLACKHOLE_PULL':
      host.telegraph = 'RED_UNPARRIABLE';
      bag.arena.onApplyBlackholePull?.(bag.centerX, bag.floorY - 42, P.a4PullSpeedPxS, true);
      ctx.onDrawGroundEffect?.('GRAVITY_SIGIL', bag.centerX, bag.floorY);
      if (bag.timerMs <= 0) bag.enterState('A4_BLACKHOLE_BLAST', 160, 'A4 · 奇点坍缩引爆');
      return;
    case 'A4_BLACKHOLE_BLAST':
      bag.arena.onApplyBlackholePull?.(bag.centerX, bag.floorY - 42, 0, false);
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        if (Math.hypot(ctx.playerX - bag.centerX, ctx.playerY - bag.floorY) <= P.a4BlastRadiusPx) ctx.onStrikePlayer(Math.round(52 * host.damageScale), dir, false, host);
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', 480, '引力消散');
      return;
    case 'A5_MATRIX_WARN':
      host.telegraph = 'RED_UNPARRIABLE';
      bag.arena.onElevatePorcelainPlatforms?.(true);
      bag.arena.onSyncMatrixFloor?.('WARN', bag.centerX);
      if (bag.timerMs <= 0) bag.enterState('A5_MATRIX_BURN', P.a5MatrixBurnMs, 'A5 · 紫火电弧矩阵灼烧');
      return;
    case 'A5_MATRIX_BURN':
      host.telegraph = 'NONE';
      bag.arena.onSyncMatrixFloor?.('BURN', bag.centerX);
      if (!bag.strikeCommitted && ctx.playerY >= bag.floorY - 22 && Math.abs(ctx.playerX - bag.centerX) <= 220) {
        bag.strikeCommitted = true;
        ctx.onStrikePlayer(Math.round(38 * host.damageScale), dir, false, host);
      }
      if (bag.timerMs <= 0) { bag.arena.onSyncMatrixFloor?.('OFF', bag.centerX); bag.arena.onElevatePorcelainPlatforms?.(false); bag.enterState('RECOVER', 400, '矩阵熄灭'); }
      return;
    case 'A6_MIRROR_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE'; host.facing = dir;
      if (bag.timerMs <= 0) { bag.subStepCounter = 0; bag.subStepTimerMs = 0; bag.enterState('A6_MIRROR_THRUSTS', P.a6MirrorThrustStepMs * 5 + 40, 'A6 · 镜像瞬步五连刺'); }
      return;
    case 'A6_MIRROR_THRUSTS':
      host.telegraph = 'YELLOW_PARRIABLE';
      bag.subStepTimerMs -= ctx.dtMs;
      if (bag.subStepTimerMs <= 0 && bag.subStepCounter < 5) {
        host.x = clampGroundX(ctx.playerX - dir * 34, host.patrolMinX + 24, host.patrolMaxX - 24);
        host.facing = dir;
        if (Math.abs(ctx.playerX - host.x) <= 68 && Math.abs(ctx.playerY - host.y) <= 44) ctx.onStrikePlayer(Math.round(32 * host.damageScale), dir, true, host);
        bag.subStepCounter += 1; bag.subStepTimerMs = P.a6MirrorThrustStepMs;
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', 520, '剑锋收势');
      return;
    case 'A7_SEA_SUBMERGE':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) { bag.subStepCounter = 0; bag.subStepTimerMs = 0; bag.enterState('A7_SEA_BLADES', P.a7BladeWaveIntervalMs * 3 + 180, 'A7 · 剥离之痛·水银剑林'); }
      return;
    case 'A7_SEA_BLADES':
      host.telegraph = 'RED_UNPARRIABLE';
      bag.subStepTimerMs -= ctx.dtMs;
      if (bag.subStepTimerMs <= 0 && bag.subStepCounter < 3) {
        const safeX = bag.centerX + (bag.subStepCounter - 1) * 140;
        bag.arena.onSyncQuicksilverBlades?.({ waveIndex: bag.subStepCounter, safeGapCenterX: safeX, safeGapHalfWidthPx: 48, state: 'BLADE_ERUPT', remainingMs: 420 });
        if (Math.abs(ctx.playerX - safeX) > 48 && ctx.playerY >= bag.floorY - 46) ctx.onStrikePlayer(Math.round(44 * host.damageScale), dir, false, host);
        bag.subStepCounter += 1; bag.subStepTimerMs = P.a7BladeWaveIntervalMs;
      }
      if (bag.timerMs <= 0) { bag.arena.onSyncQuicksilverBlades?.(null); host.x = clampGroundX(ctx.playerX + dir * 96, host.patrolMinX + 36, host.patrolMaxX - 36); bag.enterState('RECOVER', 460, '水银重凝'); }
      return;
    case 'A8_SUN_CHARGE': {
      host.telegraph = 'YELLOW_PARRIABLE'; host.x = bag.centerX; host.y = bag.floorY - 56;
      bag.arena.onSyncCalcinationSun?.(true, host.x, host.y - 68, 1 - Math.max(0, bag.timerMs) / P.a8CalcinationChargeMs);
      if (bag.timerMs <= 0) { host.y = bag.floorY; bag.enterState('A8_SUN_DIVE', 180, 'A8 · 宿命一闪坠击！'); }
      return;
    }
    case 'A8_SUN_DIVE':
      host.telegraph = 'YELLOW_PARRIABLE';
      bag.arena.onSyncCalcinationSun?.(false, host.x, host.y, 1);
      if (!bag.strikeCommitted) { bag.strikeCommitted = true; ctx.onStrikePlayer(Math.round(78 * host.damageScale), dir, true, host); }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', 800, '余烬喘息');
      return;
    case 'RECOVER':
      host.telegraph = 'NONE';
      if (bag.timerMs <= 0) bag.enterState('IDLE_DECIDE', phase === 3 ? 180 : 300, '蓄势观测');
  }
}
