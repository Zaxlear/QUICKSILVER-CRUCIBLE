/**
 * 双轨自适应混音电平与 420Hz 双二阶低通实时频谱诊断面板（src/ui/AudioDiagnosticsCard.tsx）。
 */

import type { AudioTelemetrySnapshot } from '../core/EventBus';

export interface AudioDiagnosticsCardProps {
  readonly audio: AudioTelemetrySnapshot;
}

export function AudioDiagnosticsCard({ audio }: AudioDiagnosticsCardProps) {
  const isMuffled = audio.lowpassTargetHz <= 500 || audio.lowpassCurrentHz <= 800;
  const explorePct = Math.min(100, Math.round((audio.exploreVolume / 0.85) * 100));
  const combatPct = Math.min(100, Math.round((audio.combatVolume / 0.9) * 100));

  return (
    <div class="bg-[#0B0C10] border border-[#323954] p-2.5 flex flex-col justify-between gap-2">
      <div class="flex items-start justify-between gap-1.5">
        <div>
          <div data-testid="audio-program-title" class="text-[11px] font-bold text-[#F8FAFC]">
            {audio.programTitleZh}
          </div>
          <div class="text-[9px] text-[#9AA5B8] font-mono">
            {audio.bpm} BPM · {audio.timeSignature} · DRIFT {audio.stemPhaseDriftMs.toFixed(1)}ms
          </div>
        </div>
        <span
          data-testid="audio-aggro-badge"
          class={`px-1.5 py-0.5 border text-[9px] font-bold ${
            audio.aggroCount > 0
              ? 'bg-[#3B121E] border-[#E11D48] text-[#FB7185]'
              : 'bg-[#161824] border-[#323954] text-[#9AA5B8]'
          }`}
        >
          仇恨怪: {audio.aggroCount}
        </span>
      </div>

      {/* 探索轨 vs 战斗轨实时电平 */}
      <div class="flex flex-col gap-1 text-[9px] font-mono">
        <div class="flex items-center gap-2">
          <span class="w-16 text-[#9AA5B8]">EXPLORE</span>
          <div class="flex-1 h-2 bg-[#161824] border border-[#272C42] overflow-hidden">
            <div class="h-full bg-[#38BDF8] transition-[width] duration-75" style={{ width: `${explorePct}%` }} />
          </div>
          <span class="w-9 text-right text-[#38BDF8]">{audio.exploreVolume.toFixed(2)}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-16 text-[#FB7185]">COMBAT</span>
          <div class="flex-1 h-2 bg-[#161824] border border-[#272C42] overflow-hidden">
            <div class="h-full bg-[#FF5E2B] transition-[width] duration-75" style={{ width: `${combatPct}%` }} />
          </div>
          <span class="w-9 text-right text-[#FF5E2B]">{audio.combatVolume.toFixed(2)}</span>
        </div>
      </div>

      {/* WebAudioFilterRack 420Hz 低通状态与 12 段实时频谱仪 */}
      <div class="border-t border-[#1E2233] pt-1.5 flex flex-col gap-1">
        <div class="flex items-center justify-between text-[9px]">
          <span
            data-testid="audio-lowpass-badge"
            class={`px-1.5 py-0.5 border font-mono font-bold ${
              isMuffled
                ? 'bg-[#291A0E] border-[#FBBF24] text-[#FBBF24]'
                : 'bg-[#0B1F1D] border-[#3CE682] text-[#3CE682]'
            }`}
          >
            BIQUAD LOWPASS: {audio.lowpassCurrentHz} Hz {isMuffled ? '(闷化激活)' : '(全频通透)'}
          </span>
          {audio.lowHpPulseActive && (
            <span class="text-[#FB7185] font-bold">♥ 68BPM 濒死脉搏</span>
          )}
        </div>

        <div
          data-testid="audio-spectrum-bars"
          class="h-9 flex items-end gap-1 pt-1 px-1 bg-[#11131C] border border-[#272C42]"
        >
          {audio.spectrumBars.map((val, idx) => {
            const hPct = Math.max(8, Math.min(100, Math.round(val * 100)));
            const isHighBand = idx >= 5;
            return (
              <div
                key={idx}
                class={`flex-1 transition-[height] duration-75 ${
                  isHighBand
                    ? isMuffled
                      ? 'bg-[#414A6B]/55'
                      : 'bg-[#3CE682]'
                    : 'bg-[#FBBF24]'
                }`}
                style={{ height: `${hPct}%` }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
