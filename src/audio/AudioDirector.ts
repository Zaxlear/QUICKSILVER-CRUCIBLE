/**
 * 音频总控调度器（src/audio/AudioDirector.ts）：
 * 组装 IosAudioUnlocker、WebAudioFilterRack、AdaptiveStemMixer、SfxPoolPlayer，
 * 管理暂停菜单仲裁、闭屏期间 FFT/遥测休眠降耗与手势解锁后分片预热高频战斗音效。
 */

import { Howler } from 'howler';
import { EventBus, type TypedEventBus } from '../core/EventBus';
import {
  AUDIO_PROGRAM_CATALOG,
  type AudioTelemetrySnapshot,
  type AudioUserSettings,
  type SfxGroupId,
} from '../data/audio.data';
import { AdaptiveStemMixer } from './AdaptiveStemMixer';
import {
  bindAudioEventRoutes,
  loadPersistedAudioSettings,
  savePersistedAudioSettings,
  startCombatSfxPrewarmQueue,
} from './AudioEventRouter';
import { IosAudioUnlocker } from './IosAudioUnlocker';
import { SfxPoolPlayer } from './SfxPoolPlayer';
import { WebAudioFilterRack } from './WebAudioFilterRack';

declare global {
  interface Window {
    __QC_AUDIO_STATE__?: AudioTelemetrySnapshot;
  }
}

export interface AudioDirectorDeps {
  readonly bus?: TypedEventBus;
  readonly unlocker?: IosAudioUnlocker;
  readonly filterRack?: WebAudioFilterRack;
  readonly stemMixer?: AdaptiveStemMixer;
  readonly sfxPool?: SfxPoolPlayer;
}

export class AudioDirector {
  public readonly unlocker: IosAudioUnlocker;
  public readonly filterRack: WebAudioFilterRack;
  public readonly stemMixer: AdaptiveStemMixer;
  public readonly sfxPool: SfxPoolPlayer;
  private readonly bus: TypedEventBus;

  private settings: AudioUserSettings;
  private activeSceneKey = 'SanctumHubScene';
  private listenerX = 320;
  private pauseMenuOpen = false;
  private portraitLocked = false;
  private subModalMask = 0;
  private rafId = 0;
  private lastRafMs = 0;
  private elapsedSec = 0;
  private prevGamepadStartDown = false;
  private gamepadEverConnected = false;
  private cancelPrewarm: (() => void) | null = null;
  private mountedWin: Window | null = null;
  private readonly unsubs: Array<() => void> = [];

  public constructor(deps?: AudioDirectorDeps) {
    this.bus = deps?.bus ?? EventBus;
    this.filterRack = deps?.filterRack ?? new WebAudioFilterRack();
    this.stemMixer = deps?.stemMixer ?? new AdaptiveStemMixer();
    this.sfxPool = deps?.sfxPool ?? new SfxPoolPlayer();
    this.unlocker =
      deps?.unlocker ??
      new IosAudioUnlocker(undefined, () => {
        this.filterRack.ensureAttached();
        this.stemMixer.ensurePlayingAfterUnlock();
        if (this.mountedWin && !this.cancelPrewarm) {
          this.cancelPrewarm = startCombatSfxPrewarmQueue(this.sfxPool, () => Boolean(this.mountedWin));
        }
        this.publishState();
      });
    this.settings = loadPersistedAudioSettings();
  }

  public get isPauseMenuOpen(): boolean { return this.pauseMenuOpen; }
  public get currentSettings(): AudioUserSettings { return this.settings; }

  public mount(win: Window | null = typeof window !== 'undefined' ? window : null): void {
    this.mountedWin = win;
    this.applyHowlerMasterGain();
    this.unlocker.install(win);
    this.stemMixer.setProgram('sanctum', 1, this.effectiveBgmGain);

    this.unsubs.push(
      ...bindAudioEventRoutes({
        bus: this.bus, stemMixer: this.stemMixer, filterRack: this.filterRack,
        getEffectiveBgmGain: () => this.effectiveBgmGain,
        triggerSfx: (sfxId, wx) => this.triggerSfx(sfxId, wx),
        setActiveSceneKey: (key) => { this.activeSceneKey = key; },
        setListenerX: (x) => { this.listenerX = x; },
        setPortraitLocked: (locked) => { this.portraitLocked = locked; },
        setSubModalOpen: (bit, open) => {
          if (open) this.subModalMask |= 1 << bit;
          else this.subModalMask &= ~(1 << bit);
        },
        setPauseMenuOpen: (open) => this.setPauseMenuOpen(open),
        togglePauseMenu: (open) => this.setPauseMenuOpen(open ?? !this.pauseMenuOpen),
      }),
      this.bus.on('ui:command:update_audio_settings', (patch) => this.updateSettings(patch))
    );

    if (win) {
      win.addEventListener('keydown', this.handleWindowKeyDown);
      win.addEventListener('gamepadconnected', this.handleGamepadConnected);
      if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
        for (const p of navigator.getGamepads()) if (p?.connected) this.gamepadEverConnected = true;
      }
      this.lastRafMs = win.performance.now();
      const loop = (nowMs: number): void => {
        const dtMs = Math.min(100, Math.max(0, nowMs - this.lastRafMs));
        this.lastRafMs = nowMs;
        if (this.gamepadEverConnected) this.pollGamepadPauseButton();
        this.step(dtMs, nowMs);
        this.rafId = win.requestAnimationFrame(loop);
      };
      this.rafId = win.requestAnimationFrame(loop);
    }
    this.publishState();
  }

  public step(dtMs: number, nowMs = Date.now()): void {
    const dtSec = dtMs / 1000;
    this.elapsedSec += dtSec;
    this.stemMixer.step(dtMs, this.effectiveBgmGain);

    const filterRamping = Math.abs(this.filterRack.currentCutoffHz - this.filterRack.targetCutoffHz) > 1;
    if (this.pauseMenuOpen || filterRamping) {
      const musicEnergy = this.settings.muted
        ? 0
        : Math.max(this.stemMixer.exploreVolume, this.stemMixer.combatVolume) * this.settings.masterVolume;
      this.filterRack.step(dtSec, musicEnergy, this.elapsedSec);
    }
    if (this.pauseMenuOpen && (Math.floor(nowMs / 65) !== Math.floor((nowMs - dtMs) / 65) || dtMs >= 65)) {
      this.publishState();
    }
  }

  public triggerSfx(sfxId: SfxGroupId, worldX?: number, nowMs = Date.now()): void {
    if (this.settings.muted) return;
    this.sfxPool.play(sfxId, this.settings.masterVolume * this.settings.sfxVolume, nowMs, worldX, this.listenerX);
  }

  public updateSettings(patch: Partial<AudioUserSettings>): void {
    this.settings = {
      masterVolume: patch.masterVolume !== undefined ? Math.max(0, Math.min(1, patch.masterVolume)) : this.settings.masterVolume,
      bgmVolume: patch.bgmVolume !== undefined ? Math.max(0, Math.min(1, patch.bgmVolume)) : this.settings.bgmVolume,
      sfxVolume: patch.sfxVolume !== undefined ? Math.max(0, Math.min(1, patch.sfxVolume)) : this.settings.sfxVolume,
      muted: patch.muted !== undefined ? patch.muted : this.settings.muted,
    };
    this.applyHowlerMasterGain();
    savePersistedAudioSettings(this.settings);
    this.stemMixer.step(0, this.effectiveBgmGain);
    this.publishState();
  }

  public setPauseMenuOpen(nextOpen: boolean): void {
    if (this.pauseMenuOpen === nextOpen) return;
    this.pauseMenuOpen = nextOpen;
    this.filterRack.setMuffleState({ pauseMenu: nextOpen });
    this.triggerSfx('sfx_ui_confirm_cancel');
    this.bus.emit('ui:pause_menu_updated', { open: nextOpen, activeSceneKey: this.activeSceneKey });
    this.publishState();
  }

  public snapshotTelemetry(): AudioTelemetrySnapshot {
    const prog = AUDIO_PROGRAM_CATALOG[this.stemMixer.programId];
    return {
      contextState: this.unlocker.contextState, iosUnlocked: this.unlocker.isUnlocked,
      programId: prog.id, programTitleZh: prog.titleZh, bpm: prog.bpm, timeSignature: prog.timeSignature,
      activeBossPhase: this.stemMixer.currentBossPhase, aggroCount: this.stemMixer.currentAggroCount,
      combatWeight: this.stemMixer.currentCombatWeight, exploreVolume: this.stemMixer.exploreVolume,
      combatVolume: this.stemMixer.combatVolume, stemPhaseDriftMs: this.stemMixer.stemPhaseDriftMs,
      isLowHpMuffled: this.filterRack.isLowHpActive, isPauseMenuMuffled: this.filterRack.isPauseMenuActive,
      lowHpPulseActive: this.filterRack.isLowHpActive, lowHpPulseVolume: this.stemMixer.lowHpPulseVolume,
      lowpassTargetHz: this.filterRack.targetCutoffHz, lowpassCurrentHz: this.filterRack.currentCutoffHz,
      activeSfxVoices: this.sfxPool.activeVoiceCount, lastTriggeredSfx: this.sfxPool.lastTriggeredSfx,
      lastSfxRate: this.sfxPool.lastTriggeredRate, lastSfxVariant: this.sfxPool.lastTriggeredVariant,
      spectrumBars: [...this.filterRack.spectrumBars], lowBandEnergy: this.filterRack.lowBandEnergy,
      highBandEnergy: this.filterRack.highBandEnergy, settings: { ...this.settings },
    };
  }

  public destroy(win: Window | null = typeof window !== 'undefined' ? window : null): void {
    this.cancelPrewarm?.();
    this.cancelPrewarm = null;
    if (win) {
      win.removeEventListener('keydown', this.handleWindowKeyDown);
      win.removeEventListener('gamepadconnected', this.handleGamepadConnected);
      if (this.rafId) win.cancelAnimationFrame(this.rafId);
    }
    this.mountedWin = null;
    while (this.unsubs.length > 0) this.unsubs.pop()?.();
    this.unlocker.destroy(win);
    this.stemMixer.destroy();
    this.sfxPool.destroy();
  }

  private get effectiveBgmGain(): number {
    return this.settings.muted ? 0 : this.settings.masterVolume * this.settings.bgmVolume;
  }

  private readonly handleGamepadConnected = (): void => { this.gamepadEverConnected = true; };

  private readonly handleWindowKeyDown = (ev: KeyboardEvent): void => {
    if (ev.repeat || ev.code !== 'Escape' || this.portraitLocked) return;
    ev.preventDefault();
    this.handlePauseToggleOrCloseModal();
  };

  private pollGamepadPauseButton(): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    let down = false;
    for (const p of navigator.getGamepads()) if (p && p.connected && p.buttons[9]?.pressed) down = true;
    if (down && !this.prevGamepadStartDown && !this.portraitLocked) this.handlePauseToggleOrCloseModal();
    this.prevGamepadStartDown = down;
  }

  private handlePauseToggleOrCloseModal(): void {
    if (this.subModalMask & 1) { this.bus.emit('ui:command:resolve_weapon_compare', { action: 'cancel' }); return; }
    if (this.subModalMask & 4) { this.bus.emit('ui:command:toggle_mutation_forge', { open: false }); return; }
    if (this.subModalMask & 8) { this.bus.emit('ui:command:toggle_minimap', { expanded: false }); return; }
    if (this.subModalMask & 0xf2) return;
    this.setPauseMenuOpen(!this.pauseMenuOpen);
  }

  private applyHowlerMasterGain(): void {
    Howler.mute(this.settings.muted);
    Howler.volume(this.settings.masterVolume);
  }

  private publishState(): void {
    const snap = this.snapshotTelemetry();
    if (typeof window !== 'undefined') window.__QC_AUDIO_STATE__ = snap;
    this.bus.emit('audio:state_updated', snap);
  }
}
