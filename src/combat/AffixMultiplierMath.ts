/**
 * 20 条词条条件增伤加算池、玻璃坩埚双倍伤乘区与双倍承伤惩罚纯函数计算器
 * （src/combat/AffixMultiplierMath.ts）。
 *
 * 严格遵循单向依赖铁律：零状态、零副作用，同时供 DamageCalculator 与 AffixSynergyEngine 复用。
 */

import { AFFIX_BY_ID, type AffixId } from '../data/affixes.data';

export interface TargetStatusSnapshotForAffix {
  readonly isBleeding: boolean;
  readonly isPoisoned: boolean;
  readonly isIgnited: boolean;
  readonly isVioletNapalm: boolean;
  readonly isFrozen: boolean;
  readonly isElectrified: boolean;
  readonly isStunnedOrRooted: boolean;
}

export const EMPTY_TARGET_STATUS_FOR_AFFIX: TargetStatusSnapshotForAffix = {
  isBleeding: false,
  isPoisoned: false,
  isIgnited: false,
  isVioletNapalm: false,
  isFrozen: false,
  isElectrified: false,
  isStunnedOrRooted: false,
};

/**
 * 汇总全部 20 条词条的命中伤害倍率（docs/02 §3.5.2 #01~#07 & #19）：
 * - 条件增伤词条进入同一加算池 (1.0 + sum)；
 * - #19 afx_glass_crucible 作为独立 2.0× 最终伤害乘区。
 */
export function evaluateAffixDamageMultiplier(
  affixIds: readonly string[],
  target: TargetStatusSnapshotForAffix
): number {
  let additiveBonus = 0;
  let finalProduct = 1.0;
  const hasOilBurnAfx = affixIds.includes('afx_dmg_on_oil_burn');

  for (let i = 0; i < affixIds.length; i++) {
    const id = affixIds[i] as AffixId;
    switch (id) {
      case 'afx_dmg_on_bleed':
        if (target.isBleeding) additiveBonus += 0.6;
        break;
      case 'afx_dmg_on_poison':
        if (target.isPoisoned) additiveBonus += 0.8;
        break;
      case 'afx_dmg_on_oil_burn':
        if (target.isVioletNapalm) additiveBonus += 1.0;
        break;
      case 'afx_dmg_on_burn':
        if (!(hasOilBurnAfx && target.isVioletNapalm) && (target.isIgnited || target.isVioletNapalm)) {
          additiveBonus += 0.4;
        }
        break;
      case 'afx_dmg_on_frozen':
        if (target.isFrozen) additiveBonus += 1.75;
        break;
      case 'afx_dmg_on_shock':
        if (target.isElectrified) additiveBonus += 0.5;
        break;
      case 'afx_dmg_on_stun_root':
        if (target.isStunnedOrRooted) additiveBonus += 0.7;
        break;
      case 'afx_glass_crucible':
        finalProduct *= 2.0;
        break;
      default:
        break;
    }
  }

  return Number(((1.0 + additiveBonus) * finalProduct).toFixed(4));
}

/** 计算角色装备传奇词条（#18 嗜血暴击回血 / #19 玻璃坩埚）带来的承受伤害惩罚倍率 */
export function computeAffixIncomingDamageMultiplier(equippedAffixIds: readonly string[]): number {
  let extraRatio = 0;
  for (let i = 0; i < equippedAffixIds.length; i++) {
    const spec = AFFIX_BY_ID[equippedAffixIds[i] as AffixId];
    if (spec && spec.incomingDamagePenaltyRatio > 0) {
      extraRatio += spec.incomingDamagePenaltyRatio;
    }
  }
  return 1.0 + extraRatio;
}
