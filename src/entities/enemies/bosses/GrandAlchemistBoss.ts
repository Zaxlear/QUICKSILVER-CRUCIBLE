/**
 * Boss 2（最终 Boss）：钙化至高炼金师·帕拉塞尔苏斯三阶段状态机与真结局【星界大溶解】对决器
 * （src/entities/enemies/bosses/GrandAlchemistBoss.ts）。
 */

import type Phaser from 'phaser';
import { NarrativeStore } from '../../../core/NarrativeSessionStore';
import { BOSS_COMBAT_SPECS, type BossHudSnapshot, type EndingOutcomeId } from '../../../data/dialogue.data';
import type { IWorldDisplayRegistrar } from '../../../world/ParallaxComposer';
import { BaseEnemy, type EnemyStepContext } from '../BaseEnemy';
import type { TelegraphRenderer } from '../TelegraphRenderer';
import type { BossArenaCallbacks, IBossCombatEntity } from './BossTypes';
import { stepParacelsusMoveState, type ParacelsusRuntimeBag } from './GrandAlchemistMoveStepper';
import { mapParacelsusPoseSuffix, type ParacelsusMoveState } from './GrandAlchemistPatterns';

const P = BOSS_COMBAT_SPECS.PARACELSUS;

export class GrandAlchemistBoss extends BaseEnemy implements IBossCombatEntity {
  public readonly bossId = P.id;
  public phase: 1 | 2 | 3 = 1;
  public prismShieldHp: number;
  public readonly maxPrismShieldHp: number;
  public activeMoveLabelZh = '四元素原初威仪';
  public endingState: EndingOutcomeId = 'NONE';

  private readonly hpScale: number;
  private readonly bag: ParacelsusRuntimeBag;

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
      id: P.id, speciesId: 'mob_12_astral_inquisitor', roomId: 'arena_boss_02',
      x: init.x, y: init.y - 28, patrolMinX: init.minX, patrolMaxX: init.maxX,
      hpScale: init.hpScale ?? 1.0, damageScale: init.damageScale ?? 1.0,
      atlasKey: 'bosses_atlas', framePrefix: P.id, overrideBaseHp: P.baseHpP1P2, overrideBasePoise: 18.0,
    });
    this.hpScale = init.hpScale ?? 1.0;
    this.maxPrismShieldHp = Math.round(P.p1PrismShieldHp * this.hpScale);
    this.prismShieldHp = this.maxPrismShieldHp;
    this.aggroed = true;
    const arena = init.arenaCallbacks ?? {};
    this.bag = {
      state: 'IDLE_DECIDE', timerMs: 300, subStepCounter: 0, subStepTimerMs: 0,
      strikeCommitted: false, moveCycle: 0, desperationUsed: false,
      floorY: init.y, centerX: (init.minX + init.maxX) * 0.5, arena,
      enterState: (nx, dur, lbl) => this.enterState(nx, dur, lbl),
    };
  }

  public override get isBoss(): boolean { return true; }
  public override get isUnpushable(): boolean { return this.phase === 2; }
  public override get isUntargetableByRanged(): boolean {
    return this.bag.state === 'A7_SEA_SUBMERGE' || this.bag.state === 'A7_SEA_BLADES';
  }
  public get isTransitioning(): boolean {
    return this.bag.state === 'P2_FUSION_TRANSITION' || this.bag.state === 'P3_AWAKEN_TRANSITION' || this.bag.state === 'AWAITING_CHOICE_STASIS';
  }
  protected override get poiseArmorFloor(): number { return this.phase === 2 ? 2.0 : 1.0; }
  protected override get activeColliderSize() {
    return this.phase === 2 ? { w: 72, h: 136, offY: 162 } : { w: 30, h: 58, offY: 74 };
  }

  protected override interceptIncomingDamage(damage: number): boolean {
    if (this.isTransitioning) return true;
    if (this.phase === 1 && this.prismShieldHp > 0) {
      this.prismShieldHp = Math.max(0, this.prismShieldHp - damage);
      return this.prismShieldHp > 0;
    }
    return false;
  }

  protected override interceptLethalForDeathrattle(): boolean {
    if (this.phase < 3) {
      const outcome = this.bag.arena.onParacelsusP2ZeroHp?.() ?? NarrativeStore.onParacelsusPhase2Defeated();
      this.endingState = outcome;
      if (outcome === 'AWAITING_ALKAHEST_CHOICE') {
        this.hp = 1;
        this.clearArenaHazards();
        this.enterState('AWAITING_CHOICE_STASIS', 999999, '原初质裂隙开启 · 等待注入万能溶剂');
        return true;
      }
      return false;
    }
    this.endingState = NarrativeStore.onParacelsusPhase3Defeated();
    this.clearArenaHazards();
    this.bag.arena.onParacelsusP3Defeated?.();
    return false;
  }

  public applyAlkahestDecision(choice: 'USURP_THRONE' | 'INJECT_ALKAHEST'): EndingOutcomeId {
    const res = NarrativeStore.resolveAlkahestChoice(choice);
    this.endingState = res;
    if (res === 'END_FALSE_CALCIFICATION') {
      this.hp = 0;
      this.beginAshDissolve();
      return res;
    }
    if (res === 'IN_PHASE_3_ALKAHEST') this.awakenPhase3Alkahest();
    return res;
  }

  public awakenPhase3Alkahest(): void {
    this.phase = 3;
    this.endingState = 'IN_PHASE_3_ALKAHEST';
    this.prismShieldHp = 0;
    this.maxHp = Math.max(100, Math.round(P.baseHpP3 * this.hpScale));
    this.hp = this.maxHp;
    this.y = this.bag.floorY;
    this.x = this.bag.centerX + 90;
    this.bag.desperationUsed = false;
    this.clearArenaHazards();
    this.bag.arena.onActivateQuicksilverSea?.();
    this.bag.arena.onPhaseTransition?.(this.bossId, 3, 0.85);
    this.enterState('P3_AWAKEN_TRANSITION', 900, '星界大溶解 · 镜面水银海宿命死斗！');
  }

  public shredPrismShieldFromParry(bonusAmount = 220): void {
    if (this.phase === 1 && this.prismShieldHp > 0) {
      this.prismShieldHp = Math.max(0, this.prismShieldHp - bonusAmount);
    }
  }

  public override onParriedByPlayer(): number {
    this.shredPrismShieldFromParry(220);
    if (this.bag.state === 'A8_SUN_DIVE') {
      this.bag.arena.onSyncCalcinationSun?.(false, this.x, this.y, 1);
      this.bag.arena.onTriggerChromaticClash?.(this.x, this.y - 24, 140);
      this.applyHit(this.hp + 9999, 99, 1);
      return 2400;
    }
    if (this.bag.state === 'A6_MIRROR_THRUSTS') {
      this.bag.arena.onTriggerChromaticClash?.(this.x, this.y - 22, 95);
      return this.bag.subStepCounter >= 4 ? 1900 : 0;
    }
    return 1200;
  }

  public forcePhase2ForTest(): void {
    if (this.phase === 1) this.enterPhase2Fusion();
  }

  public buildBossHudSnapshot(): BossHudSnapshot {
    const isP3 = this.phase === 3;
    return {
      bossId: this.bossId,
      nameZh: isP3 ? P.p3NameZh : P.nameZh,
      nameEn: isP3 ? P.p3NameEn : P.nameEn,
      arenaTitleZh: P.arenaTitleZh,
      phase: this.phase, hp: this.hp, maxHp: this.maxHp,
      prismShieldHp: this.prismShieldHp, maxPrismShieldHp: this.maxPrismShieldHp,
      phaseNotchRatio: isP3 ? null : P.phase2Ratio,
      statusBadge: this.statusBadgeLabel, isTransitioning: this.isTransitioning,
      activeMoveLabelZh: this.activeMoveLabelZh, endingState: this.endingState,
      collectedSeals: NarrativeStore.collectedSeals,
    };
  }

  protected override resolveStunPoseSuffix(): string { return `p${this.phase}_hurt_0`; }
  protected resolvePoseSuffix(): string { return mapParacelsusPoseSuffix(this.bag.state, this.phase, this.animClockMs); }

  protected stepBehavior(ctx: EnemyStepContext): void {
    if (this.phase === 1 && this.hp <= this.maxHp * P.phase2Ratio) this.enterPhase2Fusion();
    this.bag.timerMs -= ctx.dtMs;
    stepParacelsusMoveState(this, this.phase, this.bag, ctx);
  }

  private enterPhase2Fusion(): void {
    this.phase = 2;
    this.prismShieldHp = 0;
    this.bag.moveCycle = 1;
    this.x = this.bag.centerX;
    this.y = this.bag.floorY;
    this.bag.arena.onPhaseTransition?.(this.bossId, 2, 0.8);
    this.enterState('P2_FUSION_TRANSITION', P.transitionMs, '衔尾蛇巨型发条神躯合体！');
  }

  private clearArenaHazards(): void {
    this.bag.arena.onSyncAstrolabeLaser?.({ active: false, isHotBeam: false, originX: this.bag.centerX, originY: this.bag.floorY - 196, angleRad: 0 });
    this.bag.arena.onApplyBlackholePull?.(this.bag.centerX, this.bag.floorY - 42, 0, false);
    this.bag.arena.onSyncMatrixFloor?.('OFF', this.bag.centerX);
    this.bag.arena.onElevatePorcelainPlatforms?.(false);
    this.bag.arena.onSyncQuicksilverBlades?.(null);
    this.bag.arena.onSyncCalcinationSun?.(false, this.x, this.y, 0);
  }

  private enterState(next: ParacelsusMoveState, durationMs: number, labelZh: string): void {
    this.bag.state = next;
    this.bag.timerMs = durationMs;
    this.bag.strikeCommitted = false;
    this.activeMoveLabelZh = labelZh;
  }
}
