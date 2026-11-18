#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uIntensity;      // 0.0 ~ 1.0，触发瞬间置为 0.65~1.0，按指数衰减归零
uniform vec2 uImpactCenter;    // 命中点归一化屏幕坐标

varying vec2 outTexCoord;

void main() {
    if (uIntensity <= 0.001) {
        gl_FragColor = texture2D(uMainSampler, outTexCoord);
        return;
    }

    vec2 toEdge = outTexCoord - uImpactCenter;
    float dist = length(toEdge);
    // 中心焦距清晰，越靠近屏幕四周色差撕裂与径向拉伸越强烈
    float radialMask = smoothstep(0.06, 0.65, dist) * uIntensity;
    vec2 offset = toEdge * (0.026 * radialMask);

    // 4-Tap 轻量径向残影模糊 + RGB 三通道分离采样
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 4; i++) {
        float scale = 1.0 - float(i) * 0.009 * radialMask;
        vec2 baseUv = uImpactCenter + (outTexCoord - uImpactCenter) * scale;
        float r = texture2D(uMainSampler, clamp(baseUv + offset, 0.0, 1.0)).r;
        float g = texture2D(uMainSampler, clamp(baseUv, 0.0, 1.0)).g;
        float b = texture2D(uMainSampler, clamp(baseUv - offset, 0.0, 1.0)).b;
        acc += vec3(r, g, b);
    }
    gl_FragColor = vec4(acc * 0.25, 1.0);
}
