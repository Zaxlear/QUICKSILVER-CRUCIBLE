/**
 * 主角双主动技能槽、3 槽局内变异构筑与永恒锻炉灵液灌注状态管理器
 * （src/entities/player/PlayerSkillAndMutationLoadout.ts）。
 */

import type { DeterministicRng } from '../../core/DeterministicRng';
import { AFFIX_CATALOG, type SynergySemanticTag } from '../../data/affixes.data';
import {
  ETERNAL_FORGE_UPGRADES,
  MAX_EQUIPPED_MUTATIONS,
  type ForgeUpgradeId,
  type MutationForgeModalPayload,
  type MutationId,
} from '../../data/mutations.data';
import {
  SKILL_CATALOG,
  type CombatHudSkillSlotSummary,
  type RolledSkillInstance,
  type SkillId,
  type SkillSlotId,
} from '../../data/skills.data';
import {
  STAT_COLOR_META,
  type ForgeGrade,
  type QualityTier,
} from '../../data/weapons.data';
import type { PlayerStats } from './PlayerStats';
import {
  formatWeaponQualityBadge,
  isAffixEligibleForSkill,
  rollDeterministicAffixIds,
} from './WeaponCompareProjection';

export class PlayerSkillAndMutationLoadout {
  private slotOne: RolledSkillInstance;
  private slotTwo: RolledSkillInstance;
  private readonly equippedMutations: MutationId[] = ['mut_crimson_frenzy', 'mut_tactical_reload'];
  private respecTimes = 0;
  private skillSeq = 1;

  public readonly forgeProgress: Record<ForgeUpgradeId, number> = {
    upg_flask_tier: 0,
    upg_legendary_forge_plus: 160,
    upg_legendary_forge_pp: 0,
    upg_legendary_forge_s: 0,
  };

  public constructor(initOne?: RolledSkillInstance, initTwo?: RolledSkillInstance) {
    this.slotOne = initOne ?? {
      instanceId: 'skl_init_1',
      skillId: 'skl_vitriol_flask',
      level: 'II',
      forgeGrade: 'PLUS',
      affixIds: ['afx_dmg_on_oil_burn'],
      cooldownRemainingSec: 0,
    };
    this.slotTwo = initTwo ?? {
      instanceId: 'skl_init_2',
      skillId: 'skl_tesla_coil_turret',
      level: 'II',
      forgeGrade: 'PLUS',
      affixIds: ['afx_grenade_voltaic_net'],
      cooldownRemainingSec: 0,
    };
  }

  public get skillOne(): RolledSkillInstance {
    return this.slotOne;
  }

  public get skillTwo(): RolledSkillInstance {
    return this.slotTwo;
  }

  public get activeMutationIds(): readonly MutationId[] {
    return this.equippedMutations;
  }

  public get respecCostGold(): number {
    return 60 + this.respecTimes * 40;
  }

  public getSlotSkill(slot: SkillSlotId): RolledSkillInstance {
    return slot === 'skill_1' ? this.slotOne : this.slotTwo;
  }

  public equipSkill(slot: SkillSlotId, next: RolledSkillInstance): RolledSkillInstance {
    const prev = this.getSlotSkill(slot);
    if (slot === 'skill_1') this.slotOne = next;
    else this.slotTwo = next;
    return prev;
  }

  public rollSkillInstance(
    lootRng: DeterministicRng,
    skillId: SkillId,
    level: QualityTier = 'II',
    forgeGrade: ForgeGrade = 'PLUS'
  ): RolledSkillInstance {
    const def = SKILL_CATALOG[skillId];
    const pool = AFFIX_CATALOG.filter((a) => isAffixEligibleForSkill(a, def.archetype));
    const affixIds = rollDeterministicAffixIds(lootRng, pool, forgeGrade);
    this.skillSeq += 1;
    return {
      instanceId: `skl_inst_${this.skillSeq}_${skillId}`,
      skillId,
      level,
      forgeGrade,
      affixIds,
      cooldownRemainingSec: 0,
    };
  }

  public tryTriggerSkillCooldown(slot: SkillSlotId): RolledSkillInstance | null {
    const inst = this.getSlotSkill(slot);
    if (inst.cooldownRemainingSec > 0.01) return null;
    inst.cooldownRemainingSec = SKILL_CATALOG[inst.skillId].baseCooldownSec;
    return inst;
  }

  public stepCooldowns(dtSec: number): void {
    if (this.slotOne.cooldownRemainingSec > 0) {
      this.slotOne.cooldownRemainingSec = Math.max(0, this.slotOne.cooldownRemainingSec - dtSec);
    }
    if (this.slotTwo.cooldownRemainingSec > 0) {
      this.slotTwo.cooldownRemainingSec = Math.max(0, this.slotTwo.cooldownRemainingSec - dtSec);
    }
  }

  public reduceAllCooldowns(deltaSec: number): void {
    if (deltaSec <= 0) return;
    this.slotOne.cooldownRemainingSec = Math.max(0, this.slotOne.cooldownRemainingSec - deltaSec);
    this.slotTwo.cooldownRemainingSec = Math.max(0, this.slotTwo.cooldownRemainingSec - deltaSec);
  }

  public resetCooldowns(): void {
    this.slotOne.cooldownRemainingSec = 0;
    this.slotTwo.cooldownRemainingSec = 0;
  }

  public toggleMutationChoice(id: MutationId): boolean {
    const idx = this.equippedMutations.indexOf(id);
    if (idx >= 0) {
      this.equippedMutations.splice(idx, 1);
      return true;
    }
    if (this.equippedMutations.length >= MAX_EQUIPPED_MUTATIONS) return false;
    this.equippedMutations.push(id);
    return true;
  }

  public respecAllMutations(stats: PlayerStats): boolean {
    const cost = this.respecCostGold;
    if (stats.gold < cost || this.equippedMutations.length === 0) return false;
    stats.gold -= cost;
    this.respecTimes += 1;
    this.equippedMutations.length = 0;
    return true;
  }

  public investForgeIchor(upgradeId: ForgeUpgradeId, stats: PlayerStats, customAmount?: number): number {
    const spec = ETERNAL_FORGE_UPGRADES.find((u) => u.id === upgradeId);
    if (!spec || stats.ichor <= 0) return 0;
    const cur = this.forgeProgress[upgradeId];
    const roomLeft = Math.max(0, spec.maxIchor - cur);
    const spend = Math.min(stats.ichor, roomLeft, customAmount ?? spec.stepIchor);
    if (spend <= 0) return 0;

    stats.ichor -= spend;
    this.forgeProgress[upgradeId] = cur + spend;
    if (upgradeId === 'upg_flask_tier' && this.forgeProgress.upg_flask_tier >= 35 && stats.maxFlaskCharges < 4) {
      stats.maxFlaskCharges += 1;
      stats.flaskCharges += 1;
    }
    return spend;
  }

  public collectSkillProvidedTags(): readonly SynergySemanticTag[] {
    return [
      ...SKILL_CATALOG[this.slotOne.skillId].providesTags,
      ...SKILL_CATALOG[this.slotTwo.skillId].providesTags,
    ];
  }

  public buildHudSkillSummary(slot: SkillSlotId): CombatHudSkillSlotSummary {
    const inst = this.getSlotSkill(slot);
    const def = SKILL_CATALOG[inst.skillId];
    const leadColor = def.colors[0] ?? 'citrinitas';
    return {
      slot,
      skillId: inst.skillId,
      nameZh: def.nameZh,
      iconSlot: def.iconSlot,
      qualityBadge: formatWeaponQualityBadge(inst.level, inst.forgeGrade),
      colorHex: STAT_COLOR_META[leadColor].accentHex,
      cooldownLeftSec: Number(inst.cooldownRemainingSec.toFixed(1)),
      baseCooldownSec: def.baseCooldownSec,
      isReady: inst.cooldownRemainingSec <= 0.01,
    };
  }

  public buildMutationForgeModalPayload(stats: PlayerStats, open: boolean): MutationForgeModalPayload {
    return {
      open,
      stats: stats.snapshotLevels,
      gold: stats.gold,
      respecCostGold: this.respecCostGold,
      carriedIchor: stats.ichor,
      equippedMutationIds: [...this.equippedMutations],
      forgeProgress: { ...this.forgeProgress },
    };
  }
}
