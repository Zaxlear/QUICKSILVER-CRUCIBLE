import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ActiveSkillRuntime } from '../../src/combat/ActiveSkillRuntime';
import { MutationProcessor } from '../../src/combat/MutationProcessor';
import { StatusEffectMachine } from '../../src/combat/StatusEffectMachine';
import { computeTargetMoveSpeedMultiplier } from '../../src/combat/StatusReactionMath';
import { FIXED_STEP_SEC } from '../../src/core/ClockController';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { EventBus } from '../../src/core/EventBus';
import { NarrativeSessionStore } from '../../src/core/NarrativeSessionStore';
import {
  ALL_TRUE_ENDING_SEALS,
  BOSS_COMBAT_SPECS,
  LORE_ROOMS_CATALOG,
  NPC_DIALOGUE_LINES,
  PROLOGUE_SEQUENCE,
  WEAPON_FLAVOR_INSCRIPTIONS,
  type NpcGuardContext,
} from '../../src/data/dialogue.data';
import { ALL_WEAPON_IDS } from '../../src/data/weapons.data';
import { FurnaceWardenBoss } from '../../src/entities/enemies/bosses/FurnaceWardenBoss';
import { GrandAlchemistBoss } from '../../src/entities/enemies/bosses/GrandAlchemistBoss';
import { PlayerStats } from '../../src/entities/player/PlayerStats';
import { generateBiomeDag } from '../../src/world/DagBiomeGenerator';
import { DialogueBannerController } from '../../src/world/DialogueBannerController';
import { LoreRoomSpawner } from '../../src/world/LoreRoomSpawner';
import { validateRoomChunkTemplate, type RoomChunkTemplate } from '../../src/world/RoomChunkSchema';

function stepBossTicks(
  boss: FurnaceWardenBoss | GrandAlchemistBoss,
  ticks: number,
  playerX = 280,
  playerY = 416,
  hooks?: {
    onProj?: (kind: string) => void;
    onStrike?: (dmg: number, parriable: boolean) => void;
  }
): void {
  const dtSec = FIXED_STEP_SEC;
  const dtMs = dtSec * 1000;
  for (let i = 0; i < ticks; i++) {
    boss.stepFixed(
      {
        dtSec,
        dtMs,
        playerX,
        playerY,
        playerFacing: 1,
        playerStealthed: false,
        solidRects: [],
        roomAllies: [boss],
        onStrikePlayer: (dmg, _dir, parriable) => hooks?.onStrike?.(dmg, parriable),
        onSpawnProjectile: (_sid, _ox, _oy, _vx, _vy, _dmg, _g, kind) => hooks?.onProj?.(kind),
        onSpawnAcidOrFireHazard: () => {},
        onDrawGroundEffect: () => {},
      },
      0
    );
  }
}

describe('Milestone 8 — Multi-Phase Bosses, Sanctum Hub, 34 NPC Dialogues & True Ending Loop', () => {
  it('verifies M8 normal-mapped atlases and complete narrative tables (3 prologue + 34 NPC + 10 lore + 12 weapon inscriptions)', () => {
    const root = process.cwd();
    for (const atlas of ['bosses_atlas', 'boss_fx_atlas', 'sanctum_hub_atlas']) {
      expect(fs.existsSync(path.join(root, `public/assets/atlases/${atlas}.json`))).toBe(true);
      expect(fs.existsSync(path.join(root, `public/assets/atlases/${atlas}.png`))).toBe(true);
      expect(fs.existsSync(path.join(root, `public/assets/atlases/${atlas}_n.png`))).toBe(true);
    }
    expect(fs.existsSync(path.join(root, 'public/assets/atlases/npc_portraits_sheet.png'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'public/assets/atlases/npc_portraits_sheet_n.png'))).toBe(true);

    expect(PROLOGUE_SEQUENCE).toHaveLength(3);
    expect(NPC_DIALOGUE_LINES).toHaveLength(34);
    expect(NPC_DIALOGUE_LINES.filter((l) => l.speakerId === 'corvus')).toHaveLength(12);
    expect(NPC_DIALOGUE_LINES.filter((l) => l.speakerId === 'isolde')).toHaveLength(11);
    expect(NPC_DIALOGUE_LINES.filter((l) => l.speakerId === 'vesper')).toHaveLength(11);
    expect(Object.keys(LORE_ROOMS_CATALOG)).toHaveLength(10);
    for (const wid of ALL_WEAPON_IDS) {
      expect(WEAPON_FLAVOR_INSCRIPTIONS[wid].length).toBeGreaterThan(10);
    }
  });

  it('verifies Normal Ending (Usurpation) vs. True Ending (3 Seals -> Alkahest Choice -> Hidden P3 -> Pure Skin)', () => {
    // Branch 1: Normal run (< 3 seals) -> defeating P2 settles END_FALSE_CALCIFICATION & Heat + 1
    const normalStore = new NarrativeSessionStore();
    normalStore.grantSeal('flag_seal_conduit');
    expect(normalStore.hasAllThreeSeals).toBe(false);

    const bossFalse = new GrandAlchemistBoss(null, null, null, {
      x: 420,
      y: 416,
      minX: 80,
      maxX: 760,
      arenaCallbacks: {
        onParacelsusP2ZeroHp: () => normalStore.onParacelsusPhase2Defeated(),
      },
    });
    // Break 600 HP prism shield first, then deplete 8,200 HP across P1 & P2
    bossFalse.applyHit(650, 2.0, 1);
    expect(bossFalse.prismShieldHp).toBe(0);
    bossFalse.applyHit(4000, 2.0, 1);
    stepBossTicks(bossFalse, 220); // Completes P2 fusion transition
    expect(bossFalse.phase).toBe(2);

    const p2Kill = bossFalse.applyHit(9000, 5.0, 1);
    expect(p2Kill.killed).toBe(true);
    expect(normalStore.currentEndingState).toBe('END_FALSE_CALCIFICATION');
    expect(normalStore.normalEndingCleared).toBe(true);
    expect(normalStore.maxCrucibleHeat).toBe(1);

    // Branch 2: Collect all 3 Prima Materia Seals -> P2 zero HP holds at 1 HP for Alkahest Choice -> Hidden P3!
    const trueStore = new NarrativeSessionStore();
    for (const loreId of ['lore_04_seal_conduit_lab', 'lore_07_seal_ram_crypt', 'lore_10_seal_claws_astrolabe']) {
      const disc = trueStore.discoverLoreEntry(loreId);
      expect(disc.isFirstDiscovery).toBe(true);
      expect(disc.ichorGranted).toBe(15);
      expect(disc.newlyUnlockedSeal).not.toBeNull();
    }
    expect(trueStore.collectedSeals).toEqual(expect.arrayContaining([...ALL_TRUE_ENDING_SEALS]));
    expect(trueStore.hasAllThreeSeals).toBe(true);

    let quicksilverSeaFlooded = false;
    const bossTrue = new GrandAlchemistBoss(null, null, null, {
      x: 420,
      y: 416,
      minX: 80,
      maxX: 760,
      arenaCallbacks: {
        onParacelsusP2ZeroHp: () => trueStore.onParacelsusPhase2Defeated(),
        onActivateQuicksilverSea: () => {
          quicksilverSeaFlooded = true;
        },
      },
    });
    bossTrue.applyHit(650, 2.0, 1);
    bossTrue.applyHit(4000, 2.0, 1);
    stepBossTicks(bossTrue, 220);
    expect(bossTrue.phase).toBe(2);

    const p2Intercepted = bossTrue.applyHit(9500, 5.0, 1);
    expect(p2Intercepted.killed).toBe(false);
    expect(bossTrue.hp).toBe(1);
    expect(trueStore.currentEndingState).toBe('AWAITING_ALKAHEST_CHOICE');

    // Inject Alkahest -> awakens 3,800 HP Phase 3 on Mirror Quicksilver Sea!
    const choiceState = trueStore.resolveAlkahestChoice('INJECT_ALKAHEST');
    expect(choiceState).toBe('IN_PHASE_3_ALKAHEST');
    bossTrue.awakenPhase3Alkahest();
    expect(quicksilverSeaFlooded).toBe(true);
    expect(bossTrue.phase).toBe(3);
    expect(bossTrue.maxHp).toBe(BOSS_COMBAT_SPECS.PARACELSUS.baseHpP3);
    expect(bossTrue.hp).toBe(3800);

    stepBossTicks(bossTrue, 130); // Finish P3 awakening transition
    // Drop below 15% HP (< 570 HP) -> triggers A8 Desperation Calcination Mini-Sun -> Golden Parry executes!
    bossTrue.applyHit(3400, 2.0, 1);
    expect(bossTrue.hp).toBe(400);
    let sunCharged = false;
    const bossP3A8 = new GrandAlchemistBoss(null, null, null, {
      x: 420,
      y: 416,
      minX: 80,
      maxX: 760,
      arenaCallbacks: {
        onSyncCalcinationSun: (active) => {
          if (active) sunCharged = true;
        },
      },
    });
    bossP3A8.awakenPhase3Alkahest();
    stepBossTicks(bossP3A8, 120);
    bossP3A8.applyHit(3450, 1.0, 1); // < 15% HP
    stepBossTicks(bossP3A8, 40);
    expect(sunCharged).toBe(true);

    // Defeat bossTrue P3 -> END_TRUE_RETURN_PAIN + Pure Prima Materia platinum skin!
    trueStore.onParacelsusPhase3Defeated();
    expect(trueStore.currentEndingState).toBe('END_TRUE_RETURN_PAIN');
    expect(trueStore.trueEndingCleared).toBe(true);
    expect(trueStore.unlockedPurePrimaSkin).toBe(true);
  });

  it('verifies Boss 1 Arch-Warden Sulfur 55% HP roar transition, P2 4-grate alternation, M6 parry interrupt & Boss CC resistance', () => {
    const gratePairsSeen = new Set<string>();
    let phase2Signaled = false;
    let spawnedWaves = 0;

    const sulfur = new FurnaceWardenBoss(null, null, null, {
      x: 520,
      y: 416,
      minX: 72,
      maxX: 632,
      arenaCallbacks: {
        onPhaseTransition: (_id, nextPhase) => {
          if (nextPhase === 2) phase2Signaled = true;
        },
        onSyncFurnaceGrates: (pair, st) => {
          if (st === 'ERUPT') gratePairsSeen.add(pair.join(','));
        },
        onSpawnSulfurWave: () => {
          spawnedWaves += 1;
        },
      },
    });
    expect(sulfur.maxHp).toBe(3400);

    // Push HP to <= 55% (e.g. 1,800 HP left) -> enters 1,800ms invulnerable chest-rip roar!
    sulfur.applyHit(1600, 3.0, 1);
    stepBossTicks(sulfur, 2);
    expect(phase2Signaled).toBe(true);
    expect(sulfur.phase).toBe(2);
    expect(sulfur.isTransitioning).toBe(true);
    // Invulnerable during 1,800ms roar
    const midRoarHit = sulfur.applyHit(500, 5.0, 1);
    expect(midRoarHit.blockedByWard).toBe(true);
    expect(sulfur.hp).toBe(1800);

    // Advance past 1,800ms roar -> immediately launches M6 Whirlwind -> Golden Parry stuns for 2,200ms!
    stepBossTicks(sulfur, 230, 300, 416);
    expect(sulfur.isTransitioning).toBe(false);
    const stunMs = sulfur.onParriedByPlayer();
    expect(stunMs).toBe(2200);

    // Step enough ticks to cycle P2 M5 grates through both A+C (0,2) and B+D (1,3) + M1 flame waves
    stepBossTicks(sulfur, 720, 460, 416);
    expect(gratePairsSeen.has('0,2')).toBe(true);
    expect(gratePairsSeen.has('1,3')).toBe(true);
    expect(spawnedWaves).toBeGreaterThanOrEqual(2);

    // Boss CC Resistance: Frozen -> 0.5x frost slow (never 0), Saw Trap -> 1.6s root, Scorch Execution -> <6% HP only
    const sm = new StatusEffectMachine();
    sm.apply(sulfur.id, 'frozen', 1, 1.0);
    expect(computeTargetMoveSpeedMultiplier(sm.getRecord(sulfur.id), sulfur.isBoss)).toBe(0.5);

    const skillRt = new ActiveSkillRuntime(sm);
    skillRt.deploySawTrap(sulfur.x, sulfur.y, 1.0, []);
    skillRt.stepFixed(FIXED_STEP_SEC, 200, 416, [sulfur.toTargetView(false)]);
    expect(sm.getRecord(sulfur.id)?.rootedSec).toBeCloseTo(1.6, 1);

    const mut = new MutationProcessor(sm);
    sm.apply(sulfur.id, 'ignited', 2, 1.0);
    // At 10% HP (340 / 3400): normal enemy (<16%) would execute, Boss (<6%) must NOT execute!
    expect(mut.checkScorchExecution(['mut_scorch_execution'], sulfur.id, 340, 3400, true, sulfur.x, sulfur.y, [])).toBe(false);
    // At 5% HP (170 / 3400): Boss (<6%) executes!
    expect(mut.checkScorchExecution(['mut_scorch_execution'], sulfur.id, 170, 3400, true, sulfur.x, sulfur.y, [])).toBe(true);
  });

  it('verifies LoreRoomSpawner safe-room timer freeze, idempotent +15 Ichor & DialogueBanner auto-compact on roll/walk-away', () => {
    const dir = path.resolve(process.cwd(), 'public/assets/tilemaps/chunks');
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as { chunks: string[] };
    const chunks: RoomChunkTemplate[] = manifest.chunks.map((id) =>
      validateRoomChunkTemplate(JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')))
    );

    const store = new NarrativeSessionStore();
    const rng = new DeterministicRng(0x51c0ffee);
    const dag = generateBiomeDag(rng, 'biome_02_vitriol_sewers', chunks);
    const spawner = new LoreRoomSpawner(null, null, dag, rng, store);

    const loreShrine = spawner.anchors.find((a) => a.kind === 'LORE_SHRINE')!;
    expect(loreShrine).toBeDefined();

    const stats = new PlayerStats(120);
    stats.applyIncomingDamage(40);
    const orangeBefore = stats.rallyOrangeHp;

    const guardCtx: NpcGuardContext = {
      currentBiomeId: 'biome_02_vitriol_sewers',
      deathCount: 0,
      forgeUpgradeCount: 0,
      forgePlusPct: 0,
      forgeDoublePlusPct: 0,
      unlockedRunes: ['rune_mercury_conduit', 'rune_vitriol_tendril'],
      defeatedBoss1: false,
      normalEndingCleared: false,
      unlockedWeaponCount: 4,
      sealCount: 0,
      crucibleHeat: 0,
      holdingHeavyWeapon: false,
      holdingClockworkRepeater: false,
      isPlayerLowHp: false,
      isPlayerCursed: false,
    };

    let ichorEarned = 0;
    // Step inside Lore Room & press interact -> 200ms later grants +15 Ichor and opens FULL lore banner
    spawner.stepFixed({
      dtSec: 0.05,
      playerX: loreShrine.x,
      playerY: loreShrine.y,
      interactJustPressed: true,
      isRollingOrMoving: false,
      isRolling: false,
      unlockedRunes: ['rune_mercury_conduit', 'rune_vitriol_tendril'],
      guardCtx,
      onGrantIchor: (amt) => {
        ichorEarned += amt;
      },
    });
    expect(spawner.isInSafeLoreRoom).toBe(true);
    stats.safeLoreFreezeActive = spawner.isInSafeLoreRoom;
    stats.stepFixed(2.0); // Even after 2.0s (> 900ms freeze window), rallyOrangeHp does NOT decay in safe lore room!
    expect(stats.rallyOrangeHp).toBe(orangeBefore);

    spawner.stepFixed({
      dtSec: 0.25,
      playerX: loreShrine.x,
      playerY: loreShrine.y,
      interactJustPressed: false,
      isRollingOrMoving: false,
      isRolling: false,
      unlockedRunes: ['rune_mercury_conduit', 'rune_vitriol_tendril'],
      guardCtx,
      onGrantIchor: (amt) => {
        ichorEarned += amt;
      },
    });
    expect(ichorEarned).toBe(15);
    expect(spawner.currentBanner?.mode).toBe('FULL');

    // Second read of same lore ID -> idempotent 0 Ichor
    const secondRead = store.discoverLoreEntry(loreShrine.loreId!);
    expect(secondRead.ichorGranted).toBe(0);

    // Moving horizontally after 250ms immediately closes Lore banner without blocking parkour
    spawner.stepFixed({
      dtSec: 0.3,
      playerX: loreShrine.x + 12,
      playerY: loreShrine.y,
      interactJustPressed: false,
      isRollingOrMoving: true,
      isRolling: false,
      unlockedRunes: ['rune_mercury_conduit'],
      guardCtx,
      onGrantIchor: () => {},
    });
    expect(spawner.currentBanner).toBeNull();

    // NPC Dialogue Banner: Corvus / Isolde starts FULL -> rolling away smoothly collapses to COMPACT_SUBTITLE!
    const bannerCtrl = new DialogueBannerController();
    const emittedModes: Array<string | null> = [];
    const off = EventBus.on('narrative:dialogue_updated', (b) => emittedModes.push(b?.mode ?? null));
    const corvusLine = store.selectNextNpcDialogue('corvus', { ...guardCtx, currentBiomeId: 'sanctum' });
    expect(corvusLine.id).toBe('corvus_01');
    bannerCtrl.showNpcLine(corvusLine, 164);
    expect(bannerCtrl.current?.mode).toBe('FULL');

    // Player dodge-rolls away mid-sentence -> smoothly transitions to COMPACT_SUBTITLE!
    bannerCtrl.stepFixed(16, 190, true, true);
    expect(bannerCtrl.current?.mode).toBe('COMPACT_SUBTITLE');
    expect(emittedModes).toContain('FULL');
    expect(emittedModes).toContain('COMPACT_SUBTITLE');

    off();
    bannerCtrl.destroy();
    spawner.destroy();
  });
});
