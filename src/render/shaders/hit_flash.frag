#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uFlashAmount;   // 0.0 ~ 1.0 (受击前 60ms 为 1.0，随后 40ms 线性归零)
uniform vec3 uFlashColor;     // 默认纯白 vec3(1.0, 1.0, 1.0)，末段过渡元素色

varying vec2 outTexCoord;
varying float outTintEffect;
varying vec4 outTint;

void main() {
    vec4 texel = texture2D(uMainSampler, outTexCoord);
    if (texel.a <= 0.001) {
        discard;
    }
    // 严格保持原始硬边缘 Alpha，仅插值 RGB 至高亮闪白颜色
    vec3 flashedRgb = mix(texel.rgb, uFlashColor * texel.a, clamp(uFlashAmount, 0.0, 1.0));
    gl_FragColor = vec4(flashedRgb, texel.a);
}
