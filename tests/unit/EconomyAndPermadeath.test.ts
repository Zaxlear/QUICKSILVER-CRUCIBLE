import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BlueprintScrollWorldPool,
  rollEnemyBlueprintDrop,
  rollEnemyGoldDrop,
} from '../../src/combat/BlueprintDropResolver';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { NarrativeSessionStore, NarrativeStore } from '../../src/core/NarrativeSessionStore';
import { ENEMY_CATALOG, ALL_ENEMY_IDS } from '../../src/data/biomes.data';
import {
  BLUEPRINT_UNLOCK_CATALOG,
  computeGearRecycleGold,
  computeInheritedGoldOnDeath,
  GOLD_RESERVE_CAPS,
} from '../../src/data/economy.data';
import { RNG_CHANNEL_HASH } from '../../src/data/runes.data';
import { ALL_SKILL_IDS } from '../../src/data/skills.data';
import { DEFAULT_FORGE_TIER_PROGRESS } from '../../src/data/storage.data';
import { rollForgeGrade } from '../../src/entities/player/ForgeGradeRoller';
import { PlayerEntity } from '../../src/entities/player/PlayerEntity';
import { ActionMap } from '../../src/input/ActionMap';
import { GamepadProvider } from '../../src/input/GamepadProvider';
import { KeyboardMouseProvider } from '../../src/input/KeyboardMouseProvider';
import { TouchVirtualPadProvider } from '../../src/input/TouchVirtualPadProvider';
import { buildViewportSnapshot } from '../../src/render/ViewportScaler';
import { settlePlayerDeathAndReturnSanctum } from '../../src/scenes/RunSettlementController';
import { CloudSync } from '../../src/storage/CloudSyncCoordinator';
import { CombatLootSpawner } from '../../src/world/CombatLootSpawner';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry } from '../../src/world/DoorSocketStitcher';
import { GoldPickupPool } from '../../src/world/GoldPickupPool';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../../src/world/RoomChunkSchema';
import { ShopMerchantController } from '../../src/world/ShopMerchantController';
import { SkillLootSpawner } from '../../src/world/SkillLootSpawner';
import { equipFreshSanctumStarterKit } from '../../src/world/StarterTubeSpawner';

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

describe('Beta 1.0.2 Gate 1 — True Permadeath, Gold Economy, Priced Shop, 6-Skill Loot & Forge Math', () => {
  it('1. settles Permadeath (DEAD archive), clears unbanked ichor/blueprints, caps gold by gold_reserve_lvl & resets Sanctum stats to 1/1/1', async () => {
    const chunks = loadAllChunks();
    const dag = generateBiomeDag(new DeterministicRng(0x51c0ffee), 'biome_01_slag_retort', chunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    buildViewportSnapshot(1920, 1080, 1);

    const player = new PlayerEntity({
      spawnX: 256,
      spawnY: 416,
      world: baked,
      input: createIdleInput(),
    });

    // Simulate a rich late-run build before dying
    player.stats.applyScrollUpgrade('rubedo');
    player.stats.applyScrollUpgrade('rubedo');
    player.stats.applyScrollUpgrade('albedo');
    player.stats.gold = 3450;
    player.stats.ichor = 190;
    const highTierWpn = player.inventory.rollWeaponInstance(new DeterministicRng(77), 'wpn_mirror_aegis', 'V', 'S');
    player.inventory.equipToSlot('primary', highTierWpn);

    NarrativeStore.stageCarriedBlueprint('wpn_crucible_maul');
    expect(NarrativeStore.carriedBlueprints).toContain('wpn_crucible_maul');

    // Gold Reserve Level 2 -> cap = 2,000G
    NarrativeStore.forgeTiers = { ...DEFAULT_FORGE_TIER_PROGRESS, gold_reserve_lvl: 2, flask_charges: 3 };
    expect(GOLD_RESERVE_CAPS).toEqual([0, 800, 2000, 4000, 7500]);
    expect(computeInheritedGoldOnDeath(3450, 0)).toBe(0);
    expect(computeInheritedGoldOnDeath(3450, 2)).toBe(2000);

    const deathsBefore = NarrativeStore.deathCount;
    const settled = await settlePlayerDeathAndReturnSanctum({
      scene: null,
      player,
      biomeId: 'biome_01_slag_retort',
      roomId: 'room_01_combat',
      runSeed: 0x51c0ffee,
      killedById: 'mob_02_frenzied_miner',
    });

    expect(NarrativeStore.deathCount).toBe(deathsBefore + 1);
    expect(NarrativeStore.carriedBlueprints).toEqual([]);
    expect(settled.inheritedGold).toBe(2000);
    const archivedRun = await CloudSync.vault.loadActiveRun();
    expect(archivedRun.data?.lifecycleState).toBe('DEAD');

    // Wake up in Sanctum -> 1/1/1 stats, 0 unbanked ichor, fresh I-tier starter gear, capped 2000G!
    equipFreshSanctumStarterKit(player, settled.nextRunSeed, settled.inheritedGold);
    expect(player.stats.snapshotLevels).toEqual({ rubedo: 1, citrinitas: 1, albedo: 1 });
    expect(player.stats.ichor).toBe(0);
    expect(player.stats.gold).toBe(2000);
    expect(player.stats.maxFlaskCharges).toBe(3);
    expect(player.inventory.primaryWeapon.level).toBe('I');
    expect(player.inventory.primaryWeapon.instanceId).not.toBe(highTierWpn.instanceId);
  });

  it('2. reproduces enemy gold, blueprint scroll drops, shop 3-slot pricing & 3 restocks bit-identically for the same runSeed', () => {
    const chunks = loadAllChunks();
    // Verify all 12 mob species map to valid unique blueprints in BLUEPRINT_UNLOCK_CATALOG
    expect(BLUEPRINT_UNLOCK_CATALOG).toHaveLength(13);
    expect(ENEMY_CATALOG.mob_04_acid_spitter.blueprintDropId).toBe('skl_crimson_transfusion');
    for (const eid of ALL_ENEMY_IDS) {
      expect(ENEMY_CATALOG[eid].blueprintDropId).toBeTruthy();
    }

    const runOnce = (seed: number) => {
      const rootRng = new DeterministicRng(seed);
      const dag = generateBiomeDag(new DeterministicRng(seed), 'biome_02_vitriol_sewers', chunks);
      const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
      const player = new PlayerEntity({ spawnX: 256, spawnY: 416, world: baked, input: createIdleInput() });
      const store = new NarrativeSessionStore();
      store.forgeTiers = { ...DEFAULT_FORGE_TIER_PROGRESS, shop_restock_lvl: 1 };
      NarrativeStore.forgeTiers = { ...DEFAULT_FORGE_TIER_PROGRESS, shop_restock_lvl: 1 };

      const goldRng = rootRng.fork(RNG_CHANNEL_HASH.GOLD_AND_BLUEPRINT);
      const lootRng = rootRng.fork(RNG_CHANNEL_HASH.LOOT_AND_AFFIX);

      const goldSeq = ALL_ENEMY_IDS.map((_speciesId, i) =>
        rollEnemyGoldDrop(goldRng, { biomeDepth: 2, crucibleHeat: 1, isElite: i % 4 === 0 })
      );
      const boss1Gold = rollEnemyGoldDrop(goldRng, { biomeDepth: 2, crucibleHeat: 0, isElite: true, bossId: 'boss_01_furnace_warden' });
      const boss2Gold = rollEnemyGoldDrop(goldRng, { biomeDepth: 4, crucibleHeat: 0, isElite: true, bossId: 'boss_02_grand_alchemist' });
      expect(boss1Gold.totalGold).toBe(280);
      expect(boss2Gold.totalGold).toBe(500);

      const bpSeq = ALL_ENEMY_IDS.map((speciesId) =>
        rollEnemyBlueprintDrop(goldRng, { speciesId, isElite: true }, store)?.blueprintId ?? null
      );

      const shop = new ShopMerchantController(
        null, null, dag, player, lootRng, 2,
        () => {}, () => {}, () => {}
      );
      const initialModal = shop.buildModalPayload()!;
      expect(initialModal.slots).toHaveLength(3);
      expect(initialModal.slots[0]!.kind).toBe('WEAPON');
      expect(initialModal.slots[1]!.kind).toBe('SKILL');

      // Insufficient gold rejects transaction and keeps slot unpurchased
      player.stats.gold = 5;
      expect(shop.purchaseSlot(initialModal.slots[0]!.slotId)).toBe(false);
      expect(shop.buildModalPayload()!.rejectNoticeZh).toContain('金币不足');

      // Sufficient gold deducts exact price and records purchasedSlotIds; 3 restocks cost 120 -> 240 -> 420
      player.stats.gold = 5000;
      const price0 = initialModal.slots[0]!.priceGold;
      expect(shop.purchaseSlot(initialModal.slots[0]!.slotId)).toBe(true);
      expect(player.stats.gold).toBe(5000 - price0);
      expect(shop.purchasedSlotIds).toContain(initialModal.slots[0]!.slotId);

      const restockSnapshots: string[][] = [];
      for (const expectedCost of [120, 240, 420]) {
        expect(shop.buildModalPayload()!.nextRestockCostGold).toBe(expectedCost);
        const beforeG = player.stats.gold;
        expect(shop.restockShop(initialModal.shopNodeId)).toBe(true);
        expect(player.stats.gold).toBe(beforeG - expectedCost);
        restockSnapshots.push(shop.buildModalPayload()!.slots.map((s) => `${s.kind}:${s.priceGold}`));
      }
      // 4th restock rejected (capped at 3)
      expect(shop.restockShop(initialModal.shopNodeId)).toBe(false);

      return { goldSeq, bpSeq, initialSlots: initialModal.slots.map((s) => `${s.slotId}:${s.priceGold}`), restockSnapshots };
    };

    expect(runOnce(0x102be7a)).toEqual(runOnce(0x102be7a));

    // Also verify blueprint escort -> archive -> Corvus unlock loop & GoldPickupPool 96px magnetism
    const bpStore = new NarrativeSessionStore();
    expect(bpStore.stageCarriedBlueprint('wpn_quicksilver_rapier')).toBe(true);
    expect(bpStore.isBlueprintUnlockedOrRegistered('wpn_quicksilver_rapier')).toBe(true);
    expect(bpStore.archiveCarriedBlueprints()).toBe(1);
    const partial = bpStore.investBlueprintIchor('wpn_quicksilver_rapier', 50);
    expect(partial).toEqual({ spent: 50, unlockedNow: false });
    const full = bpStore.investBlueprintIchor('wpn_quicksilver_rapier', 100);
    expect(full).toEqual({ spent: 60, unlockedNow: true });
    expect(bpStore.unlockedWeapons).toContain('wpn_quicksilver_rapier');

    const goldPool = new GoldPickupPool(null, null, 16);
    goldPool.spawnBurst([45, 55], true, 300, 400);
    let collected = 0;
    for (let tick = 0; tick < 60; tick++) {
      goldPool.stepFixed(1 / 60, 320, 400, [{ x: 0, y: 400, w: 800, h: 32 }], [], (amt) => {
        collected += amt;
      });
    }
    expect(collected).toBe(100);
    expect(goldPool.activeCount).toBe(0);

    const bpWorld = new BlueprintScrollWorldPool(null, null, bpStore);
    bpWorld.spawnScroll(BLUEPRINT_UNLOCK_CATALOG[1]!, 200, 400);
    let pickedId = '';
    for (let tick = 0; tick < 30; tick++) {
      bpWorld.stepFixed(1 / 60, 205, 400, (spec) => { pickedId = spec.blueprintId; });
    }
    expect(pickedId).toBe('wpn_crucible_maul');
  });

  it('3. guarantees 0 BASE white items across 1,000 rolls when plus_tier_ichor reaches 800/800 (100%)', () => {
    const rng = new DeterministicRng(0x800f099e);
    const maxedPlusForge = {
      ...DEFAULT_FORGE_TIER_PROGRESS,
      plus_tier_ichor: 800,
      pp_tier_ichor: 600,
      s_tier_ichor: 900,
    };

    let baseCount = 0;
    let plusCount = 0;
    let ppCount = 0;
    let sCount = 0;

    for (let i = 0; i < 1000; i++) {
      const grade = rollForgeGrade(rng, maxedPlusForge, 1, 0);
      if (grade === 'BASE') baseCount += 1;
      else if (grade === 'PLUS') plusCount += 1;
      else if (grade === 'DOUBLE_PLUS') ppCount += 1;
      else if (grade === 'S') sCount += 1;
    }

    expect(baseCount).toBe(0);
    expect(plusCount).toBeGreaterThan(0);
    expect(ppCount).toBeGreaterThan(0);
    expect(sCount).toBeGreaterThan(0);
    expect(plusCount + ppCount + sCount).toBe(1000);
  });

  it('4. drops all 6 active skills via SkillLootSpawner, swaps [Q]/[C] slots onto floor & melts floor loot on 450ms hold', () => {
    const chunks = loadAllChunks();
    const dag = generateBiomeDag(new DeterministicRng(0x65c111), 'biome_03_clockwork_ossuary', chunks);
    const baked = bakeStitchedWorldGeometry(dag.nodes, dag.bridges);
    const player = new PlayerEntity({ spawnX: 256, spawnY: 416, world: baked, input: createIdleInput() });

    // Unlock all 6 active skills in NarrativeStore so all 6 are eligible in loot pool
    for (const sid of ALL_SKILL_IDS) NarrativeStore.unlockSkillBlueprint(sid);
    expect(NarrativeStore.unlockedSkills).toHaveLength(6);

    const lootRng = new DeterministicRng(0x998877);
    const weaponLoot = new CombatLootSpawner(null, null, dag, player.inventory, lootRng);
    const skillSpawner = new SkillLootSpawner(null, null, dag, player.inventory, lootRng, weaponLoot, 3);

    const seenSkills = new Set<string>(skillSpawner.skillDrops.map((d) => d.skill.skillId));
    for (let i = 0; i < 240 && seenSkills.size < 6; i++) {
      const drop = skillSpawner.trySpawnEliteBonusGear(300, 416);
      if (drop && 'skill' in drop) seenSkills.add(drop.skill.skillId);
    }
    expect(Array.from(seenSkills).sort()).toEqual([...ALL_SKILL_IDS].sort());

    // Equip into [Q] (skill_1) and [C] (skill_2), verifying displaced skill swaps onto floor
    const floorDrop = skillSpawner.skillDrops[0]!;
    const prevQ = player.inventory.loadout.skillOne;
    const prevC = player.inventory.loadout.skillTwo;
    const candidateQ = player.inventory.loadout.rollSkillInstance(lootRng, 'skl_crimson_transfusion', 'III', 'PLUS');
    const displacedFromQ = player.inventory.loadout.equipSkill('skill_1', candidateQ);
    expect(displacedFromQ.instanceId).toBe(prevQ.instanceId);
    expect(skillSpawner.swapSkillOnFloor(floorDrop.id, displacedFromQ)).toBe(true);
    expect(floorDrop.skill.instanceId).toBe(prevQ.instanceId);

    const candidateC = player.inventory.loadout.rollSkillInstance(lootRng, 'skl_aegis_tonics', 'III', 'S');
    const displacedFromC = player.inventory.loadout.equipSkill('skill_2', candidateC);
    expect(displacedFromC.instanceId).toBe(prevC.instanceId);

    // Hold [R] for >= 450ms next to floorDrop -> melts into 45% shop gold!
    NarrativeStore.forgeTiers = { ...DEFAULT_FORGE_TIER_PROGRESS, recycle_lvl: 0 };
    const expectedGold = computeGearRecycleGold('SKILL', floorDrop.skill.level, floorDrop.skill.forgeGrade, false);
    let earnedRecycleGold = 0;
    for (let step = 0; step < 10; step++) {
      skillSpawner.stepFixed(0.05, floorDrop.x, floorDrop.baseY, false, true, () => {}, (g) => {
        earnedRecycleGold += g;
      });
    }
    expect(earnedRecycleGold).toBe(expectedGold);
  });
});
