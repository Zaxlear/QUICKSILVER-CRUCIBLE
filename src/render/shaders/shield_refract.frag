#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uMainSampler;
uniform float uTime;
uniform vec2 uShieldCenter;   // 归一化屏幕 UV (0.0 ~ 1.0)
uniform float uShieldRadius;  // 归一化屏幕半径
uniform float uAspect;        // width / height 修正正圆比例

varying vec2 outTexCoord;

void main() {
    vec2 delta = outTexCoord - uShieldCenter;
    delta.x *= uAspect;
    float dist = length(delta);

    if (dist > uShieldRadius || uShieldRadius <= 0.0005) {
        gl_FragColor = texture2D(uMainSampler, outTexCoord);
        return;
    }

    float normDist = dist / max(uShieldRadius, 0.0001);
    // 菲涅尔边缘强化环 + 向外扩散的水银高频正弦涟漪
    float rim = pow(normDist, 3.2);
    float wave = sin(normDist * 28.0 - uTime * 14.0) * 0.012 * rim;
    vec2 refractUv = clamp(outTexCoord + normalize(delta + 1e-5) * wave, 0.0, 1.0);

    vec4 sceneCol = texture2D(uMainSampler, refractUv);
    vec3 mercuryRimColor = vec3(0.55, 0.85, 1.0) * rim * 0.65;
    gl_FragColor = vec4(sceneCol.rgb + mercuryRimColor, sceneCol.a);
}
