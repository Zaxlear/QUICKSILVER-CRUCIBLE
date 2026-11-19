/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》全部 12 种局内变异（Mutations）与
 * 永恒锻炉圣所灵液升级纯数据配表（src/data/mutations.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时依赖，100% 对齐 docs/02_COMBAT_AND_ROGUELITE_SPEC.md §3.4 & §3.6.2。
 */

import type { StatColor } from './weapons.data';

export type MutationId =
  | 'mut_crimson_frenzy'
  | 'mut_open_wounds'
  | 'mut_predator_veil'
  | 'mut_scorch_execution'
  | 'mut_point_blank'
  | 'mut_tactical_reload'
  | 'mut_support_resonance'
  | 'mut_barbed_tips'
  | 'mut_mercury_ward'
  | 'mut_gastronomy_distill'
  | 'mut_frostbite_shatter'
  | 'mut_emergency_carapace';

export const MAX_EQUIPPED_MUTATIONS = 3;

export interface MutationDefinition {
  readonly id: MutationId;
  readonly index: number;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly faction: StatColor;
  /** 对应 weapon_icons_sheet.png 内的 32x32 槽位索引（22 ~ 33） */
  readonly iconSlot: number;
  readonly roleTagZh: string;
  readonly formulaSummaryZh: string;
}

export const ALL_MUTATION_IDS: readonly MutationId[] = [
  'mut_crimson_frenzy',
  'mut_open_wounds',
  'mut_predator_veil',
  'mut_scorch_execution',
  'mut_point_blank',
  'mut_tactical_reload',
  'mut_support_resonance',
  'mut_barbed_tips',
  'mut_mercury_ward',
  'mut_gastronomy_distill',
  'mut_frostbite_shatter',
  'mut_emergency_carapace',
] as const;

/** 全部 12 种局内变异配表（docs/02 §3.4 #01 ~ #12） */
export const MUTATION_CATALOG: Readonly<Record<MutationId, MutationDefinition>> = {
  mut_crimson_frenzy: {
    id: 'mut_crimson_frenzy',
    index: 1,
    nameZh: '狂血饥渴',
    nameEn: 'Crimson Frenzy',
    faction: 'rubedo',
    iconSlot: 22,
    roleTagZh: '高速跑图续航',
    formulaSummaryZh: '击杀获 5.0s 疾走 (+25% 移速)；疾走期每次近战命中回复 min(2.2%, 0.55%+0.11%×R) MaxHP。',
  },
  mut_open_wounds: {
    id: 'mut_open_wounds',
    index: 2,
    nameZh: '撕裂锯齿',
    nameEn: 'Serrated Open Wounds',
    faction: 'rubedo',
    iconSlot: 23,
    roleTagZh: '无条件挂流血',
    formulaSummaryZh: '每次近战武器命中必定额外施加 1 层【流血】，每跳基础 DPS = 14 × 1.15^(R-1)。',
  },
  mut_predator_veil: {
    id: 'mut_predator_veil',
    index: 3,
    nameZh: '水银光学拟态',
    nameEn: 'Predator Quicksilver Veil',
    faction: 'rubedo',
    iconSlot: 24,
    roleTagZh: '背刺隐身质变',
    formulaSummaryZh: '近战击杀进入 2.8s 光学隐身，破隐首击伤害提升 min(110%, 35%+5%×R)。',
  },
  mut_scorch_execution: {
    id: 'mut_scorch_execution',
    index: 4,
    nameZh: '大煅烧处决',
    nameEn: 'Great Calcination Execution',
    faction: 'rubedo',
    iconSlot: 25,
    roleTagZh: '残血熔毁斩杀',
    formulaSummaryZh: '普通/精英怪 HP < 16%（Boss < 6%）且携燃烧或流血时，直接攻击立即熔毁斩杀并 80px 传层！',
  },
  mut_point_blank: {
    id: 'mut_point_blank',
    index: 5,
    nameZh: '贴脸炼金铳术',
    nameEn: 'Point-Blank Alchemy',
    faction: 'citrinitas',
    iconSlot: 26,
    roleTagZh: '近身远程爆发',
    formulaSummaryZh: '远程武器命中 ≤96px 近身敌人时，最终伤害独立乘算 ×(1 + min(0.75, 0.28+0.03×C))。',
  },
  mut_tactical_reload: {
    id: 'mut_tactical_reload',
    index: 6,
    nameZh: '发条超频齿轮',
    nameEn: 'Overclocked Escapement',
    faction: 'citrinitas',
    iconSlot: 27,
    roleTagZh: '暴击极速刷技能',
    formulaSummaryZh: '每次触发暴击立即缩减双技能剩余 CD min(1.6s, 0.45s+0.07s×C)（内置间隔 0.20s）。',
  },
  mut_support_resonance: {
    id: 'mut_support_resonance',
    index: 7,
    nameZh: '哨塔以太共鸣',
    nameEn: 'Turret Aether Resonance',
    faction: 'citrinitas',
    iconSlot: 28,
    roleTagZh: '阵地攻坚增伤',
    formulaSummaryZh: '距离己方部署陷阱或哨塔 ≤180px 时，全部武器伤害提升 min(65%, 22%+2.8%×C)。',
  },
  mut_barbed_tips: {
    id: 'mut_barbed_tips',
    index: 8,
    nameZh: '水银倒钩箭簇',
    nameEn: 'Barbed Mercury Tips',
    faction: 'citrinitas',
    iconSlot: 29,
    roleTagZh: '插矢持续刮骨',
    formulaSummaryZh: '体内每支箭矢/钢钉（上限 8）每 0.5s 造成 9×1.15^(C-1) 伤害；拔箭瞬间引爆 120% 撕裂伤。',
  },
  mut_mercury_ward: {
    id: 'mut_mercury_ward',
    index: 9,
    nameZh: '镜面虹吸反击',
    nameEn: 'Mirror Siphon Ward',
    faction: 'albedo',
    iconSlot: 30,
    roleTagZh: '盾反攻防一体',
    formulaSummaryZh: '黄金招架回复 min(7.5%, 2.2%+0.32%×A) MaxHP（单怪 3s CD），3s 内下次近战附加 65×1.15^(A-1) 水银伤。',
  },
  mut_gastronomy_distill: {
    id: 'mut_gastronomy_distill',
    index: 10,
    nameZh: '高纯度二次蒸馏',
    nameEn: 'Double-Distilled Gastronomy',
    faction: 'albedo',
    iconSlot: 31,
    roleTagZh: '续航转永久增伤',
    formulaSummaryZh: '灵液瓶与食物恢复量 +65%；满血提炼每次永久累加 +8% 武器伤害（上限 6 层 +48%）。',
  },
  mut_frostbite_shatter: {
    id: 'mut_frostbite_shatter',
    index: 11,
    nameZh: '绝对零度霜蚀',
    nameEn: 'Absolute Zero Frostbite',
    faction: 'albedo',
    iconSlot: 32,
    roleTagZh: '控杀传染寒霜',
    formulaSummaryZh: '减速或冰冻敌人每秒受 22×1.15^(A-1) 寒霜伤；受控死亡时将控制传染周围 96px 敌人。',
  },
  mut_emergency_carapace: {
    id: 'mut_emergency_carapace',
    index: 12,
    nameZh: '水银应急凝壳',
    nameEn: 'Emergency Mercury Carapace',
    faction: 'albedo',
    iconSlot: 33,
    roleTagZh: '防秒杀锁血底牌',
    formulaSummaryZh: 'HP > 25% 受致命伤时强制锁 1 HP，震退全场并获 2.0s 绝对无敌（饮药或击杀 35 怪重置）。',
  },
} as const;

/** 根据角色当前三系卷轴等级（R / C / A）实时计算全部 12 变异精确动态数值（docs/02 §3.4） */
export const MUTATION_MATH = {
  frenzyHealRatio: (rubedo: number): number => Math.min(0.022, 0.0055 + 0.0011 * rubedo),
  openWoundsBleedDps: (rubedo: number): number => 14 * Math.pow(1.15, Math.max(0, rubedo - 1)),
  predatorVeilBonusRatio: (rubedo: number): number => Math.min(1.1, 0.35 + 0.05 * rubedo),
  pointBlankMultiplier: (citrinitas: number): number =>
    1 + Math.min(0.75, 0.28 + 0.03 * citrinitas),
  tacticalReloadCdSec: (citrinitas: number): number =>
    Math.min(1.6, 0.45 + 0.07 * citrinitas),
  supportResonanceBonusRatio: (citrinitas: number): number =>
    Math.min(0.65, 0.22 + 0.028 * citrinitas),
  barbedTipsTickDmgPerArrow: (citrinitas: number): number =>
    9 * Math.pow(1.15, Math.max(0, citrinitas - 1)),
  mercuryWardHealRatio: (albedo: number): number => Math.min(0.075, 0.022 + 0.0032 * albedo),
  mercuryWardHolyDmg: (albedo: number): number => 65 * Math.pow(1.15, Math.max(0, albedo - 1)),
  frostbiteDps: (albedo: number): number => 22 * Math.pow(1.15, Math.max(0, albedo - 1)),
} as const;

export function formatMutationLiveEffectZh(
  id: MutationId,
  stats: Readonly<Record<StatColor, number>>
): string {
  const R = stats.rubedo;
  const C = stats.citrinitas;
  const A = stats.albedo;
  switch (id) {
    case 'mut_crimson_frenzy':
      return `击杀 5s 移速 +25%，近战命中回血 ${(MUTATION_MATH.frenzyHealRatio(R) * 100).toFixed(2)}% MaxHP`;
    case 'mut_open_wounds':
      return `近战命中必叠 1 层流血（当前 ${Math.round(MUTATION_MATH.openWoundsBleedDps(R))} DPS）`;
    case 'mut_predator_veil':
      return `近战击杀 2.8s 光学隐身，破隐一击增伤 +${Math.round(MUTATION_MATH.predatorVeilBonusRatio(R) * 100)}%`;
    case 'mut_scorch_execution':
      return '普通/精英 HP < 16%（Boss < 6%）携火/血时直接熔毁处决并 80px 传层';
    case 'mut_point_blank':
      return `远程 ≤96px 贴脸独立增伤 ×${MUTATION_MATH.pointBlankMultiplier(C).toFixed(2)}`;
    case 'mut_tactical_reload':
      return `暴击立即缩减双技能 CD -${MUTATION_MATH.tacticalReloadCdSec(C).toFixed(2)}s（0.2s 间隔）`;
    case 'mut_support_resonance':
      return `距己方哨塔/陷阱 ≤180px 时全武器增伤 +${Math.round(MUTATION_MATH.supportResonanceBonusRatio(C) * 100)}%`;
    case 'mut_barbed_tips':
      return `插矢每 0.5s 刮骨 ${Math.round(MUTATION_MATH.barbedTipsTickDmgPerArrow(C))}/支，拔箭引爆 120%`;
    case 'mut_mercury_ward':
      return `盾反回血 ${(MUTATION_MATH.mercuryWardHealRatio(A) * 100).toFixed(1)}% MaxHP，下次近战 +${Math.round(MUTATION_MATH.mercuryWardHolyDmg(A))} 水银伤`;
    case 'mut_gastronomy_distill':
      return '药瓶/食物恢复 +65%，满血提炼每层永久 +8% 武器伤（最高 +48%）';
    case 'mut_frostbite_shatter':
      return `冰冻/减速目标承受 ${Math.round(MUTATION_MATH.frostbiteDps(A))} DPS 寒霜伤，死亡 96px 传染`;
    case 'mut_emergency_carapace':
      return 'HP > 25% 致死攻击强制锁 1 HP 并获 2.0s 无敌帧（饮药或 35 杀充能）';
  }
}

export type ForgeUpgradeId =
  | 'upg_flask_tier'
  | 'upg_gold_reserve'
  | 'upg_starting_recycle'
  | 'upg_starter_tubes'
  | 'upg_shop_restock'
  | 'upg_legendary_forge_plus'
  | 'upg_legendary_forge_pp'
  | 'upg_legendary_forge_s';

export interface ForgeUpgradeSpec {
  readonly id: ForgeUpgradeId;
  readonly nameZh: string;
  readonly descZh: string;
  readonly maxIchor: number;
  readonly stepIchor: number;
}

/** 永恒锻炉圣所灵液灌注项目表（docs/02 §3.6.2 & docs/06 §2.1~§2.6） */
export const ETERNAL_FORGE_UPGRADES: readonly ForgeUpgradeSpec[] = [
  {
    id: 'upg_flask_tier',
    nameZh: '贤者灵液瓶充能阶梯',
    descZh: '永久提升局内回血药瓶可饮用次数上限（最高 4 口，每口回复 60% MaxHP）。',
    maxIchor: 120,
    stepIchor: 35,
  },
  {
    id: 'upg_gold_reserve',
    nameZh: '秘银金库袋（阵亡保金）',
    descZh: '永久死亡重返圣所时，按阶梯最高保留 800 / 2,000 / 4,000 / 7,500 G。',
    maxIchor: 200,
    stepIchor: 50,
  },
  {
    id: 'upg_starting_recycle',
    nameZh: '高阶炼金回收熔解术',
    descZh: '地面无用装备长按 [R] 熔解回收折算率由基础 45% 永久提升至 75%。',
    maxIchor: 100,
    stepIchor: 50,
  },
  {
    id: 'upg_starter_tubes',
    nameZh: '圣所多管悬吊槽',
    descZh: '圣所出发管前额外降下多套开局 I 阶武器与技能供挑选换装。',
    maxIchor: 120,
    stepIchor: 60,
  },
  {
    id: 'upg_shop_restock',
    nameZh: '军械商付费刷新许可',
    descZh: '解锁每间商店最多 3 次付费刷新货架特权（120G -> 240G -> 420G）。',
    maxIchor: 120,
    stepIchor: 60,
  },
  {
    id: 'upg_legendary_forge_plus',
    nameZh: '大熔炉：+ 级淬火池',
    descZh: '提高全局掉落与商店装备直接升阶为 + 级（满 800 灵液 100% 保底 + 级）的概率。',
    maxIchor: 800,
    stepIchor: 40,
  },
  {
    id: 'upg_legendary_forge_pp',
    nameZh: '大熔炉：++ 级精炼池',
    descZh: '提高全局装备直接升阶为 ++ 级（等效等级 +4、+1 卷轴属性、3 词条）的概率。',
    maxIchor: 1800,
    stepIchor: 60,
  },
  {
    id: 'upg_legendary_forge_s',
    nameZh: '大熔炉：S 级贤者之石',
    descZh: '提高全局装备直接升阶为最高 S 级（等效等级 +6、+2 卷轴属性、必带 ★ 词条）的概率。',
    maxIchor: 3600,
    stepIchor: 80,
  },
] as const;

export interface MutationForgeModalPayload {
  readonly open: boolean;
  readonly stats: Readonly<Record<StatColor, number>>;
  readonly gold: number;
  readonly respecCostGold: number;
  readonly carriedIchor: number;
  readonly equippedMutationIds: readonly MutationId[];
  readonly unlockedMutationIds?: readonly MutationId[];
  readonly forgeProgress: Readonly<Record<ForgeUpgradeId, number>>;
}
