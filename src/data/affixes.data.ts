/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》6 大元素异常状态参数、6 大跨元素化学反应常量与
 * 20 条全量武器/技能词条配表（src/data/affixes.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md §3.5。
 */

export type ElementStatusKey =
  | 'oiled'
  | 'ignited'
  | 'bleeding'
  | 'frozen'
  | 'electrified'
  | 'poisoned';

export type ChemicalReactionId =
  | 'VIOLET_NAPALM'
  | 'OIL_CRYO_EXTEND'
  | 'THERMAL_SHOCK'
  | 'HEMORRHAGE_BURST'
  | 'BRITTLE_SHATTER'
  | 'ELECTROLYTIC_SURGE'
  | 'VITRIOL_DETONATION';

export type AffixRarity = 'COMMON' | 'RARE' | 'LEGENDARY';

export type AffixSlotFilter =
  | 'ALL_GEAR'
  | 'ALL_WEAPONS'
  | 'HEAVY_OR_CROSSBOW'
  | 'MELEE_OR_RANGED_BOW'
  | 'MELEE_OR_THROWN'
  | 'DEPLOY_OR_THROWN'
  | 'MELEE_OR_SHIELD'
  | 'SKILL_OR_SHIELD'
  | 'RANGED_BOW_OR_CROSSBOW'
  | 'SHIELD_ONLY'
  | 'MELEE_ONLY'
  | 'HEAVY_ONLY';

export type AffixId =
  | 'afx_dmg_on_bleed'
  | 'afx_dmg_on_poison'
  | 'afx_dmg_on_burn'
  | 'afx_dmg_on_oil_burn'
  | 'afx_dmg_on_frozen'
  | 'afx_dmg_on_shock'
  | 'afx_dmg_on_stun_root'
  | 'afx_coat_blade_oil'
  | 'afx_ignite_on_crit'
  | 'afx_bleed_spread_kill'
  | 'afx_toxic_cloud_hit'
  | 'afx_freeze_blast_kill'
  | 'afx_shock_on_dodge'
  | 'afx_oil_fire_trail'
  | 'afx_pierce_first'
  | 'afx_shield_parry_poison'
  | 'afx_grenade_voltaic_net'
  | 'afx_leech_elite_hit'
  | 'afx_glass_crucible'
  | 'afx_breach_shockwave';

export interface ElementStatusSpec {
  readonly id: ElementStatusKey;
  readonly nameZh: string;
  readonly badge: string;
  readonly hex: string;
  readonly durationSec: number;
  readonly eliteDurationSec: number;
  readonly maxStacks: number;
  readonly tickIntervalSec: number | null;
  readonly baseTickDamage: number;
  readonly moveSpeedPenaltyRatio: number;
}

/** 六大元素异常状态精确参数表（docs/02 §3.5.1） */
export const ELEMENT_STATUS_SPECS: Readonly<Record<ElementStatusKey, ElementStatusSpec>> = {
  oiled: {
    id: 'oiled',
    nameZh: '炼金黑油',
    badge: 'OIL',
    hex: '#4C1D95',
    durationSec: 8.0,
    eliteDurationSec: 8.0,
    maxStacks: 1,
    tickIntervalSec: null,
    baseTickDamage: 0,
    moveSpeedPenaltyRatio: 0.15,
  },
  ignited: {
    id: 'ignited',
    nameZh: '炽热燃烧',
    badge: 'BRN',
    hex: '#FF5E2B',
    durationSec: 4.5,
    eliteDurationSec: 4.5,
    maxStacks: 5,
    tickIntervalSec: 0.33,
    baseTickDamage: 8,
    moveSpeedPenaltyRatio: 0,
  },
  bleeding: {
    id: 'bleeding',
    nameZh: '锯齿流血',
    badge: 'BLD',
    hex: '#E11D48',
    durationSec: 5.0,
    eliteDurationSec: 5.0,
    maxStacks: 5,
    tickIntervalSec: 0.4,
    baseTickDamage: 10,
    moveSpeedPenaltyRatio: 0,
  },
  frozen: {
    id: 'frozen',
    nameZh: '液氮冰冻',
    badge: 'FRZ',
    hex: '#67E8F9',
    durationSec: 3.2,
    eliteDurationSec: 1.8,
    maxStacks: 1,
    tickIntervalSec: null,
    baseTickDamage: 18,
    moveSpeedPenaltyRatio: 1.0,
  },
  electrified: {
    id: 'electrified',
    nameZh: '发条感电',
    badge: 'SHK',
    hex: '#38BDF8',
    durationSec: 4.0,
    eliteDurationSec: 4.0,
    maxStacks: 3,
    tickIntervalSec: 0.5,
    baseTickDamage: 12,
    moveSpeedPenaltyRatio: 0,
  },
  poisoned: {
    id: 'poisoned',
    nameZh: '矾酸毒蚀',
    badge: 'PSN',
    hex: '#3CE682',
    durationSec: 6.0,
    eliteDurationSec: 6.0,
    maxStacks: 8,
    tickIntervalSec: 0.5,
    baseTickDamage: 7,
    moveSpeedPenaltyRatio: 0,
  },
} as const;

/** 六大跨元素化学反应精确倍率与半径常量（docs/02 §3.5.1） */
export const CHEMICAL_REACTION_CONSTANTS = {
  // ① 油 + 火 -> 炼金紫火（燃烧每跳翻倍 2.0×，持续时间刷新至 6.0s）
  VIOLET_NAPALM_BURN_MULT: 2.0,
  VIOLET_NAPALM_DURATION_SEC: 6.0,
  // 油 + 冰 -> 冰冻延长 +1.5s
  OIL_EXTEND_FROZEN_SEC: 1.5,
  // ② 火 + 冰 -> 热震爆裂（解除冰冻，瞬间结算剩余寒冰+火焰总值的 180%）
  THERMAL_SHOCK_BURST_MULT: 1.8,
  // ③ 5 层流血 -> 大动脉崩裂（清空全部层数，一次性引爆剩余总流血伤的 135%）
  HEMORRHAGE_MAX_STACKS: 5,
  HEMORRHAGE_BURST_MULT: 1.35,
  // ④ 重击破冰 -> 脆性碎裂（破冰一击获额外 +40% 独立碎冰乘区，残留 3.0s 寒霜减速）
  BRITTLE_SHATTER_BONUS_RATIO: 0.4,
  BRITTLE_RESIDUAL_SLOW_SEC: 3.0,
  // ⑤ 电 + 潮湿/油/毒 -> 电解超导（传导半径翻倍 96px -> 192px，且电击必暴 2.0×）
  SHOCK_BASE_CHAIN_RADIUS_PX: 96,
  SHOCK_SURGE_CHAIN_RADIUS_PX: 192,
  SHOCK_CHAIN_DAMAGE_RATIO: 0.45,
  SHOCK_SURGE_CRIT_MULT: 2.0,
  // ⑥ 毒(>=3层) + 紫火 -> 矾毒爆燃（消耗毒层触发 104px 剧毒烈焰爆炸）
  VITRIOL_DETONATION_MIN_POISON_STACKS: 3,
  VITRIOL_DETONATION_RADIUS_PX: 104,
  VITRIOL_DETONATION_BASE_PER_STACK: 28,
  // 矾酸毒蚀每层削弱护甲全易伤 +3%（满 8 层 +24%）
  POISON_VULNERABILITY_PER_STACK: 0.03,
} as const;

export type SynergySemanticTag =
  | 'bleed'
  | 'poison'
  | 'fire'
  | 'violet_napalm'
  | 'oil'
  | 'freeze'
  | 'shock'
  | 'stun_root';

export interface AffixDefinition {
  readonly id: AffixId;
  readonly index: number;
  readonly rarity: AffixRarity;
  readonly slotFilter: AffixSlotFilter;
  readonly mutexGroup: string;
  readonly labelZh: string;
  readonly conditionalDmgBonus: number;
  readonly isGlassDoubleDamage: boolean;
  readonly incomingDamagePenaltyRatio: number;
  readonly piercesFirstTarget: boolean;
  readonly providesTags: readonly SynergySemanticTag[];
  readonly consumesTags: readonly SynergySemanticTag[];
}

/** 20 条完整武器/技能词条全量配表（严禁缩略，100% 对齐 docs/02 §3.5.2 #01 ~ #20） */
export const AFFIX_CATALOG: readonly AffixDefinition[] = [
  {
    id: 'afx_dmg_on_bleed',
    index: 1,
    rarity: 'COMMON',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_bleed',
    labelZh: '对【流血】状态的目标造成 +60% 伤害',
    conditionalDmgBonus: 0.6,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['bleed'],
  },
  {
    id: 'afx_dmg_on_poison',
    index: 2,
    rarity: 'COMMON',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_poison',
    labelZh: '对【矾毒】状态的目标造成 +80% 伤害',
    conditionalDmgBonus: 0.8,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['poison'],
  },
  {
    id: 'afx_dmg_on_burn',
    index: 3,
    rarity: 'COMMON',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_burn',
    labelZh: '对【燃烧】状态的目标造成 +40% 伤害',
    conditionalDmgBonus: 0.4,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['fire', 'violet_napalm'],
  },
  {
    id: 'afx_dmg_on_oil_burn',
    index: 4,
    rarity: 'RARE',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_burn',
    labelZh: '★ 对处于【炼金紫火（燃烧油污）】的目标造成 +100% 伤害',
    conditionalDmgBonus: 1.0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['violet_napalm', 'oil'],
  },
  {
    id: 'afx_dmg_on_frozen',
    index: 5,
    rarity: 'RARE',
    slotFilter: 'HEAVY_OR_CROSSBOW',
    mutexGroup: 'grp_cond_freeze',
    labelZh: '★ 对【冰冻】状态的目标造成 +175% 伤害',
    conditionalDmgBonus: 1.75,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['freeze'],
  },
  {
    id: 'afx_dmg_on_shock',
    index: 6,
    rarity: 'COMMON',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_shock',
    labelZh: '对【感电】状态的目标造成 +50% 伤害',
    conditionalDmgBonus: 0.5,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['shock'],
  },
  {
    id: 'afx_dmg_on_stun_root',
    index: 7,
    rarity: 'COMMON',
    slotFilter: 'ALL_GEAR',
    mutexGroup: 'grp_cond_cc',
    labelZh: '对【眩晕】或【定身】的目标造成 +70% 伤害',
    conditionalDmgBonus: 0.7,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: ['stun_root'],
  },
  {
    id: 'afx_coat_blade_oil',
    index: 8,
    rarity: 'COMMON',
    slotFilter: 'MELEE_OR_RANGED_BOW',
    mutexGroup: 'grp_imbue',
    labelZh: '攻击命中时为目标涂抹【炼金黑油】（持续 8.0s）',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['oil', 'violet_napalm'],
    consumesTags: ['fire'],
  },
  {
    id: 'afx_ignite_on_crit',
    index: 9,
    rarity: 'RARE',
    slotFilter: 'ALL_WEAPONS',
    mutexGroup: 'grp_imbue',
    labelZh: '★ 每次触发暴击时使目标叠加 2 层【燃烧】',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['fire', 'violet_napalm'],
    consumesTags: ['oil'],
  },
  {
    id: 'afx_bleed_spread_kill',
    index: 10,
    rarity: 'RARE',
    slotFilter: 'MELEE_OR_THROWN',
    mutexGroup: 'grp_on_kill',
    labelZh: '★ 击败敌人时将其【流血】与【矾毒】传染给周围 112px 敌人',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['bleed', 'poison'],
    consumesTags: ['bleed', 'poison'],
  },
  {
    id: 'afx_toxic_cloud_hit',
    index: 11,
    rarity: 'RARE',
    slotFilter: 'DEPLOY_OR_THROWN',
    mutexGroup: 'grp_aoe_emit',
    labelZh: '★ 技能激活时释放 88px【矾酸毒雾】（每秒叠 2 层矾毒，持续 4s）',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['poison'],
    consumesTags: [],
  },
  {
    id: 'afx_freeze_blast_kill',
    index: 12,
    rarity: 'COMMON',
    slotFilter: 'MELEE_OR_SHIELD',
    mutexGroup: 'grp_on_kill',
    labelZh: '击败敌人时迸发寒霜新星，将周围 80px 敌人【冰冻 2.0s】',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['freeze'],
    consumesTags: [],
  },
  {
    id: 'afx_shock_on_dodge',
    index: 13,
    rarity: 'COMMON',
    slotFilter: 'SKILL_OR_SHIELD',
    mutexGroup: 'grp_dodge_fx',
    labelZh: '翻滚穿过敌人时施加 2 层【感电】并落下一枚微型电弧球',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['shock'],
    consumesTags: [],
  },
  {
    id: 'afx_oil_fire_trail',
    index: 14,
    rarity: 'RARE',
    slotFilter: 'SKILL_OR_SHIELD',
    mutexGroup: 'grp_dodge_fx',
    labelZh: '★ 翻滚路径上留下一道持续 3.0s 的【炼金紫火径】',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['fire', 'violet_napalm'],
    consumesTags: ['poison'],
  },
  {
    id: 'afx_pierce_first',
    index: 15,
    rarity: 'COMMON',
    slotFilter: 'RANGED_BOW_OR_CROSSBOW',
    mutexGroup: 'grp_proj_mod',
    labelZh: '发射的箭矢/钢钉穿透第 1 个命中的敌人（伤害不衰减）',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: true,
    providesTags: [],
    consumesTags: [],
  },
  {
    id: 'afx_shield_parry_poison',
    index: 16,
    rarity: 'COMMON',
    slotFilter: 'SHIELD_ONLY',
    mutexGroup: 'grp_parry_mod',
    labelZh: '成功招架时向周围喷射腐蚀毒雾，施加 4 层【矾毒】',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['poison', 'stun_root'],
    consumesTags: [],
  },
  {
    id: 'afx_grenade_voltaic_net',
    index: 17,
    rarity: 'COMMON',
    slotFilter: 'DEPLOY_OR_THROWN',
    mutexGroup: 'grp_aoe_emit',
    labelZh: '技能结束或炮台损毁时过载自爆（100px 造成 120% 电伤 + 3 层感电）',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['shock'],
    consumesTags: [],
  },
  {
    id: 'afx_leech_elite_hit',
    index: 18,
    rarity: 'LEGENDARY',
    slotFilter: 'MELEE_ONLY',
    mutexGroup: 'grp_risk_reward',
    labelZh: '★★ 每次暴击恢复 1.0% 最大生命值，但自身承受伤害 +100%',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 1.0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: [],
  },
  {
    id: 'afx_glass_crucible',
    index: 19,
    rarity: 'LEGENDARY',
    slotFilter: 'ALL_WEAPONS',
    mutexGroup: 'grp_risk_reward',
    labelZh: '★★ 武器最终伤害 +100%（双倍伤！），同时角色承受伤害 +100%',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: true,
    incomingDamagePenaltyRatio: 1.0,
    piercesFirstTarget: false,
    providesTags: [],
    consumesTags: [],
  },
  {
    id: 'afx_breach_shockwave',
    index: 20,
    rarity: 'RARE',
    slotFilter: 'HEAVY_ONLY',
    mutexGroup: 'grp_heavy_mod',
    labelZh: '★ 击破敌人韧性眩晕时，降下星界落雷造成 85% 基础伤并施加感电',
    conditionalDmgBonus: 0,
    isGlassDoubleDamage: false,
    incomingDamagePenaltyRatio: 0,
    piercesFirstTarget: false,
    providesTags: ['shock', 'stun_root'],
    consumesTags: [],
  },
] as const;

export const AFFIX_BY_ID: Readonly<Record<AffixId, AffixDefinition>> = AFFIX_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<AffixId, AffixDefinition>
);

export const ALL_AFFIX_IDS: readonly AffixId[] = AFFIX_CATALOG.map((a) => a.id);
