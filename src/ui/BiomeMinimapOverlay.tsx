/**
 * 右上角常驻紧凑 DAG 拓扑小地图、四大探索符文条与底部非阻断剧情横幅
 * （src/ui/BiomeMinimapOverlay.tsx）。
 */

import { EventBus, type MinimapSnapshotPayload } from '../core/EventBus';
import { ALL_RUNE_IDS, EXPLORATION_RUNES } from '../data/runes.data';
import { computeNormalizedMapBounds, resolveRoleMeta } from './MinimapTacticalModal';

const MAP_ICON_SHEET = '/assets/atlases/minimap_ui_sheet.png';

export interface BiomeMinimapWidgetProps {
  readonly minimap: MinimapSnapshotPayload | null;
  readonly compactMobileMode: boolean;
}

export function BiomeMinimapWidget({ minimap, compactMobileMode }: BiomeMinimapWidgetProps) {
  if (!minimap) return null;

  const bounds = computeNormalizedMapBounds(minimap);
  const unlockedSet = new Set(minimap.unlockedRunes);
  const activeSteleCount = minimap.nodes.filter((n) => n.teleporterActive).length;

  return (
    <div
      data-testid="hud-minimap-compact"
      class="pointer-events-auto bg-[#11131C]/92 border border-[#7A5128] p-1.5 shadow-lg flex flex-col gap-1"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-[9px] font-semibold tracking-wider text-[#FBBF24]">
          {minimap.biomeNameZh} · ✦{activeSteleCount}
        </span>
        <button
          type="button"
          data-ui-interactive="true"
          data-testid="btn-open-minimap"
          onClick={() => EventBus.emit('ui:command:toggle_minimap', { expanded: true })}
          class="cursor-pointer bg-[#1E2233] hover:bg-[#272C42] border border-[#38BDF8] px-1.5 py-0.5 text-[9px] font-bold text-[#38BDF8]"
        >
          [MAP / 传送 ▾]
        </button>
      </div>

      {/* 右上角实时 DAG 缩略预览窗（点击展开全屏秒传星盘） */}
      <button
        type="button"
        data-ui-interactive="true"
        data-testid="minimap-preview-canvas"
        aria-label="Open Tactical Teleporter Map"
        onClick={() => EventBus.emit('ui:command:toggle_minimap', { expanded: true })}
        class={`cursor-pointer relative bg-[#0B0C10] border border-[#323954] overflow-hidden ${
          compactMobileMode ? 'w-32 h-10' : 'w-44 h-14'
        }`}
      >
        {minimap.bridges.map((br) => {
          const leftPct = ((br.worldTileX - bounds.minX) / bounds.spanX) * 86 + 7;
          const topPct = ((br.worldTileY - bounds.minY) / bounds.spanY) * 76 + 12;
          const wPct = Math.max(1.5, (br.widthTiles / bounds.spanX) * 86);
          const hPct = Math.max(3, (br.heightTiles / bounds.spanY) * 76);
          return (
            <span
              key={br.bridgeId}
              class={`absolute ${br.requiredRune ? 'bg-[#3CE682]/70' : 'bg-[#7A5128]/80'}`}
              style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${wPct}%`, height: `${hPct}%` }}
            />
          );
        })}

        {minimap.nodes.map((n) => {
          const meta = resolveRoleMeta(n.role);
          const isCurr = n.nodeId === minimap.currentRoomId;
          const leftPct = ((n.worldTileX - bounds.minX) / bounds.spanX) * 86 + 7;
          const topPct = ((n.worldTileY - bounds.minY) / bounds.spanY) * 76 + 12;
          const wPct = Math.max(6, (n.widthTiles / bounds.spanX) * 86);
          const hPct = Math.max(14, (n.heightTiles / bounds.spanY) * 76);
          return (
            <span
              key={n.nodeId}
              class={`absolute border ${meta.borderClass} ${
                isCurr ? 'ring-1 ring-[#F8FAFC] z-10' : n.visited ? 'opacity-95' : 'opacity-45'
              }`}
              style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${wPct}%`, height: `${hPct}%` }}
            >
              {n.teleporterActive && (
                <span class="block w-1 h-1 bg-[#38BDF8] mx-auto mt-0.5" />
              )}
            </span>
          );
        })}
      </button>

      {/* 四大探索符文徽章状态栏（支持点击切换巡检） */}
      <div class="flex items-center justify-between gap-1">
        {ALL_RUNE_IDS.map((rid) => {
          const spec = EXPLORATION_RUNES[rid];
          const active = unlockedSet.has(rid);
          return (
            <button
              key={rid}
              type="button"
              data-ui-interactive="true"
              data-testid={`btn-rune-${rid}`}
              title={`${spec.nameZh} (${active ? '已激活' : '未解锁'})`}
              onClick={() => EventBus.emit('ui:command:toggle_rune', { runeId: rid })}
              class={`cursor-pointer flex items-center gap-0.5 px-1 py-0.5 border text-[8px] ${
                active
                  ? 'bg-[#1E2233] border-[#C28B42] text-[#F8FAFC]'
                  : 'bg-[#0B0C10] border-[#272C42] text-[#556085] opacity-60'
              }`}
            >
              <span
                class="w-3.5 h-3.5 pixel-crisp inline-block shrink-0"
                style={{
                  backgroundImage: `url('${MAP_ICON_SHEET}')`,
                  backgroundSize: '192px 16px',
                  backgroundPosition: `-${spec.minimapIconSlot * 16}px 0px`,
                }}
              />
              {!compactMobileMode && <span>{spec.shortBadge}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WorldLoreBannerToast({ minimap }: { readonly minimap: MinimapSnapshotPayload | null }) {
  if (!minimap?.banner) return null;
  const { title, body, accentHex } = minimap.banner;
  return (
    <div
      data-testid="world-lore-banner"
      class="pointer-events-none fixed left-1/2 -translate-x-1/2 bottom-14 z-30 max-w-lg w-[88%] bg-[#11131C]/95 border-2 px-4 py-2.5 shadow-2xl text-center"
      style={{ borderColor: accentHex }}
    >
      <div class="text-xs font-bold tracking-wider mb-1" style={{ color: accentHex }}>
        {title}
      </div>
      <div class="text-[11px] text-[#E8EFF5] leading-relaxed">{body}</div>
    </div>
  );
}
