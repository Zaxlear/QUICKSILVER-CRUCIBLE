/**
 * 12 种普通/精英怪物与双多阶段 Boss 统一抽象基类（src/entities/enemies/BaseEnemy.ts）。
 */

import type Phaser from 'phaser';
import type { CombatTargetView } from '../../combat/CombatTypes';
import { ASH_DISSOLVE_PIPELINE_KEY, DATA_ASH_NOISE_SCALE, DATA_ASH_PROGRESS, DATA_HIT_FLASH_AMOUNT, DATA_HIT_FLASH_COLOR, DepthLayer, HIT_FLASH_PIPELINE_KEY, sampleHitFlashCurve } from '../../core/Constants';
import { ELITE_SCALING, ENEMY_CATALOG, type EliteAffixId, type EnemyId, type EnemySpeciesSpec, type TelegraphKind } from '../../data/biomes.data';
import { COMBAT_CONSTANTS } from '../../data/weapons.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import { formatEnemyOverheadLabel, type EnemyHitOutcome, type EnemySpawnInit, type EnemyStepContext } from './EnemyTypes';
import { clampGroundX } from './PerceptionSensor';
import type { EnemyCrispHudHandle, TelegraphRenderer } from './TelegraphRenderer';

export type { EnemyHitOutcome, EnemySpawnInit, EnemyStepContext };

export abstract class BaseEnemy {
  public readonly id: string;
  public readonly speciesId: EnemyId;
  public readonly spec: EnemySpeciesSpec;
  public readonly roomId: string;
  public readonly isElite: boolean;
  public readonly isClone: boolean;
  public readonly eliteAffixes: readonly EliteAffixId[];
  public readonly isEvergreenDummy: boolean;
  public readonly sprite: Phaser.GameObjects.Sprite | null;

  public x: number;
  public y: number;
  public readonly spawnX: number;
  public readonly spawnY: number;
  public patrolMinX: number;
  public patrolMaxX: number;
  public facing: -1 | 1 = -1;
  public hp: number;
  public maxHp: number;
  public poise: number;
  public maxPoise: number;
  public readonly damageScale: number;

  public aggroed = false;
  public isShieldedByPrelate = false;
  public telegraph: TelegraphKind = 'NONE';
  public statusBadgeLabel = '';
  public speedScale = 1.0;

  protected stunnedMs = 0;
  protected dissolving = false;
  protected dead = false;
  protected phaseClockMs = 0;
  protected animClockMs = 0;
  protected readonly framePrefix: string;
  private hitFlashMs = -1;
  private readonly hud: EnemyCrispHudHandle | null;
  private readonly registrar: IWorldDisplayRegistrar | null;

  public constructor(scene: Phaser.Scene | null, registrar: IWorldDisplayRegistrar | null, telegraphRenderer: TelegraphRenderer | null, init: EnemySpawnInit) {
    this.id = init.id;
    this.speciesId = init.speciesId;
    this.spec = ENEMY_CATALOG[init.speciesId];
    this.roomId = init.roomId;
    this.isElite = Boolean(init.isElite);
    this.isClone = Boolean(init.isClone);
    this.eliteAffixes = init.eliteAffixes ?? [];
    this.isEvergreenDummy = Boolean(init.evergreenRespawn);
    this.registrar = registrar;
    this.framePrefix = init.framePrefix ?? init.speciesId;
    this.x = init.x; this.y = init.y; this.spawnX = init.x; this.spawnY = init.y;
    this.patrolMinX = init.patrolMinX; this.patrolMaxX = init.patrolMaxX;

    const hpMult = this.isClone ? ELITE_SCALING.TWIN_CLONE_HP_RATIO : this.isElite ? ELITE_SCALING.HP_MULTIPLIER : 1.0;
    this.maxHp = Math.max(10, Math.round((init.overrideBaseHp ?? this.spec.baseHp) * (init.hpScale ?? 1.0) * hpMult));
    this.hp = this.maxHp;
    this.maxPoise = Number(((init.overrideBasePoise ?? this.spec.basePoise) * (this.isElite ? ELITE_SCALING.POISE_MULTIPLIER : 1.0)).toFixed(2));
    this.poise = this.maxPoise;
    this.damageScale = (init.damageScale ?? 1.0) * (this.isElite ? 1.25 : 1.0);

    const atlasKey = init.atlasKey ?? 'enemies_roster_atlas';
    if (scene && registrar) {
      const sc = this.isElite ? ELITE_SCALING.SCALE_MULTIPLIER : 1.0;
      const initFrame = atlasKey === 'bosses_atlas' ? `${this.framePrefix}_p1_idle_0` : `${this.framePrefix}_idle_0`;
      this.sprite = registrar.registerWorldLit(
        scene.add.sprite(init.x, init.y, atlasKey, initFrame)
          .setOrigin(0.5, 1.0).setScale(sc).setAlpha(this.isClone ? 0.58 : 1.0).setDepth(DepthLayer.ENEMIES).setPipeline('Light2D')
      );
      if (this.isClone) this.sprite.setTint(0x9aa5b8);
    } else {
      this.sprite = null;
    }
    this.hud = telegraphRenderer?.createEnemyHud(init.x, init.y) ?? null;
  }

  public get archetype(): string { return this.framePrefix; }
  public get isBoss(): boolean { return false; }
  public get isAlive(): boolean { return !this.dissolving && !this.dead && this.hp > 0; }
  public get isDissolving(): boolean { return this.dissolving; }
  public get isStunned(): boolean { return this.stunnedMs > 0; }
  public get isMetallicClockwork(): boolean { return this.spec.isMetallicClockwork; }
  public get hasFrontShield(): boolean { return false; }
  public get isUntargetableByRanged(): boolean { return false; }
  public get isUnpushable(): boolean { return false; }
  protected get poiseArmorFloor(): number { return 0; }
  protected get activeColliderSize() {
    return { w: this.spec.colliderWidthPx, h: this.spec.colliderHeightPx, offY: this.spec.overheadOffsetY };
  }

  public toTargetView(inConductiveHazard: boolean): CombatTargetView {
    const sc = this.isElite ? ELITE_SCALING.SCALE_MULTIPLIER : 1.0;
    const dim = this.activeColliderSize;
    return {
      id: this.id, x: this.x, y: this.y,
      width: Math.round(dim.w * sc), height: Math.round(dim.h * sc),
      facing: this.facing, isAlive: this.isAlive,
      hasFrontShield: this.hasFrontShield && !this.isStunned,
      isStunned: this.isStunned, inConductiveHazard,
      isUntargetableByRanged: this.isUntargetableByRanged, isBoss: this.isBoss,
    };
  }

  public applyHit(damage: number, breach: number, knockDirX: -1 | 1, attackerX?: number): EnemyHitOutcome {
    if (!this.isAlive) return { killed: false, triggeredBreachStun: false, blockedByWard: false, thornsReflectedDamage: 0 };
    if (this.isShieldedByPrelate || this.interceptIncomingDamage(damage)) {
      this.hitFlashMs = 0; this.applyFlashUniform(0);
      return { killed: false, triggeredBreachStun: false, blockedByWard: true, thornsReflectedDamage: 0 };
    }

    const isRearHit = attackerX !== undefined && (attackerX - this.x) * this.facing < 0;
    const thornsReflectedDamage =
      this.eliteAffixes.includes('elite_thorns_shell') && !this.isStunned && isRearHit
        ? Math.max(1, Math.round(damage * ELITE_SCALING.THORNS_REAR_REFLECT_RATIO))
        : 0;

    this.aggroed = true;
    this.hp = Math.max(0, this.hp - damage);
    this.hitFlashMs = 0; this.applyFlashUniform(0);

    if (this.hp <= 0) {
      if (this.interceptLethalForDeathrattle()) {
        return { killed: false, triggeredBreachStun: false, blockedByWard: false, thornsReflectedDamage };
      }
      this.beginAshDissolve();
      return { killed: true, triggeredBreachStun: false, blockedByWard: false, thornsReflectedDamage };
    }

    if (!this.isUnpushable) this.pushBack(knockDirX * 7);
    if (breach >= this.poiseArmorFloor) {
      this.poise = Math.max(0, this.poise - breach);
      if (this.poise <= 0) {
        this.forceStun(COMBAT_CONSTANTS.ENEMY_BREACH_STUN_MS);
        return { killed: false, triggeredBreachStun: true, blockedByWard: false, thornsReflectedDamage };
      }
    }
    return { killed: false, triggeredBreachStun: false, blockedByWard: false, thornsReflectedDamage };
  }

  public forceStun(durationMs: number): void {
    if (this.dissolving || this.dead) return;
    this.stunnedMs = Math.max(this.stunnedMs, durationMs);
    this.poise = this.maxPoise;
    this.telegraph = 'NONE';
    this.onStunnedReset();
  }

  public onParriedByPlayer(): number { return COMBAT_CONSTANTS.ENEMY_BREACH_STUN_MS; }
  public pushBack(dxPx: number): void {
    if (!this.isUnpushable) this.x = clampGroundX(this.x + dxPx, this.patrolMinX, this.patrolMaxX);
  }

  public onAllyKilledInRoom(): void {}
  protected onStunnedReset(): void {}
  protected interceptIncomingDamage(_damage: number): boolean { return false; }
  protected interceptLethalForDeathrattle(): boolean { return false; }
  protected resolveStunPoseSuffix(): string { return 'hurt_0'; }

  protected beginAshDissolve(): void {
    this.dissolving = true; this.phaseClockMs = 0; this.hitFlashMs = -1; this.telegraph = 'NONE';
    this.sprite?.setData(DATA_ASH_PROGRESS, 0.02).setData(DATA_ASH_NOISE_SCALE, [24.0, 24.0] as const).setPipeline(ASH_DISSOLVE_PIPELINE_KEY);
  }

  public stepFixed(ctx: EnemyStepContext, embeddedArrows: number): boolean {
    this.animClockMs += ctx.dtMs;
    if (this.hitFlashMs >= 0) {
      this.hitFlashMs += ctx.dtMs;
      if (this.hitFlashMs >= 100) {
        this.hitFlashMs = -1;
        if (!this.dissolving) this.sprite?.setPipeline('Light2D');
      } else this.applyFlashUniform(this.hitFlashMs);
    }

    if (this.dissolving) {
      this.phaseClockMs += ctx.dtMs;
      const prog = Math.min(1, this.phaseClockMs / 520);
      this.sprite?.setData(DATA_ASH_PROGRESS, prog);
      this.hud?.sync(this.x, this.y, this.activeColliderSize.offY, 'NONE', false, '', false, false, false);
      if (prog >= 1) { this.sprite?.setVisible(false); this.dissolving = false; this.dead = true; }
      return false;
    }

    if (this.dead) {
      if (this.isEvergreenDummy && (this.phaseClockMs += ctx.dtMs) >= 1600) {
        this.hp = this.maxHp; this.poise = this.maxPoise; this.x = this.spawnX; this.y = this.spawnY; this.dead = false;
        this.sprite?.setPipeline('Light2D').setVisible(true);
      }
      return false;
    }

    let diedFromBurst = false;
    if (this.stunnedMs > 0) {
      this.stunnedMs = Math.max(0, this.stunnedMs - ctx.dtMs);
      this.telegraph = 'NONE';
    } else if (this.speedScale > 0) {
      diedFromBurst = this.stepBehavior(ctx) === 'SELF_DESTRUCTED';
      if (diedFromBurst) this.beginAshDissolve();
    }
    this.syncVisuals(embeddedArrows);
    return diedFromBurst;
  }

  protected abstract stepBehavior(ctx: EnemyStepContext): void | 'SELF_DESTRUCTED';
  protected abstract resolvePoseSuffix(): string;

  public destroy(): void {
    if (this.sprite && this.registrar) { this.registrar.unregister(this.sprite); this.sprite.destroy(); }
    this.hud?.destroy();
  }

  private applyFlashUniform(elapsedMs: number): void {
    if (!this.sprite) return;
    const s = sampleHitFlashCurve(elapsedMs);
    this.sprite.setData(DATA_HIT_FLASH_AMOUNT, s.amount).setData(DATA_HIT_FLASH_COLOR, s.rgb).setPipeline(HIT_FLASH_PIPELINE_KEY);
  }

  private syncVisuals(embeddedArrows: number): void {
    const suffix = this.isStunned ? (this.isBoss ? this.resolveStunPoseSuffix() : 'hurt_0') : this.resolvePoseSuffix();
    this.sprite?.setFrame(`${this.framePrefix}_${suffix}`).setPosition(this.x, this.y).setFlipX(this.facing < 0);
    const sc = this.isElite ? ELITE_SCALING.SCALE_MULTIPLIER : 1.0;
    const label = formatEnemyOverheadLabel({
      isBoss: this.isBoss, isElite: this.isElite, eliteAffixes: this.eliteAffixes,
      isShielded: this.isShieldedByPrelate, isStunned: this.isStunned,
      hp: this.hp, maxHp: this.maxHp, embeddedArrows, statusBadge: this.statusBadgeLabel,
    });
    this.hud?.sync(this.x, this.y, Math.round(this.activeColliderSize.offY * sc), this.telegraph, (Math.floor(this.animClockMs / 75) & 1) === 0, label, this.isShieldedByPrelate, this.isElite || this.isBoss, true);
  }
}
