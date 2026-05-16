const canvas = document.getElementById('glcanvas');
const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });

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
uniform vec2 u_capsulePos;
uniform vec2 u_capsuleSize;
uniform sampler2D u_tex;
uniform sampler2D u_textTex; 
uniform vec2 u_texRes;
uniform float u_time;
uniform float u_scrollY;

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

float map(vec3 p) {
    float surfaceNoise = noise(p * 2.0 + u_time * 0.5) * 0.02;
    float d = 1000.0;
    
    for(int i = 0; i < 5; i++) {
        float radius = 0.5 - float(i) * 0.08;
        vec3 center = vec3(u_points[i], 0.0);
        float dist = length(p - center) - radius + surfaceNoise;
        d = (i == 0) ? dist : smin(d, dist, 0.6);
    }
    
    vec3 capsuleA = vec3(u_capsulePos.x - u_capsuleSize.x * 0.4, u_capsulePos.y, 0.0);
    vec3 capsuleB = vec3(u_capsulePos.x + u_capsuleSize.x * 1.6, u_capsulePos.y, 0.0);
    float flowWave = sin(p.x * 10.0 - u_time * 4.0) * 0.001; 
    float capsuleDist = sdCapsule(p, capsuleA, capsuleB, u_capsuleSize.y) + surfaceNoise + flowWave;
    d = smin(d, capsuleDist, 0.6);
    
    return d;
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

vec3 getBackground(vec2 fragCoord, vec2 resolution, vec2 texRes, float scrollY) {
    float docY_fromTop = scrollY + (resolution.y - fragCoord.y);
    vec3 baseColor;
    
    if (docY_fromTop > resolution.y) {
        vec2 bgCoord = vec2(fragCoord.x, resolution.y - (docY_fromTop - resolution.y));
        baseColor = texture(u_tex, getCoverUV(bgCoord, resolution, texRes)).rgb;
    } else {
        baseColor = vec3(0.95); 
    }
    
    vec2 docUV = vec2(fragCoord.x / resolution.x, 1.0 - (docY_fromTop / (resolution.y * 2.0)));
    vec4 textData = texture(u_textTex, docUV);
    
    return mix(baseColor, textData.rgb, textData.a);
}

vec3 calcRefraction(vec3 rd, vec3 n, vec2 fragCoord, vec2 resolution, vec2 texRes) {
    vec3 refR = refract(rd, n, 1.0 / 1.32);
    vec3 refG = refract(rd, n, 1.0 / 1.33);
    vec3 refB = refract(rd, n, 1.0 / 1.34);
    
    float strength = 0.1 * resolution.y; 
    
    vec3 colR = getBackground(fragCoord + (refR.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    vec3 colG = getBackground(fragCoord + (refG.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    vec3 colB = getBackground(fragCoord + (refB.xy - rd.xy) * strength, resolution, texRes, u_scrollY);
    
    return vec3(colR.r, colG.g, colB.b);
}

vec4 render(vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * u_resolution.xy) / u_resolution.y;
    vec3 ro = vec3(0.0, 0.0, 3.0);
    vec3 rd = normalize(vec3(uv, -1.0));
    
    vec3 shadowPos = vec3((uv + vec2(0.0, 0.05)) * 3.0, 0.0); 
    float shadowAlpha = mix(0.9, 1.0, smoothstep(0.0, 0.2, map(shadowPos)));
    
    float t = 0.0;
    float maxD = 10.0;
    vec3 p;
    
    for(int i = 0; i < 32; i++) {
        p = ro + rd * t;
        float d = map(p);
        if(d < 0.001 || t > maxD) break;
        t += d;
    }
    
    vec2 texRes = u_texRes.x > 0.0 ? u_texRes : vec2(1.0);
    vec3 bgCol = getBackground(fragCoord, u_resolution.xy, texRes, u_scrollY) * shadowAlpha;
    
    if(t < maxD) {
        vec3 n = calcNormal(p);
        vec3 l = normalize(vec3(1.0, 1.5, 2.0)); 
        
        vec3 refrCol = calcRefraction(rd, n, fragCoord, u_resolution.xy, texRes);
        
        float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
        vec3 finalCol = mix(refrCol, bgCol, fresnel * 0.3);
        
        finalCol += vec3(1.0) * pow(max(dot(n, normalize(-rd + l)), 0.0), 800.0) * 1.5;
        
        return vec4(finalCol, 1.0); 
    } else {
        return vec4(0.0, 0.0, 0.0, 1.0 - shadowAlpha);
    }
}

void main() {
    fragColor = render(gl_FragCoord.xy);
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
    textCanvas.width = window.innerWidth;
    textCanvas.height = window.innerHeight * 2;
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    
    const drawText = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        textCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
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

        const bgColor = style.backgroundColor;
        const isFilled = bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent';

        textCtx.strokeStyle = style.borderColor || '#ffffff';
        textCtx.lineWidth = 2;
        textCtx.beginPath();
        textCtx.roundRect(x, y, rect.width, rect.height, radius);
        
        if (isFilled) {
            textCtx.fillStyle = bgColor;
            textCtx.fill();
        } else {
            textCtx.stroke();
        }

        if (el.textContent.trim()) {
            textCtx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            textCtx.fillStyle = style.color;
            textCtx.textAlign = 'center';
            textCtx.textBaseline = 'middle';
            textCtx.fillText(el.textContent.trim(), x + rect.width / 2, y + rect.height / 2);
        }
    };

    const drawCircle = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const x = rect.left + rect.width / 2;
        const y = rect.top + window.scrollY + rect.height / 2;
        
        textCtx.fillStyle = style.backgroundColor || '#ffffff';
        textCtx.beginPath();
        textCtx.arc(x, y, rect.width / 2, 0, Math.PI * 2);
        textCtx.fill();
    };

    const elementsToDraw = document.querySelectorAll('.header-title, .welcome-title, .welcome-subtitle, .welcome-hint, #showcase-title, #showcase-sub');
    elementsToDraw.forEach(el => {
        if(el.id) drawText(el.id);
        else {
            el.id = 'temp-id-' + Math.random().toString(36).substr(2, 9);
            drawText(el.id);
        }
    });
    
    drawUIBox('ui-btn', 50);
    drawUIBox('ui-switch', 40);
    drawCircle('ui-knob');
    
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

if (uiBtn) {
    uiBtn.addEventListener('mouseenter', () => setTimeout(updateDOMTextTexture, 20));
    uiBtn.addEventListener('mouseleave', () => setTimeout(updateDOMTextTexture, 20));
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

window.addEventListener('pointerdown', (e) => { isDragging = true; updateTarget(e.clientX, e.clientY); });
window.addEventListener('pointermove', (e) => { if (isDragging) updateTarget(e.clientX, e.clientY); });
window.addEventListener('pointerup', () => isDragging = false);
window.addEventListener('pointerleave', () => isDragging = false);

window.addEventListener('touchstart', (e) => {
    isDragging = true; updateTarget(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
window.addEventListener('touchmove', (e) => {
    if (isDragging) updateTarget(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });
window.addEventListener('touchend', () => isDragging = false);

let currentScrollY = window.scrollY;
window.addEventListener('scroll', () => { currentScrollY = window.scrollY; });

const K_ANCHOR = 200.0, M_ANCHOR = 1.0, C_ANCHOR = 2.0 * Math.sqrt(K_ANCHOR * M_ANCHOR);
const K_TAIL = 300.0, M_TAIL = 1.0, C_TAIL = 2.0 * Math.sqrt(K_TAIL * M_TAIL);
let lastTime = performance.now();

function updatePhysics(dt) {
    if (dt > 0.03) dt = 0.03;

    if (isDragging) {
        points[0].x = targetPos.x;
        points[0].y = targetPos.y;
        points[0].vx = 0;
        points[0].vy = 0;
    } else {
        let fx = K_ANCHOR * (targetPos.x - points[0].x) - C_ANCHOR * points[0].vx;
        let fy = K_ANCHOR * (targetPos.y - points[0].y) - C_ANCHOR * points[0].vy;
        points[0].vx += (fx / M_ANCHOR) * dt;
        points[0].vy += (fy / M_ANCHOR) * dt;
        points[0].x += points[0].vx * dt;
        points[0].y += points[0].vy * dt;
    }

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

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    updateDOMTextTexture(); 
}
window.addEventListener('resize', resize);
resize();

const mappedPoints = new Float32Array(NUM_POINTS * 2);

function renderLoop(time) {
    let now = performance.now();
    let dt = (now - lastTime) / 1000.0;
    lastTime = now;

    updatePhysics(dt);

    for (let i = 0; i < NUM_POINTS; i++) {
        mappedPoints[i * 2] = ((points[i].x - 0.5 * canvas.width) / canvas.height) * 3.0;
        mappedPoints[i * 2 + 1] = (((canvas.height - points[i].y) - 0.5 * canvas.height) / canvas.height) * 3.0;
    }

    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(program);
    gl.uniform2f(uResolutionLoc, canvas.width, canvas.height);
    gl.uniform2fv(uPointsLoc, mappedPoints);
    gl.uniform1f(uTimeLoc, time * 0.001);
    gl.uniform1f(uScrollYLoc, currentScrollY);

    let capsuleWidth = 0.25 * canvas.width;
    let capsulePxX = 60.0 + capsuleWidth / 2.0;
    let capsulePxY = 60.0;

    let mapCapsuleX = ((capsulePxX - 0.5 * canvas.width) / canvas.height) * 3.0;
    let mapCapsuleY = (((canvas.height - capsulePxY) - 0.5 * canvas.height) / canvas.height) * 3.0;
    let mapCapsuleW = (capsuleWidth / canvas.height) * 3.0;
    let mapCapsuleR = (34.0 / canvas.height) * 3.0;

    gl.uniform2f(uCapsulePosLoc, mapCapsuleX, mapCapsuleY);
    gl.uniform2f(uCapsuleSizeLoc, mapCapsuleW, mapCapsuleR);

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