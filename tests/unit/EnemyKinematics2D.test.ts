import { describe, expect, it } from 'vitest';
import type { SolidWallRect } from '../../src/combat/CombatTypes';
import { FIXED_STEP_SEC } from '../../src/core/ClockController';
import { ENEMY_KINEMATICS_CONSTANTS } from '../../src/entities/enemies/EnemyKinematics2D';
import type { EnemyHazardRect, EnemyOneWayRect } from '../../src/entities/enemies/EnemyTypes';
import { FrenziedMinerEnemy, SlagHuskEnemy } from '../../src/entities/enemies/roster/SlagHuskEnemy';
import { MercuryStalkerEnemy, AstralInquisitorEnemy } from '../../src/entities/enemies/roster/MercuryStalkerEnemy';
import { ClockworkTickEnemy, VoltaicWeaverEnemy } from '../../src/entities/enemies/roster/VoltaicWeaverEnemy';

function stepEnemyTicks(
  enemy: SlagHuskEnemy | FrenziedMinerEnemy | ClockworkTickEnemy | MercuryStalkerEnemy | VoltaicWeaverEnemy | AstralInquisitorEnemy,
  ticks: number,
  params: {
    readonly playerX: number;
    readonly playerY: number;
    readonly solidRects: readonly SolidWallRect[];
    readonly oneWayPlatforms?: readonly EnemyOneWayRect[];
    readonly hazardZones?: readonly EnemyHazardRect[];
  }
): void {
  const dtSec = FIXED_STEP_SEC;
  const dtMs = dtSec * 1000;
  for (let i = 0; i < ticks; i++) {
    enemy.stepFixed(
      {
        dtSec,
        dtMs,
        playerX: params.playerX,
        playerY: params.playerY,
        playerFacing: 1,
        playerStealthed: false,
        solidRects: params.solidRects,
        oneWayPlatforms: params.oneWayPlatforms,
        hazardZones: params.hazardZones,
        roomAllies: [enemy],
        onStrikePlayer: () => {},
        onSpawnProjectile: () => {},
        onSpawnAcidOrFireHazard: () => {},
      },
      0
    );
  }
}

describe('Beta 1.0.2 Gate 3 — 120Hz 2D Ground Enemy Kinematics & Cross-Platform Navigation', () => {
  it('1. turns ground enemies around 100% of the time at patrol cliffs and SPIKE_BED / ACID_GEYSER hazards', () => {
    // High ledge from x = 100..260 at y = 200 (cliff drop at x > 260, wide patrolMaxX = 500)
    const cliffWorld: SolidWallRect[] = [
      { x: 100, y: 200, w: 160, h: 32 },
      { x: 0, y: 420, w: 600, h: 32 },
    ];
    const husk = new SlagHuskEnemy(null, null, null, {
      id: 'husk_cliff', speciesId: 'mob_01_slag_husk', roomId: 'r1',
      x: 235, y: 200, patrolMinX: 60, patrolMaxX: 500,
    });
    husk.facing = 1;

    // Step 180 ticks (1.5s) with player far out of perception range -> must turn around at cliff x <= 260 and stay at y = 200!
    stepEnemyTicks(husk, 180, { playerX: -9999, playerY: -9999, solidRects: cliffWorld });
    expect(husk.y).toBe(200);
    expect(husk.kinematics.grounded).toBe(true);
    expect(husk.x).toBeLessThanOrEqual(260);
    expect(husk.x).toBeGreaterThanOrEqual(100);

    // Flat floor with SPIKE_BED at x = 300..364 -> patrolling toward x = 300 must flip facing to -1 before touching spikes!
    const flatFloor: SolidWallRect[] = [{ x: 0, y: 300, w: 600, h: 32 }];
    const spikeZones: EnemyHazardRect[] = [{ kind: 'SPIKE_BED', x: 300, y: 300, w: 64 }];
    const huskSpike = new SlagHuskEnemy(null, null, null, {
      id: 'husk_spike', speciesId: 'mob_01_slag_husk', roomId: 'r1',
      x: 272, y: 300, patrolMinX: 80, patrolMaxX: 520,
    });
    huskSpike.facing = 1;
    stepEnemyTicks(huskSpike, 60, { playerX: -9999, playerY: -9999, solidRects: flatFloor, hazardZones: spikeZones });
    expect(huskSpike.facing).toBe(-1);
    expect(huskSpike.x).toBeLessThan(292);
  });

  it('2. drops through one-way platforms (220ms) and walks off solid ledges when aggroed by a player below', () => {
    const solidFloor: SolidWallRect[] = [{ x: 0, y: 360, w: 600, h: 32 }];
    const oneWayBridge: EnemyOneWayRect[] = [{ x: 140, y: 264, w: 220 }];

    const miner = new FrenziedMinerEnemy(null, null, null, {
      id: 'miner_drop', speciesId: 'mob_02_frenzied_miner', roomId: 'r1',
      x: 240, y: 264, patrolMinX: 150, patrolMaxX: 350,
    });

    // Player stands directly below on the main floor (y = 360, dy = +96px in [32, 176])
    stepEnemyTicks(miner, 90, {
      playerX: 260,
      playerY: 360,
      solidRects: solidFloor,
      oneWayPlatforms: oneWayBridge,
    });
    expect(miner.aggroed).toBe(true);
    expect(miner.y).toBe(360);
    expect(miner.kinematics.grounded).toBe(true);
    expect(miner.kinematics.onOneWay).toBe(false);

    // Solid ledge walk-off pursuit: husk on upper solid deck (x = 100..220, y = 264) walks off x = 220 to chase player at (280, 360)
    const twoTierSolids: SolidWallRect[] = [
      { x: 100, y: 264, w: 120, h: 24 },
      { x: 0, y: 360, w: 600, h: 32 },
    ];
    const ledgeHusk = new SlagHuskEnemy(null, null, null, {
      id: 'husk_walkoff', speciesId: 'mob_01_slag_husk', roomId: 'r1',
      x: 204, y: 264, patrolMinX: 112, patrolMaxX: 208,
    });
    ledgeHusk.facing = 1;
    stepEnemyTicks(ledgeHusk, 120, { playerX: 290, playerY: 360, solidRects: twoTierSolids });
    expect(ledgeHusk.y).toBe(360);
    expect(ledgeHusk.patrolMaxX).toBeGreaterThan(400);
  });

  it('3. launches agile species (mob_02, mob_08, mob_11) onto <= 84px upper platforms after 160ms crouch & 2200ms cooldown', () => {
    const mainFloor: SolidWallRect[] = [{ x: 0, y: 360, w: 600, h: 32 }];
    const upperPlatform: EnemyOneWayRect[] = [{ x: 250, y: 296, w: 160 }]; // dH = 64px <= 84px!

    const agileMiner = new FrenziedMinerEnemy(null, null, null, {
      id: 'miner_hop', speciesId: 'mob_02_frenzied_miner', roomId: 'r1',
      x: 220, y: 360, patrolMinX: 80, patrolMaxX: 500,
    });
    const agileTick = new ClockworkTickEnemy(null, null, null, {
      id: 'tick_hop', speciesId: 'mob_08_clockwork_tick', roomId: 'r1',
      x: 220, y: 360, patrolMinX: 80, patrolMaxX: 500,
    });
    const agileStalker = new MercuryStalkerEnemy(null, null, null, {
      id: 'stalker_hop', speciesId: 'mob_11_mercury_stalker', roomId: 'r1',
      x: 220, y: 360, patrolMinX: 80, patrolMaxX: 500,
    });
    agileStalker.applyHit(1, 0, 1); // Wake stalker out of puddle

    // Step 10 ticks (~83ms) -> miner enters 160ms hop crouch windup and sets 2200ms cooldown
    stepEnemyTicks(agileMiner, 10, {
      playerX: 296,
      playerY: 296,
      solidRects: mainFloor,
      oneWayPlatforms: upperPlatform,
    });
    expect(agileMiner.kinematics.hopWindupMs).toBeGreaterThan(0);
    expect(agileMiner.kinematics.hopCooldownMs).toBeGreaterThan(2000);

    // Advance 95 more ticks -> completes parabolic leap and lands cleanly on upperPlatform (y = 296)!
    stepEnemyTicks(agileMiner, 95, {
      playerX: 296,
      playerY: 296,
      solidRects: mainFloor,
      oneWayPlatforms: upperPlatform,
    });
    expect(agileMiner.y).toBe(296);
    expect(agileMiner.kinematics.grounded).toBe(true);

    // Tick & Stalker also leap up onto upperPlatform!
    stepEnemyTicks(agileTick, 110, { playerX: 296, playerY: 296, solidRects: mainFloor, oneWayPlatforms: upperPlatform });
    expect(agileTick.y).toBe(296);
    stepEnemyTicks(agileStalker, 235, { playerX: 296, playerY: 296, solidRects: mainFloor, oneWayPlatforms: upperPlatform });
    expect(agileStalker.y).toBe(296);
  });

  it('4. knocks high-ledge enemies off cliffs via pushBack(), accelerating at 1380 px/s² and applying >=112px fall damage + 800ms stun', () => {
    const highTowerWorld: SolidWallRect[] = [
      { x: 100, y: 160, w: 100, h: 24 }, // High ledge at y = 160 (right edge x = 200)
      { x: 0, y: 384, w: 600, h: 32 },   // Ground floor at y = 384 -> fall height = 224px (2.0 * 112px)!
    ];
    const victim = new SlagHuskEnemy(null, null, null, {
      id: 'husk_fall', speciesId: 'mob_01_slag_husk', roomId: 'r1',
      x: 190, y: 160, patrolMinX: 112, patrolMaxX: 192,
    });
    const hpBefore = victim.hp;
    const expectedFallDmg = Math.round(
      ENEMY_KINEMATICS_CONSTANTS.FALL_DAMAGE_BASE_MAX_HP_RATIO * victim.maxHp * (224 / 112)
    );

    // Register world walls on tick 1, then shield/heavy pushBack(+36px) shoves victim past x = 200 off the cliff!
    stepEnemyTicks(victim, 1, { playerX: -9999, playerY: -9999, solidRects: highTowerWorld });
    victim.pushBack(36, highTowerWorld);
    expect(victim.x).toBeGreaterThan(220);

    // Step 12 ticks mid-fall -> airborne, vy accelerating downward
    stepEnemyTicks(victim, 12, { playerX: -9999, playerY: -9999, solidRects: highTowerWorld });
    expect(victim.kinematics.grounded).toBe(false);
    expect(victim.kinematics.vy).toBeGreaterThan(100);
    expect(victim.y).toBeGreaterThan(160);

    // Step until landing at y = 384 -> takes exact 36% MaxHP fall impact damage and enters 800ms stun!
    stepEnemyTicks(victim, 65, { playerX: -9999, playerY: -9999, solidRects: highTowerWorld });
    expect(victim.y).toBe(384);
    expect(victim.kinematics.grounded).toBe(true);
    expect(victim.hp).toBe(hpBefore - expectedFallDmg);
    expect(victim.isStunned).toBe(true);

    // Flying species (mob_07 & mob_12) remain exempt from ground gravity
    const weaver = new VoltaicWeaverEnemy(null, null, null, {
      id: 'fly_07', speciesId: 'mob_07_voltaic_weaver', roomId: 'r1',
      x: 300, y: 180, patrolMinX: 100, patrolMaxX: 500,
    });
    const inquisitor = new AstralInquisitorEnemy(null, null, null, {
      id: 'fly_12', speciesId: 'mob_12_astral_inquisitor', roomId: 'r1',
      x: 340, y: 180, patrolMinX: 100, patrolMaxX: 500,
    });
    expect(weaver.usesGroundKinematics).toBe(false);
    expect(inquisitor.usesGroundKinematics).toBe(false);
    stepEnemyTicks(weaver, 40, { playerX: -9999, playerY: -9999, solidRects: highTowerWorld });
    expect(weaver.y).toBeLessThan(200);
  });
});
