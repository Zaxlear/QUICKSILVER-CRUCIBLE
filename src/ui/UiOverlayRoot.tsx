import { useEffect, useState } from 'preact/hooks';
import { isDevQaQueryEnabled } from '../core/Constants';
import {
  EventBus,
  type AudioTelemetrySnapshot,
  type BootTelemetryPayload,
  type BossHudSnapshot,
  type CloudSyncStatusSnapshot,
  type DialogueBannerSnapshot,
  type MinimapSnapshotPayload,
  type MutationForgeModalPayload,
  type PauseAudioMenuPayload,
  type PlayerCombatHudSnapshot,
  type SaveConflictModalPayload,
  type ScrollPickModalPayload,
  type ShowcaseStatePayload,
  type ViewportSnapshotPayload,
  type WeaponCompareModalPayload,
} from '../core/EventBus';
import { DEFAULT_AUDIO_TELEMETRY } from '../data/audio.data';
import { AuthSyncDrawer } from './AuthSyncDrawer';
import { BiomeMinimapWidget, WorldLoreBannerToast } from './BiomeMinimapOverlay';
import { BossHealthBar } from './BossHealthBar';
import { DialogueBanner } from './DialogueBanner';
import { DesktopWeaponLoadoutDock, HudBar } from './HudBar';
import { MinimapTacticalModal } from './MinimapTacticalModal';
import { MutationForgeModal } from './MutationForgeModal';
import { PauseAudioMenu } from './PauseAudioMenu';
import { SaveConflictModal } from './SaveConflictModal';
import { ScrollPickModal } from './ScrollPickModal';
import { ShaderQaDock } from './ShaderQaDock';
import { TouchControlsOverlay } from './TouchControlsOverlay';
import { WeaponCompareModal } from './WeaponCompareModal';

export interface UiOverlayInitialState {
  readonly initialViewport: ViewportSnapshotPayload;
  readonly initialPortraitLocked: boolean;
}

const DEFAULT_COMBAT_HUD: PlayerCombatHudSnapshot = {
  hp: 120, maxHp: 120, rallyOrangeHp: 0, rallyFrozen: false,
  stats: { rubedo: 1, citrinitas: 1, albedo: 1 },
  flaskCharges: 1, maxFlaskCharges: 1, gold: 150, ichor: 45,
  rapierCritReady: false, cleaverRhythmWindowOpen: false, isInvulnerable: false, isParryWindowActive: false,
  primarySlot: { slot: 'primary', weaponId: 'wpn_rust_scalpel', nameZh: '锈蚀解剖刃', iconSlot: 0, qualityBadge: 'I', colorHex: '#E11D48', scaledDps: 150, ammoLeft: null, maxAmmo: null, isReady: true },
  secondarySlot: { slot: 'secondary', weaponId: 'wpn_slag_buckler', nameZh: '矿渣反冲圆盾', iconSlot: 5, qualityBadge: 'I', colorHex: '#3CE682', scaledDps: 173, ammoLeft: null, maxAmmo: null, isReady: true },
};

function isSameShowcase(a: ShowcaseStatePayload, b: ShowcaseStatePayload): boolean {
  return (
    a.activeSceneKey === b.activeSceneKey &&
    a.shaders.hitFlash === b.shaders.hitFlash &&
    a.shaders.ashDissolve === b.shaders.ashDissolve &&
    a.shaders.shieldRefract === b.shaders.shieldRefract &&
    a.shaders.chromaticImpact === b.shaders.chromaticImpact &&
    a.shaders.vignetteBloom === b.shaders.vignetteBloom
  );
}

/**
 * 顶层独立 Preact DOM 覆盖层（挂载于 #ui-root，100% 免疫 WebGL 全屏后处理与镜头震动）。
 */
export function UiOverlayRoot({ initialViewport, initialPortraitLocked }: UiOverlayInitialState) {
  const [viewport, setViewport] = useState<ViewportSnapshotPayload>(initialViewport);
  const [isPortraitLocked, setIsPortraitLocked] = useState<boolean>(initialPortraitLocked);
  const [combatHud, setCombatHud] = useState<PlayerCombatHudSnapshot>(DEFAULT_COMBAT_HUD);
  const [bossHud, setBossHud] = useState<BossHudSnapshot | null>(null);
  const [dialogueBanner, setDialogueBanner] = useState<DialogueBannerSnapshot | null>(null);
  const [compareModal, setCompareModal] = useState<WeaponCompareModalPayload | null>(null);
  const [scrollModal, setScrollModal] = useState<ScrollPickModalPayload | null>(null);
  const [mutationModal, setMutationModal] = useState<MutationForgeModalPayload | null>(null);
  const [pauseMenu, setPauseMenu] = useState<PauseAudioMenuPayload>({ open: false, activeSceneKey: 'SanctumHubScene' });
  const [audioState, setAudioState] = useState<AudioTelemetrySnapshot>(DEFAULT_AUDIO_TELEMETRY);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatusSnapshot | null>(null);
  const [conflictModal, setConflictModal] = useState<SaveConflictModalPayload | null>(null);
  const [touchVisible, setTouchVisible] = useState<boolean>(initialViewport.tier === 'TIER_3_MOBILE_EXPAND');
  const [minimap, setMinimap] = useState<MinimapSnapshotPayload | null>(null);
  const [telemetry, setTelemetry] = useState<Pick<BootTelemetryPayload, 'fixedSimHz' | 'isPaused'>>({
    fixedSimHz: 120, isPaused: initialPortraitLocked,
  });
  const [showcase, setShowcase] = useState<ShowcaseStatePayload>({
    activeSceneKey: 'SanctumHubScene', heroAnimKey: 'hero_idle', activeLights: 5,
    shaders: { hitFlash: false, ashDissolve: false, shieldRefract: false, chromaticImpact: false, vignetteBloom: true },
  });
  const [devModeOpen, setDevModeOpen] = useState<boolean>(() => isDevQaQueryEnabled());

  useEffect(() => {
    const syncClockState = (next: BootTelemetryPayload): void => {
      setTelemetry((prev) =>
        prev.fixedSimHz === next.fixedSimHz && prev.isPaused === next.isPaused
          ? prev
          : { fixedSimHz: next.fixedSimHz, isPaused: next.isPaused }
      );
    };
    const unbinds = [
      EventBus.on('system:viewport_changed', setViewport),
      EventBus.on('system:orientation_lock_changed', ({ isPortraitLocked: locked }) => {
        setIsPortraitLocked(locked);
        EventBus.emit('ui:command:set_orientation_pause', { paused: locked });
      }),
      EventBus.on('system:boot_ready', syncClockState),
      EventBus.on('system:telemetry_updated', syncClockState),
      EventBus.on('system:showcase_state_changed', (next) => {
        setShowcase((prev) => (isSameShowcase(prev, next) ? prev : next));
      }),
      EventBus.on('player:combat_hud_updated', setCombatHud),
      EventBus.on('boss:hud_updated', setBossHud),
      EventBus.on('narrative:dialogue_updated', setDialogueBanner),
      EventBus.on('combat:weapon_compare_opened', setCompareModal),
      EventBus.on('combat:scroll_pick_opened', setScrollModal),
      EventBus.on('combat:mutation_forge_opened', setMutationModal),
      EventBus.on('ui:pause_menu_updated', setPauseMenu),
      EventBus.on('audio:state_updated', setAudioState),
      EventBus.on('save:sync_status_updated', setSyncStatus),
      EventBus.on('save:conflict_modal_updated', setConflictModal),
      EventBus.on('input:touch_hud_updated', (snap) => {
        setTouchVisible((prev) => (prev === snap.visible ? prev : snap.visible));
      }),
      EventBus.on('world:minimap_updated', setMinimap),
    ];
    const onUiClick = (ev: MouseEvent): void => {
      const el = ev.target as Element | null;
      if (el && typeof el.closest === 'function' && el.closest('[data-ui-interactive="true"]')) {
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ui_confirm_cancel' });
      }
    };
    const onDevHotkey = (ev: KeyboardEvent): void => {
      if (import.meta.env.DEV && !ev.repeat && ev.code === 'F9') {
        ev.preventDefault();
        setDevModeOpen((prev) => !prev);
      }
    };
    window.addEventListener('click', onUiClick, true);
    window.addEventListener('keydown', onDevHotkey);
    return () => {
      window.removeEventListener('click', onUiClick, true);
      window.removeEventListener('keydown', onDevHotkey);
      for (const off of unbinds) off();
    };
  }, []);

  const { top, right, bottom, left } = viewport.safeInsets;
  const isTouchModeVisible = touchVisible || viewport.tier === 'TIER_3_MOBILE_EXPAND';
  const showDevQaTools = Boolean(import.meta.env.DEV && devModeOpen);
  const anyModalBlockingTouch =
    Boolean(
      pauseMenu.open || compareModal?.open || scrollModal?.open ||
      mutationModal?.open || conflictModal?.open || syncStatus?.drawerOpen
    ) || bossHud?.endingState === 'AWAITING_ALKAHEST_CHOICE';

  return (
    <>
      <div
        data-testid="ui-safe-frame"
        class="relative w-full h-full flex flex-col justify-between box-border text-[#E8EFF5]"
        style={{
          paddingTop: `max(env(safe-area-inset-top, 0px), ${top}px)`,
          paddingRight: `max(env(safe-area-inset-right, 0px), ${right}px)`,
          paddingBottom: `max(env(safe-area-inset-bottom, 0px), ${bottom}px)`,
          paddingLeft: `max(env(safe-area-inset-left, 0px), ${left}px)`,
        }}
      >
        <div class="flex items-start justify-between gap-2">
          <HudBar combat={combatHud} compactMobileMode={isTouchModeVisible} syncStatus={syncStatus} />
          {showDevQaTools && isTouchModeVisible && <ShaderQaDock showcase={showcase} compactMobileMode={true} />}
          <BiomeMinimapWidget minimap={minimap} compactMobileMode={isTouchModeVisible} />
        </div>

        {!isTouchModeVisible && (
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div class="flex items-end gap-2">
              <DesktopWeaponLoadoutDock combat={combatHud} />
              <div data-testid="hud-badge-clock" class="bg-[#11131C]/90 border border-[#414A6B] px-2.5 py-1 shadow-md">
                <div class="text-[10px] text-[#D4DEE8]">
                  {telemetry.fixedSimHz}Hz FIXED ·{' '}
                  <span class={telemetry.isPaused ? 'text-[#FF5E2B]' : 'text-[#3CE682]'}>
                    {telemetry.isPaused ? 'PAUSED' : 'RUNNING'}
                  </span>
                </div>
                <div class="text-[9px] text-[#9AA5B8] mt-0.5">
                  [J/K] WEAPONS · [Q/C] SKILLS · [SHIFT] ROLL · [E] ACT/TALK · [V] FORGE · [M] MAP · [ESC] AUDIO
                </div>
              </div>
            </div>
            {showDevQaTools && <ShaderQaDock showcase={showcase} compactMobileMode={false} />}
          </div>
        )}
      </div>

      <BossHealthBar payload={bossHud} compactMobileMode={isTouchModeVisible} />
      <DialogueBanner payload={dialogueBanner} compactMobileMode={isTouchModeVisible} />
      <WorldLoreBannerToast minimap={minimap} />
      {minimap && <MinimapTacticalModal minimap={minimap} devModeEnabled={showDevQaTools} />}
      <WeaponCompareModal payload={compareModal} />
      <ScrollPickModal payload={scrollModal} />
      <MutationForgeModal payload={mutationModal} />
      <PauseAudioMenu pauseMenu={pauseMenu} audio={audioState} compactMobileMode={isTouchModeVisible} />
      <AuthSyncDrawer syncStatus={syncStatus} compactMobileMode={isTouchModeVisible} />
      <SaveConflictModal payload={conflictModal} />
      {!isPortraitLocked && !anyModalBlockingTouch && <TouchControlsOverlay />}

      {isPortraitLocked && (
        <div
          data-testid="portrait-lock-overlay"
          role="dialog"
          aria-modal="true"
          class="pointer-events-auto fixed inset-0 z-50 bg-[#0B0C10]/96 flex flex-col items-center justify-center p-6 text-center"
        >
          <div class="max-w-xs w-full bg-[#11131C] border-2 border-[#C28B42] p-6 shadow-2xl flex flex-col items-center">
            <div class="p-3 bg-[#161824] border border-[#7A5128] mb-4">
              <img src="/assets/atlases/boot_crucible_seal.png" alt="Dark Alchemy Astrolabe" class="w-20 h-20 pixel-crisp" />
            </div>
            <div class="text-[11px] tracking-[0.2em] text-[#E0AE53] uppercase mb-1.5">ASTROLABE ORIENTATION SEAL</div>
            <h2 class="text-base font-bold text-[#F8FAFC] leading-snug mb-2">请横向握持设备以唤醒炼金躯壳</h2>
            <p class="text-xs text-[#9AA5B8] leading-relaxed mb-4">
              《水银坩埚》采用横版宽视距战斗帧架构，旋转至横屏后将 0ms 无缝恢复当前世界步进。
            </p>
            <div class="w-full py-1.5 px-3 bg-[#161824] border border-[#323954] text-[10px] tracking-wider text-[#FF5E2B]">
              120HZ CLOCK CONTROLLER: PAUSED
            </div>
          </div>
        </div>
      )}
    </>
  );
}
