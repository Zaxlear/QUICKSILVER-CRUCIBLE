/**
 * 主角三系炼金属性（赤化/黄化/白化）、生命值上限、灵液瓶充能、橙血进攻挽回（Rally）
 * 与武器暴击/攻速时间窗状态管理器（src/entities/player/PlayerStats.ts）。
 */

import {
  computeMaxHpFromStats,
  computeScrollMarginalHpRatio,
  computeStatDamageMultiplier,
  isWithinCleaverRhythmWindow,
} from '../../combat/DamageCalculator';
import {
  ALL_STAT_COLORS,
  COMBAT_CONSTANTS,
  type ScrollOptionPreview,
  type StatColor,
} from '../../data/weapons.data';

export class PlayerStats {
  private readonly levels: Record<StatColor, number> = {
    rubedo: 1,
    citrinitas: 1,
    albedo: 1,
  };

  public hp: number;
  public maxHp: number;
  public rallyOrangeHp = 0;
  private rallyPoolPeak = 0;
  private rallyFreezeRemainingMs = 0;

  public flaskCharges = 1;
  public maxFlaskCharges = 1;
  public gold = 150;
  public ichor = 45;
  public safeLoreFreezeActive = false;

  private rapierCritRemainingMs = 0;
  private twinbladesHasteRemainingMs = 0;
  private cleaverS1ElapsedMs = -1;
  private cleaverMashedEarly = false;
  public cleaverRhythmPrimed = false;

  public constructor(initialMaxHp?: number) {
    this.maxHp = initialMaxHp ?? COMBAT_CONSTANTS.BASE_PLAYER_HP;
    this.hp = this.maxHp;
  }

  public get snapshotLevels(): Readonly<Record<StatColor, number>> {
    return { ...this.levels };
  }

  public get isRallyFrozen(): boolean {
    return this.rallyOrangeHp > 0 && this.rallyFreezeRemainingMs > 0;
  }

  public get rapierCritWindowMs(): number {
    return this.rapierCritRemainingMs;
  }

  public get hasTwinbladesBleedHaste(): boolean {
    return this.twinbladesHasteRemainingMs > 0;
  }

  public get isCleaverRhythmWindowOpen(): boolean {
    return (
      this.cleaverS1ElapsedMs >= 0 &&
      isWithinCleaverRhythmWindow(this.cleaverS1ElapsedMs, this.cleaverMashedEarly)
    );
  }

  public applyScrollUpgrade(color: StatColor): void {
    const prevMax = this.maxHp;
    this.levels[color] += 1;
    this.maxHp = computeMaxHpFromStats(this.levels);
    const deltaHp = Math.max(0, this.maxHp - prevMax);
    this.hp = Math.min(this.maxHp, this.hp + deltaHp);
  }

  public buildScrollPickOptions(): readonly ScrollOptionPreview[] {
    return ALL_STAT_COLORS.map((color) => {
      const curLv = this.levels[color];
      const nextLv = curLv + 1;
      const simulated = { ...this.levels, [color]: nextLv };
      const nextMaxHp = computeMaxHpFromStats(simulated);
      return {
        color,
        currentLevel: curLv,
        nextLevel: nextLv,
        currentDmgMult: Number(computeStatDamageMultiplier([color], this.levels).toFixed(3)),
        nextDmgMult: Number(computeStatDamageMultiplier([color], simulated).toFixed(3)),
        hpGainPct: Number((computeScrollMarginalHpRatio(color, nextLv) * 100).toFixed(1)),
        hpGainFlat: Math.max(0, nextMaxHp - this.maxHp),
        nextMaxHp,
      };
    });
  }

  public applyIncomingDamage(rawDamage: number, reductionRatio = 0): number {
    const clampedRed = Math.min(0.9, Math.max(0, reductionRatio));
    const netDamage = Math.max(1, Math.round(Math.max(0, rawDamage) * (1 - clampedRed)));
    const actualLoss = Math.min(this.hp, netDamage);
    const hadFrozenOrange = this.rallyOrangeHp > 0 && this.rallyFreezeRemainingMs > 0;

    this.hp = Math.max(0, this.hp - actualLoss);
    const addedOrange = Math.round(actualLoss * COMBAT_CONSTANTS.RALLY_DAMAGE_TO_ORANGE_RATIO);
    this.rallyOrangeHp = Math.min(this.maxHp - this.hp, this.rallyOrangeHp + addedOrange);
    this.rallyPoolPeak = Math.max(this.rallyPoolPeak, this.rallyOrangeHp);
    this.rallyFreezeRemainingMs = hadFrozenOrange ? 0 : COMBAT_CONSTANTS.RALLY_FREEZE_MS;
    return actualLoss;
  }

  public healDirect(amount: number): number {
    if (amount <= 0 || this.hp <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.round(amount));
    this.rallyOrangeHp = Math.min(this.maxHp - this.hp, this.rallyOrangeHp);
    return this.hp - before;
  }

  /** 赤化沸血狂潮：将当前生命 8% 转化为可 100% 进攻吸回的冻结橙血槽 */
  public sacrificeHpToRallyOrange(ratio: number): number {
    if (this.hp <= 2) return 0;
    const sacrifice = Math.min(this.hp - 1, Math.max(1, Math.round(this.hp * ratio)));
    this.hp -= sacrifice;
    this.rallyOrangeHp = Math.min(this.maxHp - this.hp, this.rallyOrangeHp + sacrifice);
    this.rallyPoolPeak = Math.max(this.rallyPoolPeak, this.rallyOrangeHp);
    this.rallyFreezeRemainingMs = 2400;
    return sacrifice;
  }

  /** 哲学家水银护瓮：吸回 100% 橙血；若无橙血则直接治疗 8% MaxHP */
  public healFromAegisUrn(fallbackRatio: number): number {
    if (this.rallyOrangeHp >= 1) {
      const amt = Math.round(this.rallyOrangeHp);
      this.rallyOrangeHp = 0;
      this.rallyPoolPeak = 0;
      return this.healDirect(amt);
    }
    return this.healDirect(Math.max(1, Math.round(this.maxHp * fallbackRatio)));
  }

  public recoverRallyOnWeaponHit(rallyCoeff: number, isCrit: boolean): number {
    if (this.rallyOrangeHp <= 0 || this.hp <= 0) return 0;
    const poolRef = Math.max(this.rallyPoolPeak, this.rallyOrangeHp, this.maxHp * 0.28);
    const raw = poolRef * rallyCoeff * (isCrit ? COMBAT_CONSTANTS.RALLY_CRIT_RECOVERY_MULT : 1.0);
    const recovered = Math.min(this.rallyOrangeHp, this.maxHp - this.hp, Math.max(1, Math.round(raw)));
    this.hp += recovered;
    this.rallyOrangeHp = Math.max(0, this.rallyOrangeHp - recovered);
    if (this.rallyOrangeHp <= 0) this.rallyPoolPeak = 0;
    return recovered;
  }

  public recoverRallyOnParry(): number {
    if (this.rallyOrangeHp <= 0 || this.hp <= 0) return 0;
    const recovered = Math.min(
      this.maxHp - this.hp,
      Math.ceil(this.rallyOrangeHp * COMBAT_CONSTANTS.RALLY_PARRY_INSTANT_RECOVERY_RATIO)
    );
    this.hp += recovered;
    this.rallyOrangeHp = Math.max(0, this.rallyOrangeHp - recovered);
    if (this.rallyOrangeHp <= 0) this.rallyPoolPeak = 0;
    return recovered;
  }

  public tryDrinkElixirFlask(healMultiplier = 1.0, allowFullHpDistill = false): number {
    if (this.flaskCharges <= 0 || this.hp <= 0) return 0;
    if (this.hp >= this.maxHp && !allowFullHpDistill) return 0;
    this.flaskCharges -= 1;
    const heal = Math.max(1, Math.round(this.maxHp * COMBAT_CONSTANTS.FLASK_HEAL_RATIO * healMultiplier));
    return this.healDirect(heal);
  }

  public armRapierCritWindow(): void {
    this.rapierCritRemainingMs = COMBAT_CONSTANTS.RAPIER_CRIT_WINDOW_MS;
  }

  public consumeRapierCritWindow(): void {
    this.rapierCritRemainingMs = 0;
  }

  public armTwinbladesBleedHaste(): void {
    this.twinbladesHasteRemainingMs = COMBAT_CONSTANTS.TWINBLADES_BLEED_HASTE_MS;
  }

  public notifyCleaverStageOneHit(): void {
    this.cleaverS1ElapsedMs = 0;
    this.cleaverMashedEarly = false;
    this.cleaverRhythmPrimed = false;
  }

  public evaluateCleaverSecondInput(): boolean {
    if (this.cleaverS1ElapsedMs < 0) return false;
    if (this.cleaverS1ElapsedMs < COMBAT_CONSTANTS.CLEAVER_RHYTHM_MIN_MS) {
      this.cleaverMashedEarly = true;
      this.cleaverRhythmPrimed = false;
      return false;
    }
    this.cleaverRhythmPrimed = isWithinCleaverRhythmWindow(this.cleaverS1ElapsedMs, this.cleaverMashedEarly);
    this.cleaverS1ElapsedMs = -1;
    return this.cleaverRhythmPrimed;
  }

  public clearCleaverRhythm(): void {
    this.cleaverS1ElapsedMs = -1;
    this.cleaverMashedEarly = false;
    this.cleaverRhythmPrimed = false;
  }

  public resetFullHealth(): void {
    this.hp = this.maxHp;
    this.rallyOrangeHp = 0;
    this.rallyPoolPeak = 0;
    this.rallyFreezeRemainingMs = 0;
    this.flaskCharges = this.maxFlaskCharges;
    this.rapierCritRemainingMs = 0;
    this.twinbladesHasteRemainingMs = 0;
    this.clearCleaverRhythm();
  }

  public stepFixed(dtSec: number): void {
    const dtMs = dtSec * 1000;
    if (this.rapierCritRemainingMs > 0) this.rapierCritRemainingMs = Math.max(0, this.rapierCritRemainingMs - dtMs);
    if (this.twinbladesHasteRemainingMs > 0) this.twinbladesHasteRemainingMs = Math.max(0, this.twinbladesHasteRemainingMs - dtMs);
    if (this.cleaverS1ElapsedMs >= 0) {
      this.cleaverS1ElapsedMs += dtMs;
      if (this.cleaverS1ElapsedMs > COMBAT_CONSTANTS.CLEAVER_RHYTHM_MAX_MS + 60) {
        this.cleaverS1ElapsedMs = -1;
        this.cleaverMashedEarly = false;
      }
    }
    if (this.rallyOrangeHp > 0 && !this.safeLoreFreezeActive) {
      if (this.rallyFreezeRemainingMs > 0) {
        this.rallyFreezeRemainingMs = Math.max(0, this.rallyFreezeRemainingMs - dtMs);
      } else {
        const drain = this.maxHp * COMBAT_CONSTANTS.RALLY_DECAY_MAX_HP_PER_SEC * dtSec;
        this.rallyOrangeHp = Math.max(0, Number((this.rallyOrangeHp - drain).toFixed(3)));
        if (this.rallyOrangeHp <= 0.05) {
          this.rallyOrangeHp = 0;
          this.rallyPoolPeak = 0;
        }
      }
    }
  }
}
