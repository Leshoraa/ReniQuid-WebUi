const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });

if (!gl) throw new Error("WebGL 2.0 not supported");

const vertexShaderSource = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_points[5];
uniform vec2 u_capsulePos[5]; 
uniform vec2 u_capsuleSize[5]; 
uniform float u_uiWaves[4];
uniform sampler2D u_tex;
uniform sampler2D u_textTex; 
uniform vec2 u_texRes;
uniform float u_time;
uniform float u_scrollY;
uniform float u_trailScale;

out vec4 fragColor;

float hash(float n) { return fract(sin(n) * 1e4); }
float noise(vec3 x) {
    const vec3 step = vec3(110, 241, 171);
    vec3 i = floor(x);
    vec3 f = fract(x);
    float n = dot(i, step);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(n + dot(step, vec3(0, 0, 0))), hash(n + dot(step, vec3(1, 0, 0))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 0))), hash(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
               mix(mix(hash(n + dot(step, vec3(0, 0, 1))), hash(n + dot(step, vec3(1, 0, 1))), u.x),
                   mix(hash(n + dot(step, vec3(0, 1, 1))), hash(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float sdCapsule2D(vec2 p, vec2 a, vec2 b, float r) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
}

float map(vec3 p) {
    float trailNoise = noise(p * 2.0 + u_time * 0.5) * 0.02;
    float d_trail = 1000.0;
    
    for(int i = 0; i < 5; i++) {
        float radius = (0.5 - float(i) * 0.08) * u_trailScale;
        vec3 center = vec3(u_points[i], 0.0);
        float dist = length(p - center) - radius + trailNoise;
        d_trail = (i == 0) ? dist : smin(d_trail, dist, 0.6);
    }
    
    float d_capsules = 1000.0;
    
    for(int i = 0; i < 5; i++) {
        vec3 capsuleA = vec3(u_capsulePos[i].x - u_capsuleSize[i].x, u_capsulePos[i].y, 0.0);
        vec3 capsuleB = vec3(u_capsulePos[i].x + u_capsuleSize[i].x, u_capsulePos[i].y, 0.0);
        float capsuleDist = sdCapsule(p, capsuleA, capsuleB, u_capsuleSize[i].y);
        
        if (i == 0) {
            capsuleDist += sin(p.x * 8.0 + u_time * 2.0) * 0.003;
        } else {
            float waveAmp = u_uiWaves[i - 1];
            float distCenter = length(p.xy - u_capsulePos[i]);
            capsuleDist += sin(distCenter * 40.0 - u_time * 20.0) * 0.02 * waveAmp;
        }
        
        d_capsules = (i == 0) ? capsuleDist : min(d_capsules, capsuleDist);
    }
    
    return smin(d_trail, d_capsules, 0.6);
}

vec3 calcNormal(vec3 p) {
    const vec2 e = vec2(1.0, -1.0) * 0.0005;
    return normalize(
        e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
        e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx)
    );
}

vec2 getCoverUV(vec2 fragCoord, vec2 resolution, vec2 texResolution) {
    float rs = resolution.x / resolution.y;
    float ri = texResolution.x / texResolution.y;
    vec2 newSize = rs < ri ? vec2(texResolution.x * resolution.y / texResolution.y, resolution.y) 
                           : vec2(resolution.x, texResolution.y * resolution.x / texResolution.x);
    vec2 offset = (rs < ri ? vec2((newSize.x - resolution.x) / 2.0, 0.0) 
                           : vec2(0.0, (newSize.y - resolution.y) / 2.0)) / newSize;
    return (fragCoord / resolution) * (resolution / newSize) + offset;
}

vec3 getPureBackground(vec2 coord, vec2 resolution, vec2 texRes, float scrollY) {
    float docY_fromTop = scrollY + (resolution.y - coord.y);
    if (docY_fromTop > 2.0 * resolution.y) {
        return vec3(1.0); 
    } else if (docY_fromTop > resolution.y) {
        vec2 bgCoord = vec2(coord.x, resolution.y - (docY_fromTop - resolution.y));
        return texture(u_tex, getCoverUV(bgCoord, resolution, texRes)).rgb;
    }
    return vec3(0.95); 
}

vec3 getSceneColor(vec2 coord, vec2 resolution, vec2 texRes, float scrollY) {
    vec2 p2d = ((coord - 0.5 * resolution) / resolution.y) * 3.0;
    float d_capsules = 1000.0;
    
    for(int i = 0; i < 5; i++) {
        vec2 capsuleA = vec2(u_capsulePos[i].x - u_capsuleSize[i].x, u_capsulePos[i].y);
        vec2 capsuleB = vec2(u_capsulePos[i].x + u_capsuleSize[i].x, u_capsulePos[i].y);
        float capsuleDist = sdCapsule2D(p2d, capsuleA, capsuleB, u_capsuleSize[i].y);
        d_capsules = (i == 0) ? capsuleDist : min(d_capsules, capsuleDist);
    }
    
    vec3 imgBg = getPureBackground(coord, resolution, texRes, scrollY);
    
    float docY_fromTop = scrollY + (resolution.y - coord.y);
    vec2 docUV = vec2(coord.x / resolution.x, 1.0 - (docY_fromTop / (resolution.y * 3.0)));
    vec4 textData = texture(u_textTex, docUV);
    
    if (d_capsules < 0.0) {
        vec3 glassCol = mix(imgBg, vec3(0.95, 0.98, 1.0), 0.1);
        return mix(glassCol, textData.rgb, textData.a);
    }
    return mix(imgBg, textData.rgb, textData.a);
}

vec3 calcRefraction(vec3 rd, vec3 n, vec2 fragCoord, vec2 resolution, vec2 texRes) {
    vec3 refR = refract(rd, n, 1.0 / 1.32);
    vec3 refG = refract(rd, n, 1.0 / 1.33);
    vec3 refB = refract(rd, n, 1.0 / 1.34);
    
    float strength = 0.1 * resolution.y; 
    
    vec3 colR = getSceneColor(fragCoord + (refR.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    vec3 colG = getSceneColor(fragCoord + (refG.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    vec3 colB = getSceneColor(fragCoord + (refB.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    
    return vec3(colR.r, colG.g, colB.b);
}

void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.0));
    
    vec3 shadowPos = vec3((uv + vec2(0.0, 0.05)) * 3.0, 0.0); 
    float shadowAlpha = mix(0.9, 1.0, smoothstep(0.0, 0.2, map(shadowPos)));
    
    float t = 0.0;
    float maxD = 10.0;
    vec3 p;
    
    for(int i = 0; i < 24; i++) {
        p = ro + rd * t;
        float d = map(p);
        if(d < 0.001 || t > maxD) break;
        t += d;
    }
    
    vec2 texRes = u_texRes.x > 0.0 ? u_texRes : vec2(1.0);
    
    if(t < maxD) {
        vec3 n = calcNormal(p);
        vec3 l = normalize(vec3(1.0, 1.5, 2.0)); 
        
        float d_trail = 1000.0;
        float trailNoise = noise(p * 2.0 + u_time * 0.5) * 0.02;
        for(int i = 0; i < 5; i++) {
            float radius = (0.5 - float(i) * 0.08) * u_trailScale;
            vec3 center = vec3(u_points[i], 0.0);
            float dist = length(p - center) - radius + trailNoise;
            d_trail = (i == 0) ? dist : smin(d_trail, dist, 0.6);
        }
        
        float d_header = 1000.0;
        float d_ui = 1000.0;
        
        for(int i = 0; i < 5; i++) {
            vec3 capsuleA = vec3(u_capsulePos[i].x - u_capsuleSize[i].x, u_capsulePos[i].y, 0.0);
            vec3 capsuleB = vec3(u_capsulePos[i].x + u_capsuleSize[i].x, u_capsulePos[i].y, 0.0);
            float capsuleDist = sdCapsule(p, capsuleA, capsuleB, u_capsuleSize[i].y);
            
            if (i == 0) {
                d_header = capsuleDist + sin(p.x * 8.0 + u_time * 2.0) * 0.003;
            } else {
                float waveAmp = u_uiWaves[i - 1];
                float distCenter = length(p.xy - u_capsulePos[i]);
                capsuleDist += sin(distCenter * 40.0 - u_time * 20.0) * 0.02 * waveAmp;
                d_ui = (i == 1) ? capsuleDist : min(d_ui, capsuleDist);
            }
        }
        
        if (min(d_trail, d_header) < d_ui) {
            vec3 refrCol = calcRefraction(rd, n, fragCoord, u_resolution.xy, texRes);
            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
            vec3 finalCol = mix(refrCol, vec3(0.9, 0.95, 1.0), fresnel * 0.2);
            finalCol += vec3(1.0) * pow(max(dot(n, normalize(-rd + l)), 0.0), 800.0) * 1.5;
            fragColor = vec4(finalCol, 1.0);
        } else {
            vec3 refR = refract(rd, n, 1.0 / 1.32);
            vec3 refG = refract(rd, n, 1.0 / 1.33);
            vec3 refB = refract(rd, n, 1.0 / 1.34);
            float strength = 0.1 * u_resolution.y;
            
            vec3 colR = getPureBackground(fragCoord + (refR.xy - rd.xy) * strength, u_resolution.xy, texRes, u_scrollY);
            vec3 colG = getPureBackground(fragCoord + (refG.xy - rd.xy) * strength, u_resolution.xy, texRes, u_scrollY);
            vec3 colB = getPureBackground(fragCoord + (refB.xy - rd.xy) * strength, u_resolution.xy, texRes, u_scrollY);
            vec3 refrCol = vec3(colR.r, colG.g, colB.b);
            
            float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
            vec3 finalCol = mix(refrCol, vec3(0.9, 0.95, 1.0), fresnel * 0.2);
            finalCol += vec3(1.0) * pow(max(dot(n, normalize(-rd + l)), 0.0), 800.0) * 1.5;
            
            float docY_fromTop = u_scrollY + (u_resolution.y - fragCoord.y);
            vec2 docUV = vec2(fragCoord.x / u_resolution.x, 1.0 - (docY_fromTop / (u_resolution.y * 3.0)));
            vec4 textData = texture(u_textTex, docUV);
            finalCol = mix(finalCol, textData.rgb, textData.a);
            
            fragColor = vec4(finalCol, 1.0);
        }
    } else {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0 - shadowAlpha);
    }
}`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
    return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

const program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, "a_position");
gl.enableVertexAttribArray(positionLocation);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const uResolutionLoc = gl.getUniformLocation(program, "u_resolution");
const uPointsLoc = gl.getUniformLocation(program, "u_points");
const uCapsulePosLoc = gl.getUniformLocation(program, "u_capsulePos");
const uCapsuleSizeLoc = gl.getUniformLocation(program, "u_capsuleSize");
const uTexLoc = gl.getUniformLocation(program, "u_tex");
const uTextTexLoc = gl.getUniformLocation(program, "u_textTex");
const uTexResLoc = gl.getUniformLocation(program, "u_texRes");
const uTimeLoc = gl.getUniformLocation(program, "u_time");
const uScrollYLoc = gl.getUniformLocation(program, "u_scrollY");
const uUiWavesLoc = gl.getUniformLocation(program, "u_uiWaves");
const uTrailScaleLoc = gl.getUniformLocation(program, "u_trailScale");

const bgTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, bgTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

const bgImage = new Image();
bgImage.src = 'bg.jpg';
let imageLoaded = false;
bgImage.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    imageLoaded = true;
};

const textCanvas = document.createElement('canvas');
const textCtx = textCanvas.getContext('2d');
const textTexture = gl.createTexture();

function updateDOMTextTexture() {
    if (textCanvas.width !== window.innerWidth || textCanvas.height !== window.innerHeight * 3) {
        textCanvas.width = window.innerWidth;
        textCanvas.height = window.innerHeight * 3;
    }
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

    const drawText = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        textCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        textCtx.letterSpacing = style.letterSpacing;
        textCtx.fillStyle = style.color;
        textCtx.textAlign = 'center';
        textCtx.textBaseline = 'middle';
        textCtx.fillText(el.textContent, rect.left + rect.width / 2, rect.top + window.scrollY + rect.height / 2);
    };

    const drawUIBox = (id, radius) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const x = rect.left;
        const y = rect.top + window.scrollY;

        if (el.textContent.trim()) {
            textCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            textCtx.letterSpacing = style.letterSpacing;
            textCtx.fillStyle = '#ffffff';
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';

            let txt = el.textContent.trim();
            let drawX = x + rect.width / 2;
            let drawY = y + rect.height / 2;

            if (txt === '▶') {
                drawX += 4;
            }

            textCtx.fillText(txt, drawX, drawY);
        }
    };

    const drawCircle = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + window.scrollY + rect.height / 2;

        textCtx.fillStyle = '#ffffff';
        textCtx.beginPath();
        textCtx.arc(x, y, rect.width / 2, 0, Math.PI * 2);
        textCtx.fill();
    };

    const drawStroke = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const x = rect.left;
        const y = rect.top + window.scrollY;
        const r = parseFloat(style.borderRadius) || 0;
        textCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        textCtx.lineWidth = 3;
        textCtx.beginPath();
        if (textCtx.roundRect) {
            textCtx.roundRect(x, y, rect.width, rect.height, r);
        } else {
            textCtx.rect(x, y, rect.width, rect.height);
        }
        textCtx.stroke();
    };

    const elementsToDraw = document.querySelectorAll('.welcome-title, .welcome-subtitle, .welcome-hint, #showcase-title, #showcase-sub, .ui-label, .inspiration-title, .inspiration-sub');
    elementsToDraw.forEach(el => {
        if (el.id) drawText(el.id);
        else {
            el.id = 'temp-id-' + Math.random().toString(36).substr(2, 9);
            drawText(el.id);
        }
    });

    drawUIBox('ui-btn', 50);
    drawUIBox('ui-switch', 40);
    drawCircle('ui-knob');
    drawStroke('ui-slider');
    drawCircle('ui-slider-knob');
    drawUIBox('ui-icon-btn', 50);

    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

document.fonts.ready.then(updateDOMTextTexture);

const uiBtn = document.getElementById('ui-btn');
const uiSwitch = document.getElementById('ui-switch');
const uiSlider = document.getElementById('ui-slider');
const uiIconBtn = document.getElementById('ui-icon-btn');

let uiWaves = new Float32Array(4);

const addRipple = (el, index) => {
    if (el) {
        el.addEventListener('mouseenter', () => setTimeout(updateDOMTextTexture, 20));
        el.addEventListener('mouseleave', () => setTimeout(updateDOMTextTexture, 20));
        el.addEventListener('click', () => { uiWaves[index] = 1.0; });
    }
};

addRipple(uiBtn, 0);
addRipple(uiSlider, 2);
addRipple(uiIconBtn, 3);

let isPlaying = false;
if (uiIconBtn) {
    uiIconBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        uiIconBtn.textContent = isPlaying ? '⏸' : '▶';
        updateDOMTextTexture();
    });
}

const uiSliderKnob = document.getElementById('ui-slider-knob');
let sliderActive = false;

if (uiSlider) {
    uiSlider.addEventListener('pointerdown', (e) => {
        sliderActive = true;
        updateSlider(e);
        uiWaves[2] = 1.0;
    });
    window.addEventListener('pointermove', (e) => {
        if (sliderActive) updateSlider(e);
    });
    window.addEventListener('pointerup', () => { sliderActive = false; });
}

function updateSlider(e) {
    const rect = uiSlider.getBoundingClientRect();
    let percent = (e.clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    uiSliderKnob.style.left = `calc(${percent * 100}% - 14px)`;
    updateDOMTextTexture();
}

let switchAnimFrame;
const animateTextureUpdate = (startTime) => {
    updateDOMTextTexture();
    if (performance.now() - startTime < 350) {
        switchAnimFrame = requestAnimationFrame(() => animateTextureUpdate(startTime));
    }
};

if (uiSwitch) {
    uiSwitch.addEventListener('click', () => {
        uiWaves[1] = 1.0;
        uiSwitch.classList.toggle('active');
        cancelAnimationFrame(switchAnimFrame);
        animateTextureUpdate(performance.now());
    });
}

const NUM_POINTS = 5;
const points = Array.from({ length: NUM_POINTS }, () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    vx: 0,
    vy: 0
}));

const targetPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let isDragging = false;
const updateTarget = (x, y) => { targetPos.x = x; targetPos.y = y; };

const DRAG_RADIUS = 300;
const TOUCH_DRAG_RADIUS = 400;

window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return;
    const dx = e.clientX - points[0].x;
    const dy = e.clientY - points[0].y;
    if (Math.sqrt(dx * dx + dy * dy) < DRAG_RADIUS) {
        isDragging = true;
        updateTarget(e.clientX, e.clientY);
    }
});
window.addEventListener('pointermove', (e) => { if (isDragging && e.pointerType !== 'touch') updateTarget(e.clientX, e.clientY); });
window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') isDragging = false; });

window.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const dx = touch.clientX - points[0].x;
    const dy = touch.clientY - points[0].y;
    if (Math.sqrt(dx * dx + dy * dy) < TOUCH_DRAG_RADIUS) {
        isDragging = true;
        updateTarget(touch.clientX, touch.clientY);
    }
}, { passive: true });
window.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    updateTarget(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: false });
window.addEventListener('touchend', () => { isDragging = false; });
window.addEventListener('touchcancel', () => { isDragging = false; });

const keysPressed = {};
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) keysPressed[key] = true;
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) keysPressed[key] = false;
});

let currentScrollY = window.scrollY;
window.addEventListener('scroll', () => { currentScrollY = window.scrollY; });

const K_ANCHOR = 200.0, M_ANCHOR = 1.0, C_ANCHOR = 2.0 * Math.sqrt(K_ANCHOR * M_ANCHOR);
const K_TAIL = 300.0, M_TAIL = 1.0, C_TAIL = 2.0 * Math.sqrt(K_TAIL * M_TAIL);
let lastTime = performance.now();

function updatePhysics(dt) {
    if (dt > 0.03) dt = 0.03;

    const keyboardSpeed = 1200.0;
    if (keysPressed['w']) targetPos.y -= keyboardSpeed * dt;
    if (keysPressed['s']) targetPos.y += keyboardSpeed * dt;
    if (keysPressed['a']) targetPos.x -= keyboardSpeed * dt;
    if (keysPressed['d']) targetPos.x += keyboardSpeed * dt;

    targetPos.x = Math.max(0, Math.min(window.innerWidth, targetPos.x));
    targetPos.y = Math.max(0, Math.min(window.innerHeight, targetPos.y));

    let fx = K_ANCHOR * (targetPos.x - points[0].x) - C_ANCHOR * points[0].vx;
    let fy = K_ANCHOR * (targetPos.y - points[0].y) - C_ANCHOR * points[0].vy;
    points[0].vx += (fx / M_ANCHOR) * dt;
    points[0].vy += (fy / M_ANCHOR) * dt;
    points[0].x += points[0].vx * dt;
    points[0].y += points[0].vy * dt;

    for (let i = 1; i < NUM_POINTS; i++) {
        let p = points[i];
        let target = points[i - 1];
        let fx = K_TAIL * (target.x - p.x) - C_TAIL * p.vx;
        let fy = K_TAIL * (target.y - p.y) - C_TAIL * p.vy;
        p.vx += (fx / M_TAIL) * dt;
        p.vy += (fy / M_TAIL) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
    }
}

const isMobile = window.innerWidth <= 768 || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const renderScale = isMobile ? 1.0 : 1.0;

function resize() {
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    canvas.style.width = winW + 'px';
    canvas.style.height = winH + 'px';

    canvas.width = winW * renderScale;
    canvas.height = winH * renderScale;
    gl.viewport(0, 0, canvas.width, canvas.height);

    updateDOMTextTexture();
}
window.addEventListener('resize', resize);
resize();

const mappedPoints = new Float32Array(NUM_POINTS * 2);
const capsuleDataPos = new Float32Array(10);
const capsuleDataSize = new Float32Array(10);

function renderLoop(time) {
    let now = performance.now();
    let dt = (now - lastTime) / 1000.0;
    lastTime = now;

    updatePhysics(dt);

    const winW = window.innerWidth;
    const winH = window.innerHeight;

    for (let i = 0; i < NUM_POINTS; i++) {
        mappedPoints[i * 2] = ((points[i].x - 0.5 * winW) / winH) * 3.0;
        mappedPoints[i * 2 + 1] = (((winH - points[i].y) - 0.5 * winH) / winH) * 3.0;
    }

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform1f(uTimeLoc, time * 0.001);

    gl.uniform1f(uScrollYLoc, currentScrollY * renderScale);
    gl.uniform2fv(uPointsLoc, mappedPoints);

    const currentTrailScale = isMobile ? 0.2 : 1.0;
    gl.uniform1f(uTrailScaleLoc, currentTrailScale);

    for (let w = 0; w < 4; w++) uiWaves[w] *= 0.95;
    gl.uniform1fv(uUiWavesLoc, uiWaves);

    const headerEl = document.getElementById('header-overlay');
    if (headerEl) {
        const headerRect = headerEl.getBoundingClientRect();
        const hPadX = 25;
        const hPadY = 18;
        const hCx = headerRect.left + headerRect.width / 2.0;
        const hCy = headerRect.top + headerRect.height / 2.0;

        let mapCapsuleX = ((hCx - 0.5 * winW) / winH) * 3.0;
        let mapCapsuleY = (((winH - hCy) - 0.5 * winH) / winH) * 3.0;

        let hRadius = headerRect.height / 2.0 + hPadY;
        let hHalfLen = Math.max(0, (headerRect.width + hPadX * 2.0) / 2.0 - hRadius);

        capsuleDataPos[0] = mapCapsuleX;
        capsuleDataPos[1] = mapCapsuleY;
        capsuleDataSize[0] = (hHalfLen / winH) * 3.0;
        capsuleDataSize[1] = (hRadius / winH) * 3.0;
    }

    const elements = [uiBtn, uiSwitch, uiSlider, uiIconBtn];
    elements.forEach((el, idx) => {
        const i = idx + 1;
        if (el) {
            const rect = el.getBoundingClientRect();
            const cx = ((rect.left + rect.width / 2) - 0.5 * winW) / winH * 3.0;
            const cy = (((winH - (rect.top + rect.height / 2))) - 0.5 * winH) / winH * 3.0;
            const halfLen = Math.max(0, (rect.width - rect.height) / 2) / winH * 3.0;
            const radius = (rect.height / 2) / winH * 3.0;

            capsuleDataPos[i * 2] = cx;
            capsuleDataPos[i * 2 + 1] = cy;
            capsuleDataSize[i * 2] = halfLen;
            capsuleDataSize[i * 2 + 1] = radius;
        } else {
            capsuleDataPos[i * 2] = -999.0;
            capsuleDataPos[i * 2 + 1] = -999.0;
            capsuleDataSize[i * 2] = 0.0;
            capsuleDataSize[i * 2 + 1] = 0.0;
        }
    });

    gl.uniform2fv(uCapsulePosLoc, capsuleDataPos);
    gl.uniform2fv(uCapsuleSizeLoc, capsuleDataSize);

    if (imageLoaded) gl.uniform2f(uTexResLoc, bgImage.width, bgImage.height);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTexture);
    gl.uniform1i(uTexLoc, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, textTexture);
    gl.uniform1i(uTextTexLoc, 1);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(renderLoop);
}
requestAnimationFrame(renderLoop);