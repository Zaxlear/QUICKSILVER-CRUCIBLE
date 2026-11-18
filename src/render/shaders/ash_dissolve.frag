#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uProgress;      // 0.0 (完好) -> 1.0 (彻底化灰)
uniform vec2 uNoiseScale;     // 默认 vec2(24.0, 24.0) 贴合单帧像素颗粒感
uniform vec4 uFrameUv;        // (u0, v0, uSpan, vSpan) 将图集全局 UV 归一化至单帧 [0, 1]

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;

float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float pixelValueNoise(vec2 uv) {
    vec2 grid = floor(uv * uNoiseScale);
    return 0.65 * hash21(grid) + 0.35 * hash21(floor(grid * 0.5));
}

void main() {
    vec4 texel = texture2D(uMainSampler, outTexCoord);
    if (texel.a <= 0.001) {
        discard;
    }

    vec2 localUv = clamp((outTexCoord - uFrameUv.xy) / max(uFrameUv.zw, vec2(0.0001)), 0.0, 1.0);

    // 自上而下叠加噪声权重，使怪物从头肩开始崩解化灰
    float n = pixelValueNoise(localUv) * 0.72 + localUv.y * 0.38;
    float edgeDiff = n - uProgress;

    if (edgeDiff < 0.0) {
        discard;
    }

    // 切口宽度 0.12 内渲染炽热锻炉余烬带 (#FF5E2B -> #FBBF24)
    float emberBand = 1.0 - smoothstep(0.0, 0.12, edgeDiff);
    vec3 outerEmber = vec3(1.0, 0.369, 0.169);   // #FF5E2B
    vec3 innerGold  = vec3(0.984, 0.749, 0.141); // #FBBF24
    vec3 burnColor  = mix(outerEmber, innerGold, smoothstep(0.35, 0.95, emberBand));

    vec3 finalRgb = mix(texel.rgb, burnColor * texel.a, emberBand * step(0.01, uProgress));
    gl_FragColor = vec4(finalRgb, texel.a);
}
