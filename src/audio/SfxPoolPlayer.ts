/**
 * 24 组多变体防听觉疲劳音效池播放器（src/audio/SfxPoolPlayer.ts）。
 *
 * 严格对齐 docs/04_ART_VFX_AUDIO_PIPELINE.md §4.3 与 level-topology-and-determinism 规范：
 * 1. 多变体组强制 O(1) 非重复抽样（绝不连续两次命中同一采样变体）；
 * 2. 每次播放叠加 ±8% (rate: 0.92 ~ 1.08) 音高微扰；
 * 3. 严格使用独立非存档 VisualFxRng，零消耗局内 DeterministicRng.stepCount；
 * 4. 实施每组最大并发数限流（超限淘汰最旧 Voice）与 2D 空间立体声声像偏移。
 */

import { Howl } from 'howler';
import { VisualFxRng, type VisualFxStream } from '../core/VisualFxRng';
import {
  ALL_SFX_GROUP_IDS,
  AUDIO_CONSTANTS,
  SFX_POOL_CATALOG,
  type SfxGroupId,
} from '../data/audio.data';

export interface ISfxVariantHandle {
  play(): number;
  stop(voiceId?: number): void;
  volume(vol: number, voiceId: number): void;
  rate(playbackRate: number, voiceId: number): void;
  stereo(pan: number, voiceId: number): void;
  unload(): void;
}

export type SfxVariantFactory = (
  src: readonly [string, string],
  onVoiceEnded: (voiceId: number) => void
) => ISfxVariantHandle;

interface SfxRuntimeSlot {
  lastVariantIdx: number;
  lastTriggerMs: number;
  readonly activeVoices: Array<{ readonly variantIdx: number; readonly voiceId: number }>;
  readonly handles: Array<ISfxVariantHandle | null>;
}

function defaultHowlSfxFactory(
  src: readonly [string, string],
  onVoiceEnded: (voiceId: number) => void
): ISfxVariantHandle {
  const howl = new Howl({
    src: [src[0], src[1]],
    preload: true,
    html5: false,
  });
  howl.on('end', (id) => {
    if (typeof id === 'number') onVoiceEnded(id);
  });
  return {
    play: () => howl.play(),
    stop: (voiceId?: number) => { howl.stop(voiceId); },
    volume: (vol: number, voiceId: number) => { howl.volume(vol, voiceId); },
    rate: (playbackRate: number, voiceId: number) => { howl.rate(playbackRate, voiceId); },
    stereo: (pan: number, voiceId: number) => {
      if (typeof howl.stereo === 'function') howl.stereo(pan, voiceId);
    },
    unload: () => { howl.unload(); },
  };
}

export interface SfxTriggerOutcome {
  readonly played: boolean;
  readonly sfxId: SfxGroupId;
  readonly variantIndex: number;
  readonly rate: number;
  readonly pan: number;
}

export class SfxPoolPlayer {
  private readonly slots = new Map<SfxGroupId, SfxRuntimeSlot>();
  private readonly createVariant: SfxVariantFactory;
  private readonly rng: VisualFxStream;

  private lastSfx: SfxGroupId | null = null;
  private lastRate = 1.0;
  private lastVariant = 0;

  public constructor(factory?: SfxVariantFactory, rngStream: VisualFxStream = VisualFxRng) {
    this.createVariant = factory ?? defaultHowlSfxFactory;
    this.rng = rngStream;

    for (const id of ALL_SFX_GROUP_IDS) {
      const spec = SFX_POOL_CATALOG[id];
      this.slots.set(id, {
        lastVariantIdx: -1,
        lastTriggerMs: -9999,
        activeVoices: [],
        handles: new Array<ISfxVariantHandle | null>(spec.variants).fill(null),
      });
    }
  }

  public get activeVoiceCount(): number {
    let total = 0;
    for (const slot of this.slots.values()) {
      total += slot.activeVoices.length;
    }
    return total;
  }

  public get lastTriggeredSfx(): SfxGroupId | null { return this.lastSfx; }
  public get lastTriggeredRate(): number { return this.lastRate; }
  public get lastTriggeredVariant(): number { return this.lastVariant; }

  public play(
    sfxId: SfxGroupId,
    effectiveSfxGain: number,
    nowMs: number,
    worldX?: number,
    listenerX?: number
  ): SfxTriggerOutcome {
    const spec = SFX_POOL_CATALOG[sfxId];
    const slot = this.slots.get(sfxId)!;

    if (effectiveSfxGain <= 0.001 || nowMs - slot.lastTriggerMs < spec.minRetriggerMs) {
      return { played: false, sfxId, variantIndex: slot.lastVariantIdx, rate: 1.0, pan: 0 };
    }
    slot.lastTriggerMs = nowMs;

    let variantIdx = 0;
    if (spec.variants > 1) {
      variantIdx =
        slot.lastVariantIdx < 0
          ? this.rng.intRange(0, spec.variants - 1)
          : (slot.lastVariantIdx + this.rng.intRange(1, spec.variants - 1)) % spec.variants;
    }
    slot.lastVariantIdx = variantIdx;

    // 严格并发限流：达到上限时立即停止并回收最早的活跃发声通道
    while (slot.activeVoices.length >= spec.maxConcurrent) {
      const oldest = slot.activeVoices.shift();
      if (oldest) {
        slot.handles[oldest.variantIdx]?.stop(oldest.voiceId);
      }
    }

    const handle = this.acquireVariantHandle(sfxId, slot, variantIdx);
    const span = AUDIO_CONSTANTS.PITCH_MAX_RATE - AUDIO_CONSTANTS.PITCH_MIN_RATE;
    const rate = spec.pitchJitterEnabled
      ? Number((AUDIO_CONSTANTS.PITCH_MIN_RATE + this.rng.nextFloat() * span).toFixed(4))
      : 1.0;

    let pan = 0;
    if (worldX !== undefined && listenerX !== undefined) {
      const rawPan = (worldX - listenerX) / AUDIO_CONSTANTS.SPATIAL_PAN_SPAN_PX;
      pan = Number(
        Math.max(-AUDIO_CONSTANTS.SPATIAL_PAN_CLAMP, Math.min(AUDIO_CONSTANTS.SPATIAL_PAN_CLAMP, rawPan)).toFixed(3)
      );
    }

    const finalVol = Math.max(0, Math.min(1, spec.baseVolume * effectiveSfxGain));
    const voiceId = handle.play();
    handle.volume(finalVol, voiceId);
    handle.rate(rate, voiceId);
    if (pan !== 0) handle.stereo(pan, voiceId);

    slot.activeVoices.push({ variantIdx, voiceId });
    this.lastSfx = sfxId;
    this.lastRate = rate;
    this.lastVariant = variantIdx + 1;

    return { played: true, sfxId, variantIndex: variantIdx, rate, pan };
  }

  public activeVoicesFor(sfxId: SfxGroupId): number {
    return this.slots.get(sfxId)?.activeVoices.length ?? 0;
  }

  public destroy(): void {
    for (const slot of this.slots.values()) {
      slot.activeVoices.length = 0;
      for (let i = 0; i < slot.handles.length; i++) {
        slot.handles[i]?.unload();
        slot.handles[i] = null;
      }
    }
  }

  private acquireVariantHandle(sfxId: SfxGroupId, slot: SfxRuntimeSlot, variantIdx: number): ISfxVariantHandle {
    let existing = slot.handles[variantIdx];
    if (!existing) {
      const src = SFX_POOL_CATALOG[sfxId].variantSources[variantIdx]!;
      existing = this.createVariant(src, (endedId) => {
        const idx = slot.activeVoices.findIndex((v) => v.voiceId === endedId);
        if (idx >= 0) slot.activeVoices.splice(idx, 1);
      });
      slot.handles[variantIdx] = existing;
    }
    return existing;
  }
}
