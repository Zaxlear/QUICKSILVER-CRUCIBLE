/**
 * 主角双主副手武器栏、双主动技能槽、变异构筑与全 20 词条确定性抽签管理器
 * （src/entities/player/PlayerInventory.ts）。
 */

import type { DeterministicRng } from '../../core/DeterministicRng';
import { NarrativeStore } from '../../core/NarrativeSessionStore';
import { AFFIX_CATALOG } from '../../data/affixes.data';
import { computeGearRecycleGold } from '../../data/economy.data';
import {
  ALL_STAT_COLORS,
  FORGE_GRADE_BONUS,
  STAT_COLOR_META,
  WEAPON_CATALOG,
  type CombatHudSlotSummary,
  type ForgeGrade,
  type QualityTier,
  type RolledWeaponInstance,
  type StatColor,
  type WeaponCompareModalPayload,
  type WeaponDefinition,
  type WeaponId,
  type WeaponSlotId,
} from '../../data/weapons.data';
import { resolveHighestStatColor } from './ForgeGradeRoller';
import { PlayerSkillAndMutationLoadout } from './PlayerSkillAndMutationLoadout';
import {
  computeWeaponScaledDps,
  formatWeaponQualityBadge,
  isAffixEligibleForWeapon,
  projectWeaponSlotView,
  rollDeterministicAffixIds,
} from './WeaponCompareProjection';

export { computeWeaponScaledDps, formatWeaponQualityBadge };

export class PlayerInventory {
  public readonly loadout: PlayerSkillAndMutationLoadout;
  private primary: RolledWeaponInstance;
  private secondary: RolledWeaponInstance;
  private ammoRemaining = 6;
  private instanceSeq = 1;

  public constructor(
    initialPrimary?: RolledWeaponInstance,
    initialSecondary?: RolledWeaponInstance,
    loadout?: PlayerSkillAndMutationLoadout
  ) {
    this.loadout = loadout ?? new PlayerSkillAndMutationLoadout();
    this.primary = initialPrimary ?? {
      instanceId: 'wpn_init_primary',
      weaponId: 'wpn_rust_scalpel',
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: ['afx_dmg_on_bleed'],
    };
    this.secondary = initialSecondary ?? {
      instanceId: 'wpn_init_secondary',
      weaponId: 'wpn_slag_buckler',
      level: 'I',
      forgeGrade: 'BASE',
      bonusStatColor: null,
      affixIds: ['afx_shield_parry_poison'],
    };
  }

  public get primaryWeapon(): RolledWeaponInstance {
    return this.primary;
  }

  public get secondaryWeapon(): RolledWeaponInstance {
    return this.secondary;
  }

  public get bowAmmoLeft(): number {
    return this.ammoRemaining;
  }

  public getSlotWeapon(slot: WeaponSlotId): RolledWeaponInstance {
    return slot === 'primary' ? this.primary : this.secondary;
  }

  public getSlotDefinition(slot: WeaponSlotId): WeaponDefinition {
    return WEAPON_CATALOG[this.getSlotWeapon(slot).weaponId];
  }

  /** 获取当前装备的全部词条列表（用于双倍承伤惩罚与翻滚路径词条判定） */
  public collectAllEquippedAffixIds(): readonly string[] {
    return [
      ...this.primary.affixIds,
      ...this.secondary.affixIds,
      ...this.loadout.skillOne.affixIds,
      ...this.loadout.skillTwo.affixIds,
    ];
  }

  public getEquippedShieldId(): WeaponId | null {
    if (WEAPON_CATALOG[this.secondary.weaponId].category === 'SHIELD') {
      return this.secondary.weaponId;
    }
    if (WEAPON_CATALOG[this.primary.weaponId].category === 'SHIELD') {
      return this.primary.weaponId;
    }
    return null;
  }

  public rollWeaponInstance(
    lootRng: DeterministicRng,
    weaponId: WeaponId,
    level: QualityTier = 'II',
    forgeGrade: ForgeGrade = 'PLUS',
    isColorlessLegendary = false
  ): RolledWeaponInstance {
    const def = WEAPON_CATALOG[weaponId];
    const eligible = AFFIX_CATALOG.filter((a) => isAffixEligibleForWeapon(a, def.category));
    const chosenIds = rollDeterministicAffixIds(lootRng, eligible, isColorlessLegendary ? 'S' : forgeGrade);
    const effectiveGrade: ForgeGrade = isColorlessLegendary ? 'S' : forgeGrade;
    const bonusStatColor =
      FORGE_GRADE_BONUS[effectiveGrade].bonusScrollCount > 0
        ? def.colors[0] ?? lootRng.pick(ALL_STAT_COLORS)
        : null;

    this.instanceSeq += 1;
    return {
      instanceId: `wpn_inst_${this.instanceSeq}_${weaponId}`,
      weaponId,
      level,
      forgeGrade: effectiveGrade,
      bonusStatColor,
      affixIds: chosenIds,
      ...(isColorlessLegendary ? { isColorlessLegendary: true } : {}),
    };
  }

  public equipToSlot(slot: WeaponSlotId, nextWeapon: RolledWeaponInstance): RolledWeaponInstance {
    const displaced = slot === 'primary' ? this.primary : this.secondary;
    if (slot === 'primary') this.primary = nextWeapon;
    else this.secondary = nextWeapon;

    const maxAmmo = WEAPON_CATALOG[nextWeapon.weaponId].maxAmmo;
    if (maxAmmo !== null) this.ammoRemaining = maxAmmo;
    return displaced;
  }

  public tryConsumeBowArrow(): boolean {
    if (this.ammoRemaining <= 0) return false;
    this.ammoRemaining -= 1;
    return true;
  }

  public refillBowArrows(amount?: number): void {
    const maxPrimary = WEAPON_CATALOG[this.primary.weaponId].maxAmmo;
    const maxSecondary = WEAPON_CATALOG[this.secondary.weaponId].maxAmmo;
    const cap = maxPrimary ?? maxSecondary ?? 6;
    this.ammoRemaining =
      amount === undefined ? cap : Math.min(cap, this.ammoRemaining + Math.max(0, amount));
  }

  public buildHudSlotSummary(
    slot: WeaponSlotId,
    stats: Readonly<Record<StatColor, number>>,
    isReady: boolean
  ): CombatHudSlotSummary {
    const inst = this.getSlotWeapon(slot);
    const def = WEAPON_CATALOG[inst.weaponId];
    const { baseDps } = computeWeaponScaledDps(inst, stats);
    const leadColor = inst.isColorlessLegendary ? resolveHighestStatColor(stats) : (def.colors[0] ?? 'rubedo');
    return {
      slot,
      weaponId: inst.weaponId,
      nameZh: inst.isColorlessLegendary ? `★${def.nameZh}` : def.nameZh,
      iconSlot: def.iconSlot,
      qualityBadge: formatWeaponQualityBadge(inst.level, inst.forgeGrade),
      colorHex: STAT_COLOR_META[leadColor].accentHex,
      scaledDps: baseDps,
      ammoLeft: def.maxAmmo !== null ? this.ammoRemaining : null,
      maxAmmo: def.maxAmmo,
      isReady: isReady && (def.maxAmmo === null || this.ammoRemaining > 0),
    };
  }

  public buildComparePayload(
    floorLootId: string,
    candidate: RolledWeaponInstance,
    stats: Readonly<Record<StatColor, number>>
  ): WeaponCompareModalPayload {
    const skillTags = this.loadout.collectSkillProvidedTags();
    const candView = projectWeaponSlotView(
      candidate,
      stats,
      [...this.primary.affixIds, ...this.secondary.affixIds],
      skillTags
    );
    const primView = projectWeaponSlotView(this.primary, stats, this.secondary.affixIds, skillTags);
    const secView = projectWeaponSlotView(this.secondary, stats, this.primary.affixIds, skillTags);
    return {
      open: true,
      floorLootId,
      candidate: candView,
      currentPrimary: primView,
      currentSecondary: secView,
      dpsDeltaVsPrimaryPct: Math.round(
        ((candView.scaledDps - primView.scaledDps) / Math.max(1, primView.scaledDps)) * 100
      ),
      dpsDeltaVsSecondaryPct: Math.round(
        ((candView.scaledDps - secView.scaledDps) / Math.max(1, secView.scaledDps)) * 100
      ),
      recycleGoldValue: computeGearRecycleGold(
        'WEAPON',
        candidate.level,
        candidate.forgeGrade,
        (NarrativeStore.forgeTiers.recycle_lvl ?? 0) > 0
      ),
    };
  }
}
