import Phaser from 'phaser';
import {
  AMBIENT_SLATE_NUM,
  DepthLayer,
  FIXED_SIM_HZ,
  MAX_HARDWARE_LIGHTS,
  MERCURY_CORE_LIGHT_NUM,
  TORCH_AMBER_LIGHT_NUM,
} from '../core/Constants';
import { DeterministicRng } from '../core/DeterministicRng';
import { EventBus, type BootTelemetryPayload } from '../core/EventBus';

declare global {
  interface Window {
    __QC_BOOT_STATE__?: BootTelemetryPayload;
  }
}

const CALIBRATION_SEED = 0x51c0ffee;

/**
 * 启动引导自检场景：
 * 验证 Phaser.WEBGL 上下文与法线光照帧缓冲采样后，无缝移交 PreloadScene。
 */
export class BootScene extends Phaser.Scene {
  private readonly rng = new DeterministicRng(CALIBRATION_SEED);
  private readonly pixelSampleBuf = new Uint8Array(4);
  private handedOff = false;

  public constructor() {
    super({ key: 'BootScene' });
  }

  public preload(): void {
    this.load.image('boot_crucible_seal', [
      '/assets/atlases/boot_crucible_seal.png',
      '/assets/atlases/boot_crucible_seal_n.png',
    ]);
  }

  public create(): void {
    if (this.game.renderer.type !== Phaser.WEBGL) {
      throw new Error('QUICKSILVER CRUCIBLE requires Phaser.WEBGL renderer.');
    }

    this.lights.enable().setAmbientColor(AMBIENT_SLATE_NUM);
    this.cameras.main.centerOn(0, 0);

    this.add
      .sprite(0, 0, 'boot_crucible_seal')
      .setScale(2)
      .setDepth(DepthLayer.PLAYER)
      .setPipeline('Light2D');

    this.lights.addLight(0, 0, 220, MERCURY_CORE_LIGHT_NUM, 1.85);
    this.lights.addLight(72, -18, 240, TORCH_AMBER_LIGHT_NUM, 2.5);

    this.rng.nextUint32();
    this.game.events.once(Phaser.Core.Events.POST_RENDER, this.verifyAndHandoff, this);
  }

  private verifyAndHandoff(): void {
    if (this.handedOff) return;
    this.handedOff = true;

    let framebufferLit = false;
    const renderer = this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
    const gl = renderer.gl;
    if (gl) {
      const sx = Math.floor(gl.drawingBufferWidth * 0.5);
      const sy = Math.floor(gl.drawingBufferHeight * 0.5);
      gl.readPixels(sx, sy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.pixelSampleBuf);
      framebufferLit = this.pixelSampleBuf[0]! > 24 || this.pixelSampleBuf[2]! > 32;
    }

    const payload: BootTelemetryPayload = {
      rendererType: this.game.renderer.type,
      isWebGL: this.game.renderer.type === Phaser.WEBGL,
      framebufferLit,
      maxLights: MAX_HARDWARE_LIGHTS,
      activeLights: this.lights.lights.length,
      fixedSimHz: FIXED_SIM_HZ,
      totalFixedTicks: 0,
      isPaused: false,
      trauma: 0,
      rngSeed: this.rng.seed,
    };

    window.__QC_BOOT_STATE__ = payload;
    EventBus.emit('system:boot_ready', payload);
    this.scene.start('PreloadScene');
  }
}
