/**
 * 典狱长·萨尔弗（Boss 1）M5 刑炉格栅交替节拍与 M1~M6 招式选择及单步执行器
 * （src/entities/enemies/bosses/FurnaceWardenPatterns.ts）。
 */

import { BOSS_COMBAT_SPECS } from '../../../data/dialogue.data';
import type { BaseEnemy, EnemyStepContext } from '../BaseEnemy';
import { clampGroundX } from '../PerceptionSensor';
import type { BossArenaCallbacks, GrateStateKind } from './BossTypes';

export type SulfurMoveState =
  | 'IDLE_PROWL'
  | 'ROAR_TRANSITION'
  | 'M1_S1_WINDUP' | 'M1_S1_STRIKE' | 'M1_GAP' | 'M1_S2_WINDUP' | 'M1_S2_STRIKE'
  | 'M2_HOOK_WINDUP' | 'M2_HOOK_STRIKE'
  | 'M3_SMOKE_WINDUP' | 'M3_SMOKE_ACTIVE'
  | 'M4_LEAP' | 'M4_SLAM_WINDUP' | 'M4_SLAM_STRIKE'
  | 'M6_WHIRL_WINDUP' | 'M6_WHIRL_SPIN' | 'M6_WHIRL_PANT'
  | 'RECOVER';

export interface SulfurRuntimeBag {
  state: SulfurMoveState;
  timerMs: number;
  strikeCommitted: boolean;
  moveCycle: number;
  whirlDir: -1 | 1;
  readonly floorY: number;
  readonly arena: BossArenaCallbacks;
  enterState: (next: SulfurMoveState, durationMs: number, labelZh: string) => void;
}

const S = BOSS_COMBAT_SPECS.SULFUR;

export function advanceFurnaceGrateCycle(
  grateClockMs: number,
  grateParity: number,
  dtMs: number,
  phase: 1 | 2
): {
  readonly nextClockMs: number;
  readonly nextParity: number;
  readonly activeGrates: readonly (0 | 1 | 2 | 3)[];
  readonly gratePhase: GrateStateKind;
} {
  let clock = grateClockMs + dtMs;
  let parity = grateParity;
  const cycleMs = S.m5GrateWarnMs + S.m5GrateEruptMs + (phase === 2 ? 450 : 1600);
  if (clock >= cycleMs) {
    clock -= cycleMs;
    parity ^= 1;
  }
  const activeGrates: readonly (0 | 1 | 2 | 3)[] =
    phase === 2 ? (parity === 0 ? [0, 2] : [1, 3]) : [parity === 0 ? 0 : 3];
  const gratePhase: GrateStateKind =
    clock < S.m5GrateWarnMs ? 'WARN' : clock < S.m5GrateWarnMs + S.m5GrateEruptMs ? 'ERUPT' : 'IDLE';
  return { nextClockMs: clock, nextParity: parity, activeGrates, gratePhase };
}

export function chooseNextSulfurAttack(
  phase: 1 | 2,
  moveCycle: number,
  absDx: number
): { readonly state: SulfurMoveState; readonly durationMs: number; readonly labelZh: string } {
  if (absDx > 180) return { state: 'M2_HOOK_WINDUP', durationMs: S.m2HookWindupMs, labelZh: 'M2 · 锁链远距钩抓横扫' };
  if (phase === 2 && moveCycle % 4 === 0) return { state: 'M6_WHIRL_WINDUP', durationMs: S.m6WhirlWindupMs, labelZh: 'M6 · 大焚化大风车冲锋' };
  const slot = moveCycle % 3;
  if (slot === 1) return { state: 'M1_S1_WINDUP', durationMs: S.m1Stage1WindupMs, labelZh: 'M1 · 香炉摆锤二连砸' };
  if (slot === 2 && absDx < 130) return { state: 'M3_SMOKE_WINDUP', durationMs: S.m3SmokeWindupMs, labelZh: 'M3 · 硫磺毒烟喷发' };
  return { state: 'M4_LEAP', durationMs: S.m4LeapMs, labelZh: 'M4 · 陨铁泰山压顶' };
}

export function stepSulfurAttackState(host: BaseEnemy, phase: 1 | 2, bag: SulfurRuntimeBag, ctx: EnemyStepContext): void {
  const dx = ctx.playerX - host.x;
  const absDx = Math.abs(dx);
  const dir: -1 | 1 = dx >= 0 ? 1 : -1;

  switch (bag.state) {
    case 'ROAR_TRANSITION':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) { host.telegraph = 'NONE'; bag.whirlDir = dir; bag.enterState('M6_WHIRL_WINDUP', S.m6WhirlWindupMs, 'M6 · 大焚化大风车冲锋'); }
      return;
    case 'IDLE_PROWL':
      host.facing = dir; host.telegraph = 'NONE';
      if (absDx > 86) host.x = clampGroundX(host.x + dir * (phase === 2 ? 128 : 92) * host.speedScale * ctx.dtSec, host.patrolMinX, host.patrolMaxX);
      if (bag.timerMs <= 0) { bag.moveCycle += 1; bag.whirlDir = dir; const nx = chooseNextSulfurAttack(phase, bag.moveCycle, absDx); bag.enterState(nx.state, nx.durationMs, nx.labelZh); }
      return;
    case 'M1_S1_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('M1_S1_STRIKE', S.m1Stage1ActiveMs, 'M1 · 香炉摆锤首砸');
      return;
    case 'M1_S1_STRIKE':
      host.telegraph = 'NONE';
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        host.x = clampGroundX(host.x + host.facing * 24, host.patrolMinX, host.patrolMaxX);
        if (Math.abs(ctx.playerX - (host.x + host.facing * 42)) <= 66 && Math.abs(ctx.playerY - host.y) <= 52) ctx.onStrikePlayer(Math.round(38 * host.damageScale), host.facing, true, host);
      }
      if (bag.timerMs <= 0) bag.enterState('M1_GAP', S.m1Stage1RecoverMs, 'M1 · 二段蓄势');
      return;
    case 'M1_GAP':
      if (bag.timerMs <= 0) { host.facing = dir; bag.enterState('M1_S2_WINDUP', S.m1Stage2WindupMs, 'M1 · 香炉二连重砸'); }
      return;
    case 'M1_S2_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('M1_S2_STRIKE', S.m1Stage2ActiveMs, 'M1 · 熔火重锤裂地');
      return;
    case 'M1_S2_STRIKE':
      host.telegraph = 'NONE';
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        if (Math.abs(ctx.playerX - (host.x + host.facing * 48)) <= 74 && Math.abs(ctx.playerY - host.y) <= 56) ctx.onStrikePlayer(Math.round(46 * host.damageScale), host.facing, true, host);
        if (phase === 2) { bag.arena.onSpawnSulfurWave?.(host.x, bag.floorY, 1); bag.arena.onSpawnSulfurWave?.(host.x, bag.floorY, -1); }
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', S.m1Stage2RecoverMs, '收锤硬直');
      return;
    case 'M2_HOOK_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('M2_HOOK_STRIKE', S.m2HookActiveMs, 'M2 · 锁链钩抓横扫');
      return;
    case 'M2_HOOK_STRIKE':
      host.telegraph = 'NONE';
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        if ((ctx.playerX - host.x) * host.facing > 0 && absDx <= S.m2HookRangePx && Math.abs(ctx.playerY - host.y) <= 46) ctx.onStrikePlayer(Math.round(36 * host.damageScale), host.facing, true, host);
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', S.m2HookRecoverMs, '锁链回收');
      return;
    case 'M3_SMOKE_WINDUP':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('M3_SMOKE_ACTIVE', S.m3SmokeActiveMs, 'M3 · 硫磺毒烟喷发');
      return;
    case 'M3_SMOKE_ACTIVE':
      host.telegraph = 'RED_UNPARRIABLE';
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        ctx.onSpawnAcidOrFireHazard(host.x, host.y - 24, S.m3SmokeRadiusPx, true);
        if (Math.hypot(ctx.playerX - host.x, ctx.playerY - host.y) <= S.m3SmokeRadiusPx) ctx.onStrikePlayer(Math.round(42 * host.damageScale), dir, false, host);
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', S.m3SmokeRecoverMs, '炉门闭合');
      return;
    case 'M4_LEAP':
      host.telegraph = 'RED_UNPARRIABLE'; host.y = bag.floorY - 68;
      host.x = clampGroundX(host.x + dir * 185 * ctx.dtSec, host.patrolMinX + 40, host.patrolMaxX - 40);
      if (bag.timerMs <= 0) bag.enterState('M4_SLAM_WINDUP', S.m4SlamWindupMs, 'M4 · 陨铁泰山压顶');
      return;
    case 'M4_SLAM_WINDUP':
      host.telegraph = 'RED_UNPARRIABLE';
      if (bag.timerMs <= 0) { host.y = bag.floorY; bag.enterState('M4_SLAM_STRIKE', S.m4SlamActiveMs, 'M4 · 全桥熔铁震地波'); }
      return;
    case 'M4_SLAM_STRIKE':
      host.telegraph = 'NONE';
      if (!bag.strikeCommitted) {
        bag.strikeCommitted = true;
        ctx.onDrawGroundEffect?.('EXECUTOR_WAVE', host.x - 90, bag.floorY);
        ctx.onDrawGroundEffect?.('EXECUTOR_WAVE', host.x + 90, bag.floorY);
        if (ctx.playerY >= bag.floorY - 30) ctx.onStrikePlayer(Math.round(48 * host.damageScale), dir, false, host);
      }
      if (bag.timerMs <= 0) bag.enterState('RECOVER', S.m4SlamRecoverMs, '拔锤大硬直');
      return;
    case 'M6_WHIRL_WINDUP':
      host.telegraph = 'YELLOW_PARRIABLE';
      if (bag.timerMs <= 0) bag.enterState('M6_WHIRL_SPIN', S.m6WhirlSpinMs, 'M6 · 双链焚化大风车');
      return;
    case 'M6_WHIRL_SPIN':
      host.telegraph = 'YELLOW_PARRIABLE';
      host.x += bag.whirlDir * 265 * host.speedScale * ctx.dtSec;
      if (host.x <= host.patrolMinX + 36) { host.x = host.patrolMinX + 36; bag.whirlDir = 1; }
      if (host.x >= host.patrolMaxX - 36) { host.x = host.patrolMaxX - 36; bag.whirlDir = -1; }
      host.facing = bag.whirlDir;
      if (!bag.strikeCommitted && Math.abs(ctx.playerX - host.x) <= 68 && Math.abs(ctx.playerY - host.y) <= 58) {
        bag.strikeCommitted = true;
        ctx.onStrikePlayer(Math.round(40 * host.damageScale), bag.whirlDir, true, host);
      }
      if (Math.floor(bag.timerMs / 280) % 2 === 0) bag.strikeCommitted = false;
      if (bag.timerMs <= 0) bag.enterState('M6_WHIRL_PANT', S.m6WhirlPantMs, '旋风过载喘息');
      return;
    case 'M6_WHIRL_PANT':
    case 'RECOVER':
      host.telegraph = 'NONE';
      if (bag.timerMs <= 0) bag.enterState('IDLE_PROWL', phase === 2 ? 260 : 380, '司炉步进');
  }
}

export function mapSulfurPoseSuffix(state: SulfurMoveState, phase: 1 | 2, animClockMs: number): string {
  if (state === 'ROAR_TRANSITION') return 'roar_open_0';
  if (state === 'M4_LEAP' || state === 'M4_SLAM_WINDUP') return 'p1_leap_0';
  if (state === 'M6_WHIRL_SPIN') return 'p2_whirl_0';
  const p = phase === 2 ? 'p2' : 'p1';
  if (state.includes('WINDUP')) return `${p}_windup_0`;
  if (state.includes('STRIKE') || state === 'M3_SMOKE_ACTIVE') return `${p}_attack_0`;
  if (state === 'IDLE_PROWL') return (Math.floor(animClockMs / 220) & 1) === 0 ? `${p}_idle_0` : `${p}_move_0`;
  return `${p}_idle_0`;
}
