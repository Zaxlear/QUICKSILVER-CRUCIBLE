/**
 * 34 槽位像素图标渲染器与双武器 / 双主动技能 HUD 卡片子组件
 * （src/ui/LoadoutSlotCards.tsx）。
 */

import type { CombatHudSkillSlotSummary } from '../data/skills.data';
import type { CombatHudSlotSummary } from '../data/weapons.data';

const WEAPON_ICON_SHEET = '/assets/atlases/weapon_icons_sheet.png';
const TOTAL_ICON_SLOTS = 34;

export function WeaponPixelIcon({
  iconSlot,
  scale = 1,
}: {
  readonly iconSlot: number;
  readonly scale?: 0.75 | 1 | 1.5;
}) {
  const px = Math.round(32 * scale);
  const sheetW = TOTAL_ICON_SLOTS * px;
  const sheetH = px;
  return (
    <span
      class="inline-block pixel-crisp shrink-0"
      style={{
        width: `${px}px`,
        height: `${px}px`,
        backgroundImage: `url('${WEAPON_ICON_SHEET}')`,
        backgroundSize: `${sheetW}px ${sheetH}px`,
        backgroundPosition: `-${iconSlot * px}px 0px`,
      }}
    />
  );
}

export function WeaponSlotCard({
  slotInfo,
  keyLabel,
  compact,
}: {
  readonly slotInfo: CombatHudSlotSummary;
  readonly keyLabel: string;
  readonly compact: boolean;
}) {
  return (
    <div
      data-testid={`hud-slot-${slotInfo.slot}`}
      class={`bg-[#11131C]/92 border px-1.5 py-1 shadow-md flex items-center gap-1.5 ${
        slotInfo.isReady ? 'border-[#7A5128]' : 'border-[#323954] opacity-65'
      }`}
    >
      <div class="relative">
        <WeaponPixelIcon iconSlot={slotInfo.iconSlot} scale={1} />
        <span class="absolute -top-1 -left-1 px-1 bg-[#0B0C10] border border-[#556085] text-[8px] font-bold text-[#F8FAFC]">
          {keyLabel}
        </span>
      </div>
      <div class="flex flex-col leading-tight min-w-0">
        <div class="flex items-center gap-1">
          <span class="text-[10px] font-bold text-[#F8FAFC] truncate">
            {compact ? slotInfo.nameZh.slice(0, 4) : slotInfo.nameZh}
          </span>
          <span
            class="px-1 text-[8px] font-bold bg-[#1E2233] border"
            style={{ borderColor: slotInfo.colorHex, color: slotInfo.colorHex }}
          >
            {slotInfo.qualityBadge}
          </span>
        </div>
        <div class="text-[9px] text-[#9AA5B8] flex items-center gap-1.5">
          <span>{slotInfo.scaledDps} DPS</span>
          {slotInfo.maxAmmo !== null && (
            <span class="text-[#FBBF24] font-semibold">
              ➴ {slotInfo.ammoLeft}/{slotInfo.maxAmmo}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function SkillSlotCard({
  skillInfo,
  keyLabel,
  compact,
}: {
  readonly skillInfo: CombatHudSkillSlotSummary;
  readonly keyLabel: string;
  readonly compact: boolean;
}) {
  return (
    <div
      data-testid={`hud-slot-${skillInfo.slot}`}
      class={`bg-[#11131C]/92 border px-1.5 py-1 shadow-md flex items-center gap-1.5 ${
        skillInfo.isReady ? 'border-[#A855F7]' : 'border-[#323954] opacity-70'
      }`}
    >
      <div class="relative">
        <WeaponPixelIcon iconSlot={skillInfo.iconSlot} scale={1} />
        <span class="absolute -top-1 -left-1 px-1 bg-[#0B0C10] border border-[#A855F7] text-[8px] font-bold text-[#F8FAFC]">
          {keyLabel}
        </span>
      </div>
      {!compact && (
        <div class="flex flex-col leading-tight min-w-0">
          <div class="flex items-center gap-1">
            <span class="text-[10px] font-bold text-[#F8FAFC] truncate">{skillInfo.nameZh}</span>
            <span
              class="px-1 text-[8px] font-bold bg-[#1E2233] border"
              style={{ borderColor: skillInfo.colorHex, color: skillInfo.colorHex }}
            >
              {skillInfo.qualityBadge}
            </span>
          </div>
          <div class="text-[9px]">
            {skillInfo.isReady ? (
              <span class="text-[#3CE682] font-bold">READY ({skillInfo.baseCooldownSec}s)</span>
            ) : (
              <span class="text-[#FF5E2B] font-bold">CD {skillInfo.cooldownLeftSec.toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
