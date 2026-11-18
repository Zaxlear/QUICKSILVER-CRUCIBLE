/**
 * 12 种局内变异周期跳伤（倒钩箭簇 / 绝对零度霜蚀）与拔箭引爆纯解算辅助模块
 * （src/combat/MutationFormulaEvaluator.ts）。
 */

import { MUTATION_MATH, type MutationId } from '../data/mutations.data';
import type { StatColor } from '../data/weapons.data';
import type { CombatTargetView } from './CombatTypes';
import type { StatusEffectMachine } from './StatusEffectMachine';

export interface BarbedAndFrostTickDamage {
  readonly targetId: string;
  readonly amount: number;
  readonly worldX: number;
  readonly worldY: number;
}

/** #08 水银倒钩箭簇：拔回箭矢瞬间引爆总额 120% 的撕裂伤 */
export function evaluateBarbedRipOutDamage(
  activeIds: readonly MutationId[],
  stats: Readonly<Record<StatColor, number>>,
  rippedCount: number
): number {
  if (rippedCount <= 0 || !activeIds.includes('mut_barbed_tips')) return 0;
  const clamped = Math.min(8, rippedCount);
  return Math.max(
    1,
    Math.round(clamped * MUTATION_MATH.barbedTipsTickDmgPerArrow(stats.citrinitas) * 1.2)
  );
}

/** 每 0.5s 周期结算 #08 倒钩箭簇刮骨与 #11 绝对零度霜蚀持续寒霜伤害 */
export function collectPeriodicMutationTicks(
  activeIds: readonly MutationId[],
  stats: Readonly<Record<StatColor, number>>,
  targets: readonly CombatTargetView[],
  statusMachine: StatusEffectMachine,
  getEmbeddedArrows: (targetId: string) => number,
  outTicks: BarbedAndFrostTickDamage[]
): void {
  const hasBarbed = activeIds.includes('mut_barbed_tips');
  const hasFrost = activeIds.includes('mut_frostbite_shatter');
  if (!hasBarbed && !hasFrost) return;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (!t.isAlive) continue;
    const cy = t.y - t.height * 0.5;

    if (hasBarbed) {
      const arrows = Math.min(8, getEmbeddedArrows(t.id));
      if (arrows > 0) {
        outTicks.push({
          targetId: t.id,
          amount: Math.max(
            1,
            Math.round(arrows * MUTATION_MATH.barbedTipsTickDmgPerArrow(stats.citrinitas))
          ),
          worldX: t.x,
          worldY: cy,
        });
      }
    }

    if (hasFrost && statusMachine.isSlowedOrFrozen(t.id)) {
      outTicks.push({
        targetId: t.id,
        amount: Math.max(1, Math.round(MUTATION_MATH.frostbiteDps(stats.albedo) * 0.5)),
        worldX: t.x,
        worldY: cy,
      });
    }
  }
}
