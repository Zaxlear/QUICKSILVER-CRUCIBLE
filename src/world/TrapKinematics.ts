/**
 * 环境周期机关纯数学相位与碰撞盒求解器（src/world/TrapKinematics.ts）。
 * 零 Phaser 依赖，供 TrapController 与无头确定性单测共享复用。
 */

import { TRAP_BEHAVIOR_SPECS } from '../data/runes.data';
import type { TrapSlotSpec } from './RoomChunkSchema';

export type TrapCyclePhase = 'DORMANT' | 'WARNING' | 'ACTIVE';

export interface TrapPhaseResult {
  readonly phase: TrapCyclePhase;
  readonly cycleProgress: number;
  readonly pendulumAngleRad: number;
}

export interface TrapAabbPx {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function evaluateTrapPhase(trap: TrapSlotSpec, simTimeMs: number): TrapPhaseResult {
  const spec = TRAP_BEHAVIOR_SPECS[trap.trapType];
  const period = Math.max(200, trap.cyclePeriodMs || spec.defaultCycleMs);
  const localMs = (((simTimeMs + trap.phaseOffsetMs) % period) + period) % period;
  const progress = localMs / period;

  if (trap.trapType === 'SPIKE_BED') {
    return { phase: 'ACTIVE', cycleProgress: progress, pendulumAngleRad: 0 };
  }
  if (trap.trapType === 'PENDULUM_BLADE') {
    return {
      phase: 'ACTIVE',
      cycleProgress: progress,
      pendulumAngleRad: Math.sin(progress * Math.PI * 2) * 0.88,
    };
  }

  const warnStart = period - spec.warningDurationMs - spec.activeDurationMs;
  const activeStart = period - spec.activeDurationMs;
  if (localMs >= activeStart) {
    return { phase: 'ACTIVE', cycleProgress: progress, pendulumAngleRad: 0 };
  }
  if (localMs >= Math.max(0, warnStart)) {
    return { phase: 'WARNING', cycleProgress: progress, pendulumAngleRad: 0 };
  }
  return { phase: 'DORMANT', cycleProgress: progress, pendulumAngleRad: 0 };
}

export function computeTrapActiveHitbox(
  trap: TrapSlotSpec,
  baseX: number,
  baseY: number,
  widthPx: number,
  state: TrapPhaseResult
): TrapAabbPx {
  switch (trap.trapType) {
    case 'SPIKE_BED':
      return { x0: baseX + 2, y0: baseY - 11, x1: baseX + widthPx - 2, y1: baseY };
    case 'ACID_GEYSER':
      return { x0: baseX + 4, y0: baseY - 104, x1: baseX + widthPx - 4, y1: baseY };
    case 'FLAME_NOZZLE':
      return { x0: baseX + widthPx * 0.5 - 8, y0: baseY - 78, x1: baseX + widthPx * 0.5 + 8, y1: baseY };
    case 'PENDULUM_BLADE': {
      const pivotX = baseX + widthPx * 0.5;
      const pivotY = baseY - 64;
      const tipX = pivotX - Math.sin(state.pendulumAngleRad) * 56;
      const tipY = pivotY + Math.cos(state.pendulumAngleRad) * 56;
      return { x0: tipX - 14, y0: tipY - 12, x1: tipX + 14, y1: tipY + 10 };
    }
    case 'VOLTAIC_ARC_GATE':
      return { x0: baseX + widthPx * 0.5 - 6, y0: baseY - 60, x1: baseX + widthPx * 0.5 + 6, y1: baseY };
  }
}
