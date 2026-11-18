/**
 * 副摄像机（TelegraphOverlayCam）单怪头顶高锐度状态签与招架提示句柄（src/entities/enemies/EnemyCrispHud.ts）。
 *
 * 内置全字段脏检查守卫：仅当文本或颜色真正改变时才调用 Phaser Text.setText / setColor / setStroke，
 * 彻底根除 120Hz 热路径上无条件触发 Canvas 2D 重绘与 gl.texImage2D 同步上传的卡顿元凶。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX } from '../../core/Constants';
import { EventBus } from '../../core/EventBus';
import type { TelegraphKind } from '../../data/biomes.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export interface EnemyCrispHudHandle {
  sync(
    x: number,
    y: number,
    overheadOffsetY: number,
    telegraph: TelegraphKind,
    blinkOn: boolean,
    labelText: string,
    isShielded: boolean,
    isElite: boolean,
    visible: boolean
  ): void;
  destroy(): void;
}

export function createEnemyCrispHud(
  scene: Phaser.Scene,
  reg: IWorldDisplayRegistrar,
  initX: number,
  initY: number
): EnemyCrispHudHandle {
  const badge = reg.registerCrispOverlay(
    scene.add
      .text(initX, initY - 62, '[!]', {
        fontFamily: MONO_FONT,
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#FBBF24',
        stroke: PALETTE_VOID_HEX,
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DepthLayer.CRISP_TELEGRAPH + 1)
      .setVisible(false)
  );

  const status = reg.registerCrispOverlay(
    scene.add
      .text(initX, initY - 48, '', {
        fontFamily: MONO_FONT,
        fontSize: '9px',
        color: '#E8EFF5',
        stroke: PALETTE_VOID_HEX,
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DepthLayer.CRISP_TELEGRAPH)
      .setVisible(false)
  );

  let prevStatusVisible = false;
  let prevLabelText = '';
  let prevStatusColor = '#E8EFF5';
  let prevStatusX = NaN;
  let prevStatusY = NaN;
  let prevTelegraph: TelegraphKind = 'NONE';
  let prevBadgeVisible = false;
  let prevBadgeYellow: boolean | null = null;
  let prevBlinkOn: boolean | null = null;
  let prevBadgeX = NaN;
  let prevBadgeY = NaN;

  return {
    sync: (x, y, offY, telegraph, blinkOn, labelText, isShielded, isElite, visible) => {
      if (!visible) {
        prevTelegraph = 'NONE';
        if (prevBadgeVisible) {
          badge.setVisible(false);
          prevBadgeVisible = false;
        }
        if (prevStatusVisible) {
          status.setVisible(false);
          prevStatusVisible = false;
        }
        return;
      }
      if (telegraph !== prevTelegraph && telegraph !== 'NONE') {
        EventBus.emit('audio:sfx_requested', {
          sfxId: telegraph === 'YELLOW_PARRIABLE' ? 'sfx_enemy_warn_parry' : 'sfx_enemy_warn_red',
          worldX: x,
        });
      }
      prevTelegraph = telegraph;

      const showStatus = labelText.length > 0;
      if (showStatus !== prevStatusVisible) {
        status.setVisible(showStatus);
        prevStatusVisible = showStatus;
      }
      if (showStatus) {
        if (labelText !== prevLabelText) {
          status.setText(labelText);
          prevLabelText = labelText;
        }
        const nextColor = isShielded ? '#FBBF24' : isElite ? '#FDBA74' : '#E8EFF5';
        if (nextColor !== prevStatusColor) {
          status.setColor(nextColor);
          prevStatusColor = nextColor;
        }
        const sx = Math.round(x);
        const sy = Math.round(y - offY + 12);
        if (sx !== prevStatusX || sy !== prevStatusY) {
          status.setPosition(sx, sy);
          prevStatusX = sx;
          prevStatusY = sy;
        }
      }

      if (telegraph === 'NONE') {
        if (prevBadgeVisible) {
          badge.setVisible(false);
          prevBadgeVisible = false;
        }
      } else {
        const isYellow = telegraph === 'YELLOW_PARRIABLE';
        if (!prevBadgeVisible) {
          badge.setVisible(true);
          prevBadgeVisible = true;
        }
        if (isYellow !== prevBadgeYellow) {
          badge
            .setText(isYellow ? '[!]' : '[✚!]')
            .setColor(isYellow ? '#FBBF24' : '#FB7185')
            .setStroke(isYellow ? PALETTE_VOID_HEX : '#240B12', 3)
            .setScale(isYellow ? 1.0 : 1.12);
          prevBadgeYellow = isYellow;
        }
        if (blinkOn !== prevBlinkOn) {
          badge.setAlpha(blinkOn ? 1.0 : 0.48);
          prevBlinkOn = blinkOn;
        }
        const bx = Math.round(x);
        const by = Math.round(y - offY - 3);
        if (bx !== prevBadgeX || by !== prevBadgeY) {
          badge.setPosition(bx, by);
          prevBadgeX = bx;
          prevBadgeY = by;
        }
      }
    },
    destroy: () => {
      reg.unregister(badge);
      badge.destroy();
      reg.unregister(status);
      status.destroy();
    },
  };
}
