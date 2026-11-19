/**
 * 基于永恒大熔炉（+ / ++ / S）灵液灌注进度的装备等级与淬火阶确定性抽签器
 * （src/entities/player/ForgeGradeRoller.ts）。
 *
 * 100% 对齐 docs/06_BETA_1_0_2_DEVELOPMENT_PLAN.md §2.6 概率数学模型，行数严格 <= 120 行。
 */

import type { DeterministicRng } from '../../core/DeterministicRng';
import { ECONOMY_CONSTANTS } from '../../data/economy.data';
import type { ForgeTierProgressMap } from '../../data/storage.data';
import {
  ALL_STAT_COLORS,
  QUALITY_TIERS,
  type ForgeGrade,
  type QualityTier,
  type StatColor,
} from '../../data/weapons.data';

export interface ForgeGradeProbabilityDistribution {
  readonly pS: number;
  readonly pDoublePlus: number;
  readonly pPlus: number;
  readonly pBase: number;
}

/** 计算基础品质等级 L ∈ {I..VI}（普通掉落 vs 精英/商店/受诅咒秘匣 +1 阶） */
export function computeLootQualityTier(
  biomeDepth: 1 | 2 | 3 | 4,
  crucibleHeat = 0,
  isElevatedSource = false
): QualityTier {
  const heatBonus = Math.floor(Math.max(0, crucibleHeat) / 2);
  const rawLevel = biomeDepth + (isElevatedSource ? 1 : 0) + heatBonus;
  const clamped = Math.max(1, Math.min(6, rawLevel));
  return QUALITY_TIERS[clamped - 1] ?? 'I';
}

/** 计算给定大熔炉灵液灌注进度下的淬火阶精确概率分布 */
export function computeForgeGradeProbabilities(
  forgeTiers: ForgeTierProgressMap,
  biomeDepth: 1 | 2 | 3 | 4,
  crucibleHeat = 0
): ForgeGradeProbabilityDistribution {
  const h = Math.max(0, Math.min(5, Math.floor(crucibleHeat)));
  const d = Math.max(1, Math.min(4, Math.floor(biomeDepth)));

  const rPlus = Math.min(1, Math.max(0, forgeTiers.plus_tier_ichor) / ECONOMY_CONSTANTS.FORGE_PLUS_MAX_ICHOR);
  const rPP = Math.min(1, Math.max(0, forgeTiers.pp_tier_ichor ?? 0) / ECONOMY_CONSTANTS.FORGE_PP_MAX_ICHOR);
  const rS = Math.min(1, Math.max(0, forgeTiers.s_tier_ichor) / ECONOMY_CONSTANTS.FORGE_S_MAX_ICHOR);

  const pS = Math.min(0.6, 0.5 * rS + 0.05 * Math.max(0, h - 2));
  const pDoublePlus = (1 - pS) * Math.min(0.85, 0.65 * rPP + 0.06 * h);
  const plusConditional = Math.min(1.0, rPlus + 0.08 * (d - 1) + 0.1 * h);
  const pPlus = (1 - pS - pDoublePlus) * plusConditional;
  const pBase = plusConditional >= 1.0 ? 0 : Math.max(0, 1 - pS - pDoublePlus - pPlus);

  return { pS, pDoublePlus, pPlus, pBase };
}

/** 使用 lootRng 确定性抽取装备淬火阶（当 plus_tier_ichor >= 800 时 100% 零白板保底 + 级） */
export function rollForgeGrade(
  lootRng: DeterministicRng,
  forgeTiers: ForgeTierProgressMap,
  biomeDepth: 1 | 2 | 3 | 4,
  crucibleHeat = 0
): ForgeGrade {
  const dist = computeForgeGradeProbabilities(forgeTiers, biomeDepth, crucibleHeat);
  const u = lootRng.nextFloat();
  if (u < dist.pS) return 'S';
  if (u < dist.pS + dist.pDoublePlus) return 'DOUBLE_PLUS';
  if (dist.pBase <= 0 || u < dist.pS + dist.pDoublePlus + dist.pPlus) return 'PLUS';
  return 'BASE';
}

/** 一站式抽取掉落/商店装备的品质等级与淬火阶 */
export function rollDynamicGearTierAndGrade(
  lootRng: DeterministicRng,
  forgeTiers: ForgeTierProgressMap,
  biomeDepth: 1 | 2 | 3 | 4,
  crucibleHeat = 0,
  isElevatedSource = false
): { readonly level: QualityTier; readonly forgeGrade: ForgeGrade } {
  return {
    level: computeLootQualityTier(biomeDepth, crucibleHeat, isElevatedSource),
    forgeGrade: rollForgeGrade(lootRng, forgeTiers, biomeDepth, crucibleHeat),
  };
}

/** 为无色传奇武器实时解析当前角色最高属性系（同分按赤 -> 黄 -> 白稳定决胜） */
export function resolveHighestStatColor(stats: Readonly<Record<StatColor, number>>): StatColor {
  let best: StatColor = 'rubedo';
  let bestVal = stats.rubedo;
  for (const col of ALL_STAT_COLORS) {
    if (stats[col] > bestVal) {
      bestVal = stats[col];
      best = col;
    }
  }
  return best;
}
