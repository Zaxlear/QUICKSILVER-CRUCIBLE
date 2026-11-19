/**
 * 受诅咒秘匣「10 杀血咒」赋予、一击必死优先级判定与击杀递减解咒状态机
 * （src/combat/CurseStateController.ts）。
 *
 * 核心法则（100% 对齐 docs/06_BETA_1_0_2_DEVELOPMENT_PLAN.md §3.3，严格 <= 145 行）：
 * 1. 开启诅咒秘匣叠加 +10 杀血咒；
 * 2. 血咒存续期间任何未被翻滚无敌帧或黄金招架完全规避的伤害，直接无视护盾与应急凝壳秒杀玩家；
 * 3. 普通怪击杀 -1，精英怪击杀 -3，击败 Boss 直接清零并广播净化冲击。
 */

import { EventBus, type TypedEventBus } from '../core/EventBus';
import { ECONOMY_CONSTANTS } from '../data/economy.data';
import type { PlayerStats } from '../entities/player/PlayerStats';

export interface CurseLiftFeedbackHooks {
  onCurseApplied?: (totalKillsRequired: number) => void;
  onCurseProgressed?: (remainingKills: number) => void;
  onCurseLifted?: () => void;
}

export class CurseStateController {
  private unsubKill: (() => void) | null = null;

  public constructor(
    private readonly stats: PlayerStats,
    private readonly hooks: CurseLiftFeedbackHooks = {},
    private readonly bus: TypedEventBus = EventBus
  ) {}

  public get killsRemaining(): number {
    return this.stats.cursedKillsRemaining;
  }

  public get isCursed(): boolean {
    return this.stats.cursedKillsRemaining > 0;
  }

  public mount(): void {
    if (this.unsubKill) return;
    this.unsubKill = this.bus.on('combat:enemy_killed', (ev) => {
      this.recordEnemyKilled(Boolean(ev.isElite), Boolean(ev.isBoss));
    });
  }

  public unmount(): void {
    if (this.unsubKill) {
      this.unsubKill();
      this.unsubKill = null;
    }
  }

  /** 开启受诅咒秘匣时叠加血咒击杀需求（默认 +10） */
  public inflictCurse(killCount: number = ECONOMY_CONSTANTS.CURSE_KILL_PENALTY): number {
    const added = Math.max(1, Math.floor(killCount));
    this.stats.cursedKillsRemaining += added;
    this.hooks.onCurseApplied?.(this.stats.cursedKillsRemaining);
    this.bus.emit('combat:curse_changed', {
      cursedKillsRemaining: this.stats.cursedKillsRemaining,
      lifted: false,
    });
    return this.stats.cursedKillsRemaining;
  }

  /** 记录一次有效击杀并递减血咒计数（普通 -1 / 精英 -3 / Boss 直接清零） */
  public recordEnemyKilled(isElite = false, isBoss = false): boolean {
    const before = this.stats.cursedKillsRemaining;
    if (before <= 0) return false;

    const next = isBoss
      ? 0
      : Math.max(
          0,
          before - (isElite ? ECONOMY_CONSTANTS.CURSE_ELITE_KILL_CREDIT : 1)
        );
    this.stats.cursedKillsRemaining = next;

    if (next === 0) {
      this.hooks.onCurseLifted?.();
      this.bus.emit('combat:curse_changed', { cursedKillsRemaining: 0, lifted: true });
      return true;
    }

    this.hooks.onCurseProgressed?.(next);
    this.bus.emit('combat:curse_changed', { cursedKillsRemaining: next, lifted: false });
    return false;
  }
}
