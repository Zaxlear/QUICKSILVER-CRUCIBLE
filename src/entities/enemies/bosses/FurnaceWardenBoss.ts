/**
 * Boss 1：黄铜香炉典狱长·萨尔弗双阶段帧精确状态机与 4 组刑炉格栅机关调度器
 * （src/entities/enemies/bosses/FurnaceWardenBoss.ts）。
 */

import type Phaser from 'phaser';
import { NarrativeStore } from '../../../core/NarrativeSessionStore';
import { BOSS_COMBAT_SPECS, type BossHudSnapshot } from '../../../data/dialogue.data';
import type { IWorldDisplayRegistrar } from '../../../world/ParallaxComposer';
import { BaseEnemy, type EnemyStepContext } from '../BaseEnemy';
import type { TelegraphRenderer } from '../TelegraphRenderer';
import type { BossArenaCallbacks, GrateStateKind, IBossCombatEntity } from './BossTypes';
import {
  advanceFurnaceGrateCycle,
  mapSulfurPoseSuffix,
  stepSulfurAttackState,
  type SulfurMoveState,
  type SulfurRuntimeBag,
} from './FurnaceWardenPatterns';

const S = BOSS_COMBAT_SPECS.SULFUR;

export class FurnaceWardenBoss extends BaseEnemy implements IBossCombatEntity {
  public readonly bossId = S.id;
  public phase: 1 | 2 = 1;
  public activeMoveLabelZh = '司炉威压';
  public activeGrates: readonly (0 | 1 | 2 | 3)[] = [0];
  public gratePhase: GrateStateKind = 'IDLE';

  private grateClockMs = 0;
  private grateParity = 0;
  private readonly bag: SulfurRuntimeBag;

  public constructor(
    scene: Phaser.Scene | null,
    registrar: IWorldDisplayRegistrar | null,
    telegraphRenderer: TelegraphRenderer | null,
    init: {
      readonly x: number;
      readonly y: number;
      readonly minX: number;
      readonly maxX: number;
      readonly hpScale?: number;
      readonly damageScale?: number;
      readonly arenaCallbacks?: BossArenaCallbacks;
    }
  ) {
    super(scene, registrar, telegraphRenderer, {
      id: S.id, speciesId: 'mob_06_flail_executor', roomId: 'arena_boss_01',
      x: init.x, y: init.y, patrolMinX: init.minX, patrolMaxX: init.maxX,
      hpScale: init.hpScale ?? 1.0, damageScale: init.damageScale ?? 1.0,
      atlasKey: 'bosses_atlas', framePrefix: S.id, overrideBaseHp: S.baseHp, overrideBasePoise: 14.0,
    });
    this.aggroed = true;
    const arena = init.arenaCallbacks ?? {};
    this.bag = {
      state: 'IDLE_PROWL',
      timerMs: 300,
      strikeCommitted: false,
      moveCycle: 0,
      whirlDir: 1,
      floorY: init.y,
      arena,
      enterState: (next, dur, label) => this.enterState(next, dur, label),
    };
  }

  public override get isBoss(): boolean { return true; }
  public override get isUnpushable(): boolean { return true; }
  public get isTransitioning(): boolean { return this.bag.state === 'ROAR_TRANSITION'; }
  protected override get poiseArmorFloor(): number { return 1.5; }
  protected override get activeColliderSize() { return { w: 54, h: 98, offY: 118 }; }
  protected override interceptIncomingDamage(): boolean { return this.bag.state === 'ROAR_TRANSITION'; }

  public override onParriedByPlayer(): number {
    if (this.bag.state === 'M6_WHIRL_SPIN' || this.bag.state === 'M6_WHIRL_WINDUP') {
      this.enterState('IDLE_PROWL', 400, '大风车被盾反崩解！');
      return S.m6ParryStunMs;
    }
    return 1100;
  }

  public forcePhase2ForTest(): void {
    if (this.phase === 1) this.enterPhase2Transition();
  }

  public buildBossHudSnapshot(): BossHudSnapshot {
    return {
      bossId: this.bossId, nameZh: S.nameZh, nameEn: S.nameEn, arenaTitleZh: S.arenaTitleZh,
      phase: this.phase, hp: this.hp, maxHp: this.maxHp, prismShieldHp: 0, maxPrismShieldHp: 0,
      phaseNotchRatio: S.phase2Ratio, statusBadge: this.statusBadgeLabel,
      isTransitioning: this.isTransitioning, activeMoveLabelZh: this.activeMoveLabelZh,
      endingState: 'NONE', collectedSeals: NarrativeStore.collectedSeals,
    };
  }

  protected override onStunnedReset(): void {
    this.y = this.bag.floorY;
    if (this.bag.state !== 'ROAR_TRANSITION') this.enterState('IDLE_PROWL', 260, '破防喘息');
  }

  protected stepBehavior(ctx: EnemyStepContext): void {
    const gr = advanceFurnaceGrateCycle(this.grateClockMs, this.grateParity, ctx.dtMs, this.phase);
    this.grateClockMs = gr.nextClockMs;
    this.grateParity = gr.nextParity;
    this.activeGrates = gr.activeGrates;
    this.gratePhase = gr.gratePhase;
    this.bag.arena.onSyncFurnaceGrates?.(this.activeGrates, this.gratePhase);

    if (this.phase === 1 && this.hp <= this.maxHp * S.phase2Ratio) this.enterPhase2Transition();
    this.bag.timerMs -= ctx.dtMs;
    stepSulfurAttackState(this, this.phase, this.bag, ctx);
  }

  protected resolvePoseSuffix(): string {
    return mapSulfurPoseSuffix(this.bag.state, this.phase, this.animClockMs);
  }

  private enterPhase2Transition(): void {
    this.phase = 2;
    this.y = this.bag.floorY;
    this.enterState('ROAR_TRANSITION', S.transitionRoarMs, '扒开胸口香炉 · 活体焚化炉觉醒！');
    this.bag.arena.onPhaseTransition?.(this.bossId, 2, 0.75);
  }

  private enterState(next: SulfurMoveState, durationMs: number, labelZh: string): void {
    this.bag.state = next;
    this.bag.timerMs = durationMs;
    this.bag.strikeCommitted = false;
    this.activeMoveLabelZh = labelZh;
  }
}
