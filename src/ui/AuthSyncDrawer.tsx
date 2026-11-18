/**
 * 账号绑定（匿名无损转正 Magic Link / GitHub / Google）与双轨云同步遥测抽屉
 * （src/ui/AuthSyncDrawer.tsx）。
 *
 * 100% 挂载于 #ui-root DOM 层，零 Phaser 实例持有、零几何 SVG 占位符。
 */

import { useState } from 'preact/hooks';
import { EventBus, type CloudSyncStatusSnapshot } from '../core/EventBus';

export interface AuthSyncDrawerProps {
  readonly syncStatus: CloudSyncStatusSnapshot | null;
  readonly compactMobileMode: boolean;
}

export function AuthSyncDrawer({ syncStatus, compactMobileMode }: AuthSyncDrawerProps) {
  const [emailInput, setEmailInput] = useState<string>('');

  if (!syncStatus || !syncStatus.drawerOpen) return null;

  const { metaSummary } = syncStatus;
  const isOnline = syncStatus.isNetworkOnline;

  return (
    <div
      data-testid="auth-sync-drawer"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/84 flex items-center justify-end p-2 sm:p-4"
    >
      <div
        class={`w-full h-full max-h-[94vh] overflow-y-auto bg-[#11131C] border-2 border-[#C28B42] shadow-2xl flex flex-col gap-2.5 ${
          compactMobileMode ? 'max-w-md p-2.5' : 'max-w-lg p-4'
        }`}
      >
        <div class="flex items-center justify-between gap-2 border-b border-[#3D2817] pb-2">
          <div class="flex items-center gap-2">
            <img
              src="/assets/atlases/boot_crucible_seal.png"
              alt="Athanor Vault"
              class="w-6 h-6 pixel-crisp border border-[#7A5128] bg-[#161824] p-0.5"
            />
            <div>
              <div class="text-[8px] tracking-[0.18em] text-[#E0AE53] uppercase">
                LOCAL-FIRST VAULT &amp; SUPABASE CRDT SYNC
              </div>
              <h2 class="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                炼金契约账号与双轨云存档中枢
              </h2>
            </div>
          </div>

          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-close-auth-drawer"
            onClick={() => EventBus.emit('ui:command:toggle_auth_drawer', { open: false })}
            class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#CF3650] text-[#FB7185] text-[10px] font-bold"
          >
            [关闭 ✕]
          </button>
        </div>

        {/* 实时连接态、SHA-256 完整性与 PWA 离线缓存状态 */}
        <div class="grid grid-cols-2 gap-1.5 text-[9px]">
          <div class="bg-[#161824] border border-[#323954] px-2 py-1.5">
            <div class="text-[#9AA5B8]">网络与网关状态</div>
            <div class={`font-bold mt-0.5 ${isOnline ? 'text-[#3CE682]' : 'text-[#FBBF24]'}`}>
              {isOnline ? `● ONLINE (${syncStatus.connectionMode})` : '⚡ OFFLINE VAULT'}
            </div>
          </div>
          <div class="bg-[#161824] border border-[#323954] px-2 py-1.5">
            <div class="text-[#9AA5B8]">PWA 离线缓存 / 仲裁机</div>
            <div class="font-bold text-[#38BDF8] mt-0.5 truncate">
              {syncStatus.pwaSwReady ? 'SW READY · ' : 'LOCAL · '}
              {syncStatus.fsmState}
            </div>
          </div>
          <div class="bg-[#161824] border border-[#323954] px-2 py-1.5">
            <div class="text-[#9AA5B8]">WebCrypto SHA-256 摘要</div>
            <div class="font-mono text-[#E8EFF5] mt-0.5">#{syncStatus.metaSha256Short}</div>
          </div>
          <div class="bg-[#161824] border border-[#323954] px-2 py-1.5">
            <div class="text-[#9AA5B8]">防篡改备份自愈拦截</div>
            <div class="font-bold text-[#FBBF24] mt-0.5">
              已拦截 {syncStatus.tamperInterceptCount} 次异常篡改
            </div>
          </div>
        </div>

        {/* 玩家身份与匿名账号零丢档转正 */}
        <div class="bg-[#161824] border border-[#7A5128] p-2.5 flex flex-col gap-1.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-bold text-[#F8FAFC]">
              {syncStatus.displayMoniker} · <span class="font-mono text-[#9AA5B8]">{syncStatus.userId}</span>
            </span>
            <span
              class={`px-1.5 py-0.5 text-[8px] font-bold border ${
                syncStatus.isPromotedAccount
                  ? 'bg-[#0B1F1D] border-[#3CE682] text-[#3CE682]'
                  : 'bg-[#291A0E] border-[#E0AE53] text-[#E0AE53]'
              }`}
            >
              {syncStatus.isPromotedAccount ? '正式绑定账号' : '匿名游玩容器'}
            </span>
          </div>
          <div class="text-[9px] text-[#9AA5B8]">
            当前终端: {syncStatus.deviceLabel}
            {syncStatus.boundEmail ? ` · 已绑定 ${syncStatus.boundEmail}` : ' · 转正后原 UID 与存档 100% 原位继承'}
          </div>

          <div class="flex items-center gap-1.5 mt-0.5">
            <input
              type="email"
              value={emailInput}
              placeholder="输入邮箱接收 Magic Link 转正信标..."
              onInput={(e) => setEmailInput((e.currentTarget as HTMLInputElement).value)}
              class="flex-1 bg-[#0B0C10] border border-[#414A6B] px-2 py-1 text-[10px] text-[#F8FAFC] outline-none focus:border-[#FBBF24]"
            />
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-auth-magic-link"
              onClick={() => EventBus.emit('ui:command:auth_promote', { method: 'magic_link', email: emailInput })}
              class="cursor-pointer px-2 py-1 bg-[#3D2817] hover:bg-[#593A1E] border border-[#FBBF24] text-[#FBBF24] text-[9px] font-bold shrink-0"
            >
              [邮箱转正]
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-auth-github"
              onClick={() => EventBus.emit('ui:command:auth_promote', { method: 'github' })}
              class="flex-1 cursor-pointer py-1 bg-[#1E2233] hover:bg-[#272C42] border border-[#556085] text-[#E8EFF5] text-[9px] font-bold"
            >
              [绑定 GitHub Identity]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-auth-google"
              onClick={() => EventBus.emit('ui:command:auth_promote', { method: 'google' })}
              class="flex-1 cursor-pointer py-1 bg-[#1E2233] hover:bg-[#272C42] border border-[#556085] text-[#E8EFF5] text-[9px] font-bold"
            >
              [绑定 Google Identity]
            </button>
          </div>
        </div>

        {/* CRDT Set-Union 局外永久进度总览 */}
        <div class="bg-[#161824] border border-[#323954] p-2 flex flex-col gap-1 text-[9px]">
          <div class="flex items-center justify-between text-[#E0AE53] font-bold">
            <span>轨道一：CRDT 幂等并集永久成长</span>
            <span class="font-mono">CRDT REV #{metaSummary.crdtRevision}</span>
          </div>
          <div class="grid grid-cols-3 gap-1 text-[#D4DEE8] mt-0.5">
            <span>符文: {metaSummary.unlockedRunesCount}/4</span>
            <span>武器蓝图: {metaSummary.unlockedWeaponsCount}/12</span>
            <span>真名封印: {metaSummary.sealCount}/3</span>
            <span>入库灵液: ✦{metaSummary.bankedIchor}</span>
            <span>最高热阶: Heat {metaSummary.maxCrucibleHeat}</span>
            <span>通关/图鉴: {metaSummary.totalRunsCleared}周·{metaSummary.totalBestiaryKills}杀</span>
          </div>
        </div>

        {/* 手动同步、离线演练与双端分叉冲突演练按钮 */}
        <div class="mt-auto flex flex-col gap-1.5 border-t border-[#272C42] pt-2">
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-manual-cloud-sync"
              onClick={() => EventBus.emit('ui:command:trigger_cloud_sync', {})}
              class="flex-1 cursor-pointer py-1.5 bg-[#0B1F1D] hover:bg-[#12332F] border border-[#3CE682] text-[#3CE682] text-[10px] font-bold"
            >
              [✦ 立即同步云端]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-toggle-offline-sim"
              onClick={() => EventBus.emit('ui:command:toggle_offline_mode', { offline: isOnline })}
              class="flex-1 cursor-pointer py-1.5 bg-[#1E2233] hover:bg-[#272C42] border border-[#38BDF8] text-[#38BDF8] text-[10px] font-bold"
            >
              {isOnline ? '[⚡ 切换离线断网]' : '[● 恢复联网同步]'}
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-simulate-save-conflict"
              onClick={() => EventBus.emit('ui:command:simulate_save_conflict', {})}
              class="flex-1 cursor-pointer py-1.5 bg-[#3D2817] hover:bg-[#593A1E] border border-[#FBBF24] text-[#FBBF24] text-[10px] font-bold"
            >
              [⚡ 模拟分叉冲突]
            </button>
          </div>
          <div data-testid="sync-status-message" class="text-[9px] text-[#9AA5B8] font-mono truncate">
            状态: {syncStatus.statusMessageZh}
          </div>
        </div>
      </div>
    </div>
  );
}
