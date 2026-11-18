import Phaser from 'phaser';
import { ASH_DISSOLVE_PIPELINE_KEY, AshDissolvePipeline } from './AshDissolvePipeline';
import { CHROMATIC_IMPACT_PIPELINE_KEY, ChromaticImpactPostFX } from './ChromaticImpactPostFX';
import { HIT_FLASH_PIPELINE_KEY, HitFlashPipeline } from './HitFlashPipeline';
import { SHIELD_REFRACT_PIPELINE_KEY, ShieldRefractPipeline } from './ShieldRefractPipeline';
import { VIGNETTE_BLOOM_PIPELINE_KEY, VignetteBloomPostFX } from './VignetteBloomPostFX';

export interface ActiveCameraPostFXBundle {
  readonly vignetteBloom: VignetteBloomPostFX;
  readonly shieldRefract: ShieldRefractPipeline;
  readonly chromaticImpact: ChromaticImpactPostFX;
}

/**
 * 幂等注册《水银坩埚》全部 5 大自定义 GLSL 着色器管线至 Phaser WebGLRenderer：
 * - SinglePipeline (实体级): HitFlashPipeline, AshDissolvePipeline
 * - PostFXPipeline (主相机全屏级): VignetteBloomPostFX, ShieldRefractPipeline, ChromaticImpactPostFX
 */
export function registerCruciblePipelines(game: Phaser.Game): void {
  if (game.renderer.type !== Phaser.WEBGL) {
    throw new Error('registerCruciblePipelines requires Phaser.WEBGL renderer.');
  }

  const renderer = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  const mgr = renderer.pipelines;

  if (!mgr.has(HIT_FLASH_PIPELINE_KEY)) {
    mgr.add(HIT_FLASH_PIPELINE_KEY, new HitFlashPipeline(game));
  }
  if (!mgr.has(ASH_DISSOLVE_PIPELINE_KEY)) {
    mgr.add(ASH_DISSOLVE_PIPELINE_KEY, new AshDissolvePipeline(game));
  }
  if (!mgr.has(VIGNETTE_BLOOM_PIPELINE_KEY)) {
    mgr.addPostPipeline(VIGNETTE_BLOOM_PIPELINE_KEY, VignetteBloomPostFX);
  }
  if (!mgr.has(SHIELD_REFRACT_PIPELINE_KEY)) {
    mgr.addPostPipeline(SHIELD_REFRACT_PIPELINE_KEY, ShieldRefractPipeline);
  }
  if (!mgr.has(CHROMATIC_IMPACT_PIPELINE_KEY)) {
    mgr.addPostPipeline(CHROMATIC_IMPACT_PIPELINE_KEY, ChromaticImpactPostFX);
  }
}

/**
 * 为主世界摄像机（WorldMainCam）按物理光学顺序挂载全屏后处理链：
 * 1. VignetteBloomPostFX（先对世界高光提取辉光并压暗四角）
 * 2. ShieldRefractPipeline（力场屏幕空间波纹折射）
 * 3. ChromaticImpactPostFX（最外层径向冲击与 RGB 色差撕裂）
 */
function unwrapSinglePostFX<T extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline>(
  found: Phaser.Renderer.WebGL.Pipelines.PostFXPipeline | Phaser.Renderer.WebGL.Pipelines.PostFXPipeline[]
): T {
  const instance = Array.isArray(found) ? found[0] : found;
  if (!instance) {
    throw new Error('Failed to resolve mounted PostFXPipeline on WorldMainCam');
  }
  return instance as T;
}

export function attachWorldCameraPostFX(
  worldMainCam: Phaser.Cameras.Scene2D.Camera
): ActiveCameraPostFXBundle {
  worldMainCam.resetPostPipeline(true);
  worldMainCam.setPostPipeline([
    VIGNETTE_BLOOM_PIPELINE_KEY,
    SHIELD_REFRACT_PIPELINE_KEY,
    CHROMATIC_IMPACT_PIPELINE_KEY,
  ]);

  const vignetteBloom = unwrapSinglePostFX<VignetteBloomPostFX>(
    worldMainCam.getPostPipeline(VIGNETTE_BLOOM_PIPELINE_KEY)
  );
  const shieldRefract = unwrapSinglePostFX<ShieldRefractPipeline>(
    worldMainCam.getPostPipeline(SHIELD_REFRACT_PIPELINE_KEY)
  );
  const chromaticImpact = unwrapSinglePostFX<ChromaticImpactPostFX>(
    worldMainCam.getPostPipeline(CHROMATIC_IMPACT_PIPELINE_KEY)
  );

  return {
    vignetteBloom,
    shieldRefract,
    chromaticImpact,
  };
}
