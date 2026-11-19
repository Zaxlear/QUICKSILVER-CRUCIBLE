import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectilePool } from '../../src/combat/ProjectilePool';
import { FIXED_STEP_SEC } from '../../src/core/ClockController';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { EventBus } from '../../src/core/EventBus';
import {
  ALL_BIOME_IDS,
  ALL_ELITE_AFFIX_IDS,
  ALL_ENEMY_IDS,
  BIOME_CATALOG,
  ENEMY_CATALOG,
} from '../../src/data/biomes.data';
import { BaseEnemy } from '../../src/entities/enemies/BaseEnemy';
import { EliteAffixController } from '../../src/entities/enemies/EliteAffixController';
import { EnemyDirector, instantiateEnemySpecies } from '../../src/entities/enemies/EnemyDirector';
import { evaluateEnemyPerception, hasLineOfSight } from '../../src/entities/enemies/PerceptionSensor';
import { AcidSpitterEnemy, AlembicThrowerEnemy } from '../../src/entities/enemies/roster/AlembicThrowerEnemy';
import { BrassSentinelEnemy, FlailExecutorEnemy } from '../../src/entities/enemies/roster/BrassSentinelEnemy';
import { AstralInquisitorEnemy, MercuryStalkerEnemy } from '../../src/entities/enemies/roster/MercuryStalkerEnemy';
import { OssuaryPrelateEnemy, PendulumAssassinEnemy } from '../../src/entities/enemies/roster/OssuaryPrelateEnemy';
import { FrenziedMinerEnemy, SlagHuskEnemy } from '../../src/entities/enemies/roster/SlagHuskEnemy';
import { ClockworkTickEnemy, VoltaicWeaverEnemy } from '../../src/entities/enemies/roster/VoltaicWeaverEnemy';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../../src/world/RoomChunkSchema';

function stepTicks(
  enemy: BaseEnemy,
  ticks: number,
  playerX: number,
  playerY: number,
  opts?: {
    playerFacing?: -1 | 1;
    stealthed?: boolean;
    allies?: BaseEnemy[];
    onStrike?: (dmg: number, parriable: boolean, rootSec?: number) => void;
    onProj?: (kind: string, vx: number, vy: number) => void;
    onBeam?: (kind: string, hot: boolean) => void;
    onGround?: (kind: string) => void;
  }
): void {
  const dtSec = FIXED_STEP_SEC;
  const dtMs = dtSec * 1000;
  for (let t = 0; t < ticks; t++) {
    enemy.stepFixed(
      {
        dtSec,
        dtMs,
        playerX,
        playerY,
        playerFacing: opts?.playerFacing ?? 1,
        playerStealthed: opts?.stealthed ?? false,
        solidRects: [],
        roomAllies: opts?.allies ?? [enemy],
        onStrikePlayer: (dmg, _dir, parriable, _src, rootSec) => opts?.onStrike?.(dmg, parriable, rootSec),
        onSpawnProjectile: (_sid, _ox, _oy, vx, vy, _dmg, _g, kind) => opts?.onProj?.(kind, vx, vy),
        onSpawnAcidOrFireHazard: () => {},
        onDrawBeam: (kind, _x0, _y0, _x1, _y1, hot) => opts?.onBeam?.(kind, hot),
        onDrawGroundEffect: (kind) => opts?.onGround?.(kind),
      },
      0
    );
  }
}

describe('Milestone 7 — 4 Biomes Normal Assets, 12 Enemy AI Species & 4 Elite Affixes', () => {
  it('verifies 100% normal-map pairs for all 4 biomes tilesets, 20 parallax layers, and 12-enemy atlases', () => {
    expect(ALL_BIOME_IDS).toHaveLength(4);
    expect(ALL_ENEMY_IDS).toHaveLength(12);
    expect(ALL_ELITE_AFFIX_IDS).toHaveLength(4);

    const root = process.cwd();
    for (const bid of ALL_BIOME_IDS) {
      const spec = BIOME_CATALOG[bid];
      expect(fs.existsSync(path.join(root, `public/assets/tilemaps/${spec.tilesetKey}.png`))).toBe(true);
      expect(fs.existsSync(path.join(root, `public/assets/tilemaps/${spec.tilesetKey}_n.png`))).toBe(true);
      for (let i = 0; i < 5; i++) {
        expect(fs.existsSync(path.join(root, `public/assets/tilemaps/${spec.parallaxPrefix}${i}.png`))).toBe(true);
        expect(fs.existsSync(path.join(root, `public/assets/tilemaps/${spec.parallaxPrefix}${i}_n.png`))).toBe(true);
      }
    }

    for (const atlas of ['enemies_roster_atlas', 'enemy_fx_atlas']) {
      const jsonPath = path.join(root, `public/assets/atlases/${atlas}.json`);
      expect(fs.existsSync(jsonPath)).toBe(true);
      expect(fs.existsSync(path.join(root, `public/assets/atlases/${atlas}.png`))).toBe(true);
      expect(fs.existsSync(path.join(root, `public/assets/atlases/${atlas}_n.png`))).toBe(true);
    }

    const rosterJson = JSON.parse(
      fs.readFileSync(path.join(root, 'public/assets/atlases/enemies_roster_atlas.json'), 'utf8')
    ) as { textures: Array<{ frames: Array<{ filename: string }> }> };
    const frameNames = new Set(rosterJson.textures.flatMap((t) => t.frames.map((f) => f.filename)));
    for (const eid of ALL_ENEMY_IDS) {
      expect(frameNames.has(`${eid}_idle_0`)).toBe(true);
      expect(frameNames.has(`${eid}_windup_0`)).toBe(true);
      expect(frameNames.has(`${eid}_attack_0`)).toBe(true);
      expect(frameNames.has(`${eid}_hurt_0`)).toBe(true);
    }
  });

  it('validates PerceptionSensor LOS wall occlusion and mut_predator_veil optical stealth de-aggro', () => {
    const wall = [{ x: 180, y: 200, w: 32, h: 120 }];
    expect(hasLineOfSight(100, 260, 280, 260, wall)).toBe(false);
    expect(hasLineOfSight(100, 260, 160, 260, wall)).toBe(true);

    const blocked = evaluateEnemyPerception(
      { enemyX: 100, enemyY: 280, eyeHeightPx: 30, facing: 1, losRadiusPx: 260, hearingRadiusPx: 50, ignoresWallLos: false, alreadyAggroed: false },
      280, 280, false, wall
    );
    expect(blocked.detected).toBe(false);

    const stealthLost = evaluateEnemyPerception(
      { enemyX: 100, enemyY: 280, eyeHeightPx: 30, facing: 1, losRadiusPx: 260, hearingRadiusPx: 150, ignoresWallLos: true, alreadyAggroed: true },
      180, 280, true, []
    );
    expect(stealthLost.detected).toBe(false);
  });

  it('verifies Tier 1 & 2 Roster: SlagHusk, FrenziedMiner (ally-death rage + 2-hit), AlembicThrower (backflip + flask) & AcidSpitter (3-glob + Red deathrattle)', () => {
    // 1. SlagHusk (420ms Yellow [!] -> melee lunge)
    const husk = instantiateEnemySpecies(null, null, null, {
      id: 'h1', speciesId: 'mob_01_slag_husk', roomId: 'r1', x: 200, y: 300, patrolMinX: 100, patrolMaxX: 320,
    }) as SlagHuskEnemy;
    let huskStrikes = 0;
    stepTicks(husk, 10, 230, 300, { onStrike: (_d, par) => { expect(par).toBe(true); huskStrikes++; } });
    expect(husk.telegraph).toBe('YELLOW_PARRIABLE');
    stepTicks(husk, 55, 230, 300, { onStrike: () => { huskStrikes++; } });
    expect(huskStrikes).toBe(1);

    // 2. FrenziedMiner: ally death triggers immediate rage (195 px/s) + 2-hit yellow combo
    const miner = instantiateEnemySpecies(null, null, null, {
      id: 'm2', speciesId: 'mob_02_frenzied_miner', roomId: 'r1', x: 200, y: 300, patrolMinX: 80, patrolMaxX: 400,
    }) as FrenziedMinerEnemy;
    expect(miner.isEnraged).toBe(false);
    miner.onAllyKilledInRoom();
    expect(miner.isEnraged).toBe(true);
    let minerHits = 0;
    stepTicks(miner, 100, 224, 300, { onStrike: (_d, par) => { expect(par).toBe(true); minerHits++; } });
    expect(minerHits).toBe(2);

    // 3. AlembicThrower: <72px backflip retreat then parabolic flask throw
    const thrower = instantiateEnemySpecies(null, null, null, {
      id: 't3', speciesId: 'mob_03_alembic_thrower', roomId: 'r1', x: 220, y: 300, patrolMinX: 80, patrolMaxX: 400,
    }) as AlembicThrowerEnemy;
    const spawnedProjs: string[] = [];
    stepTicks(thrower, 12, 260, 300, { onProj: (k) => spawnedProjs.push(k) });
    expect(thrower.x).toBeLessThan(205); // Retreated away from close player!
    stepTicks(thrower, 90, 360, 300, { onProj: (k) => spawnedProjs.push(k) });
    expect(spawnedProjs).toContain('ENEMY_FLASK');

    // 4. AcidSpitter: unpushable, 3-way acid glob fan + 650ms RED [✚!] deathrattle burst
    const spitter = instantiateEnemySpecies(null, null, null, {
      id: 's4', speciesId: 'mob_04_acid_spitter', roomId: 'r2', x: 200, y: 300, patrolMinX: 100, patrolMaxX: 350,
    }) as AcidSpitterEnemy;
    spitter.pushBack(50);
    expect(spitter.x).toBe(200); // Immune to pushback!
    const acidGlobs: number[] = [];
    stepTicks(spitter, 75, 310, 300, { onProj: (k, _vx, vy) => { if (k === 'ENEMY_ACID_GLOB') acidGlobs.push(vy); } });
    expect(acidGlobs).toHaveLength(3);

    const lethal = spitter.applyHit(999, 1.0, 1);
    expect(lethal.killed).toBe(false); // Intercepted into Deathrattle Swell!
    expect(spitter.telegraph).toBe('RED_UNPARRIABLE');
    let unparriableBlast = false;
    stepTicks(spitter, 85, 220, 300, { onStrike: (_d, par) => { if (!par) unparriableBlast = true; } });
    expect(unparriableBlast).toBe(true);
    expect(spitter.isDissolving || !spitter.isAlive).toBe(true);
  });

  it('verifies Tier 3 Roster: BrassSentinel (750ms turn window), FlailExecutor (super-armor + jumpable wave), VoltaicWeaver, ClockworkTick, OssuaryPrelate (3-ally ward + gold tether) & PendulumAssassin', () => {
    // 5. BrassSentinel: front shield + slow 750ms turn delay
    const sentinel = instantiateEnemySpecies(null, null, null, {
      id: 'b5', speciesId: 'mob_05_brass_sentinel', roomId: 'r3', x: 250, y: 300, patrolMinX: 100, patrolMaxX: 400,
    }) as BrassSentinelEnemy;
    sentinel.facing = -1;
    stepTicks(sentinel, 40, 300, 300); // ~333ms < 750ms -> still facing -1 (back exposed!)
    expect(sentinel.facing).toBe(-1);
    expect(sentinel.hasFrontShield).toBe(true);
    stepTicks(sentinel, 60, 300, 300); // > 750ms -> turns around to face +1
    expect(sentinel.facing).toBe(1);

    // 6. FlailExecutor: poise super-armor ignores 0.3 light breach, alternates yellow sweep & red ground wave
    const executor = instantiateEnemySpecies(null, null, null, {
      id: 'f6', speciesId: 'mob_06_flail_executor', roomId: 'r3', x: 200, y: 300, patrolMinX: 80, patrolMaxX: 420,
    }) as FlailExecutorEnemy;
    stepTicks(executor, 5, 260, 300); // Enters SWEEP_WINDUP (Yellow)
    expect(executor.telegraph).toBe('YELLOW_PARRIABLE');
    const poiseBefore = executor.poise;
    executor.applyHit(15, 0.3, 1); // Light breach < 1.05 poiseArmorFloor -> poise unchanged!
    expect(executor.poise).toBe(poiseBefore);
    stepTicks(executor, 160, 260, 300); // Completes sweep + recover -> next is SLAM_WINDUP (Red)
    stepTicks(executor, 10, 260, 300);
    expect(executor.telegraph).toBe('RED_UNPARRIABLE');
    let hitAirbornePlayer = false;
    stepTicks(executor, 110, 260, 240, { onStrike: () => { hitAirbornePlayer = true; } }); // Player jumped 60px high!
    expect(hitAirbornePlayer).toBe(false);

    // 7 & 8. VoltaicWeaver (Red ray) & ClockworkTick (ball camouflage -> 450ms Red self-destruct)
    const weaver = instantiateEnemySpecies(null, null, null, {
      id: 'w7', speciesId: 'mob_07_voltaic_weaver', roomId: 'r3', x: 200, y: 240, patrolMinX: 80, patrolMaxX: 420,
    }) as VoltaicWeaverEnemy;
    let hotRayFired = false;
    stepTicks(weaver, 90, 260, 300, { onBeam: (k, hot) => { if (k === 'WEAVER_RAY' && hot) hotRayFired = true; } });
    expect(hotRayFired).toBe(true);

    const tick = instantiateEnemySpecies(null, null, null, {
      id: 't8', speciesId: 'mob_08_clockwork_tick', roomId: 'r3', x: 200, y: 300, patrolMinX: 80, patrolMaxX: 420,
    }) as ClockworkTickEnemy;
    let tickExploded = false;
    stepTicks(tick, 70, 225, 300, { onStrike: (_d, par) => { if (!par) tickExploded = true; } });
    expect(tickExploded).toBe(true);

    // 9. OssuaryPrelate: shields up to 3 room allies with PRELATE_TETHER golden beams; killing/stunning Prelate drops wards
    const prelate = instantiateEnemySpecies(null, null, null, {
      id: 'p9', speciesId: 'mob_09_ossuary_prelate', roomId: 'r3', x: 340, y: 300, patrolMinX: 100, patrolMaxX: 420,
    }) as OssuaryPrelateEnemy;
    const allies = [0, 1, 2, 3].map((i) =>
      instantiateEnemySpecies(null, null, null, {
        id: `ally_${i}`, speciesId: 'mob_01_slag_husk', roomId: 'r3', x: 180 + i * 24, y: 300, patrolMinX: 100, patrolMaxX: 420,
      })
    );
    let goldBeams = 0;
    stepTicks(prelate, 2, 220, 300, {
      allies: [prelate, ...allies],
      onBeam: (k) => { if (k === 'PRELATE_TETHER') goldBeams++; },
    });
    expect(prelate.shieldedAllyCount).toBe(3); // Caps strictly at 3 allies!
    expect(goldBeams).toBeGreaterThanOrEqual(3);
    expect(allies[0]!.isShieldedByPrelate).toBe(true);
    expect(allies[3]!.isShieldedByPrelate).toBe(false);
    // Attacking a shielded ally deals 0 damage and returns blockedByWard = true!
    const wardHit = allies[0]!.applyHit(80, 2.0, 1);
    expect(wardHit.blockedByWard).toBe(true);
    expect(allies[0]!.hp).toBe(allies[0]!.maxHp);

    // 10. PendulumAssassin: teleports 28px behind player's back and strikes
    const assassin = instantiateEnemySpecies(null, null, null, {
      id: 'a10', speciesId: 'mob_10_pendulum_assassin', roomId: 'r3', x: 420, y: 220, patrolMinX: 80, patrolMaxX: 480,
    }) as PendulumAssassinEnemy;
    stepTicks(assassin, 22, 240, 300, { playerFacing: 1 });
    expect(assassin.x).toBeCloseTo(212, 0); // 240 - 28 = 212px behind player!
    expect(assassin.telegraph).toBe('YELLOW_PARRIABLE');
  });

  it('verifies Tier 4 Roster (MercuryStalker puddle ranged immunity + AstralInquisitor 3-blade & gravity root) and all 4 Elite Affixes', () => {
    // 11. MercuryStalker: puddle state ignores ranged arrows in ProjectilePool
    const stalker = instantiateEnemySpecies(null, null, null, {
      id: 'ms11', speciesId: 'mob_11_mercury_stalker', roomId: 'r4', x: 300, y: 300, patrolMinX: 100, patrolMaxX: 480,
    }) as MercuryStalkerEnemy;
    expect(stalker.isUntargetableByRanged).toBe(true);
    const projPool = new ProjectilePool();
    projPool.spawnPlayerMercuryArrow(160, 290, 1, false);
    const impacts = projPool.stepFixed(
      0.25, [], [stalker.toTargetView(false)],
      { x: 140, y: 300, width: 14, height: 30, isParryWindowActive: false }
    );
    expect(impacts).toHaveLength(0); // Arrow flies right over the flat reflective puddle!

    // Awaken stalker -> pounce -> next cycle submerges for RED ground spike!
    let spikeErupted = false;
    stepTicks(stalker, 210, 260, 300, { onGround: (k) => { if (k === 'SPIKE_ERUPT') spikeErupted = true; } });
    expect(spikeErupted).toBe(true);

    // 12. AstralInquisitor: 3-blade volley + 680ms RED Gravity Collapse Sigil root
    const inquisitor = instantiateEnemySpecies(null, null, null, {
      id: 'inq12', speciesId: 'mob_12_astral_inquisitor', roomId: 'r4', x: 340, y: 300, patrolMinX: 100, patrolMaxX: 500,
    }) as AstralInquisitorEnemy;
    let astralBlades = 0;
    let appliedRoot = 0;
    stepTicks(inquisitor, 260, 200, 300, {
      onProj: (k) => { if (k === 'ENEMY_ASTRAL_BLADE') astralBlades++; },
      onStrike: (_d, _par, rootSec) => { if (rootSec) appliedRoot = rootSec; },
    });
    expect(astralBlades).toBe(3);
    expect(appliedRoot).toBeGreaterThan(1.0);

    // Elite Affixes: thorns_shell (20% rear reflect), twin_clone (45% HP clone), rotating_laser & voltaic_cage
    const elite = instantiateEnemySpecies(null, null, null, {
      id: 'el_1', speciesId: 'mob_05_brass_sentinel', roomId: 'r_el', x: 250, y: 300,
      patrolMinX: 80, patrolMaxX: 460, isElite: true,
      eliteAffixes: ['elite_thorns_shell', 'elite_twin_clone', 'elite_rotating_laser', 'elite_voltaic_cage'],
    });
    expect(elite.maxHp).toBe(Math.round(ENEMY_CATALOG.mob_05_brass_sentinel.baseHp * 3.2));
    elite.facing = 1;
    // Backstab from x=210 (behind facing +1): reflects 20% of 100 = 20 dmg!
    const backHit = elite.applyHit(100, 0.5, 1, 210);
    expect(backHit.thornsReflectedDamage).toBe(20);

    const eliteCtrl = new EliteAffixController(null, null);
    let spawnedCloneFor: string | null = null;
    let auraHits = 0;
    eliteCtrl.stepFixed(
      FIXED_STEP_SEC, FIXED_STEP_SEC * 1000, [elite], 280, 300, 1, [],
      () => { auraHits++; },
      (host) => { spawnedCloneFor = host.id; }
    );
    expect(spawnedCloneFor).toBe('el_1');
    // Step player into left voltaic cage boundary (280 - 160 = 120px)
    eliteCtrl.stepFixed(
      FIXED_STEP_SEC, FIXED_STEP_SEC * 1000, [elite], 120, 300, 1, [],
      () => { auraHits++; },
      () => {}
    );
    expect(auraHits).toBeGreaterThanOrEqual(1);
  });

  it('verifies EnemyDirector deterministic spawn RNG isolation and audio:combat_intensity_changed aggro broadcast', () => {
    const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { chunks: string[] };
    const chunks: RoomChunkTemplate[] = manifest.chunks.map((id) =>
      validateRoomChunkTemplate(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')))
    );

    const rootRngA = new DeterministicRng(0x1234abcd);
    const dag = generateBiomeDag(rootRngA, 'biome_03_clockwork_ossuary', chunks);
    const dirA = new EnemyDirector(null, null, dag, rootRngA);
    const dirB = new EnemyDirector(null, null, dag, new DeterministicRng(0x1234abcd));

    expect(rootRngA.stepCount).toBe(0); // Zero parent RNG pollution!
    expect(dirA.enemies.filter((e) => e.roomId === dag.nodes[0]!.nodeId)).toHaveLength(0); // Entrance room has zero dummy spawns!
    expect(dirA.enemies.map((e) => `${e.speciesId}:${e.eliteAffixes.join(',')}`)).toEqual(
      dirB.enemies.map((e) => `${e.speciesId}:${e.eliteAffixes.join(',')}`)
    );

    const intensityEvents: number[] = [];
    const off = EventBus.on('audio:combat_intensity_changed', ({ aggroCount }) => intensityEvents.push(aggroCount));
    const first = dirA.enemies[0]!;
    dirA.stepFixed(FIXED_STEP_SEC, first.x + 12, first.y, 1, false, [], () => 0, {
      onStrikePlayer: () => {},
      onSpawnProjectile: () => {},
      onSpawnAcidOrFireHazard: () => {},
    });
    off();
    expect(intensityEvents.some((c) => c >= 1)).toBe(true);

    // Killed enemies stay permanently dead even after 500 ticks (> 4.1s) — no 1.6s dummy resurrection!
    first.applyHit(99999, 99, 1);
    stepTicks(first, 500, first.x, first.y);
    expect(first.isAlive).toBe(false);
  });
});
