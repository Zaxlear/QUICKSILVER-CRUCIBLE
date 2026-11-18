#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform vec2 uResolution;
uniform float uBloomStrength;    // 默认 0.42
uniform float uBloomThreshold;   // 默认 0.72 (仅水银核、火光、刀光与元素特效越过阈值)
uniform float uVignetteDarkness; // 默认 0.38

varying vec2 outTexCoord;

vec3 extractBright(vec2 uv) {
    vec3 c = texture2D(uMainSampler, clamp(uv, 0.0, 1.0)).rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return c * smoothstep(uBloomThreshold, uBloomThreshold + 0.22, lum);
}

void main() {
    vec4 base = texture2D(uMainSampler, outTexCoord);
    vec2 texel = 2.0 / max(uResolution, vec2(1.0));

    // 9-Tap 对称十字星芒采样提取辉光
    vec3 bloom = extractBright(outTexCoord) * 0.24;
    bloom += extractBright(outTexCoord + vec2( texel.x,  0.0)) * 0.12;
    bloom += extractBright(outTexCoord + vec2(-texel.x,  0.0)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( 0.0,  texel.y)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( 0.0, -texel.y)) * 0.12;
    bloom += extractBright(outTexCoord + vec2( texel.x,  texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2(-texel.x,  texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2( texel.x, -texel.y)) * 0.07;
    bloom += extractBright(outTexCoord + vec2(-texel.x, -texel.y)) * 0.07;

    vec3 combined = base.rgb + bloom * uBloomStrength;

    // 暗黑地牢四角冷色压暗暗角
    vec2 centered = outTexCoord - 0.5;
    float vig = 1.0 - dot(centered, centered) * (uVignetteDarkness * 2.2);
    vec3 deepShadowTint = vec3(0.043, 0.047, 0.063); // #0B0C10
    vec3 finalRgb = mix(deepShadowTint, combined, clamp(vig, 0.0, 1.0));

    gl_FragColor = vec4(finalRgb, base.a);
}
