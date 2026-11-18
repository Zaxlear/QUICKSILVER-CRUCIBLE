import { EventBus, type ViewportSnapshotPayload } from '../core/EventBus';
import {
  ALL_ACTION_IDS,
  PLAYER_KINEMATICS,
  TOUCH_PAD_METRICS,
  type ActionId,
  type InputDeviceKind,
} from '../data/playerKinematics.data';
import { GamepadProvider } from './GamepadProvider';
import { actionBit, createEmptyDeviceSample, type IInputReader } from './InputTypes';
import { KeyboardMouseProvider } from './KeyboardMouseProvider';
import { TouchVirtualPadProvider } from './TouchVirtualPadProvider';

function defaultBufferWindowFor(action: ActionId): number {
  return action === 'jump'
    ? PLAYER_KINEMATICS.JUMP_BUFFER_TICKS
    : PLAYER_KINEMATICS.ACTION_BUFFER_TICKS;
}

/**
 * 全局统一输入抽象层与外设无感热切换仲裁器（src/input/ActionMap.ts）。
 * 统一在 120Hz ClockController.fixedSimStep 首部调用 sampleFixedTick()。
 */
export class ActionMap implements IInputReader {
  public readonly keyboardMouse: KeyboardMouseProvider;
  public readonly gamepad: GamepadProvider;
  public readonly touchPad: TouchVirtualPadProvider;

  private readonly kbmSample = createEmptyDeviceSample();
  private readonly padSample = createEmptyDeviceSample();
  private readonly touchSample = createEmptyDeviceSample();

  private readonly bufferAgeTicks = new Int16Array(ALL_ACTION_IDS.length);
  private readonly bufferActiveFlags = new Uint8Array(ALL_ACTION_IDS.length);

  private currentDevice: InputDeviceKind;
  private prevHeldMask = 0;
  private currHeldMask = 0;
  private justPressedMask = 0;
  private justReleasedMask = 0;

  private axisMoveX = 0;
  private axisMoveY = 0;
  private axisAimX = 1;
  private axisAimY = 0;
  private readonly unbindViewport: () => void;

  public constructor(
    initialViewport: ViewportSnapshotPayload,
    providers?: {
      readonly keyboardMouse?: KeyboardMouseProvider;
      readonly gamepad?: GamepadProvider;
      readonly touchPad?: TouchVirtualPadProvider;
    }
  ) {
    this.keyboardMouse = providers?.keyboardMouse ?? new KeyboardMouseProvider();
    this.gamepad = providers?.gamepad ?? new GamepadProvider();
    this.touchPad = providers?.touchPad ?? new TouchVirtualPadProvider(initialViewport);

    const isMobileTier = initialViewport.tier === 'TIER_3_MOBILE_EXPAND';
    this.currentDevice = isMobileTier ? 'TOUCH' : 'KEYBOARD_MOUSE';
    this.keyboardMouse.setSuppressMouseButtons(isMobileTier);

    this.unbindViewport = EventBus.on('system:viewport_changed', (vp) => {
      this.touchPad.updateViewport(vp);
      const mobile = vp.tier === 'TIER_3_MOBILE_EXPAND';
      this.keyboardMouse.setSuppressMouseButtons(mobile);
      if (mobile && this.currentDevice !== 'TOUCH') {
        this.switchDevice('TOUCH');
      }
      this.publishTouchHud();
    });

    this.publishTouchHud();
  }

  public get activeDevice(): InputDeviceKind {
    return this.currentDevice;
  }

  public get moveX(): number {
    return this.axisMoveX;
  }

  public get moveY(): number {
    return this.axisMoveY;
  }

  public get aimX(): number {
    return this.axisAimX;
  }

  public get aimY(): number {
    return this.axisAimY;
  }

  public get isCrouchHeld(): boolean {
    return this.axisMoveY >= TOUCH_PAD_METRICS.CROUCH_AXIS_THRESHOLD;
  }

  public sampleFixedTick(): void {
    this.keyboardMouse.sampleInto(this.kbmSample);
    this.gamepad.sampleInto(this.padSample);
    this.touchPad.sampleInto(this.touchSample);

    if (this.touchSample.hadActivity) this.switchDevice('TOUCH');
    else if (this.padSample.hadActivity) this.switchDevice('GAMEPAD');
    else if (this.kbmSample.hadActivity) this.switchDevice('KEYBOARD_MOUSE');

    const mergedHeld =
      this.kbmSample.heldMask | this.padSample.heldMask | this.touchSample.heldMask;
    const mergedLatched =
      this.kbmSample.latchedPressMask |
      this.padSample.latchedPressMask |
      this.touchSample.latchedPressMask;

    const effectiveHeld = mergedHeld | mergedLatched;
    this.justPressedMask = (effectiveHeld & ~this.prevHeldMask) | mergedLatched;
    this.justReleasedMask = ~effectiveHeld & this.prevHeldMask;
    this.currHeldMask = effectiveHeld;
    this.prevHeldMask = effectiveHeld;

    const primary =
      this.currentDevice === 'TOUCH'
        ? this.touchSample
        : this.currentDevice === 'GAMEPAD'
          ? this.padSample
          : this.kbmSample;

    if (Math.hypot(primary.moveX, primary.moveY) > 0.01) {
      this.axisMoveX = primary.moveX;
      this.axisMoveY = primary.moveY;
    } else if (Math.hypot(this.kbmSample.moveX, this.kbmSample.moveY) > 0.01) {
      this.axisMoveX = this.kbmSample.moveX;
      this.axisMoveY = this.kbmSample.moveY;
    } else {
      this.axisMoveX = 0;
      this.axisMoveY = 0;
    }

    this.axisAimX = primary.aimX;
    this.axisAimY = primary.aimY;

    for (let i = 0; i < ALL_ACTION_IDS.length; i++) {
      const act = ALL_ACTION_IDS[i]!;
      if ((this.justPressedMask & actionBit(act)) !== 0) {
        this.bufferActiveFlags[i] = 1;
        this.bufferAgeTicks[i] = 0;
      } else if (this.bufferActiveFlags[i] === 1) {
        const nextAge = this.bufferAgeTicks[i]! + 1;
        if (nextAge >= defaultBufferWindowFor(act)) {
          this.bufferActiveFlags[i] = 0;
          this.bufferAgeTicks[i] = 0;
        } else {
          this.bufferAgeTicks[i] = nextAge;
        }
      }
    }

    if (this.touchPad.consumeHudDirty()) {
      this.publishTouchHud();
    }
  }

  public isHeld(action: ActionId): boolean {
    return (this.currHeldMask & actionBit(action)) !== 0;
  }

  public wasJustPressed(action: ActionId): boolean {
    return (this.justPressedMask & actionBit(action)) !== 0;
  }

  public wasJustReleased(action: ActionId): boolean {
    return (this.justReleasedMask & actionBit(action)) !== 0;
  }

  public peekBuffered(action: ActionId, maxWindowTicks?: number): boolean {
    const idx = ALL_ACTION_IDS.indexOf(action);
    if (idx < 0 || this.bufferActiveFlags[idx] !== 1) return false;
    return this.bufferAgeTicks[idx]! < (maxWindowTicks ?? defaultBufferWindowFor(action));
  }

  public consumeBuffered(action: ActionId, maxWindowTicks?: number): boolean {
    if (!this.peekBuffered(action, maxWindowTicks)) return false;
    this.clearActionBuffer(action);
    return true;
  }

  public clearActionBuffer(action: ActionId): void {
    const idx = ALL_ACTION_IDS.indexOf(action);
    if (idx >= 0) {
      this.bufferActiveFlags[idx] = 0;
      this.bufferAgeTicks[idx] = 0;
    }
  }

  public resetAll(): void {
    this.prevHeldMask = 0;
    this.currHeldMask = 0;
    this.justPressedMask = 0;
    this.justReleasedMask = 0;
    this.axisMoveX = 0;
    this.axisMoveY = 0;
    this.bufferActiveFlags.fill(0);
    this.bufferAgeTicks.fill(0);
    this.keyboardMouse.resetState();
    this.gamepad.resetState();
    this.touchPad.resetState();
    this.publishTouchHud();
  }

  public destroy(): void {
    this.unbindViewport();
    this.keyboardMouse.destroy();
    this.gamepad.destroy();
    this.touchPad.destroy();
  }

  private switchDevice(next: InputDeviceKind): void {
    if (this.currentDevice === next) return;
    this.currentDevice = next;
    EventBus.emit('input:device_changed', { device: next });
    this.publishTouchHud();
  }

  private publishTouchHud(): void {
    EventBus.emit('input:touch_hud_updated', this.touchPad.buildHudSnapshot(this.currentDevice));
  }
}
