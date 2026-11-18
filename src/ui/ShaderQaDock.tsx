import { memo } from 'preact/compat';
import { useState } from 'preact/hooks';
import {
  EventBus,
  type ShowcaseShaderId,
  type ShowcaseStatePayload,
} from '../core/EventBus';

export interface ShaderQaDockProps {
  readonly showcase: ShowcaseStatePayload;
  readonly compactMobileMode?: boolean;
}

const SHADER_BUTTONS: readonly {
  readonly id: ShowcaseShaderId;
  readonly label: string;
}[] = [
  { id: 'hitFlash', label: '1.HIT-FLASH' },
  { id: 'ashDissolve', label: '2.ASH-DISSOLVE' },
  { id: 'shieldRefract', label: '3.SHIELD-REFRACT' },
  { id: 'chromaticImpact', label: '4.CHROMATIC-IMPACT' },
  { id: 'vignetteBloom', label: '5.VIGNETTE-BLOOM' },
];

/**
 * 独立 Preact GLSL 着色器巡检控制坞（src/ui/ShaderQaDock.tsx）。
 * 移动端触控模式下自动折叠为顶部紧凑胶囊，确保左右底部触控热区 100% 无遮挡。
 */
export const ShaderQaDock = memo(function ShaderQaDock({
  showcase,
  compactMobileMode = false,
}: ShaderQaDockProps) {
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);

  if (compactMobileMode && !drawerOpen) {
    return (
      <button
        type="button"
        data-ui-interactive="true"
        data-testid="btn-toggle-qa-drawer"
        onClick={() => setDrawerOpen(true)}
        class="pointer-events-auto cursor-pointer bg-[#11131C]/90 border border-[#7A5128] px-2.5 py-1 text-[9px] tracking-wider text-[#E0AE53] shadow-md"
      >
        [QA SHADERS ▾]
      </button>
    );
  }

  return (
    <div
      data-testid="shader-qa-dock"
      class="pointer-events-auto flex flex-wrap items-center justify-end gap-1"
    >
      {compactMobileMode && (
        <button
          type="button"
          data-ui-interactive="true"
          data-testid="btn-close-qa-drawer"
          onClick={() => setDrawerOpen(false)}
          class="cursor-pointer bg-[#240B12]/95 border border-[#CF3650] px-2 py-0.5 text-[9px] text-[#FB7185]"
        >
          [CLOSE ▴]
        </button>
      )}

      {SHADER_BUTTONS.map((btn) => {
        const isActive = showcase.shaders[btn.id];
        return (
          <button
            key={btn.id}
            type="button"
            data-ui-interactive="true"
            data-testid={`btn-shader-${btn.id}`}
            aria-pressed={isActive}
            onClick={() => EventBus.emit('ui:command:toggle_shader', { shader: btn.id })}
            class={`cursor-pointer border px-2 py-1 text-[10px] tracking-wider font-medium transition-colors ${
              isActive
                ? 'bg-[#3D2817]/95 border-[#FBBF24] text-[#FBBF24]'
                : 'bg-[#11131C]/90 hover:bg-[#1E2233] border-[#414A6B] text-[#B8C4D4]'
            }`}
          >
            [{btn.label}: {isActive ? 'ON' : 'OFF'}]
          </button>
        );
      })}

      <button
        type="button"
        data-ui-interactive="true"
        data-testid="btn-trauma-test"
        onClick={() => EventBus.emit('ui:command:trigger_trauma_pulse', { amount: 0.55 })}
        class="cursor-pointer bg-[#161824]/95 hover:bg-[#1E2233] active:bg-[#272C42] border border-[#C28B42] px-2 py-1 text-[10px] tracking-wider text-[#FBBF24] transition-colors"
      >
        [PULSE TRAUMA]
      </button>
    </div>
  );
});
