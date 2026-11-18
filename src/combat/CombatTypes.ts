/**
 * 核心战斗模块共享强类型数据契约与池化投射物实体（src/combat/CombatTypes.ts）。
 * 严格遵循单向依赖铁律：仅依赖 src/core 与 src/data。
 */

import type { IPoolable } from '../core/ObjectPool';
import type { WeaponId } from '../data/weapons.data';

export type ProjectileFaction = 'PLAYER' | 'ENEMY';

export type ProjectileAtlasKey = 'weapons_fx_atlas' | 'synergy_fx_atlas' | 'enemy_fx_atlas';

export type ProjectileKind =
  | 'ARROW'
  | 'REPEATER_BOLT'
  | 'VITRIOL_FLASK'
  | 'OIL_FOG_FLASK'
  | 'PRISM_BEAM'
  | 'ENEMY_FLASK'
  | 'ENEMY_ACID_GLOB'
  | 'ENEMY_ASTRAL_BLADE';

export interface SolidWallRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CombatTargetView {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly facing: -1 | 1;
  readonly isAlive: boolean;
  readonly hasFrontShield: boolean;
  readonly isStunned: boolean;
  readonly inConductiveHazard: boolean;
  readonly isUntargetableByRanged?: boolean;
  readonly isBoss?: boolean;
}

export interface ResolvedWeaponHit {
  readonly weaponId: WeaponId;
  readonly stageIndex: number;
  readonly targetId: string;
  readonly impactX: number;
  readonly impactY: number;
  readonly blockedByFrontShield: boolean;
  readonly bypassFrontShield: boolean;
  readonly chainBounceIndex: number;
  readonly forceParryCrit: boolean;
}

export interface VoltaicChainSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  bounceIndex: number;
}

export interface ProjectileImpactEvent {
  readonly faction: ProjectileFaction;
  readonly kind: ProjectileKind;
  readonly weaponId: WeaponId;
  readonly targetId: string;
  readonly originX: number;
  readonly impactX: number;
  readonly impactY: number;
  readonly distanceTravelledPx: number;
  readonly blockedByFrontShield: boolean;
  readonly isReflectedParryBolt: boolean;
  readonly reflectedDamageScale: number;
  readonly embeddedArrowsBeforeHit: number;
  readonly sourceEnemyId: string;
  readonly rawEnemyDamage: number;
}

export class PooledProjectile implements IPoolable {
  public active = false;
  public faction: ProjectileFaction = 'PLAYER';
  public kind: ProjectileKind = 'ARROW';
  public weaponId: WeaponId = 'wpn_alembic_bow';
  public atlasKey: ProjectileAtlasKey = 'weapons_fx_atlas';
  public frameKey = 'proj_mercury_arrow';
  public originX = 0;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public gravityY = 0;
  public radiusPx = 4;
  public remainingSec = 0;
  public piercesLeft = 0;
  public homingTurnRateRadSec = 0;
  public isReflected = false;
  public reflectedDamageScale = 1.0;
  public sourceEnemyId = '';
  public rawEnemyDamage = 24;
  public firstPiercedTargetId = '';

  public reset(): void {
    this.active = false;
    this.faction = 'PLAYER';
    this.kind = 'ARROW';
    this.weaponId = 'wpn_alembic_bow';
    this.atlasKey = 'weapons_fx_atlas';
    this.vx = 0;
    this.vy = 0;
    this.gravityY = 0;
    this.remainingSec = 0;
    this.piercesLeft = 0;
    this.homingTurnRateRadSec = 0;
    this.isReflected = false;
    this.reflectedDamageScale = 1.0;
    this.sourceEnemyId = '';
    this.firstPiercedTargetId = '';
  }
}
