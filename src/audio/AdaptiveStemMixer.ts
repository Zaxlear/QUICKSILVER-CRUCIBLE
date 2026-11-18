/**
 * 同 BPM 零相位漂移双轨垂直自适应混音器与多阶段 Boss 音乐控制器（src/audio/AdaptiveStemMixer.ts）。
 * 严格遵循 docs/04 §4.1：Explore/Combat 同帧启动、900ms 进战拉升、2.2s 脱战防抖 + 1.5s 淡出、周期锁相。
 */

import { Howl } from 'howler';
import {
  AUDIO_CONSTANTS,
  AUDIO_PROGRAM_CATALOG,
  BGM_STEM_CATALOG,
  type AudioProgramId,
  type BgmStemId,
} from '../data/audio.data';

export interface IStemTrackHandle {
  play(): number;
  stop(): void;
  unload(): void;
  volume(vol?: number): number;
  seek(posSec?: number): number;
  playing(): boolean;
}

export type StemTrackFactory = (stemId: BgmStemId, src: readonly [string, string]) => IStemTrackHandle;

function defaultHowlStemFactory(_stemId: BgmStemId, src: readonly [string, string]): IStemTrackHandle {
  const howl = new Howl({ src: [src[0], src[1]], loop: true, preload: true, html5: false, volume: 0 });
  return {
    play: () => howl.play(),
    stop: () => { howl.stop(); },
    unload: () => { howl.unload(); },
    volume: (vol?: number) => (vol !== undefined ? (howl.volume(vol), vol) : howl.volume()),
    seek: (posSec?: number) => {
      const res = posSec !== undefined ? howl.seek(posSec) : howl.seek();
      return typeof res === 'number' && Number.isFinite(res) ? res : 0;
    },
    playing: () => howl.playing(),
  };
}

export class AdaptiveStemMixer {
  private readonly createTrack: StemTrackFactory;
  private currentProgram: AudioProgramId = 'sanctum';
  private readonly activeTracks = new Map<BgmStemId, IStemTrackHandle>();
  private lowHpPulseTrack: IStemTrackHandle | null = null;

  private aggroCount = 0;
  private combatWeight = 0;
  private deaggroHoldMs = 0;
  private bossPhase: 1 | 2 | 3 = 1;
  private readonly bossWeights: [number, number, number] = [1, 0, 0];
  private lowHpActive = false;
  private lowHpWeight = 0;

  private resyncTimerMs = 0;
  private lastDriftMs = 0;
  private lastExploreOutVol: number = AUDIO_CONSTANTS.SANCTUM_BASE_VOL;
  private lastCombatOutVol: number = 0;
  private lastPulseOutVol: number = 0;

  public constructor(factory?: StemTrackFactory) {
    this.createTrack = factory ?? defaultHowlStemFactory;
  }

  public get programId(): AudioProgramId { return this.currentProgram; }
  public get currentAggroCount(): number { return this.aggroCount; }
  public get currentCombatWeight(): number { return Number(this.combatWeight.toFixed(4)); }
  public get currentBossPhase(): 1 | 2 | 3 { return this.bossPhase; }
  public get exploreVolume(): number { return Number(this.lastExploreOutVol.toFixed(3)); }
  public get combatVolume(): number { return Number(this.lastCombatOutVol.toFixed(3)); }
  public get lowHpPulseVolume(): number { return Number(this.lastPulseOutVol.toFixed(3)); }
  public get stemPhaseDriftMs(): number { return Number(this.lastDriftMs.toFixed(2)); }

  public setProgram(programId: AudioProgramId, initialBossPhase: 1 | 2 | 3 = 1, effectiveBgmGain = 1): void {
    if (this.currentProgram === programId && this.activeTracks.size > 0) {
      if (AUDIO_PROGRAM_CATALOG[programId].mode === 'BOSS_PHASED') {
        this.setBossPhase(initialBossPhase);
      }
      return;
    }

    this.unloadActiveProgramTracks();
    this.currentProgram = programId;
    this.aggroCount = 0;
    this.combatWeight = 0;
    this.deaggroHoldMs = 0;
    this.bossPhase = initialBossPhase;
    this.bossWeights[0] = initialBossPhase === 1 ? 1 : 0;
    this.bossWeights[1] = initialBossPhase === 2 ? 1 : 0;
    this.bossWeights[2] = initialBossPhase === 3 ? 1 : 0;
    this.resyncTimerMs = 0;
    this.lastDriftMs = 0;

    const spec = AUDIO_PROGRAM_CATALOG[programId];
    for (const stemId of spec.stems) {
      const track = this.createTrack(stemId, BGM_STEM_CATALOG[stemId].src);
      this.activeTracks.set(stemId, track);
    }
    for (const track of this.activeTracks.values()) {
      track.play();
    }
    this.applyTrackVolumes(effectiveBgmGain);
  }

  public setAggroCount(count: number): void {
    const safe = Math.max(0, Math.floor(count));
    this.aggroCount = safe;
    if (safe >= 1) this.deaggroHoldMs = 0;
  }

  public setBossPhase(phase: 1 | 2 | 3): void {
    this.bossPhase = phase;
  }

  public setLowHpPulse(active: boolean): void {
    this.lowHpActive = active;
    if (active && !this.lowHpPulseTrack) {
      this.lowHpPulseTrack = this.createTrack('bgm_low_hp_pulse', BGM_STEM_CATALOG.bgm_low_hp_pulse.src);
      this.lowHpPulseTrack.volume(0);
      this.lowHpPulseTrack.play();
    }
  }

  public step(dtMs: number, effectiveBgmGain: number): void {
    const clampedMs = Math.max(0, Math.min(dtMs, 250));
    const prog = AUDIO_PROGRAM_CATALOG[this.currentProgram];

    if (prog.mode === 'DUAL_ADAPTIVE') {
      if (this.aggroCount >= 1) {
        this.combatWeight = Math.min(1, this.combatWeight + clampedMs / AUDIO_CONSTANTS.AGGRO_FADE_IN_MS);
      } else if (this.combatWeight > 0) {
        if (this.deaggroHoldMs < AUDIO_CONSTANTS.DEAGGRO_HOLD_MS) {
          this.deaggroHoldMs += clampedMs;
        }
        if (this.deaggroHoldMs >= AUDIO_CONSTANTS.DEAGGRO_HOLD_MS) {
          const overMs = Math.min(clampedMs, this.deaggroHoldMs - AUDIO_CONSTANTS.DEAGGRO_HOLD_MS + clampedMs);
          this.combatWeight = Math.max(0, this.combatWeight - overMs / AUDIO_CONSTANTS.DEAGGRO_FADE_OUT_MS);
        }
      }
    } else if (prog.mode === 'BOSS_PHASED') {
      const stepDelta = clampedMs / AUDIO_CONSTANTS.BOSS_PHASE_CROSSFADE_MS;
      for (let i = 0; i < 3; i++) {
        const target = this.bossPhase === i + 1 ? 1 : 0;
        if (this.bossWeights[i]! < target) this.bossWeights[i] = Math.min(1, this.bossWeights[i]! + stepDelta);
        else if (this.bossWeights[i]! > target) this.bossWeights[i] = Math.max(0, this.bossWeights[i]! - stepDelta);
      }
    }

    const pulseDelta = clampedMs / AUDIO_CONSTANTS.PULSE_FADE_MS;
    this.lowHpWeight = this.lowHpActive
      ? Math.min(1, this.lowHpWeight + pulseDelta)
      : Math.max(0, this.lowHpWeight - pulseDelta);

    this.applyTrackVolumes(effectiveBgmGain);
    this.resyncTimerMs += clampedMs;
    if (this.resyncTimerMs >= AUDIO_CONSTANTS.PHASE_RESYNC_CHECK_MS) {
      this.resyncTimerMs = 0;
      this.enforceStemPhaseSync(prog.stems);
    }
  }

  public ensurePlayingAfterUnlock(): void {
    for (const track of this.activeTracks.values()) {
      if (!track.playing()) track.play();
    }
    if (this.lowHpActive && this.lowHpPulseTrack && !this.lowHpPulseTrack.playing()) {
      this.lowHpPulseTrack.play();
    }
  }

  public destroy(): void {
    this.unloadActiveProgramTracks();
    if (this.lowHpPulseTrack) {
      this.lowHpPulseTrack.stop();
      this.lowHpPulseTrack.unload();
      this.lowHpPulseTrack = null;
    }
  }

  private applyTrackVolumes(busGain: number): void {
    const g = Math.max(0, Math.min(1, busGain));
    const prog = AUDIO_PROGRAM_CATALOG[this.currentProgram];

    if (prog.mode === 'SINGLE_LOOP') {
      this.lastExploreOutVol = AUDIO_CONSTANTS.SANCTUM_BASE_VOL * g;
      this.lastCombatOutVol = 0;
      this.activeTracks.get(prog.stems[0]!)?.volume(this.lastExploreOutVol);
    } else if (prog.mode === 'DUAL_ADAPTIVE') {
      const expRaw =
        AUDIO_CONSTANTS.EXPLORE_BASE_VOL +
        (AUDIO_CONSTANTS.EXPLORE_DUCKED_VOL - AUDIO_CONSTANTS.EXPLORE_BASE_VOL) * this.combatWeight;
      this.lastExploreOutVol = expRaw * g;
      this.lastCombatOutVol = AUDIO_CONSTANTS.COMBAT_ACTIVE_VOL * this.combatWeight * g;
      this.activeTracks.get(prog.stems[0]!)?.volume(this.lastExploreOutVol);
      this.activeTracks.get(prog.stems[1]!)?.volume(this.lastCombatOutVol);
    } else {
      let maxActive = 0;
      prog.stems.forEach((sid, idx) => {
        const vol = (this.bossWeights[idx] ?? 0) * AUDIO_CONSTANTS.BOSS_ACTIVE_VOL * g;
        if (vol > maxActive) maxActive = vol;
        this.activeTracks.get(sid)?.volume(vol);
      });
      this.lastExploreOutVol = 0;
      this.lastCombatOutVol = maxActive;
    }

    this.lastPulseOutVol = this.lowHpWeight * AUDIO_CONSTANTS.LOW_HP_PULSE_MAX_VOL * g;
    this.lowHpPulseTrack?.volume(this.lastPulseOutVol);
  }

  private enforceStemPhaseSync(stems: readonly BgmStemId[]): void {
    if (stems.length < 2) {
      this.lastDriftMs = 0;
      return;
    }
    const anchor = this.activeTracks.get(stems[0]!);
    if (!anchor || !anchor.playing()) return;
    const anchorPos = anchor.seek();

    let maxDriftSec = 0;
    for (let i = 1; i < stems.length; i++) {
      const peer = this.activeTracks.get(stems[i]!);
      if (!peer || !peer.playing()) continue;
      const diff = Math.abs(anchorPos - peer.seek());
      if (diff > maxDriftSec) maxDriftSec = diff;
      if (diff > AUDIO_CONSTANTS.MAX_ALLOWED_DRIFT_SEC && diff < 8.0) peer.seek(anchorPos);
    }
    this.lastDriftMs = maxDriftSec * 1000;
  }

  private unloadActiveProgramTracks(): void {
    for (const track of this.activeTracks.values()) {
      track.stop();
      track.unload();
    }
    this.activeTracks.clear();
  }
}
