import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateFinalHitDamage } from '../../src/combat/DamageCalculator';
import { CurseStateController } from '../../src/combat/CurseStateController';
import { TILE_SIZE_PX } from '../../src/core/Constants';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { EventBus } from '../../src/core/EventBus';
import { NarrativeSessionStore, NarrativeStore } from '../../src/core/NarrativeSessionStore';
import { WEAPON_CATALOG } from '../../src/data/weapons.data';
import { EnemyDirector } from '../../src/entities/enemies/EnemyDirector';
import { PlayerEntity } from '../../src/entities/player/PlayerEntity';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';
import { buildPlayerNpcGuardContext } from '../../src/scenes/BiomeUiCommandBridge';
import { createDefaultMetaProgression } from '../../src/storage/SaveSchema';
import { CombatLootSpawner } from '../../src/world/CombatLootSpawner';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry } from '../../src/world/DoorSocketStitcher';
import { EliteAltarEncounter } from '../../src/world/EliteAltarEncounter';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../../src/world/RoomChunkSchema';

function createIdleInput(): ActionMap {
  const vp = buildViewportSnapshot(1920, 1080, 1);
  return new ActionMap(vp, {
    keyboardMouse: new KeyboardMouseProvider(null),
    gamepad: new GamepadProvider(() => []),
    touchPad: new TouchVirtualPadProvider(vp, null),
  });
}

function loadAllChunks(): RoomChunkTemplate[] {
  const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { chunks: string[] };
  return manifest.chunks.map((id) =>
    validateRoomChunkTemplate(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')))
  );
}

describe('Beta 1.0.2 Gate 2 — Zero Initial Runes, Elite Steam-Seal Encounter & 10-Kill Blood Curse Loop', () => {
  it('1. starts fresh profiles with unlockedRunes === [] and enforces the 4-step Metroidvania rune chain', async () => {
    const freshMeta = await createDefaultMetaProgression();
    expect(freshMeta.unlockedRunes).toEqual([]);

    const freshStore = new NarrativeSessionStore();
    expect(freshStore.unlockedRunes).toEqual([]);

    freshStore.recordBossDefeated('boss_01_furnace_warden');
    expect(freshStore.unlockedRunes).toEqual(['rune_calcined_ram']);
    expect(freshStore.carriedBlueprints).toContain('skl_tesla_coil_turret');
  });

  it('2. locks ELITE room doors while room elite lives, unlocks upon kill, and converts repeat visits into Reliquaries', () => {
    NarrativeStore.setUnlockedRunesExact([]);
    const chunks = loadAllChunks();
    const dag = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_01_slag_retort', chunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    const solidCountBefore = baked.solidRects.length;

    const director = new EnemyDirector(null, null, dag, new DeterministicRng(0x51c0ffee));
    const encounter = new EliteAltarEncounter(null, null, dag, baked);
    const eliteNode = dag.nodes.find((n) => n.chunk.role === 'ELITE')!;
    const ped = eliteNode.chunk.rewardPedestalTilePos!;
    const altarX = (eliteNode.worldTileX + ped.tileX) * TILE_SIZE_PX + 8;
    const altarY = (eliteNode.worldTileY + ped.tileY + 1) * TILE_SIZE_PX;

    const roomElites = director.enemies.filter((e) => e.roomId === eliteNode.nodeId && e.isElite);
    expect(roomElites.length).toBeGreaterThanOrEqual(1);
    expect(encounter.encounterState).toBe('DORMANT');

    // Step within 140px of altar while room elite is alive -> LOCKED_COMBAT + steam door barriers added!
    encounter.stepFixed(1 / 120, altarX - 24, altarY, director.enemies);
    expect(encounter.encounterState).toBe('LOCKED_COMBAT');
    expect(baked.solidRects.length).toBeGreaterThan(solidCountBefore);

    let grantedRune = '';
    const rejected = encounter.tryClaimAltar(director.enemies, (r) => { grantedRune = r; }, () => {});
    expect(rejected).toBe('REJECTED_LOCKED');
    expect(grantedRune).toBe('');

    // Slay all elites in the room -> steam doors immediately retract and altar enters CLEARED_UNLOCKABLE!
    for (const el of roomElites) {
      el.isShieldedByPrelate = false;
      el.applyHit(999999, 99, 1);
    }
    encounter.stepFixed(1 / 120, altarX, altarY, director.enemies);
    expect(encounter.encounterState).toBe('CLEARED_UNLOCKABLE');
    expect(baked.solidRects.length).toBe(solidCountBefore);

    const claimed = encounter.tryClaimAltar(director.enemies, (r) => {
      grantedRune = r;
      NarrativeStore.syncUnlockedRunes([r]);
    }, () => {});
    expect(claimed).toBe('UNLOCKED_RUNE');
    expect(grantedRune).toBe('rune_vitriol_tendril');
    expect(encounter.encounterState).toBe('CONSUMED');

    // Repeat run when rune_vitriol_tendril is ALREADY unlocked -> converts into Reliquary (+45 Ichor)!
    const repeatEncounter = new EliteAltarEncounter(null, null, dag, baked);
    repeatEncounter.stepFixed(1 / 120, altarX, altarY, []);
    let repeatIchor = 0;
    const reliquaryRes = repeatEncounter.tryClaimAltar([], () => {}, (ichor) => { repeatIchor = ichor; });
    expect(reliquaryRes).toBe('GRANTED_RELIQUARY');
    expect(repeatIchor).toBe(45);
  });

  it('3. enforces 10-kill Blood Curse instant lethality (bypassing Aegis Shield & Emergency Carapace), colorless scaling, -1/-3/Boss lift & vesper_07', () => {
    const chunks = loadAllChunks();
    const dag = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_02_vitriol_sewers', chunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);

    let shieldHookCalled = false;
    let carapaceHookCalled = false;
    const player = new PlayerEntity({
      spawnX: 256,
      spawnY: 416,
      world: baked,
      input: createIdleInput(),
      hooks: {
        absorbIncomingWithSkillShield: () => {
          shieldHookCalled = true;
          return 0;
        },
        tryEmergencyCarapaceSave: () => {
          carapaceHookCalled = true;
          return true;
        },
      },
    });
    player.inventory.loadout.toggleMutationChoice('mut_emergency_carapace');

    const lootSpawner = new CombatLootSpawner(null, null, dag, player.inventory, new DeterministicRng(0x4242));
    expect(lootSpawner.cursedChests.length).toBeGreaterThanOrEqual(1);
    const opened = lootSpawner.openCursedChestAndSpawnLoot(lootSpawner.cursedChests[0]!.id)!;
    expect(opened).not.toBeNull();
    expect(opened.weapon.isColorlessLegendary).toBe(true);
    expect(opened.weapon.forgeGrade).toBe('S');

    // Colorless legendary weapon dynamically scales with highest stat as scrolls are picked
    player.stats.applyScrollUpgrade('albedo');
    player.stats.applyScrollUpgrade('albedo');
    player.stats.applyScrollUpgrade('albedo');
    const rule = WEAPON_CATALOG.wpn_rust_scalpel.critRule;
    const colorlessHit = calculateFinalHitDamage({
      weaponId: 'wpn_rust_scalpel', stageIndex: 0, level: 'III', forgeGrade: 'S',
      bonusStatColor: null, isColorlessLegendary: true, affixIds: [], playerStats: player.stats.snapshotLevels,
      targetStatuses: { isBleeding: false, isPoisoned: false, isIgnited: false, isVioletNapalm: false, isFrozen: false, isElectrified: false, isStunnedOrRooted: false },
      critInput: { rule, attackerX: 0, targetX: 20, targetFacing: -1, rapierCritWindowMs: 0, comboIndex: 0, cleaverRhythmPrimed: false, distancePx: 20, targetStuckArrows: 0, inConductiveHazard: false, chainBounceIndex: 0, forceParryCrit: false },
    });
    const normalHit = calculateFinalHitDamage({
      weaponId: 'wpn_rust_scalpel', stageIndex: 0, level: 'III', forgeGrade: 'S',
      bonusStatColor: null, isColorlessLegendary: false, affixIds: [], playerStats: player.stats.snapshotLevels,
      targetStatuses: { isBleeding: false, isPoisoned: false, isIgnited: false, isVioletNapalm: false, isFrozen: false, isElectrified: false, isStunnedOrRooted: false },
      critInput: { rule, attackerX: 0, targetX: 20, targetFacing: -1, rapierCritWindowMs: 0, comboIndex: 0, cleaverRhythmPrimed: false, distancePx: 20, targetStuckArrows: 0, inConductiveHazard: false, chainBounceIndex: 0, forceParryCrit: false },
    });
    expect(colorlessHit.finalDamage).toBeGreaterThan(normalHit.finalDamage);

    let curseLiftedCount = 0;
    const curseCtrl = new CurseStateController(player.stats, {
      onCurseLifted: () => { curseLiftedCount += 1; },
    });
    curseCtrl.mount();
    curseCtrl.inflictCurse(10);
    expect(player.stats.cursedKillsRemaining).toBe(10);

    // Sister Vesper prioritizes vesper_07 when player is cursed!
    const vesperStore = new NarrativeSessionStore();
    const guardCtx = buildPlayerNpcGuardContext(player, 'biome_02_vitriol_sewers', []);
    expect(guardCtx.isPlayerCursed).toBe(true);
    const vesperLine = vesperStore.selectNextNpcDialogue('vesper', guardCtx);
    expect(vesperLine.id).toBe('vesper_07');

    // Golden Parry & Dodge i-frames safely avoid curse death
    player.ctx.isParryWindowActive = true;
    expect(player.receiveIncomingHit(15, 1, true)).toBe('parried');
    expect(player.stats.hp).toBeGreaterThan(0);
    player.ctx.isParryWindowActive = false;

    player.ctx.isInvulnerable = true;
    expect(player.receiveIncomingHit(15, 1, true)).toBe('evaded');
    player.ctx.isInvulnerable = false;

    // 10 normal enemy kills via EventBus decrement 10 -> 0 and lift curse!
    for (let k = 0; k < 10; k++) {
      EventBus.emit('combat:enemy_killed', {
        enemyId: `e_${k}`, archetypeId: 'MELEE_GRUNT', worldX: 100, worldY: 100, isElite: false,
      });
    }
    expect(player.stats.cursedKillsRemaining).toBe(0);
    expect(curseLiftedCount).toBe(1);

    // Elite (-3) & Boss (-> 0) decrement rules
    curseCtrl.inflictCurse(10);
    curseCtrl.recordEnemyKilled(true, false);
    expect(player.stats.cursedKillsRemaining).toBe(7);
    curseCtrl.recordEnemyKilled(false, true);
    expect(player.stats.cursedKillsRemaining).toBe(0);

    // Re-inflict curse and take 1 point of unparried damage -> bypasses shield & carapace, instant death!
    curseCtrl.inflictCurse(10);
    const hitRes = player.receiveIncomingHit(1, 1, true);
    expect(hitRes).toBe('dead');
    expect(shieldHookCalled).toBe(false);
    expect(carapaceHookCalled).toBe(false);
    expect(player.stats.hp).toBe(0);
    expect(player.lastKilledByReason).toBe('cursed_shatter');

    curseCtrl.unmount();
  });
});
