// 설치 / 업데이트 (플러그인 설치 후 한 번): node setup.mjs [--update] [--skip-browser]
// 설치물은 ~/.motion-harness 에 둔다 (플러그인 업데이트에도 유지): node_modules(playwright·three·gsap), 레퍼런스 라이브러리, 한글 폰트, 카탈로그
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { DATA, LIB, HARNESS, CONFIG, parseArgs, has, ensureDir, hf } from './_common.mjs';

const { opt } = parseArgs();
const WIN = process.platform === 'win32', MAC = process.platform === 'darwin';
const sh = (cmd, args, cwd = DATA) => spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, cwd });
const ok = m => console.log('  ✔ ' + m), warn = m => console.log('  ⚠ ' + m);
let problems = 0;
ensureDir(DATA);
console.log(`설치 위치: ${DATA}`);

console.log('\n[1/6] 필수 프로그램');
const nodeMajor = +process.versions.node.split('.')[0];
nodeMajor >= 22 ? ok('Node ' + process.versions.node) : (warn(`Node 22 이상 필요 (현재 ${process.versions.node}) — HyperFrames 요구사항. https://nodejs.org 에서 LTS 설치`), problems++);
for (const [c, hint] of [['ffmpeg', WIN ? 'winget install Gyan.FFmpeg' : MAC ? 'brew install ffmpeg' : 'sudo apt install ffmpeg'], ['ffprobe', '(ffmpeg 과 함께 설치됨)'], ['git', WIN ? 'winget install Git.Git' : MAC ? 'xcode-select --install' : 'sudo apt install git']]) {
  has(c, c === 'git' ? ['--version'] : ['-version']) ? ok(c) : (warn(`${c} 없음 → ${hint}  (설치 후 터미널을 새로 열고 다시 실행)`), problems++);
}
const tts = [['edge-tts', ['--help']], ['python', ['-m', 'edge_tts', '--help']], ['python3', ['-m', 'edge_tts', '--help']], ['py', ['-m', 'edge_tts', '--help']]].some(([c, a]) => has(c, a));
tts ? ok('edge-tts (한국어 내레이션)') : console.log('  · edge-tts 없음 (선택) — 한국어 TTS 가 필요하면: pip install edge-tts');
if (problems) { console.log('\n위 프로그램을 설치한 뒤 다시 실행하세요.'); process.exit(1); }

console.log('\n[2/6] Node 패키지 (playwright · three · gsap)');
fs.writeFileSync(path.join(DATA, 'package.json'), JSON.stringify({ name: 'motion-harness-data', private: true, dependencies: { playwright: CONFIG.playwright, three: CONFIG.three, gsap: CONFIG.gsap } }, null, 2));
const needInstall = opt.update || !['playwright', 'three', 'gsap'].every(p => fs.existsSync(path.join(DATA, 'node_modules', p)));
if (needInstall && sh('npm', ['install', '--no-audit', '--no-fund']).status !== 0) { warn('npm install 실패'); process.exit(1); }
ok('설치됨');
if (!opt['skip-browser']) { const r = sh('npx', ['playwright', 'install', 'chromium']); r.status === 0 ? ok('Chromium (보드·분석용)') : warn('Chromium 설치 실패 — 다시 실행해 보세요'); }

console.log(`\n[3/6] HyperFrames ${CONFIG.hyperframes} (렌더 엔진)`);
const v = hf(['--version']);
(v.status === 0) ? ok('hyperframes ' + (v.stdout || '').trim().split('\n').pop()) : warn('hyperframes 실행 실패: ' + (v.stderr || '').slice(-300));

console.log('\n[4/6] 레퍼런스 라이브러리 (필요한 파일만)');
ensureDir(LIB);
const A = 'plugins/animate/skills/animate';
const REPOS = [
  { dir: 'lemo', url: 'https://github.com/lemomo-ai/lemo-opuscar.git', pats: ['/styles/*/STYLE.md', '/styles/*/style.json', '/styles/README.md', '/styleboard/catalog.json', '/DIRECTOR.md', '/TECHNIQUE.md', '/LICENSE', '/README.md'] },
  { dir: 'animate', url: 'https://github.com/cth9191/animate.git', pats: [`/${A}/styles/*/STYLE.md`, `/${A}/styles/*/sample.png`, `/${A}/styles/*/kit.js`, `/${A}/styles/README.md`, `/${A}/craft.md`, `/${A}/new-style.md`, `/${A}/grammar/`, '/LICENSE', '/README.md'] },
  { dir: 'awesome', url: 'https://github.com/zhuyansen/awesome-opus-5.5-video.git', pats: ['/cases.json', '/README.md'] },
];
for (const r of REPOS) {
  const d = path.join(LIB, r.dir);
  if (!fs.existsSync(path.join(d, '.git'))) {
    if (sh('git', ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', r.url, d], LIB).status !== 0) { warn(r.dir + ' 받기 실패'); continue; }
    sh('git', ['-C', d, 'sparse-checkout', 'set', '--no-cone', ...r.pats], LIB); sh('git', ['-C', d, 'checkout'], LIB);
  } else if (opt.update) {
    const extra = (spawnSync('git', ['-C', d, 'sparse-checkout', 'list'], { encoding: 'utf8' }).stdout || '').split('\n').filter(p => p.includes('/demo/'));
    sh('git', ['-C', d, 'sparse-checkout', 'set', '--no-cone', ...r.pats, ...extra], LIB); sh('git', ['-C', d, 'pull', '--depth', '1', '--ff-only'], LIB);
  }
  ok(`${r.dir}  (${r.url.replace('https://github.com/', '').replace('.git', '')})`);
}

console.log('\n[5/6] 한글 폰트 (Pretendard, SIL OFL)');
const fdir = ensureDir(path.join(DATA, 'fonts')), font = path.join(fdir, 'PretendardVariable.woff2');
if (!fs.existsSync(font) || fs.statSync(font).size < 100000) {
  const urls = ['https://raw.githubusercontent.com/orioncactus/pretendard/main/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2', 'https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2/PretendardVariable.woff2'];
  let got = false;
  for (const u of urls) {
    if (has('curl', ['--version']) && spawnSync('curl', ['-sSL', '--fail', '-o', font, u], { stdio: 'inherit' }).status === 0 && fs.statSync(font).size > 100000) { got = true; break; }
    try { const res = await fetch(u); if (res.ok) { fs.writeFileSync(font, Buffer.from(await res.arrayBuffer())); got = true; break; } } catch {}
  }
  got ? ok('Pretendard') : warn('폰트 내려받기 실패 — 시스템 폰트로 대체');
} else ok('Pretendard (이미 있음)');

console.log('\n[6/6] 레퍼런스 카탈로그');
spawnSync(process.execPath, [path.join(HARNESS, 'tools', 'refs.mjs'), 'catalog'], { stdio: 'inherit' });
fs.writeFileSync(path.join(DATA, 'installed.json'), JSON.stringify({ at: new Date().toISOString(), config: CONFIG }, null, 2));
console.log('\n완료. 영상 작업 폴더에서 /motion-harness:mv-new 모션1 로 시작하세요.');
