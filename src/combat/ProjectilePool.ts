/**
 * 零 GC 扫掠子步进防穿墙投射物池、箭矢插拔追踪器与镜面圣盾三光束折射器
 * （src/combat/ProjectilePool.ts）。
 */

import { ObjectPool } from '../core/ObjectPool';
import { paddedPointHitsIndexedRects } from '../core/SpatialRectIndex';
import { COMBAT_CONSTANTS, type WeaponId } from '../data/weapons.data';
import {
  PooledProjectile,
  type CombatTargetView,
  type ProjectileFaction,
  type ProjectileImpactEvent,
  type ProjectileKind,
  type SolidWallRect,
} from './CombatTypes';
import {
  spawnEnemyFlaskBoltIntoPool,
  spawnLobbedAlchemyFlaskIntoPool,
  spawnMercuryArrowIntoPool,
  spawnMirrorAegisPrismBeamsIntoPool,
  spawnRepeaterBoltIntoPool,
  steerHomingProjectile,
} from './ProjectileBallistics';

export { PooledProjectile };
export type { ProjectileFaction, ProjectileImpactEvent, ProjectileKind, SolidWallRect };

const MAX_PROJECTILE_SUBSTEP_PX = 6;

export class ProjectilePool {
  private readonly pool: ObjectPool<PooledProjectile>;
  private readonly embeddedArrows = new Map<string, number>();
  private readonly scratchImpacts: ProjectileImpactEvent[] = [];

  public constructor() {
    this.pool = new ObjectPool<PooledProjectile>(() => new PooledProjectile(), 48, 128);
  }

  public get activeCount(): number {
    return this.pool.activeCount;
  }

  public getEmbeddedArrowCount(targetId: string): number {
    return this.embeddedArrows.get(targetId) ?? 0;
  }

  public ripOutArrowsFromTarget(targetId?: string): number {
    if (targetId !== undefined) {
      const count = this.embeddedArrows.get(targetId) ?? 0;
      this.embeddedArrows.delete(targetId);
      return count;
    }
    let total = 0;
    for (const c of this.embeddedArrows.values()) total += c;
    this.embeddedArrows.clear();
    return total;
  }

  public spawnPlayerMercuryArrow(originX: number, originY: number, dirX: -1 | 1, pierceFirstTarget: boolean): PooledProjectile {
    return spawnMercuryArrowIntoPool(this.pool, originX, originY, dirX, pierceFirstTarget);
  }

  public spawnPlayerRepeaterBolt(originX: number, originY: number, dirX: -1 | 1, spreadY: number, pierceFirst: boolean): PooledProjectile {
    return spawnRepeaterBoltIntoPool(this.pool, originX, originY, dirX, spreadY, pierceFirst);
  }

  public spawnPlayerLobbedFlask(kind: 'VITRIOL_FLASK' | 'OIL_FOG_FLASK', originX: number, originY: number, dirX: -1 | 1): PooledProjectile {
    return spawnLobbedAlchemyFlaskIntoPool(this.pool, kind, originX, originY, dirX);
  }

  public spawnMirrorAegisPrismBeams(originX: number, originY: number, facing: -1 | 1): readonly PooledProjectile[] {
    return spawnMirrorAegisPrismBeamsIntoPool(this.pool, originX, originY, facing);
  }

  public spawnEnemyFlaskBolt(
    sourceEnemyId: string,
    originX: number,
    originY: number,
    vx: number,
    vy: number,
    damage: number,
    gravityY = 260,
    kind: 'ENEMY_FLASK' | 'ENEMY_ACID_GLOB' | 'ENEMY_ASTRAL_BLADE' = 'ENEMY_FLASK'
  ): PooledProjectile {
    return spawnEnemyFlaskBoltIntoPool(this.pool, sourceEnemyId, originX, originY, vx, vy, damage, gravityY, kind);
  }

  public forEachActive(cb: (proj: PooledProjectile) => void): void {
    this.pool.forEachActive(cb);
  }

  public stepFixed(
    dtSec: number,
    walls: readonly SolidWallRect[],
    enemies: readonly CombatTargetView[],
    playerBody: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly isParryWindowActive: boolean;
      readonly facing?: -1 | 1;
      readonly equippedShieldId?: WeaponId | null;
    },
    onProjectileParried?: (worldX: number, worldY: number, sourceEnemyId: string, spawnedPrismBeams: boolean) => void,
    onFlaskShattered?: (kind: 'VITRIOL_FLASK' | 'OIL_FOG_FLASK' | 'ENEMY_FLASK', worldX: number, worldY: number) => void
  ): readonly ProjectileImpactEvent[] {
    this.scratchImpacts.length = 0;

    this.pool.forEachActive((p) => {
      p.remainingSec -= dtSec;
      if (p.remainingSec <= 0) {
        this.pool.release(p);
        return;
      }

      steerHomingProjectile(p, dtSec, enemies);
      p.vy += p.gravityY * dtSec;
      const totalDx = p.vx * dtSec;
      const totalDy = p.vy * dtSec;
      const subSteps = Math.max(1, Math.ceil(Math.max(Math.abs(totalDx), Math.abs(totalDy)) / MAX_PROJECTILE_SUBSTEP_PX));
      const stepDx = totalDx / subSteps;
      const stepDy = totalDy / subSteps;

      for (let s = 0; s < subSteps; s++) {
        p.x += stepDx;
        p.y += stepDy;
        if (this.hitsSolidWall(p.x, p.y, p.radiusPx, walls)) {
          if (p.kind === 'VITRIOL_FLASK' || p.kind === 'OIL_FOG_FLASK' || (p.kind === 'ENEMY_FLASK' && p.faction === 'ENEMY')) {
            onFlaskShattered?.(p.kind, p.x, p.y - 2);
          }
          this.pool.release(p);
          return;
        }
        if (p.faction === 'ENEMY') {
          const pHalfW = playerBody.width * 0.5 + (playerBody.isParryWindowActive ? 14 : 2);
          if (Math.abs(p.x - playerBody.x) <= pHalfW && p.y >= playerBody.y - playerBody.height - 6 && p.y <= playerBody.y + 4) {
            if (playerBody.isParryWindowActive) {
              if (playerBody.equippedShieldId === 'wpn_mirror_aegis') {
                const beamDir: -1 | 1 = playerBody.facing ?? (p.vx < 0 ? 1 : -1);
                const bx = p.x;
                const by = p.y;
                const src = p.sourceEnemyId;
                this.pool.release(p);
                this.spawnMirrorAegisPrismBeams(bx, by, beamDir);
                onProjectileParried?.(bx, by, src, true);
                return;
              }
              p.faction = 'PLAYER';
              p.isReflected = true;
              p.reflectedDamageScale = COMBAT_CONSTANTS.PARRY_DEFLECT_DAMAGE_MULT;
              p.originX = p.x;
              p.vx = -p.vx * COMBAT_CONSTANTS.PARRY_DEFLECT_SPEED_MULT;
              p.vy = -Math.abs(p.vy) * 0.35;
              p.gravityY = 0;
              p.remainingSec = 1.6;
              onProjectileParried?.(p.x, p.y, p.sourceEnemyId, false);
              break;
            }
            this.pushImpact(p, 'ENEMY', 'player_vessel_09', false, 0);
            this.pool.release(p);
            return;
          }
        } else {
          const hitEnemy = this.findHitEnemy(p, enemies);
          if (hitEnemy) {
            if (p.kind === 'OIL_FOG_FLASK') {
              onFlaskShattered?.('OIL_FOG_FLASK', p.x, hitEnemy.y - 2);
              this.pool.release(p);
              return;
            }
            if (p.kind === 'VITRIOL_FLASK') {
              onFlaskShattered?.('VITRIOL_FLASK', p.x, hitEnemy.y - 2);
            }
            const frontBlocked =
              hitEnemy.hasFrontShield && !hitEnemy.isStunned && !p.isReflected &&
              p.kind !== 'PRISM_BEAM' && p.piercesLeft === 0 &&
              (p.originX - hitEnemy.x) * hitEnemy.facing >= 0;
            const prevArrows = this.embeddedArrows.get(hitEnemy.id) ?? 0;
            if (!frontBlocked && (p.kind === 'ARROW' || p.kind === 'REPEATER_BOLT')) {
              this.embeddedArrows.set(hitEnemy.id, prevArrows + 1);
            }
            this.pushImpact(p, 'PLAYER', hitEnemy.id, frontBlocked, prevArrows);
            if (p.piercesLeft > 0 && !frontBlocked) {
              p.piercesLeft -= 1;
              p.firstPiercedTargetId = hitEnemy.id;
            } else {
              this.pool.release(p);
              return;
            }
          }
        }
      }
    });

    return this.scratchImpacts;
  }

  public releaseAll(): void {
    this.embeddedArrows.clear();
    this.pool.releaseAll();
  }

  private pushImpact(p: PooledProjectile, faction: ProjectileFaction, targetId: string, blockedByFrontShield: boolean, embeddedArrowsBeforeHit: number): void {
    this.scratchImpacts.push({
      faction, kind: p.kind, weaponId: p.weaponId, targetId, originX: p.originX, impactX: p.x, impactY: p.y,
      distanceTravelledPx: Math.abs(p.x - p.originX), blockedByFrontShield,
      isReflectedParryBolt: p.isReflected, reflectedDamageScale: p.reflectedDamageScale,
      embeddedArrowsBeforeHit, sourceEnemyId: p.sourceEnemyId, rawEnemyDamage: p.rawEnemyDamage,
    });
  }

  private hitsSolidWall(x: number, y: number, r: number, walls: readonly SolidWallRect[]): boolean {
    return paddedPointHitsIndexedRects(x, y, r, walls);
  }

  private findHitEnemy(p: PooledProjectile, enemies: readonly CombatTargetView[]): CombatTargetView | null {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (!e.isAlive || e.id === p.firstPiercedTargetId || e.isUntargetableByRanged) continue;
      if (Math.abs(p.x - e.x) <= e.width * 0.5 + p.radiusPx && p.y >= e.y - e.height - p.radiusPx && p.y <= e.y) return e;
    }
    return null;
  }
}
