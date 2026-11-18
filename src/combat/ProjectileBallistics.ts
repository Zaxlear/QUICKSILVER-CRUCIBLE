/**
 * 多武器弹道生成、抛物线烧瓶与「水银镜面圣盾」3 道自动追踪棱镜光束转向解算器
 * （src/combat/ProjectileBallistics.ts）。
 */

import type { ObjectPool } from '../core/ObjectPool';
import { COMBAT_CONSTANTS } from '../data/weapons.data';
import type { CombatTargetView, PooledProjectile } from './CombatTypes';

export function spawnMercuryArrowIntoPool(
  pool: ObjectPool<PooledProjectile>,
  originX: number,
  originY: number,
  dirX: -1 | 1,
  pierceFirstTarget: boolean
): PooledProjectile {
  const p = pool.acquire();
  p.active = true;
  p.faction = 'PLAYER';
  p.kind = 'ARROW';
  p.weaponId = 'wpn_alembic_bow';
  p.atlasKey = 'weapons_fx_atlas';
  p.frameKey = 'proj_mercury_arrow';
  p.originX = originX;
  p.x = originX;
  p.y = originY;
  p.vx = dirX * COMBAT_CONSTANTS.BOW_ARROW_SPEED_PX_S;
  p.vy = 0;
  p.gravityY = 0;
  p.radiusPx = 5;
  p.remainingSec = 1.4;
  p.piercesLeft = pierceFirstTarget ? 1 : 0;
  return p;
}

export function spawnEnemyFlaskBoltIntoPool(
  pool: ObjectPool<PooledProjectile>,
  sourceEnemyId: string,
  originX: number,
  originY: number,
  vx: number,
  vy: number,
  damage: number,
  gravityY = 260,
  kind: 'ENEMY_FLASK' | 'ENEMY_ACID_GLOB' | 'ENEMY_ASTRAL_BLADE' = 'ENEMY_FLASK'
): PooledProjectile {
  const p = pool.acquire();
  p.active = true;
  p.faction = 'ENEMY';
  p.kind = kind;
  if (kind === 'ENEMY_ACID_GLOB') {
    p.atlasKey = 'enemy_fx_atlas';
    p.frameKey = 'proj_acid_glob';
  } else if (kind === 'ENEMY_ASTRAL_BLADE') {
    p.atlasKey = 'enemy_fx_atlas';
    p.frameKey = 'proj_astral_blade';
  } else {
    p.atlasKey = 'weapons_fx_atlas';
    p.frameKey = 'proj_enemy_flask';
  }
  p.sourceEnemyId = sourceEnemyId;
  p.originX = originX;
  p.x = originX;
  p.y = originY;
  p.vx = vx;
  p.vy = vy;
  p.gravityY = gravityY;
  p.radiusPx = kind === 'ENEMY_ASTRAL_BLADE' ? 7 : 6;
  p.rawEnemyDamage = damage;
  p.remainingSec = 2.6;
  return p;
}

export function spawnRepeaterBoltIntoPool(
  pool: ObjectPool<PooledProjectile>,
  originX: number,
  originY: number,
  dirX: -1 | 1,
  spreadY: number,
  pierceFirst: boolean
): PooledProjectile {
  const p = pool.acquire();
  p.active = true;
  p.faction = 'PLAYER';
  p.kind = 'REPEATER_BOLT';
  p.weaponId = 'wpn_clockwork_repeater';
  p.atlasKey = 'synergy_fx_atlas';
  p.frameKey = 'proj_repeater_bolt';
  p.originX = originX;
  p.x = originX;
  p.y = originY;
  p.vx = dirX * COMBAT_CONSTANTS.REPEATER_BOLT_SPEED_PX_S;
  p.vy = spreadY;
  p.gravityY = 0;
  p.radiusPx = 4;
  p.remainingSec = 1.2;
  p.piercesLeft = pierceFirst ? 1 : 0;
  return p;
}

export function spawnLobbedAlchemyFlaskIntoPool(
  pool: ObjectPool<PooledProjectile>,
  kind: 'VITRIOL_FLASK' | 'OIL_FOG_FLASK',
  originX: number,
  originY: number,
  dirX: -1 | 1
): PooledProjectile {
  const p = pool.acquire();
  p.active = true;
  p.faction = 'PLAYER';
  p.kind = kind;
  p.weaponId = 'wpn_vitriol_thrower';
  p.atlasKey = 'synergy_fx_atlas';
  p.frameKey = kind === 'OIL_FOG_FLASK' ? 'skl_vitriol_flask' : 'proj_vitriol_flask';
  p.originX = originX;
  p.x = originX;
  p.y = originY;
  p.vx = dirX * 265;
  p.vy = -175;
  p.gravityY = 580;
  p.radiusPx = 6;
  p.remainingSec = 1.5;
  p.piercesLeft = 0;
  return p;
}

export function spawnMirrorAegisPrismBeamsIntoPool(
  pool: ObjectPool<PooledProjectile>,
  originX: number,
  originY: number,
  facing: -1 | 1
): readonly PooledProjectile[] {
  const anglesDeg = [-22, 0, 22] as const;
  const spawned: PooledProjectile[] = [];
  const baseRad = facing >= 0 ? 0 : Math.PI;
  const speed = COMBAT_CONSTANTS.AEGIS_PRISM_BEAM_SPEED_PX_S;

  for (let i = 0; i < anglesDeg.length; i++) {
    const ang = baseRad + (anglesDeg[i]! * Math.PI) / 180;
    const p = pool.acquire();
    p.active = true;
    p.faction = 'PLAYER';
    p.kind = 'PRISM_BEAM';
    p.weaponId = 'wpn_mirror_aegis';
    p.atlasKey = 'synergy_fx_atlas';
    p.frameKey = `proj_aegis_prism_beam_${i & 1}`;
    p.originX = originX;
    p.x = originX;
    p.y = originY;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed;
    p.gravityY = 0;
    p.radiusPx = 6;
    p.remainingSec = 1.8;
    p.homingTurnRateRadSec = 8.4;
    p.isReflected = true;
    p.reflectedDamageScale = 1.0;
    spawned.push(p);
  }
  return spawned;
}

export function steerHomingProjectile(
  p: PooledProjectile,
  dtSec: number,
  enemies: readonly CombatTargetView[]
): void {
  if (p.homingTurnRateRadSec <= 0) return;
  let nearest: CombatTargetView | null = null;
  let bestDist = 420;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i]!;
    if (!e.isAlive) continue;
    const d = Math.hypot(e.x - p.x, e.y - e.height * 0.5 - p.y);
    if (d < bestDist) {
      bestDist = d;
      nearest = e;
    }
  }
  if (!nearest) return;

  const targetAngle = Math.atan2(nearest.y - nearest.height * 0.5 - p.y, nearest.x - p.x);
  const curSpeed = Math.max(120, Math.hypot(p.vx, p.vy));
  const curAngle = Math.atan2(p.vy, p.vx);
  let diff = targetAngle - curAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const maxStep = p.homingTurnRateRadSec * dtSec;
  const nextAngle = curAngle + Math.max(-maxStep, Math.min(maxStep, diff));
  p.vx = Math.cos(nextAngle) * curSpeed;
  p.vy = Math.sin(nextAngle) * curSpeed;
}
