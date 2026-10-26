// 한국어 내레이션: work/narration.json → 줄별 음성(edge-tts) + 타이밍 → work/narration.timing.json
// node harness/tools/tts.mjs 모션1 [--voices]   (--voices: 한국어 음성 목록)
// narration.json 예:
// { "voice": "ko-KR-SunHiNeural", "rate": "+5%", "lead": 0.6, "gap": 0.35,
//   "lines": [ { "id": "l1", "text": "읽을 문장", "sub": "자막(생략 시 text)", "after": 0.4 },
//              { "id": "l2", "text": "...", "at": 6.0 },                     // at: 시작 시각 고정(선택)
//              { "id": "rec", "file": "../source/녹음.m4a", "text": "직접 녹음한 줄의 대본" } ] }   // file: 직접 녹음(경로는 work/ 기준)
// 음성: ko-KR-SunHiNeural(여) · ko-KR-InJoonNeural(남) · ko-KR-HyunsuNeural(남) 등. 인터넷 연결 필요. 설치: pip install edge-tts
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { projectDir, parseArgs, die, readJSON, writeJSON, ensureDir, probe } from './_common.mjs';

const { pos, opt } = parseArgs();
const CANDS = [['edge-tts', []], ['python', ['-m', 'edge_tts']], ['python3', ['-m', 'edge_tts']], ['py', ['-m', 'edge_tts']]];
const tool = CANDS.find(([c, a]) => { try { return spawnSync(c, [...a, '--help'], { stdio: 'ignore', shell: process.platform === 'win32' }).status === 0; } catch { return false; } });

if (opt.voices) {
  if (!tool) die('edge-tts 가 없습니다: pip install edge-tts');
  const r = spawnSync(tool[0], [...tool[1], '--list-voices'], { encoding: 'utf8', shell: process.platform === 'win32' });
  console.log((r.stdout || '').split('\n').filter(l => /ko-KR/.test(l)).join('\n') || r.stdout); process.exit(0);
}
const proj = projectDir(pos[0]);
const work = path.join(proj, 'work'), spec = readJSON(path.join(work, 'narration.json'));
if (!spec) die('work/narration.json 이 없습니다 (형식은 이 파일 맨 위 주석 참고).');
const vdir = ensureDir(path.join(work, 'voice'));
const lines = []; let cursor = spec.lead ?? 0.6;
for (const l of spec.lines) {
  let file;
  if (l.file) { file = path.resolve(work, l.file); if (!fs.existsSync(file)) die('녹음 파일 없음: ' + file); }
  else {
    if (!tool) die('edge-tts 가 없습니다. 설치: pip install edge-tts  (또는 직접 녹음 파일을 "file" 로 지정)');
    file = path.join(vdir, `${l.id}.mp3`);
    const args = [...tool[1], '--voice', l.voice || spec.voice || 'ko-KR-SunHiNeural', `--rate=${l.rate || spec.rate || '+0%'}`, '--text', l.text, '--write-media', file];
    const r = spawnSync(tool[0], args, { encoding: 'utf8', shell: false });
    if (r.status !== 0 || !fs.existsSync(file)) die(`TTS 실패 (${l.id}): ${(r.stderr || '').slice(-300)}`);
  }
  const dur = probe(file).duration;
  const t0 = l.at ?? cursor, t1 = t0 + dur;
  lines.push({ id: l.id, text: l.text, sub: l.sub, file: path.relative(work, file).split(path.sep).join('/'), t0: +t0.toFixed(3), t1: +t1.toFixed(3), dur: +dur.toFixed(3) });
  cursor = t1 + (spec.gap ?? 0.35) + (l.after ?? 0);
  console.log(`  ${l.id}  ${t0.toFixed(2)}–${t1.toFixed(2)}s  ${l.text.slice(0, 40)}`);
}
const total = +(cursor + (spec.tail ?? 0.8)).toFixed(2);
writeJSON(path.join(work, 'narration.timing.json'), { voice: spec.voice, gain: spec.gain ?? 0, total, lines });
console.log(`✔ work/narration.timing.json · ${lines.length}줄 · 권장 영상 길이 ≥ ${total}s`);
