/* MH3 — three.js 도우미 (window.MH3). 루트 index.html 에서 three.min.js → mh.js → mh-three.js 순으로 불러온다.
 * 3D는 "그 장면이 3D일 이유가 있을 때"만: 제품 턴테이블, 사진 카드가 공간에 놓이는 장면, 깊이감 있는 카메라 무브, 파티클.
 * draw(t)마다 오브젝트·카메라를 t로 계산하고 s.render() — 이전 프레임 상태에 의존하지 않는다. */
(function () {
'use strict';
const T = window.THREE, MH = window.MH;
if (!T) { console.error('MH3: THREE 가 없습니다 (assets/lib/three.min.js 를 먼저 불러올 것)'); return; }

// 무대: 렌더러 + 장면 + 카메라. preserveDrawingBuffer 필수(프레임 캡처)
function stage(canvasId, o = {}) {
  const cv = document.getElementById(canvasId), W = cv.width, H = cv.height;
  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: !!o.transparent, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = o.toneMapping === false ? T.NoToneMapping : T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1.0;
  if (o.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; }
  const scene = new T.Scene();
  if (o.bg && !o.transparent) scene.background = new T.Color(o.bg);
  if (o.fog) scene.fog = new T.Fog(new T.Color(o.fog.color || o.bg || '#000'), o.fog.near ?? 6, o.fog.far ?? 20);
  const camera = new T.PerspectiveCamera(o.fov ?? 35, W / H, 0.05, 200);
  camera.position.set(0, 1.2, 6); camera.lookAt(0, 1, 0);
  return { renderer, scene, camera, W, H, render: () => renderer.render(scene, camera) };
}
// 스튜디오 조명: 따뜻한 키 + 차가운 림 + 반구광
function lights(scene, o = {}) {
  const key = new T.DirectionalLight(new T.Color(o.key || '#fff1e0'), o.keyI ?? 2.4); key.position.set(3, 5, 4);
  const rim = new T.DirectionalLight(new T.Color(o.rim || '#d7e6ff'), o.rimI ?? 1.6); rim.position.set(-4, 3, -3);
  const hemi = new T.HemisphereLight(new T.Color(o.sky || '#ffffff'), new T.Color(o.ground || '#444444'), o.ambI ?? 0.6);
  if (o.shadows) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; }
  scene.add(key, rim, hemi); return { key, rim, hemi };
}
// 이미지/캔버스 → 텍스처
function tex(src) { const t = new T.CanvasTexture(src); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true; return t; }
const aspectOf = im => (im.naturalWidth || im.width) / (im.naturalHeight || im.height);

// 사진 카드: 종이 판 위에 사진 (그리드·인쇄 계열 스타일에서 사진을 공간에 놓을 때)
function photoCard(im, o = {}) {
  const h = o.h ?? 2, a = aspectOf(im), m = o.margin ?? 0.08, w = h * a;
  const g = new T.Group();
  const paper = new T.Mesh(new T.BoxGeometry(w + m * 2, h + m * 2, o.depth ?? 0.03), new T.MeshStandardMaterial({ color: new T.Color(o.color || '#ffffff'), roughness: 0.85 }));
  const photo = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({ map: tex(im), roughness: 0.7, transparent: true }));
  photo.position.z = (o.depth ?? 0.03) / 2 + 0.002;
  if (o.shadows) { paper.castShadow = true; }
  g.add(paper, photo); g.userData = { w: w + m * 2, h: h + m * 2 }; return g;
}
// 멀티뷰 턴테이블: 여러 각도 사진으로 "돌아가는" 제품. views = [{ img, angle(도) }], set(각도)로 가장 가까운 두 장을 교차
// 진짜 3D 모델이 아니므로 회전은 ±90° 범위에서 자연스럽다. 배경 제거된 이미지(cutout)를 쓸 것.
function turntable(views, o = {}) {
  const h = o.h ?? 2.2, g = new T.Group();
  const vs = views.map(v => ({ ...v, a: v.angle ?? 0 })).sort((p, q) => p.a - q.a);
  const mk = () => { const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })); m.position.y = h / 2; g.add(m); return m; };
  const A = mk(), B = mk(); B.position.z = 0.001;
  const texs = vs.map(v => tex(v.img));
  function place(mesh, i, op, squash) { const im = vs[i].img, w = h * aspectOf(im); mesh.material.map = texs[i]; mesh.material.opacity = op; mesh.material.needsUpdate = true; mesh.scale.set(w * squash, h, 1); mesh.scale.x *= vs[i].flip ? -1 : 1; }
  function set(deg) {
    let i = vs.findIndex(v => v.a >= deg); if (i < 0) i = vs.length - 1;
    const j = Math.max(0, i - 1), a0 = vs[j].a, a1 = vs[i].a, p = a1 === a0 ? 1 : MH.clamp((deg - a0) / (a1 - a0));
    const squash = 1 - 0.07 * Math.sin(Math.PI * p);              // 교차 중간에 살짝 좁아져 회전처럼 보이게
    place(A, j, 1 - MH.E.smooth(p), squash); place(B, i, MH.E.smooth(p), squash);
    g.rotation.y = MH.lerp(-0.08, 0.08, p) * (o.wobble ?? 1);
  }
  set(vs[0].a); g.userData.set = set; return { group: g, set };
}
// 접지 그림자 (부드러운 원형)
function contactShadow(scene, o = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const gr = x.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, `rgba(0,0,0,${o.opacity ?? 0.45})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = (o.y ?? 0) + 0.001; m.scale.set((o.r ?? 1.2) * 2, (o.r ?? 1.2) * 2 * (o.squash ?? 0.6), 1);
  scene.add(m); return m;
}
// 바닥 (그림자 받기)
function floor(scene, o = {}) { const m = new T.Mesh(new T.PlaneGeometry(o.size ?? 40, o.size ?? 40), new T.MeshStandardMaterial({ color: new T.Color(o.color || '#dddddd'), roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = o.y ?? 0; m.receiveShadow = true; scene.add(m); return m; }
// 글자 평면: 캔버스에 MH.txt로 그린 뒤 텍스처 (한글 폰트 그대로)
function textPlane(str, o = {}) {
  const size = o.size ?? 120, pad = size * 0.3, c = document.createElement('canvas'), x = c.getContext('2d');
  const w = Math.ceil(MH.measure(x, str, size, o.weight ?? 800, o.family || MH.FONT.sans, o.tracking ?? 0) + pad * 2), hgt = Math.ceil(size * 1.4 + pad);
  c.width = w; c.height = hgt; MH.txt(x, str, pad, size * 1.1 + pad / 2, { size, weight: o.weight ?? 800, color: o.color || '#111', family: o.family, tracking: o.tracking ?? 0 });
  const unit = o.height ?? 0.6, m = new T.Mesh(new T.PlaneGeometry(unit * w / hgt, unit), new T.MeshBasicMaterial({ map: tex(c), transparent: true, depthWrite: false, toneMapped: false }));
  return m;
}
// 카메라 궤도: 대상 주위 각도(도)·반경·높이
function orbit(camera, o = {}) {
  const tg = o.target || [0, 1, 0], a = (o.angle ?? 0) * Math.PI / 180, r = o.radius ?? 6;
  camera.position.set(tg[0] + Math.sin(a) * r, tg[1] + (o.height ?? 0.4), tg[2] + Math.cos(a) * r); camera.lookAt(tg[0], tg[1], tg[2]);
  if (o.fov) { camera.fov = o.fov; camera.updateProjectionMatrix(); }
}
// 결정적 파티클
function points(n, seed = 1, o = {}) {
  const r = MH.rng(seed), pos = new Float32Array(n * 3), s = o.spread ?? [8, 4, 8];
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() - .5) * s[0]; pos[i * 3 + 1] = r() * s[1]; pos[i * 3 + 2] = (r() - .5) * s[2]; }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  return new T.Points(geo, new T.PointsMaterial({ color: new T.Color(o.color || '#ffffff'), size: o.size ?? 0.03, transparent: true, opacity: o.opacity ?? 0.8, depthWrite: false }));
}

window.MH3 = { THREE: T, stage, lights, tex, photoCard, turntable, contactShadow, floor, textPlane, orbit, points };
})();
