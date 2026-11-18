/**
 * 12 种局内变异（mut_01 ~ mut_12）动态成长、处决、锁血与技能减冷却执行处理器
 * （src/combat/MutationProcessor.ts）。
 */

import { MUTATION_MATH, type MutationId } from '../data/mutations.data';
import type { StatColor } from '../data/weapons.data';
import type { CombatTargetView } from './CombatTypes';
import {
  collectPeriodicMutationTicks,
  evaluateBarbedRipOutDamage,
  type BarbedAndFrostTickDamage,
} from './MutationFormulaEvaluator';
import type { StatusEffectMachine } from './StatusEffectMachine';

export type { BarbedAndFrostTickDamage };

export class MutationProcessor {
  public frenzyRemainingSec = 0;
  public stealthRemainingSec = 0;
  public holyMercuryRemainingSec = 0;
  public gastronomyOverhealStacks = 0;
  public carapaceReady = true;
  public carapaceKillCounter = 0;
  public safeLoreFreezeActive = false;

  private tacticalReloadIcdSec = 0;
  private periodicTickAccumSec = 0;
  private readonly parryHealEnemyCd = new Map<string, number>();
  private readonly scratchTicks: BarbedAndFrostTickDamage[] = [];

  public constructor(private readonly statusMachine: StatusEffectMachine) {}

  public has(activeIds: readonly MutationId[], target: MutationId): boolean {
    return activeIds.includes(target);
  }

  public evaluateAttackBonuses(params: {
    readonly activeIds: readonly MutationId[];
    readonly stats: Readonly<Record<StatColor, number>>;
    readonly isMelee: boolean;
    readonly isRanged: boolean;
    readonly distancePx: number;
    readonly nearDeployedConstruct: boolean;
  }): { readonly damageMultiplier: number; readonly flatHolyBonus: number; readonly consumedStealth: boolean } {
    const { activeIds, stats, isMelee, isRanged, distancePx, nearDeployedConstruct } = params;
    let mult = 1.0;
    let flatHolyBonus = 0;
    let consumedStealth = false;

    if (this.stealthRemainingSec > 0 && this.has(activeIds, 'mut_predator_veil')) {
      mult *= 1.0 + MUTATION_MATH.predatorVeilBonusRatio(stats.rubedo);
      this.stealthRemainingSec = 0;
      consumedStealth = true;
    }
    if (isRanged && distancePx <= 96 && this.has(activeIds, 'mut_point_blank')) {
      mult *= MUTATION_MATH.pointBlankMultiplier(stats.citrinitas);
    }
    if (nearDeployedConstruct && this.has(activeIds, 'mut_support_resonance')) {
      mult *= 1.0 + MUTATION_MATH.supportResonanceBonusRatio(stats.citrinitas);
    }
    if (this.gastronomyOverhealStacks > 0 && this.has(activeIds, 'mut_gastronomy_distill')) {
      mult *= 1.0 + Math.min(6, this.gastronomyOverhealStacks) * 0.08;
    }
    if (isMelee && this.holyMercuryRemainingSec > 0 && this.has(activeIds, 'mut_mercury_ward')) {
      flatHolyBonus = Math.round(MUTATION_MATH.mercuryWardHolyDmg(stats.albedo));
      this.holyMercuryRemainingSec = 0;
    }
    return { damageMultiplier: Number(mult.toFixed(4)), flatHolyBonus, consumedStealth };
  }

  public onWeaponHitLanded(params: {
    readonly activeIds: readonly MutationId[];
    readonly stats: Readonly<Record<StatColor, number>>;
    readonly maxHp: number;
    readonly targetId: string;
    readonly worldX: number;
    readonly worldY: number;
    readonly isMelee: boolean;
    readonly isCrit: boolean;
  }): { readonly healAmount: number; readonly skillCooldownReducedSec: number } {
    const { activeIds, stats, maxHp, targetId, worldX, worldY, isMelee, isCrit } = params;
    let healAmount = 0;
    let skillCooldownReducedSec = 0;

    if (isMelee && this.frenzyRemainingSec > 0 && this.has(activeIds, 'mut_crimson_frenzy')) {
      healAmount += Math.max(1, Math.round(maxHp * MUTATION_MATH.frenzyHealRatio(stats.rubedo)));
    }
    if (isMelee && this.has(activeIds, 'mut_open_wounds')) {
      const bleedPerTick = Math.max(1, Math.round(MUTATION_MATH.openWoundsBleedDps(stats.rubedo) * 0.4));
      this.statusMachine.apply(targetId, 'bleeding', 1, 1.0, { worldX, worldY, customBaseTickDmg: bleedPerTick });
    }
    if (isCrit && this.tacticalReloadIcdSec <= 0 && this.has(activeIds, 'mut_tactical_reload')) {
      skillCooldownReducedSec = MUTATION_MATH.tacticalReloadCdSec(stats.citrinitas);
      this.tacticalReloadIcdSec = 0.2;
    }
    return { healAmount, skillCooldownReducedSec };
  }

  /** #04 大煅烧处决：普通/精英 <16%（Boss <6%）且携火或血时立即熔毁斩杀并 80px 传层 */
  public checkScorchExecution(
    activeIds: readonly MutationId[],
    targetId: string,
    remainingHpAfterHit: number,
    targetMaxHp: number,
    isBoss: boolean,
    worldX: number,
    worldY: number,
    targets: readonly CombatTargetView[]
  ): boolean {
    if (remainingHpAfterHit <= 0 || !this.has(activeIds, 'mut_scorch_execution')) return false;
    if (remainingHpAfterHit / Math.max(1, targetMaxHp) >= (isBoss ? 0.06 : 0.16)) return false;
    if (!this.statusMachine.has(targetId, 'ignited') && !this.statusMachine.has(targetId, 'bleeding')) {
      return false;
    }
    this.statusMachine.transferStacksInRadius(targetId, worldX, worldY, 80, ['ignited', 'bleeding'], targets);
    return true;
  }

  public onEnemyKilled(
    activeIds: readonly MutationId[],
    enemyId: string,
    worldX: number,
    worldY: number,
    killedByMelee: boolean,
    wasControlledBeforeDeath: boolean,
    targets: readonly CombatTargetView[]
  ): void {
    if (this.has(activeIds, 'mut_crimson_frenzy')) this.frenzyRemainingSec = 5.0;
    if (killedByMelee && this.has(activeIds, 'mut_predator_veil')) this.stealthRemainingSec = 2.8;
    if (wasControlledBeforeDeath && this.has(activeIds, 'mut_frostbite_shatter')) {
      this.statusMachine.applyRadius(worldX, worldY, 96, targets, 'frozen', 1, 1.0, 2.0);
    }
    if (!this.carapaceReady && this.has(activeIds, 'mut_emergency_carapace')) {
      this.carapaceKillCounter += 1;
      if (this.carapaceKillCounter >= 35) {
        this.carapaceReady = true;
        this.carapaceKillCounter = 0;
      }
    }
    this.parryHealEnemyCd.delete(enemyId);
  }

  public onGoldenParry(
    activeIds: readonly MutationId[],
    stats: Readonly<Record<StatColor, number>>,
    maxHp: number,
    sourceEnemyId: string
  ): number {
    if (!this.has(activeIds, 'mut_mercury_ward')) return 0;
    this.holyMercuryRemainingSec = 3.0;
    if ((this.parryHealEnemyCd.get(sourceEnemyId) ?? 0) > 0) return 0;
    this.parryHealEnemyCd.set(sourceEnemyId, 3.0);
    return Math.max(1, Math.round(maxHp * MUTATION_MATH.mercuryWardHealRatio(stats.albedo)));
  }

  public computeBarbedRipOutDamage(
    activeIds: readonly MutationId[],
    stats: Readonly<Record<StatColor, number>>,
    rippedCount: number
  ): number {
    return evaluateBarbedRipOutDamage(activeIds, stats, rippedCount);
  }

  public resolveFlaskOrFoodModifier(
    activeIds: readonly MutationId[],
    wasFullHealth: boolean
  ): { readonly healMultiplier: number } {
    if (this.has(activeIds, 'mut_emergency_carapace')) {
      this.carapaceReady = true;
      this.carapaceKillCounter = 0;
    }
    if (!this.has(activeIds, 'mut_gastronomy_distill')) return { healMultiplier: 1.0 };
    if (wasFullHealth && this.gastronomyOverhealStacks < 6) this.gastronomyOverhealStacks += 1;
    return { healMultiplier: 1.65 };
  }

  public tryTriggerEmergencyCarapace(
    activeIds: readonly MutationId[],
    hpBeforeHit: number,
    maxHp: number,
    hpAfterHit: number
  ): boolean {
    if (
      hpAfterHit <= 0 &&
      this.carapaceReady &&
      this.has(activeIds, 'mut_emergency_carapace') &&
      hpBeforeHit > maxHp * 0.25
    ) {
      this.carapaceReady = false;
      this.carapaceKillCounter = 0;
      return true;
    }
    return false;
  }

  public stepFixed(
    dtSec: number,
    activeIds: readonly MutationId[],
    stats: Readonly<Record<StatColor, number>>,
    targets: readonly CombatTargetView[],
    getEmbeddedArrows: (targetId: string) => number
  ): readonly BarbedAndFrostTickDamage[] {
    this.scratchTicks.length = 0;
    if (this.frenzyRemainingSec > 0 && !this.safeLoreFreezeActive) {
      this.frenzyRemainingSec = Math.max(0, this.frenzyRemainingSec - dtSec);
    }
    if (this.stealthRemainingSec > 0) this.stealthRemainingSec = Math.max(0, this.stealthRemainingSec - dtSec);
    if (this.holyMercuryRemainingSec > 0) this.holyMercuryRemainingSec = Math.max(0, this.holyMercuryRemainingSec - dtSec);
    if (this.tacticalReloadIcdSec > 0) this.tacticalReloadIcdSec = Math.max(0, this.tacticalReloadIcdSec - dtSec);

    for (const [eid, rem] of this.parryHealEnemyCd.entries()) {
      const next = rem - dtSec;
      if (next <= 0) this.parryHealEnemyCd.delete(eid);
      else this.parryHealEnemyCd.set(eid, next);
    }

    this.periodicTickAccumSec += dtSec;
    if (this.periodicTickAccumSec < 0.5) return this.scratchTicks;
    this.periodicTickAccumSec -= 0.5;

    collectPeriodicMutationTicks(activeIds, stats, targets, this.statusMachine, getEmbeddedArrows, this.scratchTicks);
    return this.scratchTicks;
  }
}
