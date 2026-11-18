import { MOBILE_HOME_SAFE_BOTTOM_PX, MOBILE_LANDSCAPE_SAFE_X_PX } from '../core/Constants';
import type { ViewportSnapshotPayload } from '../core/EventBus';
import {
  ERGONOMIC_TOUCH_ARC_SPECS,
  TOUCH_PAD_METRICS,
  type ActionId,
  type TouchButtonHudItem,
} from '../data/playerKinematics.data';

export interface StickDriftState {
  originX: number;
  originY: number;
  knobX: number;
  knobY: number;
  moveX: number;
  moveY: number;
}

/**
 * 触控人体工学弧形按键几何布局与 48px 跟手漂移摇杆纯数学求解器。
 * 独立于 DOM 事件监听，供 TouchVirtualPadProvider 与单元测试直接调用。
 */
export function computeRestingStickOrigin(viewport: ViewportSnapshotPayload): {
  readonly x: number;
  readonly y: number;
} {
  const leftSafe = Math.max(viewport.safeInsets.left, MOBILE_LANDSCAPE_SAFE_X_PX);
  const bottomSafe = Math.max(viewport.safeInsets.bottom, MOBILE_HOME_SAFE_BOTTOM_PX);
  return {
    x: leftSafe + 68,
    y: Math.max(120, viewport.cssHeight - bottomSafe - 72),
  };
}

export function clampInitialStickSpawn(
  viewport: ViewportSnapshotPayload,
  rawX: number,
  rawY: number
): { readonly x: number; readonly y: number } {
  const splitX = viewport.cssWidth * TOUCH_PAD_METRICS.LEFT_ZONE_WIDTH_RATIO;
  const leftSafe = Math.max(viewport.safeInsets.left, 24) + 32;
  const bottomLimit =
    viewport.cssHeight -
    Math.max(viewport.safeInsets.bottom, MOBILE_HOME_SAFE_BOTTOM_PX) -
    32;
  return {
    x: Math.max(leftSafe, Math.min(splitX - 36, rawX)),
    y: Math.max(72, Math.min(bottomLimit, rawY)),
  };
}

export function buildErgonomicArcButtons(
  viewport: ViewportSnapshotPayload,
  isPressedFn: (action: ActionId) => boolean
): TouchButtonHudItem[] {
  const rightSafe = Math.max(viewport.safeInsets.right, MOBILE_LANDSCAPE_SAFE_X_PX);
  const bottomSafe = Math.max(viewport.safeInsets.bottom, MOBILE_HOME_SAFE_BOTTOM_PX);
  const anchorX = viewport.cssWidth - rightSafe;
  const anchorY = viewport.cssHeight - bottomSafe;

  return ERGONOMIC_TOUCH_ARC_SPECS.map((spec) => ({
    action: spec.action,
    label: spec.label,
    centerX: Math.round(anchorX - spec.offsetRightPx),
    centerY: Math.round(anchorY - spec.offsetBottomPx),
    radiusPx: spec.radiusPx,
    spriteSlot: spec.spriteSlot,
    pressed: isPressedFn(spec.action),
    accentRole: spec.accentRole,
  }));
}

export function solveFloatingStickStep(
  state: StickDriftState,
  fingerX: number,
  fingerY: number
): void {
  let dx = fingerX - state.originX;
  let dy = fingerY - state.originY;
  let dist = Math.hypot(dx, dy);

  const driftCap = TOUCH_PAD_METRICS.STICK_ORIGIN_DRIFT_LIMIT_PX;
  if (dist > driftCap) {
    const excess = dist - driftCap;
    state.originX += (dx / dist) * excess;
    state.originY += (dy / dist) * excess;
    dx = fingerX - state.originX;
    dy = fingerY - state.originY;
    dist = Math.hypot(dx, dy);
  }

  const maxR = TOUCH_PAD_METRICS.STICK_MAX_RADIUS_PX;
  const clampedR = Math.min(dist, maxR);
  state.knobX = dist > 1e-4 ? state.originX + (dx / dist) * clampedR : state.originX;
  state.knobY = dist > 1e-4 ? state.originY + (dy / dist) * clampedR : state.originY;

  if (dist <= TOUCH_PAD_METRICS.STICK_DEADZONE_PX) {
    state.moveX = 0;
    state.moveY = 0;
    return;
  }

  const norm = Math.min(
    1,
    (dist - TOUCH_PAD_METRICS.STICK_DEADZONE_PX) /
      (maxR - TOUCH_PAD_METRICS.STICK_DEADZONE_PX)
  );
  state.moveX = (dx / dist) * norm;
  state.moveY = (dy / dist) * norm;
}

export function hitTestTouchArcButton(
  buttons: readonly TouchButtonHudItem[],
  x: number,
  y: number,
  slopPx: number
): ActionId | null {
  let best: ActionId | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < buttons.length; i++) {
    const btn = buttons[i]!;
    const d = Math.hypot(x - btn.centerX, y - btn.centerY);
    if (d <= btn.radiusPx + slopPx && d < bestDist) {
      bestDist = d;
      best = btn.action;
    }
  }
  return best;
}
