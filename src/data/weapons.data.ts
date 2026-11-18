/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》全部 12 把标志性武器帧数据、三系成长参数、
 * 橙血挽回（Rally）常量与战斗 UI 只读快照契约（src/data/weapons.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md §3.2。
 */

import type { AffixRarity } from './affixes.data';
import type { MutationId } from './mutations.data';
import type { WeaponComboStageTiming } from './playerKinematics.data';
import type { CombatHudSkillSlotSummary } from './skills.data';

export type StatColor = 'rubedo' | 'citrinitas' | 'albedo';
export type QualityTier = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';
export type ForgeGrade = 'BASE' | 'PLUS' | 'DOUBLE_PLUS' | 'S';
export type HitWeightClass = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'PARRY';
export type WeaponSlotId = 'primary' | 'secondary';

export type WeaponCategory =
  | 'MELEE_LIGHT'
  | 'MELEE_THRUST'
  | 'MELEE_TWINBLADES'
  | 'MELEE_HEAVY'
  | 'MELEE_HALBERD'
  | 'RANGED_BOW'
  | 'RANGED_CROSSBOW'
  | 'THROWN_FLASK'
  | 'MAGIC_STAFF'
  | 'SHIELD';

export type WeaponId =
  | 'wpn_rust_scalpel'
  | 'wpn_quicksilver_rapier'
  | 'wpn_cinnabar_twinblades'
  | 'wpn_athanor_cleaver'
  | 'wpn_crucible_maul'
  | 'wpn_pendulum_halberd'
  | 'wpn_alembic_bow'
  | 'wpn_clockwork_repeater'
  | 'wpn_vitriol_thrower'
  | 'wpn_voltaic_arc_staff'
  | 'wpn_slag_buckler'
  | 'wpn_mirror_aegis';

/** 向后兼容 Milestone 5 类型别名 */
export type Milestone5WeaponId = WeaponId;

export type WeaponCritRuleId =
  | 'BACKSTAB_180'
  | 'POST_DODGE_OR_PARRY_1800MS'
  | 'COMBO_STAGE_3_AND_5'
  | 'RHYTHM_WINDOW_220_380MS'
  | 'CRUSH_FROZEN_STUN_ROOT'
  | 'HALBERD_SWEETSPOT_64_112PX'
  | 'SNIPER_160PX_OR_3_STUCK_ARROWS'
  | 'ELECTRIFIED_OR_ROOTED'
  | 'CATALYST_OILED_OR_IGNITED'
  | 'LIQUID_CONDUCTOR_OR_CHAIN_BOUNCE'
  | 'PARRY_SHOCKWAVE'
  | 'PRISM_PARRY_TRIPLE_BEAM';

export const ALL_STAT_COLORS: readonly StatColor[] = ['rubedo', 'citrinitas', 'albedo'] as const;
export const QUALITY_TIERS: readonly QualityTier[] = ['I', 'II', 'III', 'IV', 'V', 'VI'] as const;
export const FORGE_GRADES: readonly ForgeGrade[] = ['BASE', 'PLUS', 'DOUBLE_PLUS', 'S'] as const;

export const STAT_COLOR_META: Readonly<
  Record<
    StatColor,
    {
      readonly nameZh: string;
      readonly shortZh: string;
      readonly titleZh: string;
      readonly descZh: string;
      readonly accentHex: string;
      readonly scrollIconSlot: number;
    }
  >
> = {
  rubedo: {
    nameZh: '赤化 (Rubedo)',
    shortZh: '赤',
    titleZh: '赤化卷轴 · 狂战煅烧',
    descZh: '强化近战快刀、突刺剑、双刃与沸血爆发武器伤害，并提供中等生命池增幅。',
    accentHex: '#E11D48',
    scrollIconSlot: 6,
  },
  citrinitas: {
    nameZh: '黄化 (Citrinitas)',
    shortZh: '黄',
    titleZh: '黄化卷轴 · 星盘精密',
    descZh: '强化猎弓、连发重弩、电弧法杖与炼金机关伤害，以极致输出换取紧凑生命成长。',
    accentHex: '#FBBF24',
    scrollIconSlot: 7,
  },
  albedo: {
    nameZh: '白化 (Albedo)',
    shortZh: '白',
    titleZh: '白化卷轴 · 水银坚壁',
    descZh: '强化重锤、战戟与镜面圣盾伤害，并提供三系中最高额的最大生命值增幅。',
    accentHex: '#3CE682',
    scrollIconSlot: 8,
  },
} as const;

/** 核心战斗、橙血挽回与 12 武器专属精确常量（docs/02 §1.2 ~ §3.2） */
export const COMBAT_CONSTANTS = {
  BASE_PLAYER_HP: 120,
  STAT_DMG_BASE: 1.15,
  GEAR_TIER_DMG_STEP: 0.15,

  // 橙血进攻挽回机制（Rally Mechanic）
  RALLY_DAMAGE_TO_ORANGE_RATIO: 0.75,
  RALLY_FREEZE_MS: 900,
  RALLY_DECAY_MAX_HP_PER_SEC: 0.32,
  RALLY_CRIT_RECOVERY_MULT: 1.5,
  RALLY_PARRY_INSTANT_RECOVERY_RATIO: 0.6,

  // 分级顿帧（Hit-Stop）毫秒锚点
  HITSTOP_MIN_MS: 16,
  HITSTOP_MAX_MS: 140,
  HITSTOP_BASE_LIGHT_MS: 25,
  HITSTOP_BASE_MEDIUM_MS: 45,
  HITSTOP_BASE_HEAVY_MS: 75,
  HITSTOP_BASE_PARRY_MS: 90,
  HITSTOP_CRIT_BONUS_MS: 14,
  HITSTOP_BREACH_BONUS_MS: 22,
  HITSTOP_MULTI_TARGET_COEFF: 8,

  // 12 武器专属精确参数
  RAPIER_CRIT_WINDOW_MS: 1800,
  TWINBLADES_STAGE3_CRIT_MULT: 1.65,
  TWINBLADES_STAGE5_CRIT_MULT: 2.4,
  TWINBLADES_BLEED_ATK_SPEED_BONUS: 0.15,
  TWINBLADES_BLEED_HASTE_MS: 2500,
  CLEAVER_RHYTHM_MIN_MS: 220,
  CLEAVER_RHYTHM_MAX_MS: 380,
  MAUL_SHOCKWAVE_REACH_PX: 96,
  HALBERD_SWEETSPOT_MIN_PX: 64,
  HALBERD_SWEETSPOT_MAX_PX: 112,
  BOW_SNIPER_MIN_DIST_PX: 160,
  BOW_STUCK_ARROW_CRIT_THRESHOLD: 3,
  BOW_ARROW_SPEED_PX_S: 860,
  BOW_AIR_HOVER_TICKS: 22,
  REPEATER_BOLT_SPEED_PX_S: 920,
  REPEATER_BURST_INTERVAL_TICKS: 7, // 58.3ms 连射
  VITRIOL_THROWER_RANGE_PX: 210,
  VITRIOL_POOL_WIDTH_PX: 64,
  VITRIOL_POOL_DURATION_SEC: 2.5,
  ARC_STAFF_RANGE_PX: 185,
  ARC_STAFF_HALF_CONE_DEG: 35,
  ARC_STAFF_MAX_CHAIN_TARGETS: 4,
  ARC_STAFF_CHAIN_RADIUS_PX: 140,
  ARC_STAFF_REPEAT_TICKS: 22,
  BUCKLER_BLOCK_REDUCTION: 0.75,
  AEGIS_BLOCK_REDUCTION: 0.7,
  BUCKLER_BLOCK_PUSHBACK_PX: 32,
  BUCKLER_PARRY_SHOCKWAVE_PX: 96,
  AEGIS_PRISM_BEAM_COUNT: 3,
  AEGIS_PRISM_BEAM_SPEED_PX_S: 540,
  AEGIS_MELEE_PARRY_FREEZE_SEC: 2.5,
  ENEMY_BREACH_STUN_MS: 1800,
  PARRY_DEFLECT_SPEED_MULT: 1.8,
  PARRY_DEFLECT_DAMAGE_MULT: 2.5,
  FLASK_HEAL_RATIO: 0.6,
} as const;

export const FORGE_GRADE_BONUS: Readonly<
  Record<
    ForgeGrade,
    {
      readonly suffix: string;
      readonly effectiveExtraLevels: number;
      readonly affixSlots: number;
      readonly bonusScrollCount: number;
    }
  >
> = {
  BASE: { suffix: '', effectiveExtraLevels: 0, affixSlots: 1, bonusScrollCount: 0 },
  PLUS: { suffix: '+', effectiveExtraLevels: 2, affixSlots: 2, bonusScrollCount: 0 },
  DOUBLE_PLUS: { suffix: '++', effectiveExtraLevels: 4, affixSlots: 3, bonusScrollCount: 1 },
  S: { suffix: 'S', effectiveExtraLevels: 6, affixSlots: 4, bonusScrollCount: 2 },
} as const;

export interface WeaponAttackStageSpec extends WeaponComboStageTiming {
  readonly baseDamage: number;
  readonly breach: number;
  readonly hitWeight: HitWeightClass;
  readonly hitboxWidthPx: number;
  readonly hitboxHeightPx: number;
  readonly hitboxOffsetX: number;
  readonly hitboxOffsetY: number;
  readonly smearFrame: string;
  readonly smearAtlas?: 'weapons_fx_atlas' | 'synergy_fx_atlas';
}

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly colors: readonly StatColor[];
  readonly category: WeaponCategory;
  readonly iconSlot: number;
  readonly worldAtlas: 'weapons_fx_atlas' | 'synergy_fx_atlas';
  readonly worldFrame: string;
  readonly critMultiplier: number;
  readonly critRule: WeaponCritRuleId;
  readonly critSummaryZh: string;
  readonly mechanicSummaryZh: string;
  readonly flavorInscriptionZh: string;
  readonly rallyCoeff: number;
  readonly maxAmmo: number | null;
  readonly startupDamageReduction: number;
  readonly startupHyperArmor: boolean;
  readonly stages: readonly WeaponAttackStageSpec[];
}

export const ALL_WEAPON_IDS: readonly WeaponId[] = [
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

export const MILESTONE_5_WEAPON_IDS: readonly WeaponId[] = [
  'wpn_rust_scalpel',
  'wpn_quicksilver_rapier',
  'wpn_athanor_cleaver',
  'wpn_alembic_bow',
  'wpn_voltaic_arc_staff',
  'wpn_slag_buckler',
] as const;

/** 全部 12 把标志性武器 100% 完整帧数据与机制配表（docs/02 §3.2 #01 ~ #12） */
export const WEAPON_CATALOG: Readonly<Record<WeaponId, WeaponDefinition>> = {
  wpn_rust_scalpel: {
    id: 'wpn_rust_scalpel',
    nameZh: '锈蚀解剖刃',
    nameEn: 'Rusted Vivisector Scalpel',
    colors: ['rubedo'],
    category: 'MELEE_LIGHT',
    iconSlot: 0,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_rust_scalpel',
    critMultiplier: 1.95,
    critRule: 'BACKSTAB_180',
    critSummaryZh: '1.95× 背刺暴击：位于敌人面朝方向后方 180° 半平面命中必暴。',
    mechanicSummaryZh: '极速四段快刀，每段自带 10px 悬崖防坠微步吸附，翻滚穿背刀刀红字。',
    flavorInscriptionZh: '“尖塔医学院的第一课：先切开病人的声带，再切开病灶。”',
    rallyCoeff: 0.1,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 7, activeTicks: 4, recoveryTicks: 14, cancelStartTick: 12, lungePx: 10, animStartFrame: 0, animEndFrame: 3, baseDamage: 28, breach: 0.2, hitWeight: 'LIGHT', hitboxWidthPx: 38, hitboxHeightPx: 26, hitboxOffsetX: 22, hitboxOffsetY: -15, smearFrame: 'slash_scalpel_0' },
      { startupTicks: 6, activeTicks: 4, recoveryTicks: 14, cancelStartTick: 11, lungePx: 10, animStartFrame: 4, animEndFrame: 7, baseDamage: 30, breach: 0.2, hitWeight: 'LIGHT', hitboxWidthPx: 38, hitboxHeightPx: 26, hitboxOffsetX: 22, hitboxOffsetY: -15, smearFrame: 'slash_scalpel_1' },
      { startupTicks: 8, activeTicks: 5, recoveryTicks: 16, cancelStartTick: 14, lungePx: 10, animStartFrame: 0, animEndFrame: 3, baseDamage: 36, breach: 0.4, hitWeight: 'LIGHT', hitboxWidthPx: 42, hitboxHeightPx: 28, hitboxOffsetX: 24, hitboxOffsetY: -16, smearFrame: 'slash_scalpel_0' },
      { startupTicks: 10, activeTicks: 6, recoveryTicks: 24, cancelStartTick: 18, lungePx: 14, animStartFrame: 8, animEndFrame: 11, baseDamage: 52, breach: 0.8, hitWeight: 'MEDIUM', hitboxWidthPx: 46, hitboxHeightPx: 30, hitboxOffsetX: 26, hitboxOffsetY: -16, smearFrame: 'slash_scalpel_1' },
    ],
  },
  wpn_quicksilver_rapier: {
    id: 'wpn_quicksilver_rapier',
    nameZh: '水银刺剑',
    nameEn: 'Quicksilver Estoc Rapier',
    colors: ['rubedo'],
    category: 'MELEE_THRUST',
    iconSlot: 1,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_quicksilver_rapier',
    critMultiplier: 2.25,
    critRule: 'POST_DODGE_OR_PARRY_1800MS',
    critSummaryZh: '2.25× 瞬步暴击：翻滚或黄金招架后 1,800ms 内首次刺击必定暴击。',
    mechanicSummaryZh: '首刺向前瞬步突进 44px（悬崖防坠钳制），76×16px 狭长剑芒贯穿直线敌人。',
    flavorInscriptionZh: '“剑脊中空灌满活态汞，挥刺时重心永远比你的杀意快半寸。”',
    rallyCoeff: 0.12,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 8, activeTicks: 5, recoveryTicks: 17, cancelStartTick: 14, lungePx: 44, animStartFrame: 0, animEndFrame: 3, baseDamage: 34, breach: 0.3, hitWeight: 'LIGHT', hitboxWidthPx: 76, hitboxHeightPx: 16, hitboxOffsetX: 40, hitboxOffsetY: -16, smearFrame: 'thrust_rapier_0' },
      { startupTicks: 7, activeTicks: 5, recoveryTicks: 17, cancelStartTick: 13, lungePx: 12, animStartFrame: 4, animEndFrame: 7, baseDamage: 38, breach: 0.3, hitWeight: 'LIGHT', hitboxWidthPx: 76, hitboxHeightPx: 16, hitboxOffsetX: 40, hitboxOffsetY: -16, smearFrame: 'thrust_rapier_1' },
      { startupTicks: 11, activeTicks: 7, recoveryTicks: 26, cancelStartTick: 20, lungePx: 18, animStartFrame: 8, animEndFrame: 11, baseDamage: 64, breach: 1.0, hitWeight: 'MEDIUM', hitboxWidthPx: 80, hitboxHeightPx: 18, hitboxOffsetX: 42, hitboxOffsetY: -16, smearFrame: 'thrust_rapier_0' },
    ],
  },
  wpn_cinnabar_twinblades: {
    id: 'wpn_cinnabar_twinblades',
    nameZh: '辰砂双刃',
    nameEn: 'Cinnabar Twinblades',
    colors: ['rubedo', 'citrinitas'],
    category: 'MELEE_TWINBLADES',
    iconSlot: 10,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_cinnabar_twinblades',
    critMultiplier: 2.4,
    critRule: 'COMBO_STAGE_3_AND_5',
    critSummaryZh: '节奏段暴击：第 3 段交叉斩小暴击（1.65×），第 5 段腾空风车斩大暴击（2.40×）！',
    mechanicSummaryZh: '极速五段连舞；命中携带【流血】的目标时自身获得 +15% 攻速提升，鼓励贪刀打满五连。',
    flavorInscriptionZh: '“朱砂本是剧毒之血，双刀交错之声恰似矿工临终的喘息。”',
    rallyCoeff: 0.09,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 6, activeTicks: 3, recoveryTicks: 11, cancelStartTick: 10, lungePx: 8, animStartFrame: 0, animEndFrame: 3, baseDamage: 20, breach: 0.15, hitWeight: 'LIGHT', hitboxWidthPx: 36, hitboxHeightPx: 26, hitboxOffsetX: 20, hitboxOffsetY: -15, smearFrame: 'slash_twinblades_0', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 6, activeTicks: 3, recoveryTicks: 11, cancelStartTick: 10, lungePx: 8, animStartFrame: 4, animEndFrame: 7, baseDamage: 20, breach: 0.15, hitWeight: 'LIGHT', hitboxWidthPx: 36, hitboxHeightPx: 26, hitboxOffsetX: 20, hitboxOffsetY: -15, smearFrame: 'slash_twinblades_1', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 8, activeTicks: 5, recoveryTicks: 14, cancelStartTick: 14, lungePx: 14, animStartFrame: 0, animEndFrame: 3, baseDamage: 35, breach: 0.5, hitWeight: 'MEDIUM', hitboxWidthPx: 44, hitboxHeightPx: 30, hitboxOffsetX: 24, hitboxOffsetY: -16, smearFrame: 'slash_twinblades_0', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 7, activeTicks: 4, recoveryTicks: 12, cancelStartTick: 12, lungePx: 10, animStartFrame: 4, animEndFrame: 7, baseDamage: 24, breach: 0.2, hitWeight: 'LIGHT', hitboxWidthPx: 40, hitboxHeightPx: 28, hitboxOffsetX: 22, hitboxOffsetY: -16, smearFrame: 'slash_twinblades_1', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 12, activeTicks: 8, recoveryTicks: 28, cancelStartTick: 22, lungePx: 20, animStartFrame: 8, animEndFrame: 11, baseDamage: 68, breach: 1.1, hitWeight: 'MEDIUM', hitboxWidthPx: 52, hitboxHeightPx: 36, hitboxOffsetX: 26, hitboxOffsetY: -18, smearFrame: 'slash_twinblades_0', smearAtlas: 'synergy_fx_atlas' },
    ],
  },
  wpn_athanor_cleaver: {
    id: 'wpn_athanor_cleaver',
    nameZh: '锻炉断头重刃',
    nameEn: 'Athanor Guillotine Cleaver',
    colors: ['rubedo', 'albedo'],
    category: 'MELEE_HEAVY',
    iconSlot: 2,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_athanor_cleaver',
    critMultiplier: 2.6,
    critRule: 'RHYTHM_WINDOW_220_380MS',
    critSummaryZh: '2.60× 律动暴击：第 1 段命中后 220~380ms 肩部火星亮起时精准按下第 2 段必暴（禁狂按）。',
    mechanicSummaryZh: '超高破盾重兵，前摇期间享 40% 伤害减免与浅霸体，正面硬劈直接轰开卫兵塔盾。',
    flavorInscriptionZh: '“它原本是用来斩断冷却失控的黄铜蒸汽管的，后来发现斩断叛乱者同样顺手。”',
    rallyCoeff: 0.18,
    maxAmmo: null,
    startupDamageReduction: 0.4,
    startupHyperArmor: true,
    stages: [
      { startupTicks: 28, activeTicks: 8, recoveryTicks: 34, cancelStartTick: 39, lungePx: 14, animStartFrame: 0, animEndFrame: 3, baseDamage: 95, breach: 1.8, hitWeight: 'HEAVY', hitboxWidthPx: 62, hitboxHeightPx: 38, hitboxOffsetX: 30, hitboxOffsetY: -19, smearFrame: 'cleave_athanor_0' },
      { startupTicks: 32, activeTicks: 10, recoveryTicks: 42, cancelStartTick: 45, lungePx: 20, animStartFrame: 8, animEndFrame: 11, baseDamage: 135, breach: 2.8, hitWeight: 'HEAVY', hitboxWidthPx: 68, hitboxHeightPx: 42, hitboxOffsetX: 34, hitboxOffsetY: -21, smearFrame: 'cleave_athanor_1' },
    ],
  },
  wpn_crucible_maul: {
    id: 'wpn_crucible_maul',
    nameZh: '坩埚震地重锤',
    nameEn: 'Crucible Earthshaker Maul',
    colors: ['albedo'],
    category: 'MELEE_HEAVY',
    iconSlot: 11,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_crucible_maul',
    critMultiplier: 2.5,
    critRule: 'CRUSH_FROZEN_STUN_ROOT',
    critSummaryZh: '2.50× 碎壳暴击：命中处于【冰冻】、【眩晕】或【定身】控制状态下的敌人必定暴击！',
    mechanicSummaryZh: '全游戏最高破盾值（3.8）；第 3 段砸地向前延伸 96px 熔渣地裂冲击波震飞群怪。',
    flavorInscriptionZh: '“锤头里封存着一炉尚未凝固的铁水，砸在冰雕上时听起来像极了庆典礼炮。”',
    rallyCoeff: 0.18,
    maxAmmo: null,
    startupDamageReduction: 0.35,
    startupHyperArmor: true,
    stages: [
      { startupTicks: 30, activeTicks: 8, recoveryTicks: 32, cancelStartTick: 40, lungePx: 10, animStartFrame: 0, animEndFrame: 3, baseDamage: 88, breach: 2.2, hitWeight: 'HEAVY', hitboxWidthPx: 58, hitboxHeightPx: 38, hitboxOffsetX: 28, hitboxOffsetY: -19, smearFrame: 'maul_shockwave_0', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 26, activeTicks: 8, recoveryTicks: 30, cancelStartTick: 36, lungePx: 12, animStartFrame: 4, animEndFrame: 7, baseDamage: 96, breach: 2.2, hitWeight: 'HEAVY', hitboxWidthPx: 60, hitboxHeightPx: 38, hitboxOffsetX: 30, hitboxOffsetY: -19, smearFrame: 'maul_shockwave_0', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 38, activeTicks: 12, recoveryTicks: 46, cancelStartTick: 52, lungePx: 16, animStartFrame: 8, animEndFrame: 11, baseDamage: 160, breach: 3.8, hitWeight: 'HEAVY', hitboxWidthPx: 96, hitboxHeightPx: 44, hitboxOffsetX: 48, hitboxOffsetY: -22, smearFrame: 'maul_shockwave_1', smearAtlas: 'synergy_fx_atlas' },
    ],
  },
  wpn_pendulum_halberd: {
    id: 'wpn_pendulum_halberd',
    nameZh: '骸骨钟摆战戟',
    nameEn: 'Ossuary Pendulum Halberd',
    colors: ['albedo', 'rubedo'],
    category: 'MELEE_HALBERD',
    iconSlot: 12,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_pendulum_halberd',
    critMultiplier: 2.15,
    critRule: 'HALBERD_SWEETSPOT_64_112PX',
    critSummaryZh: '2.15× 刀尖甜区暴击：总长 112px，外圈月牙刃口（64~112px）命中必定暴击，内圈戟杆普攻。',
    mechanicSummaryZh: '超长控距巨兵，第 3 段斜上方大圆弧挑斩精准覆盖高处平台与飞行怪。',
    flavorInscriptionZh: '“从大圣堂报丧钟上拆下的摆锤，每一击都在替亡者校准吉时。”',
    rallyCoeff: 0.14,
    maxAmmo: null,
    startupDamageReduction: 0.2,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 18, activeTicks: 6, recoveryTicks: 22, cancelStartTick: 26, lungePx: 8, animStartFrame: 0, animEndFrame: 3, baseDamage: 58, breach: 1.1, hitWeight: 'MEDIUM', hitboxWidthPx: 112, hitboxHeightPx: 28, hitboxOffsetX: 56, hitboxOffsetY: -16, smearFrame: 'sweep_halberd_0', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 17, activeTicks: 6, recoveryTicks: 22, cancelStartTick: 25, lungePx: 8, animStartFrame: 4, animEndFrame: 7, baseDamage: 62, breach: 1.1, hitWeight: 'MEDIUM', hitboxWidthPx: 112, hitboxHeightPx: 30, hitboxOffsetX: 56, hitboxOffsetY: -17, smearFrame: 'sweep_halberd_1', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 24, activeTicks: 8, recoveryTicks: 32, cancelStartTick: 34, lungePx: 12, animStartFrame: 8, animEndFrame: 11, baseDamage: 94, breach: 1.9, hitWeight: 'HEAVY', hitboxWidthPx: 112, hitboxHeightPx: 54, hitboxOffsetX: 56, hitboxOffsetY: -26, smearFrame: 'sweep_halberd_0', smearAtlas: 'synergy_fx_atlas' },
    ],
  },
  wpn_alembic_bow: {
    id: 'wpn_alembic_bow',
    nameZh: '曲颈瓶速射猎弓',
    nameEn: 'Alembic Reflex Bow',
    colors: ['citrinitas'],
    category: 'RANGED_BOW',
    iconSlot: 3,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_alembic_bow',
    critMultiplier: 2.05,
    critRule: 'SNIPER_160PX_OR_3_STUCK_ARROWS',
    critSummaryZh: '2.05× 狙杀/满矢暴击：距离目标 ≥ 160px 命中，或目标身插 ≥ 3 支未拔出箭矢时必暴。',
    mechanicSummaryZh: '箭速 860 px/s（备弹 6），空中拉弓滞空缓降 180ms；副手近战或盾反命中瞬间拔回全部插矢。',
    flavorInscriptionZh: '“弓弦由硬化羊肠与钨丝绞合，离目标越远，玻璃箭簇旋转积蓄的离心力越致命。”',
    rallyCoeff: 0.09,
    maxAmmo: 6,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 14, activeTicks: 2, recoveryTicks: 16, cancelStartTick: 17, lungePx: 0, animStartFrame: 4, animEndFrame: 7, baseDamage: 48, breach: 0.5, hitWeight: 'LIGHT', hitboxWidthPx: 0, hitboxHeightPx: 0, hitboxOffsetX: 16, hitboxOffsetY: -17, smearFrame: 'proj_mercury_arrow' },
    ],
  },
  wpn_clockwork_repeater: {
    id: 'wpn_clockwork_repeater',
    nameZh: '发条连发重弩',
    nameEn: 'Clockwork Repeating Arbalest',
    colors: ['citrinitas', 'albedo'],
    category: 'RANGED_CROSSBOW',
    iconSlot: 13,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_clockwork_repeater',
    critMultiplier: 1.85,
    critRule: 'ELECTRIFIED_OR_ROOTED',
    critSummaryZh: '1.85× 每矢暴击：攻击处于【感电】或【定身】状态的敌人时，三发钢钉全部暴击！',
    mechanicSummaryZh: '单次按键高速三连点射（3×58ms，备弹 18 枚钢钉），贴合捕兽夹定身或哨塔感电倾泻火力。',
    flavorInscriptionZh: '“扣动一次扳机，发条盒便替你省去三次忏悔的工夫。”',
    rallyCoeff: 0.07,
    maxAmmo: 18,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 18, activeTicks: 16, recoveryTicks: 26, cancelStartTick: 41, lungePx: 0, animStartFrame: 4, animEndFrame: 7, baseDamage: 22, breach: 0.35, hitWeight: 'LIGHT', hitboxWidthPx: 0, hitboxHeightPx: 0, hitboxOffsetX: 18, hitboxOffsetY: -17, smearFrame: 'proj_repeater_bolt', smearAtlas: 'synergy_fx_atlas' },
    ],
  },
  wpn_vitriol_thrower: {
    id: 'wpn_vitriol_thrower',
    nameZh: '矾酸蒸馏投掷瓶',
    nameEn: 'Vitriol Retort Thrower',
    colors: ['rubedo', 'citrinitas'],
    category: 'THROWN_FLASK',
    iconSlot: 14,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_vitriol_thrower',
    critMultiplier: 1.95,
    critRule: 'CATALYST_OILED_OR_IGNITED',
    critSummaryZh: '1.95× 催化暴击：瓶体直接砸中正处于【油污】或【燃烧】状态的敌人必定暴击！',
    mechanicSummaryZh: '无限瓶药抛物线投掷（射程 210px），碎裂后铺设 64px 宽、持续 2.5s 的酸火区持续叠燃烧。',
    flavorInscriptionZh: '“千万别摇晃——好吧，既然你是扔向别人，请使劲摇晃。”',
    rallyCoeff: 0.1,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 15, activeTicks: 2, recoveryTicks: 19, cancelStartTick: 19, lungePx: 0, animStartFrame: 0, animEndFrame: 3, baseDamage: 38, breach: 0.4, hitWeight: 'MEDIUM', hitboxWidthPx: 0, hitboxHeightPx: 0, hitboxOffsetX: 14, hitboxOffsetY: -20, smearFrame: 'proj_vitriol_flask', smearAtlas: 'synergy_fx_atlas' },
      { startupTicks: 13, activeTicks: 2, recoveryTicks: 19, cancelStartTick: 17, lungePx: 0, animStartFrame: 4, animEndFrame: 7, baseDamage: 38, breach: 0.4, hitWeight: 'MEDIUM', hitboxWidthPx: 0, hitboxHeightPx: 0, hitboxOffsetX: 14, hitboxOffsetY: -20, smearFrame: 'proj_vitriol_flask', smearAtlas: 'synergy_fx_atlas' },
    ],
  },
  wpn_voltaic_arc_staff: {
    id: 'wpn_voltaic_arc_staff',
    nameZh: '星盘电弧法杖',
    nameEn: 'Astrolabe Voltaic Staff',
    colors: ['citrinitas'],
    category: 'MAGIC_STAFF',
    iconSlot: 4,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_voltaic_arc_staff',
    critMultiplier: 1.9,
    critRule: 'LIQUID_CONDUCTOR_OR_CHAIN_BOUNCE',
    critSummaryZh: '1.90× 超导暴击：处于酸水池/油污导电地形，或电弧链式弹射至第 2、3、4 名次级目标时必暴。',
    mechanicSummaryZh: '按住每 183ms 脉冲释放 ±35° 自动索敌闪电链（射程 185px），任意帧可 0ms 无前摇翻滚取消。',
    flavorInscriptionZh: '“引天顶雷暴入凡铁，凡流淌液体之处，皆为刑场。”',
    rallyCoeff: 0.08,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 12, activeTicks: 2, recoveryTicks: 8, cancelStartTick: 1, lungePx: 0, animStartFrame: 4, animEndFrame: 7, baseDamage: 29, breach: 0.25, hitWeight: 'LIGHT', hitboxWidthPx: 185, hitboxHeightPx: 80, hitboxOffsetX: 0, hitboxOffsetY: -18, smearFrame: 'arc_chain_bolt_0' },
    ],
  },
  wpn_slag_buckler: {
    id: 'wpn_slag_buckler',
    nameZh: '矿渣反冲圆盾',
    nameEn: 'Slag Repulsor Buckler',
    colors: ['albedo'],
    category: 'SHIELD',
    iconSlot: 5,
    worldAtlas: 'weapons_fx_atlas',
    worldFrame: 'wpn_slag_buckler',
    critMultiplier: 2.4,
    critRule: 'PARRY_SHOCKWAVE',
    critSummaryZh: '2.40× 震荡暴击：150ms 黄金招架成功瞬间向前 96px 扇形迸发必暴炼金冲击波并眩晕 1.8s。',
    mechanicSummaryZh: '黄金招架 0ms 清零冷却并弹反投射物（1.8× 移速 / 250% 伤害）；长按举盾减伤 75% 且震退贴脸怪。',
    flavorInscriptionZh: '“最卑贱的炉底废渣，却挡住了贵族老爷们最锋利的刺剑。”',
    rallyCoeff: 0.16,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 2, activeTicks: 18, recoveryTicks: 34, cancelStartTick: 21, lungePx: 0, animStartFrame: 0, animEndFrame: 3, baseDamage: 78, breach: 99, hitWeight: 'PARRY', hitboxWidthPx: 96, hitboxHeightPx: 54, hitboxOffsetX: 48, hitboxOffsetY: -18, smearFrame: 'buckler_shockwave_0' },
    ],
  },
  wpn_mirror_aegis: {
    id: 'wpn_mirror_aegis',
    nameZh: '水银镜面圣盾',
    nameEn: 'Quicksilver Mirror Aegis',
    colors: ['albedo', 'citrinitas'],
    category: 'SHIELD',
    iconSlot: 15,
    worldAtlas: 'synergy_fx_atlas',
    worldFrame: 'wpn_mirror_aegis',
    critMultiplier: 2.1,
    critRule: 'PRISM_PARRY_TRIPLE_BEAM',
    critSummaryZh: '2.10× ×3 棱镜暴击：招架远程弹药分裂 3 道自动追踪水银光束全部暴击；招架近战附加感电+冰冻！',
    mechanicSummaryZh: '挂载 ShieldRefractPipeline 水银折射力场；长按举盾减伤 70%，远程克星神盾。',
    flavorInscriptionZh: '“凝视盾面之人，终将被自己的杀意原封不动地射穿眉心。”',
    rallyCoeff: 0.16,
    maxAmmo: null,
    startupDamageReduction: 0,
    startupHyperArmor: false,
    stages: [
      { startupTicks: 2, activeTicks: 18, recoveryTicks: 36, cancelStartTick: 21, lungePx: 0, animStartFrame: 0, animEndFrame: 3, baseDamage: 54, breach: 99, hitWeight: 'PARRY', hitboxWidthPx: 88, hitboxHeightPx: 54, hitboxOffsetX: 44, hitboxOffsetY: -18, smearFrame: 'buckler_shockwave_0' },
    ],
  },
} as const;

export const WEAPON_CATALOG_M5 = WEAPON_CATALOG;

export interface RolledWeaponInstance {
  readonly instanceId: string;
  readonly weaponId: WeaponId;
  readonly level: QualityTier;
  readonly forgeGrade: ForgeGrade;
  readonly bonusStatColor: StatColor | null;
  readonly affixIds: readonly string[];
}

export interface CombatHudSlotSummary {
  readonly slot: WeaponSlotId;
  readonly weaponId: WeaponId;
  readonly nameZh: string;
  readonly iconSlot: number;
  readonly qualityBadge: string;
  readonly colorHex: string;
  readonly scaledDps: number;
  readonly ammoLeft: number | null;
  readonly maxAmmo: number | null;
  readonly isReady: boolean;
}

export interface PlayerCombatHudSnapshot {
  readonly hp: number;
  readonly maxHp: number;
  readonly rallyOrangeHp: number;
  readonly rallyFrozen: boolean;
  readonly stats: Readonly<Record<StatColor, number>>;
  readonly flaskCharges: number;
  readonly maxFlaskCharges: number;
  readonly gold: number;
  readonly ichor: number;
  readonly rapierCritReady: boolean;
  readonly cleaverRhythmWindowOpen: boolean;
  readonly isInvulnerable: boolean;
  readonly isParryWindowActive: boolean;
  readonly primarySlot: CombatHudSlotSummary;
  readonly secondarySlot: CombatHudSlotSummary;
  readonly skillOneSlot?: CombatHudSkillSlotSummary;
  readonly skillTwoSlot?: CombatHudSkillSlotSummary;
  readonly activeMutationIds?: readonly MutationId[];
  readonly aegisShieldHp?: number;
  readonly crimsonTransfusionActive?: boolean;
  readonly predatorStealthActive?: boolean;
  readonly teslaTetherLinked?: boolean;
  readonly carapaceReady?: boolean;
}

export interface WeaponCompareSlotView {
  readonly weapon: RolledWeaponInstance;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly iconSlot: number;
  readonly qualityBadge: string;
  readonly colors: readonly StatColor[];
  readonly scaledDps: number;
  readonly critDps: number;
  readonly avgBreach: number;
  readonly critSummaryZh: string;
  readonly mechanicSummaryZh: string;
  readonly flavorInscriptionZh: string;
  readonly affixes: readonly {
    readonly id: string;
    readonly rarity: AffixRarity;
    readonly labelZh: string;
    readonly hasSynergyWithOtherSlot: boolean;
  }[];
}

export interface WeaponCompareModalPayload {
  readonly open: boolean;
  readonly floorLootId: string;
  readonly candidate: WeaponCompareSlotView;
  readonly currentPrimary: WeaponCompareSlotView;
  readonly currentSecondary: WeaponCompareSlotView;
  readonly dpsDeltaVsPrimaryPct: number;
  readonly dpsDeltaVsSecondaryPct: number;
}

export interface ScrollOptionPreview {
  readonly color: StatColor;
  readonly currentLevel: number;
  readonly nextLevel: number;
  readonly currentDmgMult: number;
  readonly nextDmgMult: number;
  readonly hpGainPct: number;
  readonly hpGainFlat: number;
  readonly nextMaxHp: number;
}

export interface ScrollPickModalPayload {
  readonly open: boolean;
  readonly stationId: string;
  readonly currentHp: number;
  readonly currentMaxHp: number;
  readonly options: readonly ScrollOptionPreview[];
}
