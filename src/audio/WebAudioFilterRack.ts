/**
 * 濒死压迫（HP < 25%）与暂停菜单实时双二阶低通滤波器及零分配频谱分析架
 * （src/audio/WebAudioFilterRack.ts）。
 *
 * 信号拓扑：Howler.masterGain -> BiquadFilterNode (lowpass, Q=1.4) -> AnalyserNode -> destination
 */

import { Howler } from 'howler';
import { AUDIO_CONSTANTS } from '../data/audio.data';

const SPECTRUM_BAND_CENTERS_HZ: readonly number[] = [
  55, 95, 160, 260, 420, 700, 1150, 1900, 3200, 5400, 9200, 15000,
] as const;

export interface WebAudioFilterHardware {
  readonly currentTime: number;
  setFilterRamp(fromHz: number, targetHz: number, durationSec: number): void;
  readFrequencyValue(): number | null;
  sampleFftBytes(out: Uint8Array): boolean;
}

export class WebAudioFilterRack {
  private lowHpMuffled = false;
  private pauseMenuMuffled = false;
  private targetHz: number = AUDIO_CONSTANTS.LOWPASS_OPEN_HZ;
  private currentHz: number = AUDIO_CONSTANTS.LOWPASS_OPEN_HZ;

  private wiredCtx: AudioContext | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private readonly customHw: WebAudioFilterHardware | null;

  private readonly fftScratch = new Uint8Array(128);
  private readonly barsOut: number[] = new Array<number>(12).fill(0);
  private lowEnergy = 0;
  private highEnergy = 0;

  public constructor(customHardware?: WebAudioFilterHardware) {
    this.customHw = customHardware ?? null;
  }

  public get isLowHpActive(): boolean {
    return this.lowHpMuffled;
  }

  public get isPauseMenuActive(): boolean {
    return this.pauseMenuMuffled;
  }

  public get isMuffled(): boolean {
    return this.lowHpMuffled || this.pauseMenuMuffled;
  }

  public get targetCutoffHz(): number {
    return this.targetHz;
  }

  public get currentCutoffHz(): number {
    const hwVal = this.readHardwareFrequency();
    if (hwVal !== null && Number.isFinite(hwVal) && hwVal > 10) {
      return Math.round(hwVal);
    }
    return Math.round(this.currentHz);
  }

  public get spectrumBars(): readonly number[] {
    return this.barsOut;
  }

  public get lowBandEnergy(): number {
    return Number(this.lowEnergy.toFixed(3));
  }

  public get highBandEnergy(): number {
    return Number(this.highEnergy.toFixed(3));
  }

  /** 确保在 Howler.ctx 可用或重建后挂载 BiquadLowPass + Analyser 串联拓扑 */
  public ensureAttached(): boolean {
    if (this.customHw) return true;
    const ctx = (Howler.ctx as AudioContext | undefined) ?? null;
    const masterGain = (Howler as unknown as { masterGain?: GainNode }).masterGain ?? null;
    if (!ctx || !masterGain || typeof ctx.createBiquadFilter !== 'function') {
      return false;
    }
    if (this.wiredCtx === ctx && this.filterNode) {
      return true;
    }

    try {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = AUDIO_CONSTANTS.LOWPASS_Q;
      filter.frequency.value = this.targetHz;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;

      masterGain.disconnect();
      masterGain.connect(filter);
      filter.connect(analyser);
      analyser.connect(ctx.destination);

      this.wiredCtx = ctx;
      this.filterNode = filter;
      this.analyserNode = analyser;
      return true;
    } catch {
      return false;
    }
  }

  public setMuffleState(options: { readonly lowHp?: boolean; readonly pauseMenu?: boolean }): void {
    if (options.lowHp !== undefined) this.lowHpMuffled = options.lowHp;
    if (options.pauseMenu !== undefined) this.pauseMenuMuffled = options.pauseMenu;

    const nextTarget = this.isMuffled
      ? AUDIO_CONSTANTS.LOWPASS_MUFFLED_HZ
      : AUDIO_CONSTANTS.LOWPASS_OPEN_HZ;

    if (nextTarget === this.targetHz) return;
    const prevHz = Math.max(40, Math.min(20000, this.currentCutoffHz));
    this.currentHz = prevHz;
    this.targetHz = nextTarget;

    const rampSec = this.isMuffled
      ? AUDIO_CONSTANTS.LOWPASS_ENTER_RAMP_SEC
      : AUDIO_CONSTANTS.LOWPASS_EXIT_RAMP_SEC;

    this.ensureAttached();
    if (this.customHw) {
      this.customHw.setFilterRamp(prevHz, nextTarget, rampSec);
      return;
    }

    if (this.filterNode && this.wiredCtx) {
      const now = this.wiredCtx.currentTime;
      const param = this.filterNode.frequency;
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(40, param.value || prevHz), now);
      param.exponentialRampToValueAtTime(nextTarget, now + rampSec);
    }
  }

  public step(dtSec: number, activeStemAmplitude: number, phaseSec: number): void {
    this.ensureAttached();
    const rampSec = this.isMuffled
      ? AUDIO_CONSTANTS.LOWPASS_ENTER_RAMP_SEC
      : AUDIO_CONSTANTS.LOWPASS_EXIT_RAMP_SEC;

    if (Math.abs(this.currentHz - this.targetHz) > 0.5) {
      const ratio = Math.min(1, Math.max(0, dtSec / Math.max(0.02, rampSec)));
      this.currentHz = this.currentHz * Math.pow(this.targetHz / Math.max(40, this.currentHz), ratio);
      if (Math.abs(this.currentHz - this.targetHz) < 2) {
        this.currentHz = this.targetHz;
      }
    } else {
      this.currentHz = this.targetHz;
    }

    this.updateSpectrumTelemetry(activeStemAmplitude, phaseSec);
  }

  private readHardwareFrequency(): number | null {
    if (this.customHw) return this.customHw.readFrequencyValue();
    if (this.filterNode && this.wiredCtx && this.wiredCtx.state === 'running') {
      return this.filterNode.frequency.value;
    }
    return null;
  }

  private updateSpectrumTelemetry(activeStemAmplitude: number, phaseSec: number): void {
    let hasLiveFft = false;
    if (this.customHw) {
      hasLiveFft = this.customHw.sampleFftBytes(this.fftScratch);
    } else if (this.analyserNode && this.wiredCtx?.state === 'running') {
      this.analyserNode.getByteFrequencyData(this.fftScratch);
      let sum = 0;
      for (let i = 0; i < 32; i++) sum += this.fftScratch[i] ?? 0;
      hasLiveFft = sum > 8;
    }

    const cutoff = Math.max(60, this.currentCutoffHz);
    if (hasLiveFft) {
      const binHz = 24000 / this.fftScratch.length;
      for (let b = 0; b < 12; b++) {
        const center = SPECTRUM_BAND_CENTERS_HZ[b]!;
        const idx = Math.min(this.fftScratch.length - 1, Math.max(0, Math.round(center / binHz)));
        this.barsOut[b] = Number(((this.fftScratch[idx] ?? 0) / 255).toFixed(3));
      }
    } else {
      // 未解锁手势前或无声卡单测环境：严格按二阶低通幅频响应 |H(jf)| 投影当前混音能量
      const amp = Math.max(0, Math.min(1, activeStemAmplitude));
      for (let b = 0; b < 12; b++) {
        const f = SPECTRUM_BAND_CENTERS_HZ[b]!;
        const r = f / cutoff;
        const mag = 1 / Math.sqrt(Math.pow(1 - r * r, 2) + Math.pow(r / AUDIO_CONSTANTS.LOWPASS_Q, 2));
        const flutter = 0.84 + 0.16 * Math.sin(phaseSec * (4.5 + b * 0.7) + b);
        const sourceSlope = 1.0 - b * 0.042;
        this.barsOut[b] = Number(Math.min(1, amp * sourceSlope * Math.min(1.18, mag) * flutter).toFixed(3));
      }
    }

    this.lowEnergy = ((this.barsOut[0]! + this.barsOut[1]! + this.barsOut[2]! + this.barsOut[3]!) * 0.25);
    this.highEnergy = ((this.barsOut[7]! + this.barsOut[8]! + this.barsOut[9]! + this.barsOut[10]! + this.barsOut[11]!) * 0.2);
  }
}
