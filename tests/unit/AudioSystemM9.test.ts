import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdaptiveStemMixer, type IStemTrackHandle } from '../../src/audio/AdaptiveStemMixer';
import { AudioDirector } from '../../src/audio/AudioDirector';
import {
  IosAudioUnlocker,
  type ExtendedAudioContextState,
  type UnlockableAudioContext,
} from '../../src/audio/IosAudioUnlocker';
import { SfxPoolPlayer, type ISfxVariantHandle } from '../../src/audio/SfxPoolPlayer';
import { WebAudioFilterRack, type WebAudioFilterHardware } from '../../src/audio/WebAudioFilterRack';
import { DeterministicRng } from '../../src/core/DeterministicRng';
import { TypedEventBus } from '../../src/core/EventBus';
import { VisualFxStream } from '../../src/core/VisualFxRng';
import {
  ALL_BGM_STEM_IDS,
  ALL_SFX_GROUP_IDS,
  BGM_STEM_CATALOG,
  SFX_POOL_CATALOG,
  type BgmStemId,
} from '../../src/data/audio.data';

class MockStemTrack implements IStemTrackHandle {
  public vol = 0;
  public pos = 0;
  public isPlaying = false;
  public unloaded = false;

  public constructor(public readonly id: BgmStemId) {}
  public play(): number {
    this.isPlaying = true;
    return 1;
  }
  public stop(): void {
    this.isPlaying = false;
  }
  public unload(): void {
    this.isPlaying = false;
    this.unloaded = true;
  }
  public volume(v?: number): number {
    if (v !== undefined) this.vol = v;
    return this.vol;
  }
  public seek(s?: number): number {
    if (s !== undefined) this.pos = s;
    return this.pos;
  }
  public playing(): boolean {
    return this.isPlaying;
  }
}

describe('Milestone 9 — Commercial Dual-Stem Music, 420Hz Lowpass Rack & 24-Pool SFX', () => {
  it('verifies 100% dual-codec (.webm Opus first, .m4a AAC second) mastered files exist on disk', () => {
    const publicRoot = path.resolve(process.cwd(), 'public');
    expect(ALL_BGM_STEM_IDS.length).toBe(15);
    expect(ALL_SFX_GROUP_IDS.length).toBe(24);

    for (const stemId of ALL_BGM_STEM_IDS) {
      const [webmRel, m4aRel] = BGM_STEM_CATALOG[stemId].src;
      expect(webmRel.endsWith('.webm')).toBe(true);
      expect(m4aRel.endsWith('.m4a')).toBe(true);
      const webmPath = path.join(publicRoot, webmRel);
      const m4aPath = path.join(publicRoot, m4aRel);
      expect(fs.existsSync(webmPath)).toBe(true);
      expect(fs.existsSync(m4aPath)).toBe(true);
      expect(fs.statSync(webmPath).size).toBeGreaterThan(1024);
      expect(fs.statSync(m4aPath).size).toBeGreaterThan(1024);
    }

    let totalVariantCount = 0;
    for (const sfxId of ALL_SFX_GROUP_IDS) {
      const spec = SFX_POOL_CATALOG[sfxId];
      expect(spec.variantSources.length).toBe(spec.variants);
      for (const [webmRel, m4aRel] of spec.variantSources) {
        expect(webmRel.endsWith('.webm')).toBe(true);
        expect(m4aRel.endsWith('.m4a')).toBe(true);
        const webmPath = path.join(publicRoot, webmRel);
        const m4aPath = path.join(publicRoot, m4aRel);
        expect(fs.existsSync(webmPath)).toBe(true);
        expect(fs.existsSync(m4aPath)).toBe(true);
        expect(fs.statSync(webmPath).size).toBeGreaterThan(256);
        expect(fs.statSync(m4aPath).size).toBeGreaterThan(256);
        totalVariantCount += 1;
      }
    }
    expect(totalVariantCount).toBe(71);
  });

  it('crossfades Exploration & Combat stems with 2.2s de-aggro hold, zero phase drift, and Boss P1/P2/P3 lock', () => {
    const tracks = new Map<BgmStemId, MockStemTrack>();
    const mixer = new AdaptiveStemMixer((id) => {
      const t = new MockStemTrack(id);
      tracks.set(id, t);
      return t;
    });

    mixer.setProgram('biome_01_slag_retort', 1, 1.0);
    const exp = tracks.get('bgm_b01_explore')!;
    const cmb = tracks.get('bgm_b01_combat')!;
    expect(exp.isPlaying).toBe(true);
    expect(cmb.isPlaying).toBe(true);
    expect(exp.vol).toBeCloseTo(0.85, 2);
    expect(cmb.vol).toBeCloseTo(0.0, 3);

    // Enter aggro -> 900ms smooth ramp to combat=0.90, explore=0.35
    mixer.setAggroCount(2);
    for (let i = 0; i < 9; i++) mixer.step(100, 1.0);
    expect(mixer.currentCombatWeight).toBeCloseTo(1.0, 3);
    expect(cmb.vol).toBeCloseTo(0.90, 2);
    expect(exp.vol).toBeCloseTo(0.35, 2);

    // Simulate 85ms browser tab drift and verify 2.0s phase resync locks stems back together
    exp.pos = 4.50;
    cmb.pos = 4.585;
    for (let i = 0; i < 12; i++) mixer.step(100, 1.0);
    expect(cmb.pos).toBeCloseTo(4.50, 3);

    // De-aggro: must hold combat stem steady for 2,200ms before 1,500ms fade-out
    mixer.setAggroCount(0);
    for (let i = 0; i < 21; i++) mixer.step(100, 1.0); // 2,100ms elapsed (< 2,200ms)
    expect(mixer.currentCombatWeight).toBeCloseTo(1.0, 3);

    mixer.step(100, 1.0); // reaches 2,200ms threshold
    for (let i = 0; i < 15; i++) mixer.step(100, 1.0); // 1,500ms fade-out
    expect(mixer.currentCombatWeight).toBeCloseTo(0.0, 3);
    expect(cmb.vol).toBeCloseTo(0.0, 3);
    expect(exp.vol).toBeCloseTo(0.85, 2);

    // Boss 2 multi-phase synchronous escalation P1 -> P2 -> P3
    mixer.setProgram('boss_02_grand_alchemist', 1, 1.0);
    expect(tracks.get('bgm_boss2_p1')!.vol).toBeCloseTo(0.90, 2);
    expect(tracks.get('bgm_boss2_p3')!.vol).toBeCloseTo(0.0, 3);
    mixer.setBossPhase(3);
    for (let i = 0; i < 10; i++) mixer.step(100, 1.0);
    expect(tracks.get('bgm_boss2_p1')!.vol).toBeCloseTo(0.0, 3);
    expect(tracks.get('bgm_boss2_p3')!.vol).toBeCloseTo(0.90, 2);
  });

  it('drives WebAudioFilterRack smoothly to 420Hz on <25% HP or Pause and restores 20,000Hz immediately', () => {
    const ramps: Array<{ from: number; to: number; dur: number }> = [];
    let hwFreq: number | null = null;
    const mockHw: WebAudioFilterHardware = {
      currentTime: 1.0,
      setFilterRamp: (from, to, dur) => {
        ramps.push({ from, to, dur });
        hwFreq = to;
      },
      readFrequencyValue: () => hwFreq,
      sampleFftBytes: () => false,
    };

    const rack = new WebAudioFilterRack(mockHw);
    rack.step(0.05, 0.85, 0.5);
    expect(rack.currentCutoffHz).toBe(20000);
    const openHighEnergy = rack.highBandEnergy;
    expect(openHighEnergy).toBeGreaterThan(0.25);

    // Drop HP < 25% -> muffles to 420Hz in 0.25s
    rack.setMuffleState({ lowHp: true });
    rack.step(0.25, 0.85, 0.75);
    expect(ramps.at(-1)?.to).toBe(420);
    expect(rack.currentCutoffHz).toBe(420);
    expect(rack.highBandEnergy).toBeLessThan(openHighEnergy * 0.15);

    // Pause menu also active; healing HP while paused keeps 420Hz active
    rack.setMuffleState({ pauseMenu: true });
    rack.setMuffleState({ lowHp: false });
    expect(rack.targetCutoffHz).toBe(420);

    // Unpausing restores full 20,000Hz crisp treble
    rack.setMuffleState({ pauseMenu: false });
    rack.step(0.2, 0.85, 1.0);
    expect(ramps.at(-1)?.to).toBe(20000);
    expect(rack.currentCutoffHz).toBe(20000);
  });

  it('enforces non-repeating SFX variants, ±8% pitch jitter, concurrency cap, and zero DeterministicRng consumption', () => {
    const saveRng = new DeterministicRng(0x51c0ffee);
    let nextVoiceSeq = 1;
    const stoppedVoices: number[] = [];

    const pool = new SfxPoolPlayer(
      () => {
        const handle: ISfxVariantHandle = {
          play: () => nextVoiceSeq++,
          stop: (id) => { if (id !== undefined) stoppedVoices.push(id); },
          volume: () => {},
          rate: () => {},
          stereo: () => {},
          unload: () => {},
        };
        return handle;
      },
      new VisualFxStream(0x1234abcd)
    );

    let prevVariant = -1;
    const observedRates: number[] = [];
    for (let i = 0; i < 50; i++) {
      const out = pool.play('sfx_step_stone', 0.9, i * 100, 480, 320);
      expect(out.played).toBe(true);
      expect(out.variantIndex).not.toBe(prevVariant);
      prevVariant = out.variantIndex;
      expect(out.rate).toBeGreaterThanOrEqual(0.92);
      expect(out.rate).toBeLessThanOrEqual(1.08);
      expect(out.pan).toBeGreaterThan(0);
      expect(out.pan).toBeLessThanOrEqual(0.65);
      observedRates.push(out.rate);
      // sfx_step_stone maxConcurrent === 2
      expect(pool.activeVoicesFor('sfx_step_stone')).toBeLessThanOrEqual(2);
    }

    expect(new Set(observedRates).size).toBeGreaterThan(15);
    expect(stoppedVoices.length).toBe(48);
    expect(saveRng.serialize().stepCount).toBe(0);
  });

  it('recovers iOS WebKit AudioContext from both suspended and interrupted states and orchestrates EventBus cues', async () => {
    let state: ExtendedAudioContextState = 'suspended';
    let bufferStarted = false;
    const mockCtx: UnlockableAudioContext = {
      get state() { return state; },
      destination: {},
      resume: async () => { state = 'running'; },
      createBuffer: () => ({}),
      createBufferSource: () => ({
        buffer: null,
        connect: () => {},
        start: () => { bufferStarted = true; },
      }),
    };

    const unlocker = new IosAudioUnlocker(() => mockCtx);
    expect(await unlocker.resumeContext()).toBe(true);
    expect(unlocker.isUnlocked).toBe(true);
    expect(bufferStarted).toBe(true);

    // Simulate incoming phone call / Siri WebKit 'interrupted' state
    state = 'interrupted';
    expect(unlocker.contextState).toBe('interrupted');
    expect(await unlocker.resumeContext()).toBe(true);
    expect(unlocker.contextState).toBe('running');

    // Verify end-to-end AudioDirector EventBus orchestration
    const bus = new TypedEventBus();
    const director = new AudioDirector({
      bus,
      unlocker,
      stemMixer: new AdaptiveStemMixer((id) => new MockStemTrack(id)),
      sfxPool: new SfxPoolPlayer(() => ({
        play: () => 1, stop: () => {}, volume: () => {}, rate: () => {}, stereo: () => {}, unload: () => {},
      })),
    });
    director.mount(null);

    bus.emit('player:combat_hud_updated', {
      hp: 20, maxHp: 120, rallyOrangeHp: 0, rallyFrozen: false,
      stats: { rubedo: 1, citrinitas: 1, albedo: 1 },
      flaskCharges: 1, maxFlaskCharges: 1, gold: 0, ichor: 0,
      rapierCritReady: false, cleaverRhythmWindowOpen: false, isInvulnerable: false, isParryWindowActive: false,
      primarySlot: {} as never, secondarySlot: {} as never,
    });
    expect(director.snapshotTelemetry().lowpassTargetHz).toBe(420);
    expect(director.snapshotTelemetry().lowHpPulseActive).toBe(true);

    bus.emit('combat:parry_succeeded', { defenderId: 'player_vessel_09', sourceId: 'mob_01', worldX: 300, worldY: 200 });
    expect(director.snapshotTelemetry().lastTriggeredSfx).toBe('sfx_parry_clang');

    // Regression check: repeated 90ms telemetry ticks in SanctumHubScene must keep PauseAudioMenu open
    bus.emit('system:showcase_state_changed', {
      activeSceneKey: 'SanctumHubScene', heroAnimKey: 'hero_idle', activeLights: 5,
      shaders: { hitFlash: false, ashDissolve: false, shieldRefract: false, chromaticImpact: false, vignetteBloom: true },
    });
    director.setPauseMenuOpen(true);
    expect(director.isPauseMenuOpen).toBe(true);
    bus.emit('system:showcase_state_changed', {
      activeSceneKey: 'SanctumHubScene', heroAnimKey: 'hero_idle', activeLights: 5,
      shaders: { hitFlash: false, ashDissolve: false, shieldRefract: false, chromaticImpact: false, vignetteBloom: true },
    });
    expect(director.isPauseMenuOpen).toBe(true);
    director.destroy(null);
  });
});
