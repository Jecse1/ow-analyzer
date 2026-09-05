// gameData.js — 프론트엔드 영웅/맵 게임 데이터 단일 출처(SSOT) 접근 모듈.
//
// backend/game_data/heroes.json · maps.json(정본)을 @gamedata 별칭으로 임포트해,
// 기존 각 화면 파일이 로컬에 중복 정의하던 상수/헬퍼를 값·동작 동일하게 재구성해 노출한다.
// (백엔드 game_data/__init__.py 의 프론트 대응판. 변수명 유지 → 사용처 최소 수정.)
//
// 정본 원칙:
//   - 표시용 데이터(역할·스킬명·별칭)는 heroes.json 에서 파생한다.
//   - 이미지 리졸버는 STEP 3에서 단일화: getHeroImageSrc(name) = /heroes/{image}.png
//     (getHeroByName → image 필드). STEP 2의 파일별 exactFileNames/ultExactFileNames/
//     overallImgAliases 호환 객체는 제거됐다. 밴픽 썸네일은 getHeroImageCandidates 사용.

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

// ── 이미지 리졸버(STEP 3: SSOT image 필드 기반 단일 리졸버) ───────────────────
// 입력명(logName/ko/en/aliases/roleForms 등) → getHeroByName → image 필드 → /heroes/{image}.png.
// STEP 2의 파일별 exactFileNames/ultExactFileNames/overallImgAliases 호환 객체를 대체·제거함.
// 미지 영웅(heroes.json 밖)은 기존 폴백(별칭 정규화 후 구두점 strip)과 동일하게 처리한다.
export const getHeroImageSrc = (heroName) => {
  if (!heroName || heroName === 'Unknown') return null;
  const h = getHeroByName(heroName);
  if (h) return `/heroes/${h.image}.png`;
  const displayName = getDisplayHeroName(heroName);
  return `/heroes/${displayName.replace(/[\s.:]/g, '')}.png`;
};

// 밴픽 썸네일용 후보 리스트(image 1순위 + 확장자/이름/id 폴백). 첫 존재 후보를 표시한다.
// idx>0(=폴백)이면 image 필드 오류 신호 → 개발 모드 경고(소비처에서 처리).
const IMAGE_EXTS = ['.png', '.webp', '.jpg', '.jpeg'];
export const getHeroImageCandidates = (name, id) => {
  const h = getHeroByName(name);
  const bases = [];
  if (h && h.image) bases.push(h.image); // 1순위: 정본 image
  if (name) bases.push(name);            // 폴백: 표시명
  if (id) bases.push(id);                // 폴백: id
  const list = [];
  for (const b of bases) for (const ext of IMAGE_EXTS) list.push(`/heroes/${encodeURIComponent(b)}${ext}`);
  return [...new Set(list)];
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
