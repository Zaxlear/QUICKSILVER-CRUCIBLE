import { h, render } from 'preact';
import './styles/global.css';
import { AudioDirector } from './audio/AudioDirector';
import { GameApp } from './core/GameApp';
import {
  buildViewportSnapshot,
  isPortraitOrientationLocked,
} from './render/ViewportScaler';
import { BiomeRunScene } from './scenes/BiomeRunScene';
import { BootScene } from './scenes/BootScene';
import { BossArenaScene } from './scenes/BossArenaScene';
import { PreloadScene } from './scenes/PreloadScene';
import { SanctumHubScene } from './scenes/SanctumHubScene';
import { CloudSync } from './storage/CloudSyncCoordinator';
import { UiOverlayRoot } from './ui/UiOverlayRoot';

function registerPwaServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (reg.active) CloudSync.setPwaSwReady(true);
        void navigator.serviceWorker.ready.then(() => CloudSync.setPwaSwReady(true));
      })
      .catch(() => {
        /* 非 HTTPS 或开发模式下优雅跳过 */
      });
  });
}

function bootstrapCrucibleApp(): void {
  const uiContainer = document.getElementById('ui-root');
  const gameContainer = document.getElementById('game-root');

  if (!uiContainer || !gameContainer) {
    throw new Error('Missing #game-root or #ui-root mount container in index.html');
  }

  const cssWidth = Math.max(window.innerWidth || 640, 1);
  const cssHeight = Math.max(window.innerHeight || 360, 1);
  const dpr = window.devicePixelRatio || 1;
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0 || 'ontouchstart' in window;

  const initialViewport = buildViewportSnapshot(cssWidth, cssHeight, dpr);
  const initialPortraitLocked = isPortraitOrientationLocked(cssWidth, cssHeight, hasTouch);

  const audioDirector = new AudioDirector();
  audioDirector.mount(window);

  // 先挂载独立 Preact UI 覆盖层，确保零延迟接收双轨云存档与场景广播
  render(
    h(UiOverlayRoot, {
      initialViewport,
      initialPortraitLocked,
    }),
    uiContainer
  );

  void CloudSync.bootstrap(window);
  registerPwaServiceWorker();

  new GameApp({
    parentId: 'game-root',
    scenes: [BootScene, PreloadScene, SanctumHubScene, BiomeRunScene, BossArenaScene],
    computeViewportSnapshot: buildViewportSnapshot,
    checkPortraitLocked: isPortraitOrientationLocked,
  });
}

bootstrapCrucibleApp();
