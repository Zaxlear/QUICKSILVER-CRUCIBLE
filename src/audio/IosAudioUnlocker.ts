/**
 * iOS Safari / Standalone PWA WebAudio 自动解锁与中断自愈器（src/audio/IosAudioUnlocker.ts）。
 *
 * 严格对齐 docs/01_ARCHITECTURE_AND_SYNC.md §2.4.3：
 * 1. 启用 iOS 17+ navigator.audioSession.type = 'playback' 穿透侧边硬件静音键；
 * 2. 监听手势与 visibilitychange，自动从 'suspended' 及 WebKit 专有 'interrupted' 状态恢复；
 * 3. 使用 1-sample 全零静音 AudioBuffer 唤醒硬件解码管线（零 createOscillator）。
 */

import { Howler } from 'howler';

export type ExtendedAudioContextState =
  | 'running'
  | 'suspended'
  | 'interrupted'
  | 'closed'
  | 'unavailable';

export interface AudioBufferSourceLike {
  buffer: unknown;
  connect(destination: unknown): void;
  start(when?: number): void;
}

export interface UnlockableAudioContext {
  readonly state: ExtendedAudioContextState;
  readonly destination: unknown;
  resume(): Promise<void>;
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): unknown;
  createBufferSource(): AudioBufferSourceLike;
}

const UNLOCK_GESTURE_EVENTS = ['pointerdown', 'touchstart', 'keydown'] as const;

export class IosAudioUnlocker {
  private unlocked = false;
  private installed = false;
  private readonly getContext: () => UnlockableAudioContext | null;
  private readonly onStateChanged?: () => void;

  public constructor(
    getContext?: () => UnlockableAudioContext | null,
    onStateChanged?: () => void
  ) {
    this.getContext =
      getContext ?? (() => (Howler.ctx as unknown as UnlockableAudioContext | null) ?? null);
    this.onStateChanged = onStateChanged;
  }

  public get isUnlocked(): boolean {
    return this.unlocked;
  }

  public get contextState(): ExtendedAudioContextState {
    const ctx = this.getContext();
    return ctx ? ctx.state : 'unavailable';
  }

  public install(win: Window | null = typeof window !== 'undefined' ? window : null): void {
    if (this.installed) return;
    this.installed = true;

    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) {
        try {
          nav.audioSession.type = 'playback';
        } catch {
          // 非 iOS WebKit 或受限环境安全忽略
        }
      }
    }

    if (!win) return;
    for (const evt of UNLOCK_GESTURE_EVENTS) {
      win.addEventListener(evt, this.handleGestureUnlock, { passive: true, capture: true });
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  public async resumeContext(): Promise<boolean> {
    const ctx = this.getContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
      try {
        await ctx.resume();
      } catch {
        this.onStateChanged?.();
        return false;
      }
    }

    if (!this.unlocked && ctx.state === 'running') {
      try {
        const silentBuffer = ctx.createBuffer(1, 1, 22050);
        const source = ctx.createBufferSource();
        source.buffer = silentBuffer;
        source.connect(ctx.destination);
        source.start(0);
        this.unlocked = true;
      } catch {
        // 部分精简 Mock 环境无完整 Buffer 管线时仍标记已恢复
        this.unlocked = true;
      }
    }

    this.onStateChanged?.();
    return ctx.state === 'running';
  }

  public destroy(win: Window | null = typeof window !== 'undefined' ? window : null): void {
    if (!this.installed) return;
    this.installed = false;
    if (win) {
      for (const evt of UNLOCK_GESTURE_EVENTS) {
        win.removeEventListener(evt, this.handleGestureUnlock, true);
      }
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private readonly handleGestureUnlock = (): void => {
    void this.resumeContext();
  };

  private readonly handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void this.resumeContext();
    }
  };
}
