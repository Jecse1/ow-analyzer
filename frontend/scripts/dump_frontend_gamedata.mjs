// dump_frontend_gamedata.mjs — STEP 2 이관 검증용 프론트 게임데이터 덤프/디프.
//
// 산출물(frontend/dumps/):
//   before.json      : 8개 화면 파일의 로컬 상수(정규식+괄호 밸런싱 추출), 키 정렬.
//   before_fn.json   : 각 파일의 "현재" 리졸버 로직에 정본 전 영웅명(logName/ko/aliases)을
//                      넣은 산출값(이미지 경로·역할·스킬명 Ability 1/2/Ultimate).
//   after_fn.json    : 동일 로직을 gameData.js 의 실제 export 로 구동한 산출값(이관 후 동작).
//   diff_fn.json     : before_fn vs after_fn 차이(허용 델타 = FirstKillStats 루시우 1건).
//   image_residuals.json : 이미지 리졸버별로 heroes.json image 필드와 다른 결과를 내는 영웅.
//
// gameData.js 는 @gamedata 별칭+JSON 임포트를 쓰므로, 여기서는 그 두 임포트를 file:// URL로
// 치환한 임시 사본을 만들어 실제 export 를 그대로 불러온다(로직 중복 없음).

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONT = path.resolve(__dirname, '..');
const ROOT = path.resolve(FRONT, '..');
const GD = path.join(ROOT, 'backend', 'game_data');
const SRC = path.join(FRONT, 'src');
const OUT = path.join(FRONT, 'dumps');
fs.mkdirSync(OUT, { recursive: true });

const read = (p) => fs.readFileSync(p, 'utf8');

// ───────────────────────── gameData.js 실제 export 로드 ─────────────────────────
const gdSrc = read(path.join(SRC, 'gameData.js'));
const heroesURL = pathToFileURL(path.join(GD, 'heroes.json')).href;
const mapsURL = pathToFileURL(path.join(GD, 'maps.json')).href;
const gdRuntime = gdSrc
  .replace(/import heroesDoc from ['"]@gamedata\/heroes\.json['"];/, `import heroesDoc from '${heroesURL}' with { type: 'json' };`)
  .replace(/import mapsDoc from ['"]@gamedata\/maps\.json['"];/, `import mapsDoc from '${mapsURL}' with { type: 'json' };`);
const tmp = path.join(OUT, '.gameData.runtime.mjs');
fs.writeFileSync(tmp, gdRuntime);
const GAME = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

const HEROES = JSON.parse(read(path.join(GD, 'heroes.json'))).heroes;

// ───────────────────────── 정본 전 영웅명(테스트 집합) ─────────────────────────
const testNames = [];
{
  const seen = new Set();
  for (const h of HEROES) {
    for (const n of [h.logName, h.ko, ...(h.aliases || [])]) {
      if (n && !seen.has(n)) { seen.add(n); testNames.push(n); }
    }
  }
}
const ABILITIES = ['Ability 1', 'Ability 2', 'Ultimate'];
const IMAGE_BY_NAME = new Map(); // 테스트명 → heroes.json image
for (const h of HEROES) for (const n of [h.logName, h.ko, ...(h.aliases || [])]) if (!IMAGE_BY_NAME.has(n)) IMAGE_BY_NAME.set(n, h.image);

// ───────────────────────── JS 리터럴 밸런스 추출기 ─────────────────────────
// declRegex 이후 첫 open 문자부터 매칭 close 까지(문자열/주석 무시) 잘라 eval.
function extractLiteral(src, declRegex, open, close) {
  const m = declRegex.exec(src);
  if (!m) throw new Error(`decl not found: ${declRegex}`);
  let i = src.indexOf(open, m.index + m[0].length - 1);
  if (i < 0) i = src.indexOf(open, m.index);
  let depth = 0, j = i, inStr = null, inLine = false, inBlock = false;
  for (; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; j++; } continue; }
    if (inStr) {
      if (c === '\\') { j++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; j++; continue; }
    if (c === '/' && n === '*') { inBlock = true; j++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (depth === 0) { j++; break; } }
  }
  const slice = src.slice(i, j);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${slice});`)();
}
const obj = (src, name) => extractLiteral(src, new RegExp(`const\\s+${name}\\s*=\\s*\\{`), '{', '}');
const arr = (src, name) => extractLiteral(src, new RegExp(`const\\s+${name}\\s*=\\s*\\[`), '[', ']');

// ───────────────────────── 소스 로드 & 상수 추출(before) ─────────────────────────
const S = {
  App: read(path.join(SRC, 'App.jsx')),
  FirstKill: read(path.join(SRC, 'FirstKillStats.jsx')),
  FirstDeath: read(path.join(SRC, 'FirstDeathStats.jsx')),
  Match: read(path.join(SRC, 'MatchStats.jsx')),
  Overall: read(path.join(SRC, 'OverallStats.jsx')),
  PlayerProfile: read(path.join(SRC, 'PlayerProfileView.jsx')),
  PlayerCompare: read(path.join(SRC, 'PlayerCompareView.jsx')),
  Ultimate: read(path.join(SRC, 'UltimateStats.jsx')),
};

// exactFileNames / aliases / tanks / supports 는 함수 내부라 파일에 1회만 등장 → 이름으로 추출.
const before = {
  App: { TANK_HEROES: arr(S.App, 'TANK_HEROES'), SUPPORT_HEROES: arr(S.App, 'SUPPORT_HEROES') },
  FirstKill: {
    HERO_ALIAS_MAP: obj(S.FirstKill, 'HERO_ALIAS_MAP'),
    exactFileNames: obj(S.FirstKill, 'exactFileNames'),
    tanks: arr(S.FirstKill, 'tanks'), supports: arr(S.FirstKill, 'supports'),
    HERO_SKILL_MAP: obj(S.FirstKill, 'HERO_SKILL_MAP'),
  },
  FirstDeath: {
    HERO_ALIAS_MAP: obj(S.FirstDeath, 'HERO_ALIAS_MAP'),
    exactFileNames: obj(S.FirstDeath, 'exactFileNames'),
    tanks: arr(S.FirstDeath, 'tanks'), supports: arr(S.FirstDeath, 'supports'),
    HERO_SKILL_MAP: obj(S.FirstDeath, 'HERO_SKILL_MAP'),
  },
  Match: {
    HERO_ALIAS_MAP: obj(S.Match, 'HERO_ALIAS_MAP'),
    HERO_SKILL_MAP: obj(S.Match, 'HERO_SKILL_MAP'),
    exactFileNames: obj(S.Match, 'exactFileNames'),
    tanks: arr(S.Match, 'tanks'), supports: arr(S.Match, 'supports'),
  },
  Overall: { getHeroImg_aliases: obj(S.Overall, 'aliases') },
  PlayerProfile: { HERO_ALIAS_MAP: obj(S.PlayerProfile, 'HERO_ALIAS_MAP'), exactFileNames: obj(S.PlayerProfile, 'exactFileNames') },
  PlayerCompare: { HERO_ALIAS_MAP: obj(S.PlayerCompare, 'HERO_ALIAS_MAP'), exactFileNames: obj(S.PlayerCompare, 'exactFileNames') },
  Ultimate: { exactFileNames: obj(S.Ultimate, 'exactFileNames') },
};

// ───────────────────────── 리졸버 로직(원본 그대로) ─────────────────────────
const disp = (aliasMap, name) => aliasMap[String(name).trim()] || String(name).trim();

const imgA = (name, exact, aliasMap) => { // getHeroImageSrc (FirstKill/FirstDeath/Match)
  if (!name || name === 'Unknown') return null;
  const d = disp(aliasMap, name);
  let f = exact[name] || exact[d];
  if (!f) f = d.replace(/[\s.:]/g, '');
  return `/heroes/${f}.png`;
};
const imgB = (name, exact) => { // UltimateStats
  if (!name || name === 'Unknown') return null;
  let f = exact[name];
  if (!f) f = String(name).replace(/[\s.:]/g, '');
  return `/heroes/${f}.png`;
};
const imgC = (name, exact, aliasMap) => { // PlayerProfile/PlayerCompare
  if (!name || name === 'Unknown') return null;
  const d = disp(aliasMap, name);
  const f = exact[name] || exact[d] || d.replace(/[\s.:]/g, '');
  return `/heroes/${f}.png`;
};
const imgD = (name, aliases) => { // getHeroImg (Match/Overall)
  if (!name || name === 'Unknown') return null;
  const nm = String(name || '').trim();
  const f = aliases[nm] || nm.replace(/[\s.:]/g, '');
  return `/heroes/${f}.png`;
};
const roleKor = (name, tanks, supports, aliasMap) => {
  const n = disp(aliasMap, name);
  if (tanks.includes(n)) return 'label=탱커,order=1';
  if (supports.includes(n)) return 'label=힐러,order=3';
  return 'label=딜러,order=2';
};
const roleEng = (name, tanks, supports, aliasMap) => {
  const n = disp(aliasMap, name);
  if (tanks.includes(n) || tanks.includes(name)) return 'label=tank,order=1';
  if (supports.includes(n) || supports.includes(name)) return 'label=support,order=3';
  return 'label=dps,order=2';
};
const heroRoleApp = (name, tanks, supports) => (tanks.includes(name) ? '탱크' : supports.includes(name) ? '지원' : '딜러');
const abilityName = (heroName, abilityRaw, skillMap, aliasMap) => {
  if (!abilityRaw) return '기본 발사';
  const c = String(abilityRaw).trim();
  if (c === '0' || c === 'null') return '기본 발사';
  if (c.toLowerCase().includes('primary')) return '기본 발사';
  if (c.toLowerCase().includes('secondary')) return '보조 발사';
  if (c.toLowerCase().includes('melee')) return '근접 공격';
  const d = disp(aliasMap, heroName);
  let s = c;
  if (skillMap[d] && skillMap[d][c]) s = skillMap[d][c];
  else if (skillMap[heroName] && skillMap[heroName][c]) s = skillMap[heroName][c];
  if (c === 'Ability 1') return s === 'Ability 1' ? '기술 1 (Shift)' : `${s} (Shift)`;
  if (c === 'Ability 2') return s === 'Ability 2' ? '기술 2 (E)' : `${s} (E)`;
  if (c === 'Ultimate') return s === 'Ultimate' ? '궁극기 (Q)' : `${s} (Q)`;
  return s;
};

// ───────────────────────── before_fn / after_fn 구성 ─────────────────────────
const imgMap = (fn) => Object.fromEntries(testNames.map((n) => [n, fn(n)]));
const roleMap = (fn) => Object.fromEntries(testNames.map((n) => [n, fn(n)]));
const skillMap = (fn) => Object.fromEntries(testNames.map((n) => [n, Object.fromEntries(ABILITIES.map((a) => [a, fn(n, a)]))]));

const G = GAME;
function buildFn(mode) {
  const b = mode === 'before';
  // 선택기: before=추출 상수, after=gameData export
  const alias = (file) => (b ? before[file].HERO_ALIAS_MAP : G.HERO_ALIAS_MAP);
  const exact = (file) => (b ? before[file].exactFileNames : G.exactFileNames);
  const skills = (file) => (b ? before[file].HERO_SKILL_MAP : G.HERO_SKILL_MAP);
  const tanksOf = (file) => (b ? before[file].tanks : G.TANK_HEROES);
  const supsOf = (file) => (b ? before[file].supports : G.SUPPORT_HEROES);
  const appTanks = b ? before.App.TANK_HEROES : G.TANK_HEROES;
  const appSups = b ? before.App.SUPPORT_HEROES : G.SUPPORT_HEROES;
  const dImg = (file) => (b ? before[file].getHeroImg_aliases : G.overallImgAliases);
  const ultExact = b ? before.Ultimate.exactFileNames : G.ultExactFileNames;

  return {
    'App.jsx': { heroRole: roleMap((n) => heroRoleApp(n, appTanks, appSups)) },
    'FirstKillStats.jsx': {
      getHeroImageSrc: imgMap((n) => imgA(n, exact('FirstKill'), alias('FirstKill'))),
      getRoleInfo: roleMap((n) => roleKor(n, tanksOf('FirstKill'), supsOf('FirstKill'), alias('FirstKill'))),
      getAbilityName: skillMap((n, a) => abilityName(n, a, skills('FirstKill'), alias('FirstKill'))),
    },
    'FirstDeathStats.jsx': {
      getHeroImageSrc: imgMap((n) => imgA(n, exact('FirstDeath'), alias('FirstDeath'))),
      getRoleInfo: roleMap((n) => roleKor(n, tanksOf('FirstDeath'), supsOf('FirstDeath'), alias('FirstDeath'))),
      getAbilityName: skillMap((n, a) => abilityName(n, a, skills('FirstDeath'), alias('FirstDeath'))),
    },
    'MatchStats.jsx': {
      getHeroImageSrc: imgMap((n) => imgA(n, exact('Match'), alias('Match'))),
      getRoleInfo: roleMap((n) => roleEng(n, tanksOf('Match'), supsOf('Match'), alias('Match'))),
      getAbilityName: skillMap((n, a) => abilityName(n, a, skills('Match'), alias('Match'))),
    },
    'OverallStats.jsx': { getHeroImg: imgMap((n) => imgD(n, dImg('Overall'))) },
    'PlayerProfileView.jsx': { getHeroImageSrc: imgMap((n) => imgC(n, exact('PlayerProfile'), alias('PlayerProfile'))) },
    'PlayerCompareView.jsx': { getHeroImageSrc: imgMap((n) => imgC(n, exact('PlayerCompare'), alias('PlayerCompare'))) },
    'UltimateStats.jsx': { getHeroImageSrc: imgMap((n) => imgB(n, ultExact)) },
  };
}

const beforeFn = buildFn('before');
const afterFn = buildFn('after');

// ───────────────────────── diff ─────────────────────────
const diffs = [];
function walk(a, b, pathArr) {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) walk(a[k], b[k], [...pathArr, k]);
  } else if (a !== b) {
    diffs.push({ path: pathArr.join(' / '), before: a, after: b });
  }
}
walk(beforeFn, afterFn, []);

// ───────────────────────── 이미지 리졸버 잔여(vs heroes.json image) ─────────────
const imageResolvers = [
  { loc: 'FirstKillStats.jsx:getHeroImageSrc', fn: (n) => imgA(n, G.exactFileNames, G.HERO_ALIAS_MAP) },
  { loc: 'FirstDeathStats.jsx:getHeroImageSrc', fn: (n) => imgA(n, G.exactFileNames, G.HERO_ALIAS_MAP) },
  { loc: 'MatchStats.jsx:getHeroImageSrc', fn: (n) => imgA(n, G.exactFileNames, G.HERO_ALIAS_MAP) },
  { loc: 'OverallStats.jsx:getHeroImg', fn: (n) => imgD(n, G.overallImgAliases) },
  { loc: 'PlayerProfileView.jsx:getHeroImageSrc', fn: (n) => imgC(n, G.exactFileNames, G.HERO_ALIAS_MAP) },
  { loc: 'PlayerCompareView.jsx:getHeroImageSrc', fn: (n) => imgC(n, G.exactFileNames, G.HERO_ALIAS_MAP) },
  { loc: 'UltimateStats.jsx:getHeroImageSrc', fn: (n) => imgB(n, G.ultExactFileNames) },
];
const imageResiduals = {};
for (const r of imageResolvers) {
  const rows = [];
  for (const n of testNames) {
    const out = r.fn(n);
    const want = `/heroes/${IMAGE_BY_NAME.get(n)}.png`;
    if (out !== want) rows.push({ name: n, resolved: out, image_field: want });
  }
  imageResiduals[r.loc] = rows;
}

// ───────────────────────── 쓰기 ─────────────────────────
const sortKeys = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
};
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + '\n');

write('before.json', sortKeys(before));
write('before_fn.json', beforeFn);
write('after_fn.json', afterFn);
write('diff_fn.json', diffs);
write('image_residuals.json', imageResiduals);

console.log(`test names: ${testNames.length}`);
console.log(`diff_fn entries: ${diffs.length}`);
for (const d of diffs) console.log(`  DIFF ${d.path}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
console.log('image residual counts:');
for (const [loc, rows] of Object.entries(imageResiduals)) console.log(`  ${loc}: ${rows.length}`);
