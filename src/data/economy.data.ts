/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》Beta 1.0.2 局内经济、明码标价军械商、
 * 全 6 主动技能换装、13 蓝图归档解锁、大熔炉概率常数与受诅咒秘匣纯静态配表（src/data/economy.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时模块依赖，100% 对齐 docs/06_BETA_1_0_2_DEVELOPMENT_PLAN.md。
 */

import type { AffixRarity } from './affixes.data';
import type { EnemyId } from './biomes.data';
import type { MutationId } from './mutations.data';
import type { RolledSkillInstance, SkillId } from './skills.data';
import {
  QUALITY_TIERS,
  type ForgeGrade,
  type QualityTier,
  type StatColor,
  type WeaponCompareSlotView,
  type WeaponId,
} from './weapons.data';

/** 秘银金库袋各等级（0~4）死亡保留金币硬上限（docs/06 §2.1） */
export const GOLD_RESERVE_CAPS: readonly [number, number, number, number, number] = [
  0, 800, 2000, 4000, 7500,
] as const;

export const ECONOMY_CONSTANTS = {
  ENEMY_GOLD_BASE_FLAT: 14,
  ENEMY_GOLD_DEPTH_STEP: 6,
  ENEMY_GOLD_HEAT_STEP: 0.12,
  ENEMY_GOLD_VARIANCE_MIN: 0.85,
  ENEMY_GOLD_VARIANCE_MAX: 1.15,
  NORMAL_RANK_GOLD_MULT: 1.0,
  ELITE_RANK_GOLD_MULT: 3.5,
  BOSS_1_FIXED_GOLD: 280,
  BOSS_2_FIXED_GOLD: 500,
  ELITE_COIN_SPLIT_MIN: 4,
  ELITE_COIN_SPLIT_MAX: 6,
  BOSS_COIN_SPLIT_COUNT: 10,

  GOLD_MAGNET_RADIUS_PX: 96,
  GOLD_COLLECT_RADIUS_PX: 18,
  GOLD_BOUNCE_RESTITUTION: 0.42,
  GOLD_GRAVITY_PX_S2: 960,
  GOLD_GROUND_FRICTION: 0.72,

  RECYCLE_HOLD_MS: 450,
  RECYCLE_RATIO_BASE: 0.45,
  RECYCLE_RATIO_UPGRADED: 0.75,

  SHOP_WEAPON_BASE_GOLD: 160,
  SHOP_SKILL_BASE_GOLD: 140,
  SHOP_LEVEL_GROWTH_BASE: 1.32,
  SHOP_TONIC_BASE_GOLD: 180,
  SHOP_TONIC_DEPTH_STEP_GOLD: 70,
  SHOP_MARROW_HEAL_RATIO: 0.55,
  SHOP_MAX_RESTOCKS: 3,

  ELITE_EXTRA_GEAR_DROP_CHANCE: 0.35,
  NORMAL_BLUEPRINT_DROP_CHANCE: 0.14,
  ELITE_BLUEPRINT_DROP_CHANCE: 0.5,

  FORGE_PLUS_MAX_ICHOR: 800,
  FORGE_PP_MAX_ICHOR: 1800,
  FORGE_S_MAX_ICHOR: 3600,

  CURSE_KILL_PENALTY: 10,
  CURSE_ELITE_KILL_CREDIT: 3,
  CURSE_CHEST_BONUS_GOLD: 250,
  ELITE_ALTAR_REPEAT_ICHOR: 45,
} as const;

export const SHOP_RESTOCK_COSTS: readonly [number, number, number] = [120, 240, 420] as const;

export const SHOP_FORGE_GRADE_MULT: Readonly<Record<ForgeGrade, number>> = {
  BASE: 1.0,
  PLUS: 1.35,
  DOUBLE_PLUS: 1.75,
  S: 2.3,
} as const;

/** 计算装备标准商店售价（docs/06 §2.3） */
export function computeGearShopPrice(
  kind: 'WEAPON' | 'SKILL',
  level: QualityTier,
  forgeGrade: ForgeGrade
): number {
  const base =
    kind === 'WEAPON' ? ECONOMY_CONSTANTS.SHOP_WEAPON_BASE_GOLD : ECONOMY_CONSTANTS.SHOP_SKILL_BASE_GOLD;
  const lvIdx = Math.max(0, QUALITY_TIERS.indexOf(level));
  const raw =
    base * Math.pow(ECONOMY_CONSTANTS.SHOP_LEVEL_GROWTH_BASE, lvIdx) * SHOP_FORGE_GRADE_MULT[forgeGrade];
  return Math.max(10, Math.round(raw));
}

/** 计算炼金补给品商店售价（docs/06 §2.3） */
export function computeTonicShopPrice(biomeDepth: 1 | 2 | 3 | 4): number {
  return (
    ECONOMY_CONSTANTS.SHOP_TONIC_BASE_GOLD +
    ECONOMY_CONSTANTS.SHOP_TONIC_DEPTH_STEP_GOLD * (biomeDepth - 1)
  );
}

/** 计算地面无用装备长按回收熔解入账金币（docs/06 §2.2） */
export function computeGearRecycleGold(
  kind: 'WEAPON' | 'SKILL',
  level: QualityTier,
  forgeGrade: ForgeGrade,
  hasHighTierRecycle = false
): number {
  const ratio = hasHighTierRecycle
    ? ECONOMY_CONSTANTS.RECYCLE_RATIO_UPGRADED
    : ECONOMY_CONSTANTS.RECYCLE_RATIO_BASE;
  return Math.max(5, Math.round(computeGearShopPrice(kind, level, forgeGrade) * ratio));
}

/** 计算秘银金库保留金币（docs/06 §2.1） */
export function computeInheritedGoldOnDeath(carriedGold: number, goldReserveLvl: number): number {
  const clampedLvl = Math.max(0, Math.min(4, Math.floor(goldReserveLvl)));
  const cap = GOLD_RESERVE_CAPS[clampedLvl] ?? 0;
  return Math.max(0, Math.min(Math.floor(carriedGold), cap));
}

export type BlueprintCategory = 'WEAPON' | 'SKILL' | 'MUTATION';

export interface BlueprintUnlockSpec {
  readonly blueprintId: WeaponId | SkillId | MutationId;
  readonly category: BlueprintCategory;
  readonly nameZh: string;
  readonly iconSlot: number;
  readonly ichorCost: number;
  readonly sourceId: EnemyId | 'boss_01_furnace_warden';
  readonly sourceNameZh: string;
  readonly summaryZh: string;
}

/** 全部 12 物种 + 首领萨尔弗专属进阶蓝图解锁矩阵（100% 对齐 docs/06 §2.5） */
export const BLUEPRINT_UNLOCK_CATALOG: readonly BlueprintUnlockSpec[] = [
  {
    blueprintId: 'mut_open_wounds',
    category: 'MUTATION',
    nameZh: '撕裂锯齿',
    iconSlot: 23,
    ichorCost: 35,
    sourceId: 'mob_01_slag_husk',
    sourceNameZh: '矿渣行尸',
    summaryZh: '每次近战武器命中必定额外施加 1 层【流血】持续割裂目标。',
  },
  {
    blueprintId: 'wpn_crucible_maul',
    category: 'WEAPON',
    nameZh: '坩埚震地重锤',
    iconSlot: 4,
    ichorCost: 55,
    sourceId: 'mob_02_frenzied_miner',
    sourceNameZh: '狂暴煅烧矿工',
    summaryZh: '蓄力霸体重锤，粉碎冰冻/定身/眩晕敌人必定触发毁灭暴击。',
  },
  {
    blueprintId: 'wpn_vitriol_thrower',
    category: 'WEAPON',
    nameZh: '矾酸蒸馏投掷瓶',
    iconSlot: 8,
    ichorCost: 50,
    sourceId: 'mob_03_alembic_thrower',
    sourceNameZh: '烧瓶投掷工',
    summaryZh: '抛射腐蚀烧瓶铺设矾酸火池，命中油污或燃烧目标必定暴击。',
  },
  {
    blueprintId: 'skl_crimson_transfusion',
    category: 'SKILL',
    nameZh: '赤化沸血狂潮',
    iconSlot: 20,
    ichorCost: 65,
    sourceId: 'mob_04_acid_spitter',
    sourceNameZh: '矾酸囊肿虫',
    summaryZh: '献祭 8% 生命化为冻结橙血，大幅提升攻速移速并溅射血雾 AOE。',
  },
  {
    blueprintId: 'mut_mercury_ward',
    category: 'MUTATION',
    nameZh: '镜面虹吸反击',
    iconSlot: 30,
    ichorCost: 45,
    sourceId: 'mob_05_brass_sentinel',
    sourceNameZh: '黄铜持盾卫兵',
    summaryZh: '黄金招架立即恢复生命并强化下一次近战攻击附加高额水银伤。',
  },
  {
    blueprintId: 'wpn_pendulum_halberd',
    category: 'WEAPON',
    nameZh: '骸骨钟摆战戟',
    iconSlot: 9,
    ichorCost: 75,
    sourceId: 'mob_06_flail_executor',
    sourceNameZh: '链锤处刑官',
    summaryZh: '中远距戟刃甜点区（64~112px）刀刀烈火暴击的控距重兵。',
  },
  {
    blueprintId: 'wpn_voltaic_arc_staff',
    category: 'WEAPON',
    nameZh: '星盘电弧法杖',
    iconSlot: 3,
    ichorCost: 80,
    sourceId: 'mob_07_voltaic_weaver',
    sourceNameZh: '电弧织网者',
    summaryZh: '释放多目标跳跃闪电链，处于导电液体或弹跳命中必定暴击。',
  },
  {
    blueprintId: 'wpn_clockwork_repeater',
    category: 'WEAPON',
    nameZh: '发条连发重弩',
    iconSlot: 7,
    ichorCost: 70,
    sourceId: 'mob_08_clockwork_tick',
    sourceNameZh: '发条自爆蛛',
    summaryZh: '三连发高速钢钉重弩，命中感电或定身目标必定全额暴击。',
  },
  {
    blueprintId: 'skl_aegis_tonics',
    category: 'SKILL',
    nameZh: '哲学家水银护瓮',
    iconSlot: 21,
    ichorCost: 90,
    sourceId: 'mob_09_ossuary_prelate',
    sourceNameZh: '骸骨堂司铎',
    summaryZh: '吸回全部橙血并展开 35% MaxHP 折射力场，可主动二段震爆。',
  },
  {
    blueprintId: 'wpn_cinnabar_twinblades',
    category: 'WEAPON',
    nameZh: '辰砂双刃',
    iconSlot: 6,
    ichorCost: 85,
    sourceId: 'mob_10_pendulum_assassin',
    sourceNameZh: '钟摆影刺客',
    summaryZh: '极速五连斩刺客双刀，第 3 与第 5 段连击必定暴击并叠流血加速。',
  },
  {
    blueprintId: 'wpn_quicksilver_rapier',
    category: 'WEAPON',
    nameZh: '水银刺剑',
    iconSlot: 1,
    ichorCost: 110,
    sourceId: 'mob_11_mercury_stalker',
    sourceNameZh: '水银拟态猎手',
    summaryZh: '翻滚穿过攻击或成功盾反后 1.8s 内突刺必定触发高倍率暴击。',
  },
  {
    blueprintId: 'wpn_mirror_aegis',
    category: 'WEAPON',
    nameZh: '水银镜面圣盾',
    iconSlot: 11,
    ichorCost: 130,
    sourceId: 'mob_12_astral_inquisitor',
    sourceNameZh: '星界审判官',
    summaryZh: '招架远程弹药分裂 3 道追踪棱镜暴击光束；招架近战附加冰冻与感电。',
  },
  {
    blueprintId: 'skl_tesla_coil_turret',
    category: 'SKILL',
    nameZh: '黄铜特斯拉哨塔',
    iconSlot: 18,
    ichorCost: 80,
    sourceId: 'boss_01_furnace_warden',
    sourceNameZh: '典狱长·萨尔弗',
    summaryZh: '部署自动索敌发条电塔，靠近拉出高压电弧绊线并提升 60% 射速。',
  },
] as const;

export const BLUEPRINT_BY_ID: Readonly<Record<string, BlueprintUnlockSpec>> = Object.fromEntries(
  BLUEPRINT_UNLOCK_CATALOG.map((b) => [b.blueprintId, b])
);

export interface SkillCompareSlotView {
  readonly skill: RolledSkillInstance;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly iconSlot: number;
  readonly qualityBadge: string;
  readonly colors: readonly StatColor[];
  readonly baseCooldownSec: number;
  readonly scaledDamage: number;
  readonly mechanicSummaryZh: string;
  readonly synergySummaryZh: string;
  readonly hasWeaponChemicalSynergy: boolean;
  readonly affixes: readonly {
    readonly id: string;
    readonly rarity: AffixRarity;
    readonly labelZh: string;
  }[];
}

export interface SkillCompareModalPayload {
  readonly open: boolean;
  readonly floorLootId: string;
  readonly candidate: SkillCompareSlotView;
  readonly currentSkillOne: SkillCompareSlotView;
  readonly currentSkillTwo: SkillCompareSlotView;
  readonly recycleGoldValue: number;
}

export type ShopSupplyKind = 'TONIC_FLASK' | 'MARROW_SALVE';

export interface ShopMerchandiseSlotView {
  readonly slotId: string;
  readonly categoryLabelZh: '主战兵器' | '炼金技能' | '炼金补给';
  readonly kind: 'WEAPON' | 'SKILL' | ShopSupplyKind;
  readonly priceGold: number;
  readonly purchased: boolean;
  readonly weaponView?: WeaponCompareSlotView;
  readonly skillView?: SkillCompareSlotView;
  readonly supplyTitleZh?: string;
  readonly supplyDescZh?: string;
  readonly supplyFrame?: string;
}

export interface ShopPurchaseModalPayload {
  readonly open: boolean;
  readonly shopNodeId: string;
  readonly biomeNameZh: string;
  readonly playerGold: number;
  readonly slots: readonly ShopMerchandiseSlotView[];
  readonly restockUnlocked: boolean;
  readonly restocksUsed: number;
  readonly nextRestockCostGold: number | null;
  readonly rejectNoticeZh: string | null;
}

export interface CollectorBlueprintEntryView {
  readonly spec: BlueprintUnlockSpec;
  readonly status: 'UNLOCKED' | 'REGISTERED' | 'UNDISCOVERED';
  readonly investedIchor: number;
}

export interface CollectorBlueprintModalPayload {
  readonly open: boolean;
  readonly availableIchor: number;
  readonly newlyRegisteredCount: number;
  readonly entries: readonly CollectorBlueprintEntryView[];
}

export interface CursedChestModalPayload {
  readonly open: boolean;
  readonly chestId: string;
  readonly killRequirement: number;
  readonly bonusGold: number;
}
