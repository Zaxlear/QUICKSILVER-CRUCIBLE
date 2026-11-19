/**
 * 拾取主动技能球时的 [Q] / [C] 双槽位对比换装与化学联动高亮独立 Preact 弹窗
 * （src/ui/SkillCompareModal.tsx，严格 <= 190 行）。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import type { SkillCompareModalPayload, SkillCompareSlotView } from '../data/economy.data';
import { STAT_COLOR_META } from '../data/weapons.data';
import { WeaponPixelIcon } from './LoadoutSlotCards';

export interface SkillCompareModalProps {
  readonly payload: SkillCompareModalPayload | null;
}

function EquippedSkillCard({
  slotLabel, view, testId, onReplace,
}: {
  readonly slotLabel: string; readonly view: SkillCompareSlotView; readonly testId: string; readonly onReplace: () => void;
}) {
  return (
    <div class="bg-[#161824] border border-[#414A6B] p-2.5 flex flex-col justify-between gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <WeaponPixelIcon iconSlot={view.iconSlot} scale={1} />
          <div>
            <div class="text-[9px] text-[#9AA5B8] uppercase tracking-wider">{slotLabel}</div>
            <div class="text-xs font-bold text-[#F8FAFC]">
              {view.nameZh} <span class="text-[#FBBF24]">{view.qualityBadge}</span>
            </div>
            <div class="text-[10px] text-[#B8C4D4]">伤害 {view.scaledDamage} · 冷却 {view.baseCooldownSec}s</div>
          </div>
        </div>
        {view.hasWeaponChemicalSynergy && (
          <span class="px-1.5 py-0.5 bg-[#291A0E] border border-[#FBBF24] text-[9px] font-bold text-[#FBBF24]">★ 化学联动</span>
        )}
      </div>

      <div class="text-[10px] text-[#9AA5B8] space-y-0.5">
        {view.affixes.map((a) => <div key={a.id} class="truncate">• {a.labelZh}</div>)}
      </div>

      <button
        type="button"
        data-ui-interactive="true"
        data-testid={testId}
        onClick={onReplace}
        class="cursor-pointer w-full py-1.5 px-2 bg-[#0B1F1D] hover:bg-[#12332F] border border-[#3CE682] text-[11px] font-bold text-[#3CE682] tracking-wide"
      >
        [{slotLabel} ← 装填此技能]
      </button>
    </div>
  );
}

export function SkillCompareModal({ payload }: SkillCompareModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'KeyQ' || ev.code === 'Digit1') { ev.preventDefault(); EventBus.emit('ui:command:resolve_skill_compare', { action: 'equip_skill_1' }); }
      else if (ev.code === 'KeyC' || ev.code === 'Digit2') { ev.preventDefault(); EventBus.emit('ui:command:resolve_skill_compare', { action: 'equip_skill_2' }); }
      else if (ev.code === 'Escape') { ev.preventDefault(); EventBus.emit('ui:command:resolve_skill_compare', { action: 'cancel' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;
  const { candidate, currentSkillOne, currentSkillTwo } = payload;

  return (
    <div data-testid="skill-compare-modal" role="dialog" aria-modal="true" class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/86 flex items-center justify-center p-3">
      <div class="max-w-2xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#3CE682] p-3.5 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#323954] pb-2">
          <div>
            <span class="text-[10px] tracking-[0.18em] text-[#3CE682] uppercase font-bold">ALCHEMICAL CATALYST · 主动炼金技能双槽换装</span>
            <h2 class="text-sm font-bold text-[#F8FAFC]">选择替换 [Q] 或 [C] 槽位</h2>
          </div>

          <div class="flex items-center gap-2">
            {payload.recycleGoldValue > 0 && (
              <button
                type="button"
                data-ui-interactive="true"
                data-testid="btn-recycle-skill-modal"
                onClick={() => EventBus.emit('ui:command:recycle_floor_loot', { lootId: payload.floorLootId })}
                class="cursor-pointer px-2.5 py-1 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]"
              >
                [♻ 回收 +{payload.recycleGoldValue}G]
              </button>
            )}
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-cancel-skill-compare"
              onClick={() => EventBus.emit('ui:command:resolve_skill_compare', { action: 'cancel' })}
              class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-[10px] font-bold text-[#FB7185]"
            >
              [留在地上 ESC]
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div class="md:col-span-6 bg-[#161824] border-2 border-[#38BDF8] p-3 flex flex-col justify-between gap-2">
            <div>
              <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-2">
                  <div class="p-1 bg-[#0B0C10] border border-[#38BDF8]"><WeaponPixelIcon iconSlot={candidate.iconSlot} scale={1.5} /></div>
                  <div>
                    <div class="text-sm font-bold text-[#F8FAFC]">
                      {candidate.nameZh} <span class="px-1.5 bg-[#1E2233] border border-[#FBBF24] text-[10px] text-[#FBBF24]">{candidate.qualityBadge}</span>
                    </div>
                    <div class="flex items-center gap-1 mt-1">
                      {candidate.colors.map((c) => (
                        <span key={c} class="px-1.5 text-[9px] font-bold border bg-[#0B0C10]" style={{ borderColor: STAT_COLOR_META[c].accentHex, color: STAT_COLOR_META[c].accentHex }}>
                          {STAT_COLOR_META[c].nameZh}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                {candidate.hasWeaponChemicalSynergy && (
                  <span class="px-1.5 py-0.5 bg-[#291A0E] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]">★ 化学联动</span>
                )}
              </div>

              <div class="grid grid-cols-2 gap-1.5 bg-[#0B0C10] border border-[#272C42] p-2 text-center mb-2">
                <div><div class="text-[9px] text-[#9AA5B8]">缩放基础伤害</div><div class="text-xs font-bold text-[#F8FAFC]">{candidate.scaledDamage}</div></div>
                <div><div class="text-[9px] text-[#9AA5B8]">基础冷却时间</div><div class="text-xs font-bold text-[#38BDF8]">{candidate.baseCooldownSec}s</div></div>
              </div>

              <div class="text-[10px] text-[#D4DEE8] leading-snug mb-1.5">{candidate.mechanicSummaryZh}</div>
              <div class="text-[10px] text-[#FBBF24] leading-snug mb-2">✦ {candidate.synergySummaryZh}</div>

              <div class="border-t border-[#272C42] pt-1.5 space-y-1">
                {candidate.affixes.map((a) => <div key={a.id} class="text-[10px] text-[#3CE682]">• {a.labelZh}</div>)}
              </div>
            </div>
          </div>

          <div class="md:col-span-6 flex flex-col gap-2.5 justify-between">
            <EquippedSkillCard slotLabel="技能槽 1 [Q]" view={currentSkillOne} testId="btn-equip-skill-1" onReplace={() => EventBus.emit('ui:command:resolve_skill_compare', { action: 'equip_skill_1' })} />
            <EquippedSkillCard slotLabel="技能槽 2 [C]" view={currentSkillTwo} testId="btn-equip-skill-2" onReplace={() => EventBus.emit('ui:command:resolve_skill_compare', { action: 'equip_skill_2' })} />
          </div>
        </div>
      </div>
    </div>
  );
}
