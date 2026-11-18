/**
 * 独立 Preact 暂停与商业级交互音频调音台（src/ui/PauseAudioMenu.tsx）。
 *
 * 100% 挂载于 #ui-root DOM 层，零 Phaser 实例持有：
 * - 三路独立音量推子（Master / Adaptive BGM / Multi-Variant SFX）与一键静音；
 * - 组合 AudioDiagnosticsCard 实时展示双轨混音权重、420Hz 低通状态与 12 段频谱柱；
 * - 支持多变体音效实时试听（核验 ±8% 音高微扰与变体轮询）及一键水银回流圣所。
 */

import {
  EventBus,
  type AudioTelemetrySnapshot,
  type PauseAudioMenuPayload,
} from '../core/EventBus';
import { AudioDiagnosticsCard } from './AudioDiagnosticsCard';

export interface PauseAudioMenuProps {
  readonly pauseMenu: PauseAudioMenuPayload;
  readonly audio: AudioTelemetrySnapshot;
  readonly compactMobileMode: boolean;
}

interface SliderRowProps {
  readonly testId: string;
  readonly labelZh: string;
  readonly subLabelEn: string;
  readonly value: number;
  readonly accentHex: string;
  readonly onChange: (val: number) => void;
}

function VolumeSliderRow({ testId, labelZh, subLabelEn, value, accentHex, onChange }: SliderRowProps) {
  const pct = Math.round(value * 100);
  return (
    <div class="bg-[#161824] border border-[#323954] px-2.5 py-1.5 flex flex-col gap-1">
      <div class="flex items-center justify-between text-[10px]">
        <span class="font-bold text-[#F8FAFC]">
          {labelZh} <span class="text-[8px] text-[#9AA5B8] font-normal">{subLabelEn}</span>
        </span>
        <span class="font-mono font-bold" style={{ color: accentHex }}>
          {pct}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        data-ui-interactive="true"
        data-testid={testId}
        onInput={(ev) => onChange(Number((ev.currentTarget as HTMLInputElement).value) / 100)}
        class="w-full h-1.5 cursor-pointer accent-[#FBBF24] bg-[#0B0C10]"
      />
    </div>
  );
}

export function PauseAudioMenu({ pauseMenu, audio, compactMobileMode }: PauseAudioMenuProps) {
  if (!pauseMenu.open) return null;

  return (
    <div
      data-testid="pause-audio-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/86 flex items-center justify-center p-2 sm:p-4"
    >
      <div
        class={`w-full bg-[#11131C] border-2 border-[#C28B42] shadow-2xl flex flex-col gap-2.5 overflow-y-auto max-h-[92vh] ${
          compactMobileMode ? 'max-w-xl p-2.5' : 'max-w-2xl p-4'
        }`}
      >
        <div class="flex items-center justify-between gap-2 border-b border-[#3D2817] pb-2">
          <div class="flex items-center gap-2">
            <img
              src="/assets/atlases/boot_crucible_seal.png"
              alt="Crucible Seal"
              class="w-6 h-6 pixel-crisp border border-[#7A5128] bg-[#161824] p-0.5"
            />
            <div>
              <div class="text-[9px] tracking-[0.18em] text-[#E0AE53] uppercase">
                ATHANOR ACOUSTIC RACK · 120HZ SIM PAUSED
              </div>
              <h2 class="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                战局暂停与双轨声学调音台
              </h2>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-audio-mute"
              onClick={() => EventBus.emit('ui:command:update_audio_settings', { muted: !audio.settings.muted })}
              class={`cursor-pointer px-2 py-1 border text-[10px] font-bold tracking-wider ${
                audio.settings.muted
                  ? 'bg-[#3B121E] border-[#E11D48] text-[#FB7185]'
                  : 'bg-[#161824] border-[#414A6B] text-[#D4DEE8] hover:border-[#C28B42]'
              }`}
            >
              {audio.settings.muted ? '[🔇 已静音]' : '[🔊 正常发声]'}
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-resume-pause"
              onClick={() => EventBus.emit('ui:command:toggle_pause_menu', { open: false })}
              class="cursor-pointer px-3 py-1 bg-[#3D2817] hover:bg-[#593A1E] border border-[#FBBF24] text-[#FBBF24] text-[10px] font-bold tracking-wider"
            >
              [继续战斗 ESC]
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div class="flex flex-col gap-1.5">
            <VolumeSliderRow
              testId="slider-master-vol"
              labelZh="主输出总线"
              subLabelEn="MASTER (-14 LUFS)"
              value={audio.settings.masterVolume}
              accentHex="#FBBF24"
              onChange={(v) => EventBus.emit('ui:command:update_audio_settings', { masterVolume: v })}
            />
            <VolumeSliderRow
              testId="slider-bgm-vol"
              labelZh="自适应双轨音乐"
              subLabelEn="EXPLORE + COMBAT STEMS"
              value={audio.settings.bgmVolume}
              accentHex="#38BDF8"
              onChange={(v) => EventBus.emit('ui:command:update_audio_settings', { bgmVolume: v })}
            />
            <VolumeSliderRow
              testId="slider-sfx-vol"
              labelZh="多变体打击音效"
              subLabelEn="24 POOLS · ±8% PITCH"
              value={audio.settings.sfxVolume}
              accentHex="#3CE682"
              onChange={(v) => EventBus.emit('ui:command:update_audio_settings', { sfxVolume: v })}
            />
          </div>

          <AudioDiagnosticsCard audio={audio} />
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 border-t border-[#272C42] pt-2 text-[9px]">
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-test-parry-sfx"
              onClick={() => EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_parry_clang' })}
              class="cursor-pointer px-2 py-1 bg-[#1E2233] hover:bg-[#272C42] border border-[#38BDF8] text-[#E8EFF5] font-semibold"
            >
              [⚡ 试听黄金招架音池]
            </button>
            <span data-testid="audio-last-sfx-readout" class="text-[#9AA5B8] font-mono">
              最近触发: {audio.lastTriggeredSfx ?? '—'} (v{audio.lastSfxVariant} · ×{audio.lastSfxRate.toFixed(2)}) · WebM+M4A
            </span>
          </div>

          {pauseMenu.activeSceneKey !== 'SanctumHubScene' && (
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-pause-return-sanctum"
              onClick={() => {
                EventBus.emit('ui:command:toggle_pause_menu', { open: false });
                EventBus.emit('ui:command:warp_campaign_stage', { target: 'sanctum' });
              }}
              class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#CF3650] text-[#FB7185] font-bold"
            >
              [水银回流 · 返回永恒锻炉圣所]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
