import type { ViewportSnapshotPayload } from '../core/EventBus';
import {
  TOUCH_PAD_METRICS,
  type ActionId,
  type InputDeviceKind,
  type TouchButtonHudItem,
  type TouchHudSnapshot,
} from '../data/playerKinematics.data';
import { actionBit, type IInputProvider, type RawDeviceSample } from './InputTypes';
import {
  buildErgonomicArcButtons,
  clampInitialStickSpawn,
  computeRestingStickOrigin,
  hitTestTouchArcButton,
  solveFloatingStickStep,
  type StickDriftState,
} from './TouchPadGeometry';

function isUiButtonElement(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  return Boolean((target as Element).closest('[data-ui-interactive="true"]'));
}

/**
 * 移动端自适应多点触控虚拟手柄采样器（左半屏 48px 漂移浮动摇杆 + 右半屏弧形热区 + Slide-to-Cancel）。
 */
export class TouchVirtualPadProvider implements IInputProvider {
  public readonly kind = 'TOUCH' as const;

  private viewport: ViewportSnapshotPayload;
  private stickPointerId: number | null = null;
  private readonly stick: StickDriftState = {
    originX: 132,
    originY: 278,
    knobX: 132,
    knobY: 278,
    moveX: 0,
    moveY: 0,
  };

  private readonly rightPointerActions = new Map<number, ActionId>();
  private buttons: TouchButtonHudItem[] = [];
  private latchedPressMask = 0;
  private hadRecentTouch = false;
  private hudDirty = true;
  private readonly win: Window | null;

  public constructor(
    initialViewport: ViewportSnapshotPayload,
    win: Window | null = typeof window !== 'undefined' ? window : null
  ) {
    this.viewport = initialViewport;
    this.win = win;
    this.recomputeLayout();

    if (this.win) {
      this.win.addEventListener('pointerdown', this.onPointerDown);
      this.win.addEventListener('pointermove', this.onPointerMove);
      this.win.addEventListener('pointerup', this.onPointerUp);
      this.win.addEventListener('pointercancel', this.onPointerUp);
      this.win.addEventListener('blur', this.resetState);
    }
  }

  public get isMobileTouchViewport(): boolean {
    return this.viewport.tier === 'TIER_3_MOBILE_EXPAND';
  }

  public updateViewport(nextViewport: ViewportSnapshotPayload): void {
    this.viewport = nextViewport;
    this.recomputeLayout();
    this.hudDirty = true;
  }

  public consumeHudDirty(): boolean {
    const d = this.hudDirty;
    this.hudDirty = false;
    return d;
  }

  public buildHudSnapshot(activeDevice: InputDeviceKind): TouchHudSnapshot {
    return {
      visible: activeDevice === 'TOUCH' || this.isMobileTouchViewport,
      activeDevice,
      stick: {
        active: this.stickPointerId !== null,
        originX: Math.round(this.stick.originX),
        originY: Math.round(this.stick.originY),
        knobX: Math.round(this.stick.knobX),
        knobY: Math.round(this.stick.knobY),
        moveX: Number(this.stick.moveX.toFixed(3)),
        moveY: Number(this.stick.moveY.toFixed(3)),
      },
      buttons: this.buttons,
    };
  }

  public injectPointer(
    type: 'down' | 'move' | 'up',
    pointerId: number,
    clientX: number,
    clientY: number
  ): void {
    if (type === 'down') this.handleDown(pointerId, clientX, clientY);
    else if (type === 'move') this.handleMove(pointerId, clientX, clientY);
    else this.handleUp(pointerId);
  }

  public sampleInto(out: RawDeviceSample): void {
    out.moveX = this.stick.moveX;
    out.moveY = this.stick.moveY;
    const len = Math.hypot(this.stick.moveX, this.stick.moveY);
    if (len > 0.15) {
      out.aimX = this.stick.moveX / len;
      out.aimY = this.stick.moveY / len;
    }

    let mask = 0;
    for (const act of this.rightPointerActions.values()) mask |= actionBit(act);

    out.heldMask = mask;
    out.latchedPressMask = this.latchedPressMask;
    out.hadActivity = this.hadRecentTouch || this.stickPointerId !== null || mask !== 0;

    this.latchedPressMask = 0;
    this.hadRecentTouch = false;
  }

  public readonly resetState = (): void => {
    this.stickPointerId = null;
    this.stick.moveX = 0;
    this.stick.moveY = 0;
    this.stick.knobX = this.stick.originX;
    this.stick.knobY = this.stick.originY;
    this.rightPointerActions.clear();
    this.latchedPressMask = 0;
    this.syncPressedFlags();
    this.hudDirty = true;
  };

  public destroy(): void {
    if (!this.win) return;
    this.win.removeEventListener('pointerdown', this.onPointerDown);
    this.win.removeEventListener('pointermove', this.onPointerMove);
    this.win.removeEventListener('pointerup', this.onPointerUp);
    this.win.removeEventListener('pointercancel', this.onPointerUp);
    this.win.removeEventListener('blur', this.resetState);
  }

  private recomputeLayout(): void {
    if (this.stickPointerId === null) {
      const rest = computeRestingStickOrigin(this.viewport);
      this.stick.originX = rest.x;
      this.stick.originY = rest.y;
      this.stick.knobX = rest.x;
      this.stick.knobY = rest.y;
    }
    this.syncPressedFlags();
  }

  private handleDown(pointerId: number, x: number, y: number): void {
    this.hadRecentTouch = true;
    const splitX = this.viewport.cssWidth * TOUCH_PAD_METRICS.LEFT_ZONE_WIDTH_RATIO;

    if (x < splitX && this.stickPointerId === null) {
      const clamped = clampInitialStickSpawn(this.viewport, x, y);
      this.stickPointerId = pointerId;
      this.stick.originX = clamped.x;
      this.stick.originY = clamped.y;
      solveFloatingStickStep(this.stick, x, y);
      this.hudDirty = true;
      return;
    }

    const hit = hitTestTouchArcButton(this.buttons, x, y, 10);
    if (hit) {
      this.rightPointerActions.set(pointerId, hit);
      this.latchedPressMask |= actionBit(hit);
      this.syncPressedFlags();
      this.hudDirty = true;
    }
  }

  private handleMove(pointerId: number, x: number, y: number): void {
    if (pointerId === this.stickPointerId) {
      this.hadRecentTouch = true;
      solveFloatingStickStep(this.stick, x, y);
      this.hudDirty = true;
      return;
    }

    const prevAct = this.rightPointerActions.get(pointerId) ?? null;
    if (!prevAct) return;
    const nextAct = hitTestTouchArcButton(this.buttons, x, y, 10);
    if (nextAct && nextAct !== prevAct) {
      this.rightPointerActions.set(pointerId, nextAct);
      this.latchedPressMask |= actionBit(nextAct);
      this.hadRecentTouch = true;
      this.syncPressedFlags();
      this.hudDirty = true;
    }
  }

  private handleUp(pointerId: number): void {
    if (pointerId === this.stickPointerId) {
      this.stickPointerId = null;
      this.stick.moveX = 0;
      this.stick.moveY = 0;
      this.stick.knobX = this.stick.originX;
      this.stick.knobY = this.stick.originY;
      this.hudDirty = true;
      return;
    }
    if (this.rightPointerActions.delete(pointerId)) {
      this.syncPressedFlags();
      this.hudDirty = true;
    }
  }

  private syncPressedFlags(): void {
    this.buttons = buildErgonomicArcButtons(this.viewport, (act) => {
      for (const held of this.rightPointerActions.values()) {
        if (held === act) return true;
      }
      return false;
    });
  }

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (isUiButtonElement(ev.target)) return;
    if (ev.pointerType !== 'touch' && ev.pointerType !== 'pen' && !this.isMobileTouchViewport) return;
    this.handleDown(ev.pointerId, ev.clientX, ev.clientY);
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.stickPointerId && !this.rightPointerActions.has(ev.pointerId)) return;
    this.handleMove(ev.pointerId, ev.clientX, ev.clientY);
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    this.handleUp(ev.pointerId);
  };
}
