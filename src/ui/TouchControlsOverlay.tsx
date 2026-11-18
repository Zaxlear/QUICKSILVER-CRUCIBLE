import type { TouchButtonHudItem, TouchHudSnapshot } from '../data/playerKinematics.data';

export interface TouchControlsOverlayProps {
  readonly touchHud: TouchHudSnapshot | null;
}

const HUD_SHEET_URL = '/assets/atlases/touch_hud_sheet.png';

function resolveButtonRingClasses(btn: TouchButtonHudItem): string {
  if (btn.pressed) {
    if (btn.accentRole === 'primary' || btn.accentRole === 'secondary') {
      return 'border-[#FBBF24] bg-[#3D2817]/90 shadow-[0_0_14px_rgba(251,191,36,0.75)] scale-95';
    }
    return 'border-[#38BDF8] bg-[#1E2233]/92 shadow-[0_0_14px_rgba(56,189,248,0.75)] scale-95';
  }
  switch (btn.accentRole) {
    case 'primary':
      return 'border-[#A62B44]/85 bg-[#161824]/75';
    case 'secondary':
      return 'border-[#C28B42]/80 bg-[#161824]/72';
    case 'mobility':
      return 'border-[#556085]/85 bg-[#11131C]/72';
    case 'utility':
      return 'border-[#414A6B]/80 bg-[#11131C]/68';
  }
}

/**
 * 移动端自适应半透明虚拟摇杆与人体工学弧形动作键视觉反馈层（src/ui/TouchControlsOverlay.tsx）。
 *
 * 严格遵循单向数据流与零占位符铁律：
 * - 不持有任何 Phaser / PlayerEntity 引用，纯渲染 EventBus 快照；
 * - 全部按键与星盘摇杆采用 48 色像素图集 touch_hud_sheet.png，零内联几何 SVG。
 */
export function TouchControlsOverlay({ touchHud }: TouchControlsOverlayProps) {
  if (!touchHud || !touchHud.visible) {
    return null;
  }

  const { stick, buttons } = touchHud;

  return (
    <div
      data-testid="touch-controls-overlay"
      class="pointer-events-none fixed inset-0 z-20 select-none"
    >
      {/* 左半屏动态盲操星盘浮动虚拟摇杆 */}
      <div
        data-testid="touch-floating-stick"
        data-active={stick.active ? 'true' : 'false'}
        class={`absolute w-16 h-16 transition-opacity duration-75 ${
          stick.active ? 'opacity-95' : 'opacity-45'
        }`}
        style={{
          left: `${stick.originX - 32}px`,
          top: `${stick.originY - 32}px`,
        }}
      >
        <div
          class="w-16 h-16 pixel-crisp"
          style={{
            backgroundImage: `url('${HUD_SHEET_URL}')`,
            backgroundSize: '256px 96px',
            backgroundPosition: '0px -32px',
          }}
        />
        {!stick.active && (
          <div class="mt-0.5 text-center text-[8px] tracking-widest text-[#9AA5B8] uppercase">
            FLOAT STICK
          </div>
        )}
      </div>

      {/* 跟随拇指偏移的活态水银球核心 */}
      <div
        data-testid="touch-stick-knob"
        class={`absolute w-16 h-16 transition-opacity duration-75 ${
          stick.active ? 'opacity-100' : 'opacity-55'
        }`}
        style={{
          left: `${stick.knobX - 32}px`,
          top: `${stick.knobY - 32}px`,
        }}
      >
        <div
          class="w-16 h-16 pixel-crisp"
          style={{
            backgroundImage: `url('${HUD_SHEET_URL}')`,
            backgroundSize: '256px 96px',
            backgroundPosition: '-64px -32px',
          }}
        />
      </div>

      {/* 右半屏人体工学扇形动作键组（严格避开灵动岛与底部 >=22px Home Indicator 净空） */}
      {buttons.map((btn) => {
        const diameter = btn.radiusPx * 2;
        const iconScale = btn.radiusPx >= 28 ? 1.0 : btn.radiusPx <= 19 ? 0.78 : 0.88;
        return (
          <div
            key={btn.action}
            data-testid={`touch-btn-${btn.action}`}
            data-pressed={btn.pressed ? 'true' : 'false'}
            aria-label={btn.label}
            class={`absolute rounded-full border-2 flex flex-col items-center justify-center transition-transform duration-75 ${resolveButtonRingClasses(
              btn
            )}`}
            style={{
              width: `${diameter}px`,
              height: `${diameter}px`,
              left: `${btn.centerX - btn.radiusPx}px`,
              top: `${btn.centerY - btn.radiusPx}px`,
            }}
          >
            <div
              class="w-7 h-7 pixel-crisp shrink-0 bg-no-repeat"
              style={{
                backgroundImage: `url('${HUD_SHEET_URL}')`,
                backgroundSize: '256px 96px',
                backgroundPosition: `-${btn.spriteSlot * 32}px 0px`,
                width: '32px',
                height: '32px',
                transform: `scale(${iconScale})`,
              }}
            />
            <span
              class={`${
                btn.radiusPx >= 28 ? 'mt-0.5 text-[9px]' : '-mt-1 text-[8px]'
              } relative z-10 font-bold tracking-wider leading-none ${
                btn.pressed ? 'text-[#F8FAFC]' : 'text-[#B8C4D4]'
              }`}
            >
              {btn.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
