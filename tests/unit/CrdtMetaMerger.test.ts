import { describe, expect, it } from 'vitest';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import type { MetaProgressionRecord } from '../../src/data/storage.data';
import {
  maxNumericMapMerge,
  mergeMetaProgressions,
  setUnionSorted,
} from '../../src/storage/CrdtMetaMerger';
import {
  canonicalizeJson,
  computeSaveSha256,
  createDefaultMetaProgression,
  signMetaProgression,
  verifySaveSha256,
} from '../../src/storage/SaveSchema';

async function buildRandomMeta(rng: DeterministicRng, rev: number): Promise<MetaProgressionRecord> {
  const runePool = [
    'rune_vitriol_tendril',
    'rune_mercury_conduit',
    'rune_calcined_ram',
    'rune_magnetic_claws',
  ] as const;
  const weaponPool = [
    'wpn_rust_scalpel',
    'wpn_quicksilver_rapier',
    'wpn_cinnabar_twinblades',
    'wpn_athanor_cleaver',
    'wpn_crucible_maul',
    'wpn_pendulum_halberd',
    'wpn_alembic_bow',
    'wpn_clockwork_repeater',
    'wpn_vitriol_thrower',
    'wpn_voltaic_arc_staff',
    'wpn_slag_buckler',
    'wpn_mirror_aegis',
  ] as const;
  const sealPool = ['flag_seal_conduit', 'flag_seal_ram', 'flag_seal_claws'] as const;

  const runes = runePool.filter(() => rng.nextBool(0.5));
  const weapons = weaponPool.filter(() => rng.nextBool(0.45));
  const seals = sealPool.filter(() => rng.nextBool(0.4));

  return signMetaProgression({
    schemaVersion: 1,
    unlockedRunes: setUnionSorted(runes),
    unlockedWeapons: setUnionSorted(['wpn_alembic_bow', 'wpn_rust_scalpel', 'wpn_slag_buckler'], weapons),
    unlockedSkills: setUnionSorted(['skl_vitriol_flask'], rng.nextBool(0.5) ? ['skl_tesla_coil_turret'] : []),
    unlockedMutations: setUnionSorted(['mut_crimson_frenzy', 'mut_mercury_ward', 'mut_tactical_reload']),
    discoveredLoreIds: setUnionSorted(rng.nextBool(0.5) ? ['lore_01_quarantine_notice'] : [], rng.nextBool(0.5) ? ['lore_06_clockwork_vow'] : []),
    seenNpcDialogueIds: setUnionSorted(rng.nextBool(0.5) ? ['corvus_01', 'isolde_01'] : ['vesper_01']),
    trueEndingFlags: setUnionSorted(seals),
    blueprintIchorMap: maxNumericMapMerge(
      {
        wpn_crucible_maul: rng.nextInt(0, 100),
        wpn_mirror_aegis: rng.nextInt(0, 120),
      },
      {}
    ),
    forgeTierProgress: {
      plus_tier_ichor: rng.nextInt(0, 320),
      s_tier_ichor: rng.nextInt(0, 480),
      flask_charges: rng.nextInt(1, 4),
      gold_reserve_lvl: rng.nextInt(0, 5),
    },
    bestiaryKillCounts: maxNumericMapMerge(
      {
        mob_01_slag_husk: rng.nextInt(0, 60),
        mob_09_ossuary_prelate: rng.nextInt(0, 25),
      },
      {}
    ),
    bankedIchor: rng.nextInt(0, 800),
    maxCrucibleHeat: rng.nextInt(0, 5) as 0 | 1 | 2 | 3 | 4 | 5,
    totalRunsStarted: rng.nextInt(1, 40),
    totalRunsCleared: rng.nextInt(0, 15),
    crdtRevision: rev,
  });
}

describe('Milestone 10 — CrdtMetaMerger & Canonical SHA-256 Integrity', () => {
  it('merges dual-device offline runes, weapon blueprints, forge ichor & seals with zero data loss', async () => {
    const base = await createDefaultMetaProgression();

    const desktopOffline = await signMetaProgression({
      ...base,
      unlockedRunes: ['rune_vitriol_tendril', 'rune_calcined_ram'],
      unlockedWeapons: ['wpn_rust_scalpel', 'wpn_quicksilver_rapier', 'wpn_crucible_maul'],
      unlockedSkills: ['skl_vitriol_flask', 'skl_naphtha_jar'],
      discoveredLoreIds: ['lore_01_quarantine_notice', 'lore_02_discarded_vessels'],
      seenNpcDialogueIds: ['corvus_01', 'corvus_04'],
      trueEndingFlags: ['flag_seal_ram'],
      blueprintIchorMap: { wpn_pendulum_halberd: 45, wpn_voltaic_arc_staff: 80 },
      forgeTierProgress: {
        plus_tier_ichor: 240,
        s_tier_ichor: 40,
        flask_charges: 2,
        gold_reserve_lvl: 3,
      },
      bestiaryKillCounts: { mob_01_slag_husk: 42, mob_05_brass_sentinel: 11 },
      bankedIchor: 125,
      maxCrucibleHeat: 1,
      totalRunsStarted: 8,
      totalRunsCleared: 1,
      crdtRevision: 3,
    });

    const iphonePwaOffline = await signMetaProgression({
      ...base,
      unlockedRunes: ['rune_mercury_conduit', 'rune_magnetic_claws'],
      unlockedWeapons: ['wpn_alembic_bow', 'wpn_cinnabar_twinblades', 'wpn_mirror_aegis'],
      unlockedMutations: ['mut_crimson_frenzy', 'mut_open_wounds'],
      discoveredLoreIds: ['lore_04_seal_conduit_lab'],
      seenNpcDialogueIds: ['corvus_01', 'isolde_02', 'vesper_04'],
      trueEndingFlags: ['flag_seal_conduit', 'flag_seal_claws'],
      blueprintIchorMap: { wpn_pendulum_halberd: 90, wpn_clockwork_repeater: 55 },
      forgeTierProgress: {
        plus_tier_ichor: 160,
        s_tier_ichor: 195,
        flask_charges: 4,
        gold_reserve_lvl: 1,
      },
      bestiaryKillCounts: { mob_01_slag_husk: 19, mob_12_astral_inquisitor: 7 },
      bankedIchor: 210,
      maxCrucibleHeat: 2,
      totalRunsStarted: 12,
      totalRunsCleared: 3,
      crdtRevision: 5,
    });

    const merged = await mergeMetaProgressions(desktopOffline, iphonePwaOffline);

    expect(await verifySaveSha256(merged)).toBe(true);
    expect(merged.unlockedRunes).toEqual([
      'rune_calcined_ram',
      'rune_magnetic_claws',
      'rune_mercury_conduit',
      'rune_vitriol_tendril',
    ]);
    expect(merged.unlockedWeapons).toEqual([
      'wpn_alembic_bow',
      'wpn_cinnabar_twinblades',
      'wpn_crucible_maul',
      'wpn_mirror_aegis',
      'wpn_quicksilver_rapier',
      'wpn_rust_scalpel',
      'wpn_slag_buckler',
    ]);
    expect(merged.unlockedSkills).toEqual(['skl_naphtha_jar', 'skl_vitriol_flask']);
    expect(merged.unlockedMutations).toContain('mut_open_wounds');
    expect(merged.trueEndingFlags).toEqual([
      'flag_seal_claws',
      'flag_seal_conduit',
      'flag_seal_ram',
    ]);
    expect(merged.blueprintIchorMap).toEqual({
      wpn_clockwork_repeater: 55,
      wpn_pendulum_halberd: 90,
      wpn_voltaic_arc_staff: 80,
    });
    expect(merged.forgeTierProgress).toEqual({
      plus_tier_ichor: 240,
      s_tier_ichor: 195,
      flask_charges: 4,
      gold_reserve_lvl: 3,
    });
    expect(merged.bestiaryKillCounts).toEqual({
      mob_01_slag_husk: 42,
      mob_05_brass_sentinel: 11,
      mob_12_astral_inquisitor: 7,
    });
    expect(merged.bankedIchor).toBe(210);
    expect(merged.maxCrucibleHeat).toBe(2);
    expect(merged.totalRunsStarted).toBe(12);
    expect(merged.totalRunsCleared).toBe(3);
  });

  it('strictly satisfies Commutativity (A ⊔ B === B ⊔ A), Associativity ((A ⊔ B) ⊔ C === A ⊔ (B ⊔ C)) & Idempotence (A ⊔ A === A)', async () => {
    const rng = new DeterministicRng(0x10c0ffee);

    for (let i = 0; i < 20; i++) {
      const a = await buildRandomMeta(rng, rng.nextInt(1, 10));
      const b = await buildRandomMeta(rng, rng.nextInt(1, 10));
      const c = await buildRandomMeta(rng, rng.nextInt(1, 10));

      // 幂等律：A ⊔ A === A
      const idempA = await mergeMetaProgressions(a, a);
      expect(idempA).toEqual(a);
      expect(idempA.payloadSha256).toBe(a.payloadSha256);

      // 交换律：A ⊔ B === B ⊔ A
      const ab = await mergeMetaProgressions(a, b);
      const ba = await mergeMetaProgressions(b, a);
      expect(ab).toEqual(ba);
      expect(ab.payloadSha256).toBe(ba.payloadSha256);

      // 结合律：(A ⊔ B) ⊔ C === A ⊔ (B ⊔ C)
      const ab_c = await mergeMetaProgressions(ab, c);
      const bc = await mergeMetaProgressions(b, c);
      const a_bc = await mergeMetaProgressions(a, bc);
      expect(ab_c).toEqual(a_bc);
      expect(ab_c.payloadSha256).toBe(a_bc.payloadSha256);
    }
  });

  it('produces identical SHA-256 regardless of V8/JavaScriptCore object property insertion order', async () => {
    const orderOne = {
      zKey: 42,
      aKey: 'athanor',
      nested: { second: [1, 2, 3], first: true },
      revision: 1,
      payloadSha256: 'ignored_old_hash',
    };
    const orderTwo = {
      payloadSha256: 'different_ignored_hash',
      revision: 99,
      nested: { first: true, second: [1, 2, 3] },
      aKey: 'athanor',
      zKey: 42,
    };

    expect(canonicalizeJson(orderOne)).toBe(canonicalizeJson(orderTwo));
    expect(await computeSaveSha256(orderOne)).toBe(await computeSaveSha256(orderTwo));
  });
});
