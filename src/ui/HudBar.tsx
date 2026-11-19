/**
 * 独立 Preact 战斗状态栏、双武器双主动技能槽、云存档入口与已激活变异徽标组件（src/ui/HudBar.tsx）。
 * 100% 挂载于 #ui-root DOM 层，零着色器模糊污染。
 */

import { memo } from 'preact/compat';
import { EventBus, type CloudSyncStatusSnapshot } from '../core/EventBus';
import { MUTATION_CATALOG } from '../data/mutations.data';
import type { PlayerCombatHudSnapshot } from '../data/weapons.data';
import { SkillSlotCard, WeaponPixelIcon, WeaponSlotCard } from './LoadoutSlotCards';

export { WeaponPixelIcon };

export interface HudBarProps {
  readonly combat: PlayerCombatHudSnapshot;
  readonly compactMobileMode: boolean;
  readonly syncStatus?: CloudSyncStatusSnapshot | null;
}

export const HudBar = memo(function HudBar({ combat, compactMobileMode, syncStatus }: HudBarProps) {
  const maxHp = Math.max(1, combat.maxHp);
  const redPct = Math.min(100, Math.max(0, (combat.hp / maxHp) * 100));
  const totalWithRallyPct = Math.min(
    100,
    Math.max(redPct, ((combat.hp + combat.rallyOrangeHp) / maxHp) * 100)
  );
  const activeMuts = combat.activeMutationIds ?? [];
  const isCriticalLowHp = combat.hp > 0 && combat.hp < maxHp * 0.25;
  const cursedKills = combat.cursedKillsRemaining ?? 0;
  const carriedBps = combat.carriedBlueprintsCount ?? 0;
  const isConflict = syncStatus?.fsmState === 'CONFLICT_MODAL_OPEN';
  const isOffline = syncStatus ? !syncStatus.isNetworkOnline : false;

  return (
    <div data-testid="hud-combat-bar" class="flex flex-col gap-1.5 pointer-events-none">
      {cursedKills > 0 && (
        <div
          data-testid="hud-curse-warning-bar"
          class="bg-[#3B0764]/95 border-2 border-[#A855F7] px-2.5 py-1 text-[10px] font-bold text-[#F8FAFC] tracking-wide animate-pulse shadow-lg"
        >
          [☠ 血咒剩余 {cursedKills} 杀 · 触之即死]
        </div>
      )}
      <div
        data-testid="hud-badge-renderer"
        class="bg-[#11131C]/94 border border-[#7A5128] px-2.5 py-1.5 shadow-lg flex flex-col gap-1"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-[#F8FAFC]">
            <img src="/assets/atlases/boot_crucible_seal.png" alt="Vessel Core" class="w-3.5 h-3.5 pixel-crisp" />
            <span>
              HP {combat.hp}/{combat.maxHp}
            </span>
            {combat.rallyOrangeHp > 0 && (
              <span data-testid="hud-rally-numeric" class="text-[#FBBF24] text-[9px] font-semibold">
                (+{combat.rallyOrangeHp} 橙血)
              </span>
            )}
            {(combat.aegisShieldHp ?? 0) > 0 && (
              <span class="text-[#38BDF8] text-[9px] font-bold">
                [护盾 +{combat.aegisShieldHp}]
              </span>
            )}
          </div>

          <div class="flex items-center gap-1 flex-wrap justify-end">
            {combat.isInvulnerable && (
              <span class="px-1 bg-[#38BDF8]/25 border border-[#38BDF8] text-[#38BDF8] text-[8px] font-bold">I-FRAME</span>
            )}
            {combat.isParryWindowActive && (
              <span class="px-1 bg-[#FBBF24]/25 border border-[#FBBF24] text-[#FBBF24] text-[8px] font-bold">PARRY</span>
            )}
            {combat.rapierCritReady && (
              <span class="px-1 bg-[#E8EFF5]/20 border border-[#38BDF8] text-[#E8EFF5] text-[8px] font-bold">刺剑必暴</span>
            )}
            {combat.cleaverRhythmWindowOpen && (
              <span class="px-1 bg-[#FF5E2B]/30 border border-[#FBBF24] text-[#FBBF24] text-[8px] font-bold">重刃节拍!</span>
            )}
            {combat.teslaTetherLinked && (
              <span data-testid="hud-tether-badge" class="px-1 bg-[#38BDF8]/30 border border-[#38BDF8] text-[#E8EFF5] text-[8px] font-bold">
                ⚡电弧绊线
              </span>
            )}
            {combat.crimsonTransfusionActive && (
              <span class="px-1 bg-[#E11D48]/30 border border-[#FB7185] text-[#FB7185] text-[8px] font-bold">沸血狂潮</span>
            )}
            {combat.predatorStealthActive && (
              <span class="px-1 bg-[#A855F7]/30 border border-[#A855F7] text-[#E8EFF5] text-[8px] font-bold">光学拟态</span>
            )}
            {isCriticalLowHp && (
              <span data-testid="hud-lowpass-critical-badge" class="px-1 bg-[#3B121E] border border-[#E11D48] text-[#FB7185] text-[8px] font-bold">
                濒死低通 420Hz
              </span>
            )}
          </div>
        </div>

        <div
          data-testid="hud-hp-bar"
          class={`relative h-3 bg-[#0B0C10] border border-[#593A1E] overflow-hidden ${
            compactMobileMode ? 'w-48' : 'w-64'
          }`}
        >
          <div
            data-testid="hud-rally-orange-fill"
            class={`absolute inset-y-0 left-0 transition-[width] duration-75 ${
              combat.rallyFrozen ? 'bg-[#FBBF24]' : 'bg-[#FF5E2B]'
            }`}
            style={{ width: `${totalWithRallyPct.toFixed(1)}%` }}
          />
          <div
            data-testid="hud-hp-red-fill"
            class="absolute inset-y-0 left-0 bg-[#E11D48] border-t border-[#FB7185] transition-[width] duration-75"
            style={{ width: `${redPct.toFixed(1)}%` }}
          />
        </div>

        <div class="flex items-center justify-between gap-1.5 text-[9px] pt-0.5 flex-wrap">
          <div class="flex items-center gap-1">
            <span data-testid="stat-badge-rubedo" class="px-1.5 py-0.2 bg-[#240B12] border border-[#E11D48] text-[#FB7185] font-bold">
              赤 {combat.stats.rubedo}
            </span>
            <span data-testid="stat-badge-citrinitas" class="px-1.5 py-0.2 bg-[#291A0E] border border-[#FBBF24] text-[#FBBF24] font-bold">
              黄 {combat.stats.citrinitas}
            </span>
            <span data-testid="stat-badge-albedo" class="px-1.5 py-0.2 bg-[#0B1F1D] border border-[#3CE682] text-[#3CE682] font-bold">
              白 {combat.stats.albedo}
            </span>
          </div>

          <div class="flex items-center gap-1 text-[#D4DEE8] font-semibold">
            <span class="text-[#FB7185]">[F] {combat.flaskCharges}/{combat.maxFlaskCharges}</span>
            <span class="text-[#FBBF24]">{combat.gold}G</span>
            <span class="text-[#38BDF8]">✦{combat.ichor}</span>
            {carriedBps > 0 && (
              <span data-testid="hud-blueprint-badge" class="text-[#3CE682]">📜×{carriedBps}</span>
            )}
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-open-mutation-forge"
              onClick={() => EventBus.emit('ui:command:toggle_mutation_forge', { open: true })}
              class="pointer-events-auto cursor-pointer px-1 py-0.2 bg-[#1E2233] hover:bg-[#272C42] border border-[#A855F7] text-[#E8EFF5] text-[8px] font-bold"
            >
              [V 锻炉 {activeMuts.length}/3]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-open-pause-audio"
              onClick={() => EventBus.emit('ui:command:toggle_pause_menu', { open: true })}
              class="pointer-events-auto cursor-pointer px-1 py-0.2 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[#FBBF24] text-[8px] font-bold"
            >
              [ESC 音频]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-open-auth-sync"
              onClick={() => EventBus.emit('ui:command:toggle_auth_drawer', { open: true })}
              class={`pointer-events-auto cursor-pointer px-1 py-0.2 border text-[8px] font-bold ${
                isConflict
                  ? 'bg-[#3B121E] border-[#E11D48] text-[#FB7185]'
                  : isOffline
                    ? 'bg-[#291A0E] border-[#E0AE53] text-[#E0AE53]'
                    : 'bg-[#0B1F1D] hover:bg-[#12332F] border-[#3CE682] text-[#3CE682]'
              }`}
            >
              {isConflict ? '[⚠ 分叉冲突]' : isOffline ? '[⚡ 离线金库]' : '[☁ 云档]'}
            </button>
          </div>
        </div>

        {activeMuts.length > 0 && !compactMobileMode && (
          <div class="flex items-center gap-1 pt-0.5 border-t border-[#272C42]">
            {activeMuts.map((mid) => {
              const m = MUTATION_CATALOG[mid];
              return (
                <div key={mid} class="flex items-center gap-1 bg-[#161824] border border-[#323954] px-1 py-0.5">
                  <WeaponPixelIcon iconSlot={m.iconSlot} scale={0.75} />
                  <span class="text-[8px] text-[#D4DEE8] font-semibold">{m.nameZh}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {compactMobileMode && (
        <div class="flex items-center gap-1 flex-wrap">
          <WeaponSlotCard slotInfo={combat.primarySlot} keyLabel="ATK" compact={true} />
          <WeaponSlotCard slotInfo={combat.secondarySlot} keyLabel="PRY" compact={true} />
          {combat.skillOneSlot && <SkillSlotCard skillInfo={combat.skillOneSlot} keyLabel="S1" compact={true} />}
          {combat.skillTwoSlot && <SkillSlotCard skillInfo={combat.skillTwoSlot} keyLabel="S2" compact={true} />}
        </div>
      )}
    </div>
  );
});

export const DesktopWeaponLoadoutDock = memo(function DesktopWeaponLoadoutDock({
  combat,
}: {
  readonly combat: PlayerCombatHudSnapshot;
}) {
  return (
    <div data-testid="hud-weapon-dock" class="pointer-events-none flex items-center gap-1.5 flex-wrap">
      <WeaponSlotCard slotInfo={combat.primarySlot} keyLabel="J" compact={false} />
      <WeaponSlotCard slotInfo={combat.secondarySlot} keyLabel="K" compact={false} />
      {combat.skillOneSlot && <SkillSlotCard skillInfo={combat.skillOneSlot} keyLabel="Q" compact={false} />}
      {combat.skillTwoSlot && <SkillSlotCard skillInfo={combat.skillTwoSlot} keyLabel="C" compact={false} />}
    </div>
  );
});
