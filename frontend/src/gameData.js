// gameData.js — 프론트엔드 영웅/맵 게임 데이터 단일 출처(SSOT) 접근 모듈.
//
// backend/game_data/heroes.json · maps.json(정본)을 @gamedata 별칭으로 임포트해,
// 기존 각 화면 파일이 로컬에 중복 정의하던 상수/헬퍼를 값·동작 동일하게 재구성해 노출한다.
// (백엔드 game_data/__init__.py 의 프론트 대응판. 변수명 유지 → 사용처 최소 수정.)
//
// 정본 원칙:
//   - 표시용 데이터(역할·스킬명·별칭)는 heroes.json 에서 파생한다.
//   - 이미지 "파일명" 리졸버는 STEP 2 범위 밖(백엔드 주석의 STEP 3에 해당)이라
//     동작 보존을 위해 각 화면의 기존 exactFileNames 관례를 그대로 재현하는
//     "호환 객체"로 노출한다. 값은 heroes.json 의 image 필드와 동일하며,
//     경로 산출 결과가 기존과 1건도 달라지지 않도록 키 집합까지 원본과 맞췄다.
//
// ⚠ 이미지 리졸버(getHeroImageSrc / exactFileNames / overallImgAliases /
//   ultExactFileNames)는 image 필드 기반 통합(STEP 3) 전까지 호환 목적의 잔여물이다.
//   STEP2_report.txt "이미지 리졸버 잔여 위치" 표 참조.

import heroesDoc from '@gamedata/heroes.json';
import mapsDoc from '@gamedata/maps.json';

export const HEROES = heroesDoc.heroes;
export const MAPS = mapsDoc.maps;

// ── 무손실 이름 조회 ─────────────────────────────────────────────────────────
// 정본 aliases + 파생 필드(logName/ko/en/roleForms/koreanHeroMap 키)를 모두 색인.
// 어떤 표기(표시명·로그명·별칭)든 해당 영웅 엔트리로 해석한다.
const _lookup = new Map();
for (const h of HEROES) {
  const forms = [h.logName, h.ko, h.en, ...(h.aliases || []), ...(h.roleForms || [])];
  for (const k of Object.keys(h.koreanHeroMap || {})) forms.push(k);
  for (const f of forms) if (f && !_lookup.has(f)) _lookup.set(f, h);
}
export const getHeroByName = (name) => (name ? _lookup.get(String(name).trim()) || null : null);

// ── 역할 ─────────────────────────────────────────────────────────────────────
export const getRole = (name) => {
  const h = getHeroByName(name);
  return h ? h.role : null;
};

// 역할별 표기형 목록(한글/영문 등 roleForms 전체). 기존 파일들의
// TANK_HEROES / SUPPORT_HEROES 리터럴과 집합 동일(사용처는 includes 판정만 함).
export const TANK_HEROES = HEROES.filter((h) => h.role === 'tank').flatMap((h) => h.roleForms || []);
export const SUPPORT_HEROES = HEROES.filter((h) => h.role === 'support').flatMap((h) => h.roleForms || []);

// ── 별칭(표시명 정규화) 호환 맵 ──────────────────────────────────────────────
// 기존 각 파일의 HERO_ALIAS_MAP 리터럴과 동일(8키). 로그/영문 표기를 한글 표시명으로.
// heroes.json 만으로 무손실 재현이 불가한 수기 보정(예: '솔저 : 76', 특정 영문만)이라
// 동작 보존용 호환 리터럴로 유지한다. (getHeroByName 이 무손실 조회를 별도 제공.)
export const HERO_ALIAS_MAP = {
  '솔저: 76': '솔저76', '솔저 : 76': '솔저76', 'D.Va': '디바', 'D.Mon': '디몬',
  'Widowmaker': '위도우메이커', 'Tracer': '트레이서', 'Sojourn': '소전', 'Sierra': '시에라',
};

export const getDisplayHeroName = (rawName) => {
  if (!rawName) return '';
  const clean = String(rawName).trim();
  return HERO_ALIAS_MAP[clean] || clean;
};

// ── 스킬명 맵(정본 파생) ─────────────────────────────────────────────────────
// heroes.json 의 skills 에서 파생. 키는 기존 관례 = 표시명(getDisplayHeroName(logName)).
//   · dva→'디바', dmon→'디몬', soldier76→'솔저76' 로 원본 키와 일치.
//   · 루시우 Ability 1 은 정본값 '분위기 전환' → FirstKillStats 의 오타 '분위 전환'을
//     교정(이번 단계 승인 델타 1건).
export const HERO_SKILL_MAP = {};
for (const h of HEROES) {
  if (!h.skills) continue;
  HERO_SKILL_MAP[getDisplayHeroName(h.logName)] = { ...h.skills };
}

// 정본 스킬명 조회 헬퍼(단축키 접미사 없는 원값). 미지정 시 입력 어빌리티 그대로.
export const getSkillName = (heroName, abilityRaw) => {
  const display = getDisplayHeroName(heroName);
  const m = HERO_SKILL_MAP[display] || HERO_SKILL_MAP[String(heroName ?? '').trim()];
  const key = String(abilityRaw ?? '').trim();
  return (m && m[key]) || key;
};

// ── 이미지 파일명 리졸버(호환 · STEP 3 이관 대상) ─────────────────────────────
// [정본] 아래 값(dva/디몬/soldier76/jetpackcat/sierra)은 heroes.json image 필드와 동일.
// 다수 화면이 쓰는 표준형(FirstKill/FirstDeath/MatchStats.getHeroImageSrc/Player 2종).
export const exactFileNames = {
  'D.Va': 'dva', '디바': 'dva', 'D.Mon': '디몬', '디몬': '디몬',
  '솔저: 76': 'soldier76', '솔저 76': 'soldier76', 'Soldier: 76': 'soldier76',
  '제트팩 캣': 'jetpackcat', 'Jetpack Cat': 'jetpackcat', '시에라': 'sierra',
};

export const getHeroImageSrc = (heroName) => {
  if (!heroName || heroName === 'Unknown') return null;
  const displayName = getDisplayHeroName(heroName);
  let fileName = exactFileNames[heroName] || exactFileNames[displayName];
  if (!fileName) fileName = displayName.replace(/[\s.:]/g, '');
  return `/heroes/${fileName}.png`;
};

// [잔여] OverallStats 의 getHeroImg(요약/영웅별 카드용) 전용 별칭 맵.
// 표준형과 키 집합이 미묘하게 달라(예: '솔저76' 포함) 통합 시 경로가 바뀌므로 별도 유지.
export const overallImgAliases = {
  'D.Va': 'dva', '디바': 'dva', 'D.Mon': '디몬', '디몬': '디몬',
  '솔저: 76': 'soldier76', '솔저76': 'soldier76', '솔저 76': 'soldier76',
  '제트팩 캣': 'jetpackcat', '시에라': 'sierra',
};

// [잔여] UltimateStats 전용. '솔져' 오타 키 포함 + '시에라' 미포함(기존 동작 보존).
export const ultExactFileNames = {
  'D.Va': 'dva', '디바': 'dva', 'D.Mon': '디몬', '디몬': '디몬',
  '솔저: 76': 'soldier76', '솔저 76': 'soldier76', '솔져: 76': 'soldier76', '솔져 76': 'soldier76',
  'Soldier: 76': 'soldier76', '제트팩 캣': 'jetpackcat', 'Jetpack Cat': 'jetpackcat',
};

// ── 밴픽 그리드 데이터(정본 파생) ────────────────────────────────────────────
// 값(id/name/role·type)은 heroes.json/maps.json 의 banpick 필드에서 파생한다.
// ⚠ "표시 순서"는 SSOT JSON에 없다(기존 CSV의 한글정렬+신규추가분 말미 순서 = 역사적 산물).
//   그리드 순서 불변 계약을 지키기 위해 아래 id 순서 목록으로 재현한다.
//   → SSOT 미완 지점: 향후 heroes.json/maps.json 에 banpick 표시 순서를 넣으면 이 목록 제거 가능.
const BANPICK_HERO_ORDER = [
  // Tank
  'dva', 'doomfist', 'ramattra', 'reinhardt', 'wrecking-ball', 'roadhog', 'mauga', 'sigma',
  'orisa', 'winston', 'zarya', 'junker-queen', 'hazard', 'domina', 'dmon',
  // Damage
  'genji', 'reaper', 'mei', 'bastion', 'venture', 'sojourn', 'soldier-76', 'sombra', 'symmetra',
  'ashe', 'echo', 'widowmaker', 'junkrat', 'cassidy', 'torbjorn', 'tracer', 'pharah', 'freja',
  'hanzo', 'vendetta', 'anran', 'emre', 'shion',
  // Support
  'lifeweaver', 'lucio', 'mercy', 'moira', 'baptiste', 'brigitte', 'ana', 'wuyang', 'illari',
  'zenyatta', 'juno', 'kiriko', 'mizuki', 'jetpack-cat', 'sierra',
];
const BANPICK_MAP_ORDER = [
  'antarctic', 'nepal', 'lijiang', 'busan', 'samoa', 'oasis', 'ilios',
  'route66', 'gibraltar', 'dorado', 'rialto', 'shambali', 'circuit', 'junkertown', 'havana',
  'numbani', 'midtown', 'blizzardworld', 'eichenwalde', 'kingsrow', 'paraiso', 'hollywood', 'neoncross',
  'newqueenstreet', 'esperanca', 'colosseo', 'lunasafi',
  'newjunkcity', 'suravasa', 'atliss',
];

const _heroByBanpickId = new Map(HEROES.filter((h) => h.banpick).map((h) => [h.banpick.id, h.banpick]));
const _mapByBanpickId = new Map(MAPS.filter((m) => m.banpick).map((m) => [m.banpick.id, m.banpick]));

// 기존 parseCSV 결과와 형태 동일: [{ id, name, role }] / [{ id, name, type }] (표시 순서 보존).
export const BANPICK_HEROES = BANPICK_HERO_ORDER.map((id) => {
  const b = _heroByBanpickId.get(id);
  if (!b) throw new Error(`gameData: banpick hero id 누락 - ${id}`);
  return { id: b.id, name: b.name, role: b.role };
});
export const BANPICK_MAPS = BANPICK_MAP_ORDER.map((id) => {
  const b = _mapByBanpickId.get(id);
  if (!b) throw new Error(`gameData: banpick map id 누락 - ${id}`);
  return { id: b.id, name: b.name, type: b.type };
});
