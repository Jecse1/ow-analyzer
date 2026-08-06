import React, { useEffect, useMemo, useRef, useState } from "react";
import "./banpick.css";

// ── 멀티플레이어(1v1 실시간 대전) 스텁 — 이번 통합 단계는 SOLO 전용 ──
// 원본은 Firebase(Firestore 실시간 룸 + 익명 auth)로 코치 대전을 구현하지만,
// 분석기에 추가 의존성(firebase)을 들이지 않기 위해 transport를 no-op으로 대체한다.
// 대전 모드 진입 UI도 숨김(아래 Setup). 다음 단계에서 살릴 때 이 스텁만 교체하면 됨.
const ensureAnonAuth = async (): Promise<void> => {};
function useRoomSync(_roomId: string, _enabled: boolean) {
  return { remote: null as any, patch: async (_p?: any) => {}, pushFull: async (_s?: any) => {} };
}

/* ================= Constants & Types ================= */
const TIMER = { NORMAL: 30, PICK: 60 } as const; // 맵/밴:30초, 픽:60초
const MODE = { HERO_BAN_ONLY: 1, HERO_BAN_WITH_MAP: 2, FULL: 3 } as const;

type Team = "A" | "B";
type MapType = "Control" | "Escort" | "Hybrid" | "Push" | "Flashpoint";
type Role = "Tank" | "Damage" | "Support";
type Phase = "MAP_PICK" | "BAN_ORDER" | "HERO_BAN" | "HERO_PICK";
type Lang = "ko" | "en";
type Side = "ATTACK" | "DEFENSE"; // 선공/선수비 타입
type PartMode = "SOLO" | "COACH_1V1";
type MyRole = "HOST" | Team | "OBS";
type Hero = { id: string; name: string; role: Role };
type MapInfo = { id: string; name: string; type: MapType };
type SetSnapshot = {
  bans: Record<Team, string[]>;
  picks: Record<Team, string[]>;
  map: string | null;
  winner: Team | null;
  mapPicker: Team | null;
  banFirst: Team;
  banSecond: Team;
  scoreA?: number;
  scoreB?: number;
  resultA?: "W" | "L" | "D"; // "D" (무승부) 추가
  attackOrDefense?: Side | null; // 선공/선수비 필드 추가
};

/** 1v1 READY 동기화 (rooms/{roomId} 문서의 readyA/readyB 필드만 관리) */
// SOLO 전용 스텁: READY 동기화 없음(대전 모드 미사용).
function useReadySyncFS(_roomId: string, _enabled: boolean) {
  const [readyA] = React.useState(false);
  const [readyB] = React.useState(false);
  const setReadyA = (_next: React.SetStateAction<boolean>) => {};
  const setReadyB = (_next: React.SetStateAction<boolean>) => {};
  return { readyA, readyB, setReadyA, setReadyB };
}

/* ===== helper (1v1 권한 매핑) ===== */
function roleAsTeam(partMode: PartMode, myRole: MyRole): Team | null {
  return partMode === "COACH_1V1" && myRole === "HOST" ? "A" : myRole === "A" || myRole === "B" ? myRole : null;
}
function canControlMapOrOrder(partMode: PartMode, myRole: MyRole, ownerTeam: Team): boolean {
  if (partMode === "SOLO") return true;
  const t = roleAsTeam(partMode, myRole);
  return t === ownerTeam;
}
function canControlBanTurn(partMode: PartMode, myRole: MyRole, turnTeam: Team): boolean {
  if (partMode === "SOLO") return true;
  const t = roleAsTeam(partMode, myRole);
  return t === turnTeam;
}

/* ===== i18n ===== */
const ROLE_LABELS: Record<Lang, Record<Role, string>> = {
  ko: { Tank: "탱커", Damage: "딜러", Support: "힐러" },
  en: { Tank: "Tank", Damage: "Damage", Support: "Support" },
};
const MAP_LABELS: Record<Lang, Record<MapType, string>> = {
  ko: { Control: "쟁탈", Escort: "호위", Hybrid: "혼합", Push: "밀기", Flashpoint: "플래시포인트" },
  en: { Control: "Control", Escort: "Escort", Hybrid: "Hybrid", Push: "Push", Flashpoint: "Flashpoint" },
};
const SLOT_ROLES: Role[] = ["Tank", "Damage", "Damage", "Support", "Support"];

const STR = {
  ko: {
    title: "OW2 BAN Simulator",
    startSettings: "시작 설정",
    teamAName: "팀 A 이름",
    teamBName: "팀 B 이름",
    participation: "모드",
    solo: "solo",
    oneVone: "1vs1",
    scrim: "스크림 모드",
    format: "진행 방식",
    modeRange: "시뮬레이션 범위",
    mode1: "모드1: 영웅 밴",
    mode2: "모드2: 맵 + 영웅 밴",
    mode3: "모드3: 맵 + 영웅 밴 + 영웅 픽",
    firstPicker: "1세트 맵/밴 선택권",
    random: "랜덤",
    start: "시작하기",
    mapPick: "맵 선택",
    banOrder: "선/후밴 결정",
    heroBan: "영웅 밴",
    heroPick: "영웅 픽 (탱-딜-딜-힐-힐)",
    mapRight: "맵 선택권",
    pickFirst: "선밴",
    pickSecond: "후밴",
    timeLeft: "남은 시간",
    play: "시작",
    pause: "일시정지",
    confirmMap: "맵 확정",
    chooserRight: "선/후밴 선택권",
    confirm: "확정",
    curTurn: "현재 턴",
    banned: "밴됨",
    confirmBan: "밴 확정",
    slot: "슬롯",
    ready: "Ready",
    lockPickTeam: (name: string) => `${name} 픽 확정`,
    pickLockShort: "픽 확정",
    setWinner: "세트 승리 팀 선택",
    close: "닫기",
    showSummary: "경기 요약",
    showLog: "로그 보기",
    toastMap: "맵 확정",
    toastBan: "밴 확정",
    summary: "요약",
    noneYet: "아직 완료된 세트가 없습니다.",
    setN: (i: number) => `세트 ${i}`,
    map: "맵",
    mapPickerLabel: "맵 선택",
    firstBan: "선밴",
    secondBan: "후밴",
    none: "없음",
    inProgress: "진행 중",
    phase: "단계",
    selectedMap: "선택된 맵",
    nextFirstBan: "선밴 예정",
    log: "로그",
    noLog: "로그가 없습니다.",
    light: "☀️ 라이트 모드",
    dark: "🌙 다크 모드",
    koBtn: "한국어",
    enBtn: "English",
    teamNameRequired: "팀 이름을 입력해 주세요.",
    scoreDone: " · 경기 종료",
    openSummary: "요약",
    openLogs: "로그",
    seriesEnd: "경기가 종료되었습니다",
    endBtn: "종료",
  },
  en: {
    title: "OW2 BAN Simulator",
    startSettings: "Setup",
    teamAName: "Team A Name",
    teamBName: "Team B Name",
    participation: "Mode",
    solo: "solo",
    oneVone: "1vs1",
    scrim: "Scrim Mode",
    format: "Series Format",
    modeRange: "Simulation Scope",
    mode1: "Mode1: Hero Ban",
    mode2: "Mode2: Map + Hero Ban",
    mode3: "Mode3: Map + Hero Ban + Hero Pick",
    firstPicker: "Initial map/ban right",
    random: "Random",
    start: "Start",
    mapPick: "Map Pick",
    banOrder: "Decide First/Second Ban",
    heroBan: "Hero Ban",
    heroPick: "Hero Pick (Tank-Damage-Damage-Support-Support)",
    mapRight: "Map Right",
    pickFirst: "First Ban",
    pickSecond: "Second Ban",
    timeLeft: "Time Left",
    play: "Play",
    pause: "Pause",
    confirmMap: "Lock Map",
    chooserRight: "Ban Order Right",
    confirm: "Confirm",
    curTurn: "Turn",
    banned: "Banned",
    confirmBan: "Lock Ban",
    slot: "Slot",
    ready: "Ready",
    lockPickTeam: (name: string) => `${name} Picks Locked`,
    pickLockShort: "Lock Picks",
    setWinner: "Select Set Winner",
    close: "Close",
    showSummary: "Match Summary",
    showLog: "View Logs",
    toastMap: "Map Locked",
    toastBan: "Ban Locked",
    summary: "Summary",
    noneYet: "No finished sets yet.",
    setN: (i: number) => `Set ${i}`,
    map: "Map",
    mapPickerLabel: "Map Picker",
    firstBan: "First Ban",
    secondBan: "Second Ban",
    none: "None",
    inProgress: "In Progress",
    phase: "Phase",
    selectedMap: "Selected Map",
    nextFirstBan: "Next First Ban",
    log: "Logs",
    noLog: "No logs yet.",
    light: "☀️ Light Mode",
    dark: "🌙 Dark Mode",
    koBtn: "한국어",
    enBtn: "English",
    teamNameRequired: "Please enter team names.",
    scoreDone: " · Finished",
    openSummary: "Summary",
    openLogs: "Logs",
    seriesEnd: "Series Finished",
    endBtn: "End",
  },
} as const;

type I18n = (typeof STR)[keyof typeof STR];

/* ============== Data (CSV) ============== */
const HERO_CSV = `
#id,name,role
// Tank
 dva,디바,Tank
 doomfist,둠피스트,Tank
 ramattra,라마트라,Tank
 reinhardt,라인하르트,Tank
 wrecking-ball,레킹볼,Tank
 roadhog,로드호그,Tank
 mauga,마우가,Tank
 sigma,시그마,Tank
 orisa,오리사,Tank
 winston,윈스턴,Tank
 zarya,자리야,Tank
 junker-queen,정커퀸,Tank
 hazard,해저드,Tank
 domina,도미나,Tank
// Damage
 genji,겐지,Damage
 reaper,리퍼,Damage
 mei,메이,Damage
 bastion,바스티온,Damage
 venture,벤처,Damage
 sojourn,소전,Damage
 soldier-76,솔저 76,Damage
 sombra,솜브라,Damage
 symmetra,시메트라,Damage
 ashe,애쉬,Damage
 echo,에코,Damage
 widowmaker,위도우메이커,Damage
 junkrat,정크랫,Damage
 cassidy,캐서디,Damage
 torbjorn,토르비욘,Damage
 tracer,트레이서,Damage
 pharah,파라,Damage
 freja,프레야,Damage
 hanzo,한조,Damage
 vendetta,벤데타,Damage
 anran,안란,Damage
 emre,엠레,Damage
 shion,시온,Damage
// Support
 lifeweaver,라이프위버,Support
 lucio,루시우,Support
 mercy,메르시,Support
 moira,모이라,Support
 baptiste,바티스트,Support
 brigitte,브리기테,Support
 ana,아나,Support
 wuyang,우양,Support
 illari,일리아리,Support
 zenyatta,젠야타,Support
 juno,주노,Support
 kiriko,키리코,Support
 mizuki,미즈키,Support
 jetpack-cat,제트팩 캣,Support
 sierra,시에라,Support
`;

const MAP_CSV = `
#id,name,type
 antarctic,남극반도,Control
 nepal,네팔,Control
 lijiang,리장 타워,Control
 busan,부산,Control
 samoa,사모아,Control
 oasis,오아시스,Control
 ilios,일리오스,Control
 route66,66번 국도,Escort
 gibraltar,감시기지 지브롤터,Escort
 dorado,도라도,Escort
 rialto,리알토,Escort
 shambali,샴발리 수도원,Escort
 circuit,서킷 로얄,Escort
 junkertown,쓰레기촌,Escort
 havana,하바나,Escort
 numbani,눔바니,Hybrid
 midtown,미드타운,Hybrid
 blizzardworld,블리자드 월드,Hybrid
 eichenwalde,아이헨발데,Hybrid
 kingsrow,왕의 길,Hybrid
 paraiso,파라이수,Hybrid
 hollywood,할리우드,Hybrid
 neoncross,네온 교차로,Hybrid
 newqueenstreet,뉴 퀸 스트리트,Push
 esperanca,이스페란사,Push
 colosseo,콜로세오,Push
 lunasafi,루나사피,Push
 newjunkcity,뉴 정크 시티,Flashpoint
 suravasa,수라바사,Flashpoint
 atliss,아틀리스,Flashpoint
`;

function parseCSV<T extends { [k: string]: any }>(csv: string, keys: string[]): T[] {
  return csv
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("//"))
    .map((l) => {
      const arr = l.split(",").map((s) => s.trim());
      const obj: any = {};
      keys.forEach((k, i) => (obj[k] = arr[i]));
      return obj as T;
    });
}
const HEROES: Hero[] = parseCSV<Hero>(HERO_CSV, ["id", "name", "role"]).map((h) => ({ ...h, role: h.role as Role }));
const MAPS: MapInfo[] = parseCSV<MapInfo>(MAP_CSV, ["id", "name", "type"]).map((m) => ({ ...m, type: m.type as MapType }));

/* === image helpers === */
const IMG_EXTS = [".png", ".webp", ".jpg", ".jpeg"];
function heroSrcCandidates(id: string): string[] {
  const h = HEROES.find((x) => x.id === id);
  const bases: string[] = [];
  if (h?.name) bases.push(h.name);
  bases.push(id);
  const list: string[] = [];
  for (const b of bases) for (const ext of IMG_EXTS) list.push(`/heroes/${encodeURIComponent(b)}${ext}`);
  return list;
}
function mapSrcCandidates(id: string): string[] {
  const m = MAPS.find((x) => x.id === id);
  const bases: string[] = [];
  if (m?.name) bases.push(m.name);
  bases.push(id);
  const list: string[] = [];
  for (const b of bases) for (const ext of IMG_EXTS) list.push(`/maps/${encodeURIComponent(b)}${ext}`);
  return list;
}

/** 맵 썸네일 */
function MapThumb({ id, className, contain = false }: { id: string | null; className?: string; contain?: boolean }) {
  const [idx, setIdx] = React.useState(0);
  const candidates = React.useMemo(() => (id ? mapSrcCandidates(id) : []), [id]);
  if (!id || idx >= candidates.length) {
    return <div className={`absolute inset-0 bg-gradient-to-br from-neutral-100 to-neutral-200 ${className ?? ""}`} />;
  }
  return (
    <img
      src={candidates[idx]}
      alt={id ?? ""}
      onError={() => setIdx((i) => i + 1)}
      draggable={false}
      className={`absolute inset-0 w-full h-full ${contain ? "object-contain" : "object-cover"} ${className ?? ""}`}
    />
  );
}

/** 영웅 썸네일 */
function HeroThumb({ id, className, contain = true }: { id: string | null; className?: string; contain?: boolean }) {
  const [idx, setIdx] = React.useState(0);
  const candidates = React.useMemo(() => (id ? heroSrcCandidates(id) : []), [id]);
  if (!id || idx >= candidates.length) {
    return <div className={`absolute inset-0 bg-gradient-to-br from-neutral-100 to-neutral-200 ${className ?? ""}`} />;
  }
  return (
    <img
      src={candidates[idx]}
      alt={id ?? ""}
      onError={() => setIdx((i) => i + 1)}
      draggable={false}
      className={["absolute inset-0 w-full h-full", contain ? "object-contain" : "object-cover", "object-center", className ?? ""].join(" ")}
    />
  );
}

function useBoxSize<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0, padX: 0, padY: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      setSize({
        width: r.width,
        height: r.height,
        padX: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight),
        padY: parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return [ref, size] as const;
}

/** 밴 오버레이 */
function BanSlashOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute left-[-30%] right-[-30%] top-1/2 h-[5px] bg-red-600/90 -rotate-45" />
      <div className="absolute left-[-30%] right-[-30%] top-[calc(50%+11px)] h-[5px] bg-red-600/90 -rotate-45" />
    </div>
  );
}

/** 맵 타입 아이콘/텍스트 */
const MAPICON_EXTS = [".svg", ".png", ".webp", ".jpg", ".jpeg"];
function mapTypeIconCandidates(mt: MapType): string[] {
  const bases = [mt.toLowerCase(), MAP_LABELS.ko[mt], MAP_LABELS.en[mt]];
  const list: string[] = [];
  for (const b of bases) for (const ext of MAPICON_EXTS) list.push(`/mapicons/${encodeURIComponent(b)}${ext}`);
  return list;
}
function MapTypeBadge({ type, lang, className }: { type: MapType; lang: Lang; className?: string }) {
  const [idx, setIdx] = React.useState(0);
  const cands = React.useMemo(() => mapTypeIconCandidates(type), [type]);
  if (idx >= cands.length) {
    return <span className={`text-[10px] opacity-80 ${className ?? ""}`}>{MAP_LABELS[lang][type]}</span>;
  }
  return (
    <img
      src={cands[idx]}
      alt={MAP_LABELS[lang][type]}
      title={MAP_LABELS[lang][type]}
      onError={() => setIdx((i) => i + 1)}
      className={`w-4 h-4 object-contain ${className ?? ""}`}
      draggable={false}
    />
  );
}

/** 역할 아이콘/텍스트 */
const ROLE_ICON_EXTS = [".svg", ".png", ".webp", ".jpg", ".jpeg"];
function roleIconCandidates(role: Role, lang: Lang): string[] {
  const bases = [role.toLowerCase(), ROLE_LABELS.ko[role], ROLE_LABELS.en[role]];
  const list: string[] = [];
  for (const b of bases) for (const ext of ROLE_ICON_EXTS) list.push(`/roles/${encodeURIComponent(b)}${ext}`);
  return list;
}
function RoleBadge({ role, lang, className }: { role: Role; lang: Lang; className?: string }) {
  const [idx, setIdx] = React.useState(0);
  const cands = React.useMemo(() => roleIconCandidates(role, lang), [role, lang]);
  if (idx >= cands.length) {
    return <span className={`text-[10px] opacity-80 ${className ?? ""}`}>{ROLE_LABELS[lang][role]}</span>;
  }
  return (
    <img
      src={cands[idx]}
      alt={ROLE_LABELS[lang][role]}
      title={ROLE_LABELS[lang][role]}
      onError={() => setIdx((i) => i + 1)}
      className={`w-5 h-5 object-contain ${className ?? ""}`}
      draggable={false}
    />
  );
}

/* ================= Summary / Log Modal ================= */
function SummaryLogModal(props: {
  teamName: Record<Team, string>;
  completedSets: SetSnapshot[];
  logs: string[];
  tab: "summary" | "log";
  setTab: (t: "summary" | "log") => void;
  onClose: () => void;
  dark: boolean;
  t: I18n;
  onFinishSet: (t: Team) => void;
  onFinishSetA: (r: "W" | "L" | "D", aScore: number, bScore: number) => void;
  scrimMode: boolean;
  seriesDone: boolean;
  onExitSeries: () => void;
  canEditWinner: boolean;
}) {
  const wrapClass = `${props.dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"} border rounded-2xl p-5`;
  const tabBtn = (active: boolean) =>
    `px-2 py-1 rounded border ${
      active
        ? `border-emerald-500 ring-2 ring-emerald-500/60 ${props.dark ? "bg-emerald-900/30 text-emerald-100" : "bg-emerald-50 text-emerald-900"}`
        : props.dark
        ? "border-neutral-700"
        : "border-neutral-300"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* [수정됨] 배경 클릭 시 닫히는 이벤트(onClick={props.onClose})를 제거했습니다. */}
      <div className="absolute inset-0 bg-black/60" />
      
      <div className={`relative z-10 w-full max-w-2xl ${wrapClass}`}>
        <div className="flex items-center mb-3">
          <div className="font-semibold">{props.tab === "summary" ? props.t.showSummary : props.t.showLog}</div>
          <div className="ml-auto flex gap-2 text-xs">
            <button className={tabBtn(props.tab === "summary")} onClick={() => props.setTab("summary")}>
              {props.t.showSummary}
            </button>
            <button className={tabBtn(props.tab === "log")} onClick={() => props.setTab("log")}>
              {props.t.showLog}
            </button>
            <button className={`px-2 py-1 rounded border ${props.dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={props.onClose}>
              {props.t.close}
            </button>
          </div>
        </div>

        {props.tab === "summary" ? (
          <div className="space-y-3 text-xs max-h:[60vh] max-h-[60vh] overflow-y-auto">
            {props.completedSets.length === 0 && <div className="text-neutral-400">{props.t.noneYet}</div>}
            {props.completedSets.map((s, i) => {
              const mapObj = s.map ? MAPS.find((m) => m.id === s.map) : null;
              const a = props.teamName.A;
              const b = props.teamName.B;
              return (
                <div key={i} className="border border-neutral-200 rounded-lg p-2">
                  <div className="font-medium mb-1">
                    {props.t.setN(i + 1)} {s.winner ? `- 승자: ${s.winner === "A" ? a : b}` : ""}
                  </div>
                  <div className="mb-1">
                    {props.t.map}: <b>{mapObj ? `${mapObj.name} (${MAP_LABELS.ko[mapObj.type]})` : "-"}</b> / {props.t.mapPickerLabel}: <b>{s.mapPicker ? (s.mapPicker === "A" ? a : b) : "-"}</b>
                  </div>
                  <div className="mb-1">
                    {props.t.firstBan}: <b>{s.banFirst === "A" ? a : b}</b> / {props.t.secondBan}: <b>{s.banSecond === "A" ? a : b}</b>
                  </div>
                  <div className="mb-1">
                    A팀 밴: {s.bans.A.length ? s.bans.A.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(", ") : props.t.none}
                  </div>
                  <div className="mb-1">
                    B팀 밴: {s.bans.B.length ? s.bans.B.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(", ") : props.t.none}
                  </div>
                  {(s.picks.A.length > 0 || s.picks.B.length > 0) && (
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[11px] text-neutral-400 mb-0.5">A팀 픽</div>
                        <div>{s.picks.A.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(" / ") || "-"}</div>
                      </div>
                      <div>
                        <div className="text-[11px] text-neutral-400 mb-0.5">B팀 픽</div>
                        <div>{s.picks.B.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(" / ") || "-"}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs max-h-[60vh] overflow-y-auto space-y-1">
            {props.logs.length === 0 && <div className="text-neutral-400">{props.t.noLog}</div>}
            {props.logs.map((l, i) => (
              <div key={i} className="border-b border-neutral-200 pb-1">
                {l}
              </div>
            ))}
          </div>
        )}

        {props.seriesDone ? (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm font-medium">{props.t.seriesEnd}</div>
            <button
              className={`px-3 py-2 rounded-lg border ${props.dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900"}`}
              onClick={props.onExitSeries}
            >
              {props.t.endBtn}
            </button>
          </div>
        ) : props.canEditWinner ? (
          props.scrimMode ? (
            <FinishBarForA t={props.t} onSubmit={(resultA, scoreA, scoreB) => props.onFinishSetA(resultA, scoreA, scoreB)} dark={props.dark} />
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                className={`px-3 py-2 rounded-lg border ${props.dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900"}`}
                onClick={() => props.onFinishSet("A")}
              >
                {props.teamName.A} 승리
              </button>
              <button
                className={`px-3 py-2 rounded-lg border ${props.dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900"}`}
                onClick={() => props.onFinishSet("B")}
              >
                {props.teamName.B} 승리
              </button>
            </div>
          )
        ) : (
          <div className="mt-4 text-xs text-neutral-400">승자 선택은 A팀 코치(호스트)만 가능합니다.</div>
        )}
      </div>
    </div>
  );
}

// ‼️ FinishBarForA 수정 (무승부 버튼 추가) ‼️
function FinishBarForA({ t, onSubmit, dark }: { t: I18n; onSubmit: (r: "W" | "L" | "D", a: number, b: number) => void; dark: boolean }) {
  const [a, setA] = React.useState(0);
  const [b, setB] = React.useState(0);
  return (
    <div className="mt-4 flex items-center gap-2">
      <span className="text-xs">세부 스코어를 입력하세요</span>
      <input className={`w-14 px-2 py-1 rounded border ${dark ? "border-neutral-700 bg-neutral-900" : "border-neutral-300 bg-white"}`} type="number" value={a} min={0} onChange={(e) => setA(+e.target.value)} />
      <span>:</span>
      <input className={`w-14 px-2 py-1 rounded border ${dark ? "border-neutral-700 bg-neutral-900" : "border-neutral-300 bg-white"}`} type="number" value={b} min={0} onChange={(e) => setB(+e.target.value)} />
      <div className="ml-auto flex gap-2">
        <button className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={() => onSubmit("W", a, b)}>
          승리(W)
        </button>
        <button className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={() => onSubmit("L", a, b)}>
          패배(L)
        </button>
        <button className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={() => onSubmit("D", a, b)}>
          무승부(D)
        </button>
      </div>
    </div>
  );
}

/** ‼️ 선공/선수비 선택 모달 (A팀 기준) - 배경 클릭 닫기 제거 ‼️ */
function AttackDefenseModal({
  open,
  onClose,
  onConfirm,
  dark,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (side: Side) => void;
  dark: boolean;
}) {
  if (!open) return null;

  const wrap = `${dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"} border rounded-2xl p-5`;
  const btn = (side: Side) => `w-full px-3 py-4 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* [수정됨] 배경 클릭 시 닫히는 이벤트 제거 */}
      <div className="absolute inset-0 bg-black/60" />
      
      <div className={`relative z-10 w-full max-w-xs ${wrap}`}>
        <div className="font-semibold mb-1">선공/선수비 선택</div>
        <div className="text-xs text-neutral-400 mb-4">
          A팀의 선공/선수비를 선택합니다.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button className={btn("ATTACK")} onClick={() => onConfirm("ATTACK")}>
            선공격
          </button>
          <button className={btn("DEFENSE")} onClick={() => onConfirm("DEFENSE")}>
            선수비
          </button>
        </div>
        {/* 필요한 경우 닫기 버튼을 따로 추가하거나, 선택을 강제해야 한다면 버튼 없음 */}
      </div>
    </div>
  );
}

function BetweenSetModal({
  open,
  onClose,
  defaultMapPicker,
  defaultBanFirst,
  teamName,
  dark,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  defaultMapPicker: Team;
  defaultBanFirst: Team;
  teamName: Record<Team, string>;
  dark: boolean;
  onConfirm: (nextMapPicker: Team, nextBanFirst: Team) => void;
}) {
  const [mp, setMp] = React.useState<Team>(defaultMapPicker);
  const [bf, setBf] = React.useState<Team>(defaultBanFirst);
  if (!open) return null;

  const wrap = `${dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"} border rounded-2xl p-5`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* [수정됨] 배경 클릭 시 닫히는 이벤트 제거 */}
      <div className="absolute inset-0 bg-black/60" />
      
      <div className={`relative z-10 w-full max-w-md ${wrap}`}>
        <div className="font-semibold mb-3">다음 세트 설정</div>

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-xs mb-1">맵 선택 팀</div>
            <div className="flex gap-2">
              {(["A", "B"] as Team[]).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1 rounded border ${mp === t ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300"}`}
                  onClick={() => setMp(t)}
                >
                  {t} ({t === "A" ? teamName.A : teamName.B})
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs mb-1">선밴 팀</div>
            <div className="flex gap-2">
              {(["A", "B"] as Team[]).map((t) => (
                <button
                  key={t}
                  className={`px-3 py-1 rounded border ${bf === t ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300"}`}
                  onClick={() => setBf(t)}
                >
                  {t} ({t === "A" ? teamName.A : teamName.B})
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          {/* 닫기 버튼으로만 닫을 수 있게 유지 */}
          <button className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={onClose}>
            닫기
          </button>
          <button className={`ml-auto px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={() => onConfirm(mp, bf)}>
            다음 세트 시작
          </button>
        </div>
      </div>
    </div>
  );
}

// ‼️ ScrimSummaryModal 수정 (제목 형식, 본문 형식) ‼️
function ScrimSummaryModal({
  open,
  onClose,
  sets,
  teamName,
  dark,
  setScrimActive,
  syncOn,
  myRole,
  patch,
  onExitSeries,
  scrimTime,
}: {
  open: boolean;
  onClose: () => void;
  sets: SetSnapshot[];
  teamName: Record<Team, string>;
  dark: boolean;
  setScrimActive: React.Dispatch<React.SetStateAction<boolean>>;
  syncOn: boolean;
  myRole: MyRole;
  patch: (data: any) => void;
  onExitSeries: () => void;
  scrimTime: string;
}) {
  if (!open) return null;
  const wins = sets.filter((s) => s.resultA === "W").length;
  const loses = sets.filter((s) => s.resultA === "L").length;
  const draws = sets.filter((s) => s.resultA === "D").length;

  const scoreStr = `${wins}승 ${draws}무 ${loses}패`;
  const finalResultStr = wins > loses ? "W" : wins < loses ? "L" : "D";
  const startTime = parseInt(scrimTime, 10);
  const timeStr = !isNaN(startTime)
    ? `${startTime} ~ ${startTime + 2} / `
    : scrimTime
    ? `${scrimTime} / `
    : "";

  const title = `Scrim / ${yymmdd()} / ${timeStr}vs ${teamName.B} / ${scoreStr} / ${finalResultStr}`;

  const lines = [
    title,
    "",
    ...sets.map((s, i) => {
      const mapObj = s.map ? MAPS.find((m) => m.id === s.map) : null;
      const resultText = s.resultA === "W" ? "승리(W)" : s.resultA === "L" ? "패배(L)" : "무승부(D)";
      const rline = `세트 ${i + 1} - ${s.scoreA ?? 0}:${s.scoreB ?? 0} ${resultText}`;
      const sideStr = s.attackOrDefense === "ATTACK" ? "/ 선공격 " : s.attackOrDefense === "DEFENSE" ? "/ 선수비 " : "";
      const mline = `맵 : ${mapObj ? `${mapObj.name}(${MAP_LABELS.ko[mapObj.type]})` : "-"} ${sideStr}/ 맵 선택 : ${s.mapPicker ?? "-"}`;
      const bline = `선밴 : ${s.banFirst} / 후밴 : ${s.banSecond}`;
      const aban = `${teamName.A} 밴 : ${s.bans.A.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(", ") || "-"}`;
      const apick = `${teamName.A} 픽 : ${s.picks.A.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(" / ") || "-"}`;
      const bban = `${teamName.B} 밴 : ${s.bans.B.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(", ") || "-"}`;
      const bpick = `${teamName.B} 픽 : ${s.picks.B.map((id) => HEROES.find((h) => h.id === id)?.name ?? id).join(" / ") || "-"}`;
      return [rline, mline, bline, "", aban, apick, "", bban, bpick, ""].join("\n");
    }),
  ].join("\n");

  const wrap = `${dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"} border rounded-2xl p-5`;

  const download = () => {
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${yymmdd()}_scrim.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* [수정됨] 배경 클릭 시 닫히는 이벤트 제거 */}
      <div className="absolute inset-0 bg-black/60" />
      
      <div className={`relative z-10 w-full max-w-2xl ${wrap}`}>
        <div className="font-semibold mb-2">스크림 요약</div>
        <textarea
          className={`w-full h-[50vh] rounded-lg border ${dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900"} text-xs p-2`}
          readOnly
          value={lines}
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`}
            onClick={() => {
              navigator.clipboard.writeText(lines);
            }}
          >
            복사
          </button>
          <button className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={download}>
            .txt 저장
          </button>

          <button className={`ml-auto px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`} onClick={onClose}>
            닫기
          </button>

          <button
            className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`}
            onClick={onExitSeries}
          >
            스크림 종료
          </button>
        </div>
      </div>
    </div>
  );
}

function yymmdd(d = new Date()) {
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/* ================= UI 작은 컴포넌트 ================= */
function RoleIcon({ role, lang, className }: { role: Role; lang: Lang; className?: string }) {
  const [idx, setIdx] = React.useState(0);
  const cands = React.useMemo(() => roleIconCandidates(role, lang), [role, lang]);
  if (idx >= cands.length) {
    return <span className={`text-[10px] opacity-80 ${className ?? ""}`}>{ROLE_LABELS[lang][role]}</span>;
  }
  return (
    <img
      src={cands[idx]}
      alt={ROLE_LABELS[lang][role]}
      title={ROLE_LABELS[lang][role]}
      onError={() => setIdx((i) => i + 1)}
      className={`w-5 h-5 object-contain ${className ?? ""}`}
      draggable={false}
    />
  );
}
const cn = (...a: (string | undefined | false)[]) => a.filter(Boolean).join(" ");

/** 픽 컬럼(좌/우) */
type PickColumnProps = {
  team: Team;
  teamName: Record<Team, string>;
  lang: Lang;
  t: I18n;
  btnBorderClass: string;
  pickSlots: Record<Team, (string | null)[]>;
  pickLockedTeam: Record<Team, boolean>;
  activeSlot: Record<Team, number>;
  setActiveSlot: React.Dispatch<React.SetStateAction<Record<Team, number>>>;
  confirmPick: (team: Team) => void;
  canPickForTeam: (team: Team) => boolean;
  heroById: (id: string) => Hero | undefined;
};
const PickColumn = React.memo(function PickColumn({
  team,
  teamName,
  lang,
  t,
  btnBorderClass,
  pickSlots,
  pickLockedTeam,
  activeSlot,
  setActiveSlot,
  confirmPick,
  canPickForTeam,
  heroById,
}: PickColumnProps) {
  const label = team === "A" ? teamName.A : teamName.B;
  const locked = pickLockedTeam[team];
  const act = activeSlot[team];

  const [wrapRef, wrap] = useBoxSize<HTMLDivElement>();
  const headerRef = React.useRef<HTMLDivElement>(null);
  const footerRef = React.useRef<HTMLDivElement>(null);

  const SLOT_GAP = 12;
  const BTN_VPAD = 16;
  const LABEL_H = 18;
  const LABEL_MT = 4;
  const BORDER_Y = 2;
  const EXTRA_PER = BTN_VPAD + LABEL_H + LABEL_MT + BORDER_Y;
  const FOOTER_MARGIN = 12;
  const SAFE = 2;
  const BTN_PAD_X = 16;

  const slotPx = React.useMemo(() => {
    const h = wrap.height,
      w = wrap.width;
    if (!h || !w) return 84;
    const head = headerRef.current?.offsetHeight ?? 0;
    const foot = footerRef.current?.offsetHeight ?? 0;
    const innerH = h - wrap.padY - head - foot - FOOTER_MARGIN - SAFE;
    const byH = Math.floor((innerH - EXTRA_PER * 5 - SLOT_GAP * 4) / 5);
    const innerW = Math.max(0, w - wrap.padX - BTN_PAD_X);
    const byW = Math.floor(innerW);
    return Math.max(56, Math.min(byH, byW));
  }, [wrap]);

  const roleLabel = (r: Role) => ROLE_LABELS[lang][r];
  const canClickSlot = (t: Team) => canPickForTeam(t) && !pickLockedTeam[t];

  return (
    <div
      ref={wrapRef}
      className={["h-full flex flex-col overflow-visible", "p-3 pb-5 rounded-xl border", locked ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300", "w-full min-w-[220px] max-w-[320px] mx-auto"].join(" ")}
    >
      <div ref={headerRef} className="flex items-center mb-2 shrink-0">
        <div className="text-xs font-semibold">{label}</div>
        {locked && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-green-600/90 text-white">{t.ready}</span>}
      </div>

      <div className="flex-1 flex flex-col gap-3 overflow-visible">
        {SLOT_ROLES.map((sr, i) => {
          const hid = pickSlots[team][i];
          const active = activeSlot[team] === i && !pickLockedTeam[team];
          const heroName = hid ? heroById(hid)?.name ?? hid : roleLabel(sr);
          const clickable = canClickSlot(team);
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => clickable && setActiveSlot((p) => ({ ...p, [team]: i }))}
              className={["w-full rounded-xl border text-center p-2", active ? "border-blue-500 ring-2 ring-blue-500/60" : "border-neutral-300", !clickable && "opacity-60 cursor-not-allowed"].join(" ")}
              style={{ paddingLeft: 8, paddingRight: 8 }}
            >
              <div className="relative mx-auto rounded-lg overflow-hidden bg-neutral-100" style={{ width: slotPx, height: slotPx }}>
                <HeroThumb id={hid ?? null} />
              </div>
              <div className="mt-1 text-[11px] md:text-[12px] font-medium px-1">
                <div className="w-full flex items-center justify-center gap-1 min-h-[18px] truncate">
                  {(() => {
                    const slotRole: Role = (hid ? (heroById(hid)?.role as Role) : sr) ?? sr;
                    return <RoleIcon role={slotRole} lang={lang} className="shrink-0" />;
                  })()}
                  <span className="truncate">{heroName}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div ref={footerRef} className="mt-3 flex items-center shrink-0">
        <span className="text-[11px]">
          {t.slot} {act + 1}/5
        </span>
        <button
          className={`ml-auto px-2 py-1 rounded border ${btnBorderClass} text-[11px]`}
          onClick={() => confirmPick(team)}
          disabled={locked || pickSlots[team].some((v) => v === null) || !canPickForTeam(team)}
        >
          {team} {t.pickLockShort}
        </button>
      </div>
    </div>
  );
});

/* ================= App ================= */
export default function BanpickApp() {
  useEffect(() => {
    ensureAnonAuth();
  }, []);

  /* === Theme === */
  const [dark, setDark] = useState(true); // 분석기 기본 다크로 통일
  // 분석기 다크 theme 톤으로 통일한 커스텀 클래스(banpick.css 정의). 글래스/그라데이션/링 제거.
  const theme = useMemo(
    () => ({
      root: "bp-root-base",
      header: "bp-header",
      panel: "bp-panel",
      btnBorder: "bp-btnborder",
      chipBg: "bp-chip",
      activeGreen: "bp-active",
    }),
    []
  );

  /* === Language === */
  const [lang, setLang] = useState<Lang>("ko");
  const t: I18n = useMemo(() => STR[lang], [lang]);
  const roleLabel = (r: Role) => ROLE_LABELS[lang][r];
  const mapTypeLabel = (mt: string) => (mt === "All" ? (lang === "ko" ? "전체" : "All") : MAP_LABELS[lang][mt as MapType]);

  /* === Setup === */
  const [teamName, setTeamName] = useState<Record<Team, string>>({ A: "Team A", B: "Team B" });
  const [sets, setSets] = useState(3);
  const [mode, setMode] = useState<number>(MODE.FULL);
  const [partMode, setPartMode] = useState<PartMode>("SOLO");
  const [myRole, setMyRole] = useState<MyRole>("HOST");
  const myTeamRole = useMemo(() => roleAsTeam(partMode, myRole), [partMode, myRole]);
  const [firstSetPicker, setFirstSetPicker] = useState<"AUTO" | Team>("AUTO");
  const is1v1 = partMode === "COACH_1V1";
  // Scrim
  const [scrimMode, setScrimMode] = useState(false);
  const [scrimActive, setScrimActive] = useState(false);
  const [betweenOpen, setBetweenOpen] = useState(false);
  const [scrimTime, setScrimTime] = useState("");

  /* === Room / URL === */
  const [roomId, setRoomId] = useState<string>("");
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const role = sp.get("role");
    if (role === "A" || role === "B" || role === "HOST" || role === "OBS") setMyRole(role as any);
    if (sp.get("mode") === "1v1") setPartMode("COACH_1V1");
    const l = sp.get("lang");
    if (l === "en") setLang("en");
    const r = sp.get("room");
    if (r) setRoomId(r);
  }, []);
  useEffect(() => {
    if (partMode === "COACH_1V1" && !roomId) {
      const id = Math.random().toString(36).slice(2, 8);
      setRoomId(id);
    }
  }, [partMode, roomId]);
  const joinUrl = useMemo(() => {
    if (!roomId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("mode", "1v1");
    url.searchParams.set("room", roomId);
    url.searchParams.set("role", "B");
    return url.toString();
  }, [roomId]);

  /* === Firestore Sync === */
  const syncOn = partMode === "COACH_1V1" && !!roomId;
  const { remote, patch, pushFull } = useRoomSync(roomId, syncOn);

  const setInitialPickerSync = React.useCallback(
    (v: "AUTO" | Team) => {
      setFirstSetPicker(v);
      if (syncOn && myRole === "HOST") {
        patch({ firstSetPicker: v });
      }
    },
    [syncOn, myRole, patch]
  );

  /* === 스크림모드 토글 === */
  const setScrimModeSync = React.useCallback(
    (v: boolean) => {
      setScrimMode(v);
      if (syncOn && myRole === "HOST") patch({ scrimMode: v });
    },
    [syncOn, myRole, patch]
  );

  /* === 스크림 시간 동기화 === */
  const setScrimTimeSync = React.useCallback(
    (v: string) => {
      setScrimTime(v);
      if (syncOn && myRole === "HOST") patch({ scrimTime: v });
    },
    [syncOn, myRole, patch]
  );

  // ✅ READY는 전용 훅으로만 동기화 (rooms/{roomId}.readyA/readyB)
  const { readyA, readyB, setReadyA, setReadyB } = useReadySyncFS(roomId, syncOn);

  /* === Match === */
  const [started, setStarted] = useState(false);
  const [phase, setPhase] = useState<Phase>(mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK");
  const [timer, setTimer] = useState<number>(TIMER.NORMAL);
  const [run, setRun] = useState(false);

  /* === per-set === */
  const [orderChooser, setOrderChooser] = useState<Team>("A");
  const [banStarterChoice, setBanStarterChoice] = useState<null | "PICKER" | "OPPONENT">(null);
  const [mapPicker, setMapPicker] = useState<Team>("A");
  const [selectedMap, setSelectedMap] = useState<string | null>(null);
  const [turn, setTurn] = useState<Team>("A");
  const [bans, setBans] = useState<Record<Team, string[]>>({ A: [], B: [] });
  const [roleLock, setRoleLock] = useState<Partial<Record<Role, Team>>>({});
  const [pendingBan, setPendingBan] = useState<Record<Team, string | null>>({ A: null, B: null });
  const [attackOrDefense, setAttackOrDefense] = useState<Side | null>(null);

  const [pickSlots, setPickSlots] = useState<Record<Team, (string | null)[]>>({ A: [null, null, null, null, null], B: [null, null, null, null, null] });
  const [activeSlot, setActiveSlot] = useState<Record<Team, number>>({ A: 0, B: 0 });
  const [pickLockedTeam, setPickLockedTeam] = useState<Record<Team, boolean>>({ A: false, B: false });
  const [pickLocked, setPickLocked] = useState(false);

  const [completedSets, setCompletedSets] = useState<SetSnapshot[]>([]);
  const [usedModesCycle, setUsedModesCycle] = useState<Set<MapType>>(new Set());
  const [usedMaps, setUsedMaps] = useState<Set<string>>(new Set());
  const [winnerThisSet, setWinnerThisSet] = useState<Team | null>(null);

  const [mapFilter, setMapFilter] = useState<"All" | MapType>("All");
  const [filterRole, setFilterRole] = useState<Role>("Tank");

  /* === feedback & logs === */
  const [toast, setToast] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [showSummaryOpen, setShowSummaryOpen] = useState(false);
  const [summaryTab, setSummaryTab] = useState<"summary" | "log">("summary");
  const [showScrimSummary, setShowScrimSummary] = useState(false);
  const [showSideModal, setShowSideModal] = useState(false);
  const [frozenSummarySets, setFrozenSummarySets] = useState<SetSnapshot[]>([]);

  const otherTeam = (t: Team): Team => (t === "A" ? "B" : "A");
  const canEditWinner = useMemo(() => (partMode === "COACH_1V1" ? myTeamRole === "A" : myRole !== "OBS"), [partMode, myTeamRole, myRole]);
  const heroById = (id: string) => HEROES.find((h) => h.id === id);

  const teamBanHistory = useMemo(() => {
    const hist: Record<Team, Set<string>> = { A: new Set(), B: new Set() };
    completedSets.forEach((s) => {
      s.bans.A.forEach((h) => hist.A.add(h));
      s.bans.B.forEach((h) => hist.B.add(h));
    });
    return hist;
  }, [completedSets]);

  // ... App 컴포넌트 내부 ...

  const filteredMapsForPick = useMemo(() => {
    const available = MAPS.filter((m) => !usedMaps.has(m.id));
    const firstSet = completedSets.length === 0;
    const typeAllowed = (m: MapInfo) => {
      // [수정] 첫 세트라고 해서 반드시 Control일 필요 없음 (삭제됨)
      // if (firstSet) return m.type === "Control"; 
      
      // 같은 모드(쟁탈, 호위 등)가 너무 자주 반복되지 않도록 하는 로직은 유지하거나
      // 원하시면 아래 조건도 삭제하여 모든 맵을 항상 열어둘 수 있습니다.
      // 현재는 5세트 이내에 같은 모드 반복 금지 로직만 남겨둡니다.
      if (usedModesCycle.size < 5 && usedModesCycle.has(m.type)) return false;
      return true;
    };
    return available.filter((m) => (mapFilter === "All" ? true : m.type === mapFilter)).filter(typeAllowed);
  }, [mapFilter, usedMaps, usedModesCycle, completedSets.length]);

  
  const allBannedThisSet = useMemo(() => bans.A.concat(bans.B), [bans]);

  /* === Series Score === */
  const targetWins = useMemo(() => (sets === 3 ? 2 : sets === 5 ? 3 : 4), [sets]);
  const winsA = useMemo(() => completedSets.filter((s) => s.winner === "A").length, [completedSets]);
  const winsB = useMemo(() => completedSets.filter((s) => s.winner === "B").length, [completedSets]);
  const seriesDone = scrimMode ? false : winsA >= targetWins || winsB >= targetWins;

  /* ========== Sync: 호스트 스냅샷 스로틀 푸시 ========== */
  const sharedSnapshot = useMemo(
    () => ({
      teamName,
      sets,
      mode,
      partMode,
      myRole,
      firstSetPicker,
      started,
      phase,
      timer,
      run,
      orderChooser,
      banStarterChoice,
      mapPicker,
      selectedMap,
      turn,
      bans,
      roleLock,
      pendingBan,
      pickSlots,
      pickLockedTeam,
      pickLocked,
      activeSlot,
      completedSets,
      usedMaps: Array.from(usedMaps),
      usedModesCycle: Array.from(usedModesCycle),
      winnerThisSet,
      logs,
      scrimMode,
      scrimActive,
      scrimTime,
      attackOrDefense,
    }),
    [
      teamName,
      sets,
      mode,
      partMode,
      myRole,
      firstSetPicker,
      started,
      phase,
      timer,
      run,
      orderChooser,
      banStarterChoice,
      mapPicker,
      selectedMap,
      turn,
      bans,
      roleLock,
      pendingBan,
      pickSlots,
      pickLockedTeam,
      pickLocked,
      activeSlot,
      completedSets,
      usedMaps,
      usedModesCycle,
      winnerThisSet,
      logs,
      scrimMode,
      scrimActive,
      scrimTime,
      attackOrDefense,
    ]
  );

  const pushRef = useRef<number | null>(null);
  // 호스트만 pushFull, 시작 후에만
  useEffect(() => {
    if (!syncOn || myRole !== "HOST" || !started) return;

    if (pushRef.current) window.clearTimeout(pushRef.current);
    pushRef.current = window.setTimeout(() => {
      pushFull(sharedSnapshot);
    }, 300);

    return () => {
      if (pushRef.current) window.clearTimeout(pushRef.current);
    };
  }, [sharedSnapshot, syncOn, myRole, started, pushFull]);

  // 2) 원격 스냅샷을 호스트/게스트 모두 로컬에 반영
  useEffect(() => {
    if (!syncOn || !remote) return;

    setStarted((v) => remote.started ?? v);
    setPhase((v) => remote.phase ?? v);
    setTimer((v) => remote.timer ?? v);
    setRun((v) => remote.run ?? v);

    setOrderChooser((v) => remote.orderChooser ?? v);
    setBanStarterChoice((v) => remote.banStarterChoice ?? v);
    setMapPicker((v) => remote.mapPicker ?? v);
    setSelectedMap((v) => remote.selectedMap ?? v);
    setTurn((v) => remote.turn ?? v);
    setBans((v) => remote.bans ?? v);
    setRoleLock((v) => remote.roleLock ?? v);
    setPendingBan((v) => remote.pendingBan ?? v);
    setPickSlots((v) => remote.pickSlots ?? v);
    setPickLockedTeam((v) => remote.pickLockedTeam ?? v);
    setPickLocked((v) => remote.pickLocked ?? v);
    setActiveSlot((v) => remote.activeSlot ?? v);

    setScrimMode((v) => remote.scrimMode ?? v);
    setScrimActive((v) => remote.scrimActive ?? v);
    setScrimTime((v) => remote.scrimTime ?? v);
    setAttackOrDefense((v) => remote.attackOrDefense ?? v);

    setCompletedSets((v) => remote.completedSets ?? v);
    setUsedMaps(new Set(remote.usedMaps ?? []));
    setUsedModesCycle(new Set(remote.usedModesCycle ?? []));
    setWinnerThisSet((v) => remote.winnerThisSet ?? v);
    setLogs((v) => remote.logs ?? v);
    setFirstSetPicker((v) => remote.firstSetPicker ?? v);
  }, [remote, syncOn, myRole]);

  // ★ HOST도 게스트 patch를 받아서 로컬로 흡수 (되돌림 방지)
  useEffect(() => {
    if (!syncOn || !remote) return;
    if (myRole !== "HOST") return;

    // 게스트가 바꾸는 가능성이 있는 필드들만 흡수
    if (remote.pickSlots) setPickSlots(remote.pickSlots);
    if (remote.activeSlot) setActiveSlot(remote.activeSlot);
    if (remote.pendingBan) setPendingBan(remote.pendingBan);
    if (remote.selectedMap !== undefined) setSelectedMap(remote.selectedMap);
    if (remote.banStarterChoice !== undefined) setBanStarterChoice(remote.banStarterChoice);
    if (remote.turn) setTurn(remote.turn);
    if (remote.phase) setPhase(remote.phase);
    if (remote.pickLockedTeam) setPickLockedTeam(remote.pickLockedTeam);
    if (remote.attackOrDefense !== undefined) setAttackOrDefense(remote.attackOrDefense);
  }, [syncOn, remote, myRole]);

  // READY → 동시에 시작: HOST가 깃발 1회만 세움 (단일 useEffect로만)
  useEffect(() => {
    if (!is1v1) return;

    // 원격에서 이미 started가 올라왔으면 로컬 맞춤 (게스트 포함)
    if (remote?.started) {
      if (!started) {
        setStarted(true);
        setPhase(remote.phase ?? (mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK"));
        setRun(true);
      }
      return;
    }

    // 둘 다 READY이고, 내가 호스트이며 아직 시작 안 했을 때만 서버에 시작 플래그 1회 반영
    if (readyA && readyB && myRole === "HOST" && !remote?.started) {
      patch({ started: true, phase: mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK" });
    }
  }, [is1v1, readyA, readyB, remote?.started, remote?.phase, myRole, mode, started, patch]);

  useEffect(() => {
    if (!started || !scrimMode) return;
    if (!scrimActive) {
      setScrimActive(true);
      if (syncOn && myRole === "HOST") patch({ scrimActive: true });
    }
  }, [started, scrimMode, scrimActive, syncOn, myRole, patch]);

  /* ========== 타이머 등 기타 로직 ========== */
  useEffect(() => {
    if (!started) return;
    setTimer(phase === "HERO_PICK" ? TIMER.PICK : TIMER.NORMAL);
    setRun(true);
  }, [phase, started]);

  useEffect(() => {
    if (!run || !started) return;
    if (timer <= 0) {
      setRun(false);
      onTimeout();
      return;
    }
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [run, timer, started]);

  useEffect(() => {
    if (phase === "HERO_PICK" && pickLockedTeam.A && pickLockedTeam.B) {
      setPickLocked(true);
      setRun(false);
      setShowSummaryOpen(true);
      setSummaryTab("summary");
    }
  }, [phase, pickLockedTeam]);

  useEffect(() => {
    if (phase !== "HERO_PICK") return;
    let tTeam: Team | null = null;
    if (partMode === "SOLO") tTeam = !pickLockedTeam.A ? "A" : !pickLockedTeam.B ? "B" : null;
    else tTeam = myTeamRole as Team | null;
    if (tTeam) {
      const role = SLOT_ROLES[activeSlot[tTeam]] ?? "Tank";
      if (filterRole !== role) setFilterRole(role);
    }
  }, [phase, partMode, myTeamRole, pickLockedTeam, activeSlot, filterRole]);

  useEffect(() => {
    if (phase !== "HERO_BAN") return;
    const allowed: Role[] = (["Tank", "Damage", "Support"] as Role[]).filter((r) => {
      const lock = roleLock[r];
      return !lock || lock === turn;
    });
    if (!allowed.includes(filterRole)) {
      setFilterRole(allowed[0] ?? "Tank");
    }
  }, [phase, turn, roleLock, filterRole]);

  // 세트 초기화 (직전 세트 패자에게 권한)
  useEffect(() => {
    if (scrimMode) return; // 스크림은 BetweenSetModal에서 초기화
    if (!started) return;
    if (seriesDone) {
      setRun(false);
      return;
    }
    const first = completedSets.length === 0;
    const lastWinner: Team | null = first ? null : completedSets[completedSets.length - 1].winner ?? null;
    const chooser: Team = first ? (firstSetPicker === "AUTO" ? (Math.random() < 0.5 ? "A" : "B") : firstSetPicker) : lastWinner ? (lastWinner === "A" ? "B" : "A") : "A";
    setOrderChooser(chooser);
    setMapPicker(chooser);
    setTurn(chooser);
    setSelectedMap(null);
    setBanStarterChoice(null);
    setAttackOrDefense(null); // ‼️ 초기화 추가
    setRoleLock({});
    setPendingBan({ A: null, B: null });
    setPickSlots({ A: [null, null, null, null, null], B: [null, null, null, null, null] });
    setActiveSlot({ A: 0, B: 0 });
    setPickLockedTeam({ A: false, B: false });
    setPickLocked(false);
    setBans({ A: [], B: [] });
    setWinnerThisSet(null);
    setPhase(mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK");
  }, [completedSets.length, mode, started, seriesDone, firstSetPicker, scrimMode]);

  // 시리즈 종료되면 요약 모달 자동 오픈
  useEffect(() => {
    if (!started) return;
    if (!seriesDone) return;
    setRun(false);
    setShowSummaryOpen(true);
    setSummaryTab("summary");
  }, [seriesDone, started]);

  /* ========== Actions ========== */
  function popToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 900);
  }
  function logLine(msg: string) {
    setLogs((ls) => ls.concat([msg]));
  }

  const pushImportant = React.useCallback(() => {
    if (syncOn && myRole === "HOST") pushFull(sharedSnapshot);
  }, [syncOn, myRole, pushFull, sharedSnapshot]);

  function handleStart() {
    if (!teamName.A.trim() || !teamName.B.trim()) {
      alert(t.teamNameRequired);
      return;
    }
    if (partMode === "COACH_1V1") {
      if (!(readyA && readyB)) {
        alert("양 팀 모두 READY가 되어야 시작할 수 있습니다.");
        return;
      }
      if (myRole === "HOST") {
        patch({ started: true, phase: mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK" });
      }
      return;
    }
    setStarted(true);

    if (scrimMode) {
      setScrimActive(true);
      if (syncOn && myRole === "HOST") patch({ scrimActive: true });
    }
  }

  function confirmBanOrderClick() {
    if (!banStarterChoice) return;
    const starter: Team = banStarterChoice === "OPPONENT" ? otherTeam(orderChooser) : orderChooser;

    // 로컬 반영
    setTurn(starter);
    setPhase("HERO_BAN");

    // 서버 반영 (게스트가 눌러도 서버에 반영되도록!)
    if (syncOn) {
      patch({
        banStarterChoice,
        turn: starter,
        phase: "HERO_BAN",
      });
    }
  }

  // ‼️ commitMap 함수 수정 (스크림 모드 분기 처리) ‼️
  /** 맵 확정 버튼 클릭 시 */
  function commitMap() {
    if (mode === MODE.HERO_BAN_ONLY) return;
    if (!selectedMap || !banStarterChoice) return;

    const mapObj = MAPS.find((m) => m.id === selectedMap);

    // ‼️ 맵 타입 체크 시 scrimMode인지 확인 ‼️
    if (scrimMode && mapObj && (mapObj.type === "Escort" || mapObj.type === "Hybrid")) {
      // (스크림 모드)이고 (호위/혼합 맵) -> 선공/선수비 선택 모달 열기
      setRun(false);
      setShowSideModal(true);
      // 밴 페이즈로의 진행은 모달의 onConfirm에서 처리
    } else {
      // (SOLO, 1v1 모드) 또는 (스크림이지만 쟁탈/밀기/플포 맵) -> 즉시 밴 페이즈로 진행
      setAttackOrDefense(null); // 공수선택 없음
      proceedToBanPhase(null);
    }
  }

  /** ‼️ 밴 페이즈로 진행하는 공통 로직 (신규 함수) ‼️ */
  function proceedToBanPhase(side: Side | null) {
    if (!selectedMap || !banStarterChoice) return; // 필수값 재확인

    const starter: Team = banStarterChoice === "OPPONENT" ? otherTeam(mapPicker) : mapPicker;
    const mapObj = MAPS.find((m) => m.id === selectedMap);

    // 로그 기록 (선공/선수비 포함)
    const sideStr = side === "ATTACK" ? " / 선공격" : side === "DEFENSE" ? " / 선수비" : "";
    logLine(`[세트 ${completedSets.length + 1}] ${t.confirmMap}: ${mapObj?.name ?? selectedMap}${sideStr}`);
    popToast(t.toastMap);

    // 로컬 상태 업데이트
    setTurn(starter);
    setPhase("HERO_BAN");
    setRun(true); // 타이머 다시 시작

    // 서버 반영 (게스트가 눌러도 반영되도록)
    if (syncOn) {
      patch({
        selectedMap,
        banStarterChoice,
        turn: starter,
        phase: "HERO_BAN",
        attackOrDefense: side, // ‼️ 선택된 사이드 정보 동기화
      });
    }
  }

  function proceedAfterBans() {
    if (mode === MODE.FULL) setPhase("HERO_PICK");
    else {
      setShowSummaryOpen(true);
      setSummaryTab("summary");
      setRun(false);
    }
  }

// [수정됨] 팀별 중복 밴 방지 로직 복구
  function applyBan(team: Team, id: string) {
    const hero = heroById(id);
    if (!hero) return;
    if (bans[team].length >= 1) return;
    
    // ★ 핵심 복구: 이 팀이 과거 세트에 이 영웅을 밴 했었다면, 이번에는 밴 할 수 없음
    if (teamBanHistory[team].has(id)) return; 

    if (roleLock[hero.role] && roleLock[hero.role] !== team) return;
    if (allBannedThisSet.includes(id)) return;

    const newBans: Record<Team, string[]> = { ...bans, [team]: [...bans[team], id] };
    const newRoleLock = roleLock[hero.role] ? roleLock : { ...roleLock, [hero.role]: team };
    const newPending = { ...pendingBan, [team]: null };

    logLine(`${teamName[team]} ${t.confirmBan}: ${hero.name}`);

    const total = newBans.A.length + newBans.B.length;
    let nextPhase: Phase = phase;
    let nextTurn: Team = turn;

    if (total >= 2) {
      if (mode === MODE.FULL) nextPhase = "HERO_PICK";
      else {
        // 요약 모달 등은 아래 setState에서 그대로 동작
      }
    } else {
      nextTurn = otherTeam(team);
    }

    // 로컬 반영
    setBans(newBans);
    if (newRoleLock !== roleLock) setRoleLock(newRoleLock);
    setPendingBan(newPending);
    if (nextTurn !== turn) setTurn(nextTurn);

    if (total >= 2) {
      if (mode === MODE.FULL) setPhase("HERO_PICK");
      else {
        setShowSummaryOpen(true);
        setSummaryTab("summary");
        setRun(false);
      }
    }

    // ★ 서버 반영
    if (syncOn) {
      const payload: any = {
        bans: newBans,
        roleLock: newRoleLock,
        pendingBan: newPending,
        turn: nextTurn,
      };
      if (total >= 2) payload.phase = nextPhase; 
      patch(payload);
    }

    popToast(t.toastBan);
  }

  function commitBan(forceId?: string) {
    const id = forceId ?? pendingBan[turn];
    if (!id) return;
    // popToast는 applyBan 안에서 처리
    applyBan(turn, id);
  }

  function canPickForTeam(team: Team) {
    if (phase !== "HERO_PICK") return false;
    if (partMode === "SOLO") return team === "A" ? !pickLockedTeam.A : pickLockedTeam.A && !pickLockedTeam.B;
    return myTeamRole === team;
  }

  function slotCanTake(team: Team, heroId: string) {
    if (phase !== "HERO_PICK" || pickLocked || pickLockedTeam[team]) return false;
    if (!canPickForTeam(team)) return false;
    if (allBannedThisSet.includes(heroId)) return false;
    if (pickSlots[team].includes(heroId)) return true;
    const idx = activeSlot[team];
    const need = SLOT_ROLES[idx];
    const hero = heroById(heroId);
    return hero?.role === need;
  }

  function togglePick(team: Team, heroId: string) {
    if (phase !== "HERO_PICK" || pickLocked || pickLockedTeam[team]) return;
    if (!canPickForTeam(team)) return;

    // 현재 상태를 바탕으로 다음 상태 계산
    const exist = pickSlots[team].indexOf(heroId);

    let nextSlots: Record<Team, (string | null)[]> = { ...pickSlots };
    let nextActive: Record<Team, number> = { ...activeSlot };

    if (exist !== -1) {
      // 이미 들어가 있던 영웅이면 제거
      nextSlots[team] = nextSlots[team].map((v, i) => (i === exist ? null : v));
      nextActive[team] = exist;
    } else {
      const idx = activeSlot[team];
      if (!slotCanTake(team, heroId)) return;
      nextSlots[team] = nextSlots[team].map((v, i) => (i === idx ? heroId : v));

      // 다음 빈 슬롯 탐색
      const arr = nextSlots[team];
      let nextIdx = -1;
      for (let i = 0; i < arr.length; i++) {
        if (i !== idx && arr[i] === null) {
          nextIdx = i;
          break;
        }
      }
      nextActive[team] = nextIdx === -1 ? idx : nextIdx;
    }

    // 로컬 반영
    setPickSlots(nextSlots);
    setActiveSlot(nextActive);

    // ★ 서버 반영 (게스트가 눌러도 호스트가 곧바로 받아서 되살림)
    if (syncOn) patch({ pickSlots: nextSlots, activeSlot: nextActive });
  }

  function handleHeroClick(heroId: string) {
    if (phase !== "HERO_PICK" || pickLocked) return;
    let t: Team | null = null;
    if (partMode === "SOLO") t = !pickLockedTeam.A ? "A" : !pickLockedTeam.B ? "B" : null;
    else t = myTeamRole as Team | null;
    if (!t) return;
    togglePick(t, heroId);
  }

  function confirmPick(team: Team) {
    if (pickSlots[team].some((v) => v === null)) return;

    const nextLocked = { ...pickLockedTeam, [team]: true };
    setPickLockedTeam(nextLocked);

    const names = pickSlots[team].map((id) => (id ? heroById(id)?.name ?? id : "(빈)"));
    logLine(STR[lang].lockPickTeam(teamName[team]) + ": " + names.join(" / "));
    popToast(STR[lang].lockPickTeam(teamName[team]));

    // ★ 서버에도 락 반영
    if (syncOn) patch({ pickLockedTeam: nextLocked });
  }

  // ‼️ 'finishSet' 함수 (단순 승리)
  function finishSet(winner: Team) {
    const effective: "PICKER" | "OPPONENT" = banStarterChoice ?? "PICKER";
    const mapPickerThis: Team | null = mode === MODE.HERO_BAN_ONLY ? null : mapPicker;
    const firstChooser: Team = mode === MODE.HERO_BAN_ONLY ? orderChooser : mapPickerThis ?? orderChooser;
    const banFirstTeam: Team = effective === "OPPONENT" ? otherTeam(firstChooser) : firstChooser;

    const snapshot: SetSnapshot = {
      bans,
      picks: { A: pickSlots.A.filter(Boolean) as string[], B: pickSlots.B.filter(Boolean) as string[] },
      map: selectedMap,
      winner,
      mapPicker: mapPickerThis,
      banFirst: banFirstTeam,
      banSecond: otherTeam(banFirstTeam),
      attackOrDefense: attackOrDefense, // ‼️ 공수정보 추가
    };

    setWinnerThisSet(winner);
    setCompletedSets((prev) => prev.concat([snapshot]));

    if (selectedMap) {
      const m = MAPS.find((x) => x.id === selectedMap);
      if (m) {
        setUsedMaps((prev) => new Set(prev).add(selectedMap));
        setUsedModesCycle((prev) => {
          const nxt = new Set(prev);
          nxt.add(m.type);
          return nxt.size >= 5 ? new Set() : nxt;
        });
      }
    }
    logLine(`[세트 ${completedSets.length + 1}] 승자: ${winner === "A" ? teamName.A : teamName.B}`);
    setTimeout(pushImportant, 0);
  }

  // ‼️ 'finishSetA' 함수 (스크림용 상세 승리/무승부)
  function finishSetA(resultA: "W" | "L" | "D", scoreA: number, scoreB: number) {
    const winner: Team | null = resultA === "W" ? "A" : resultA === "L" ? "B" : null; // ‼️ 무승부(D) 시 winner는 null

    const effective: "PICKER" | "OPPONENT" = banStarterChoice ?? "PICKER";
    const mapPickerThis: Team | null = mode === MODE.HERO_BAN_ONLY ? null : mapPicker;
    const firstChooser: Team = mode === MODE.HERO_BAN_ONLY ? orderChooser : mapPickerThis ?? orderChooser;
    const banFirstTeam: Team = effective === "OPPONENT" ? (firstChooser === "A" ? "B" : "A") : firstChooser;

    const snapshot: SetSnapshot = {
      bans,
      picks: { A: pickSlots.A.filter(Boolean) as string[], B: pickSlots.B.filter(Boolean) as string[] },
      map: selectedMap,
      winner,
      mapPicker: mapPickerThis,
      banFirst: banFirstTeam,
      banSecond: banFirstTeam === "A" ? "B" : "A",
      scoreA,
      scoreB,
      resultA,
      attackOrDefense: attackOrDefense, // ‼️ 공수정보 추가
    };

    setWinnerThisSet(winner);
    setCompletedSets((prev) => prev.concat([snapshot]));

    // ‼️ 로그 메시지 수정 ‼️
    const resultText = resultA === "W" ? "승리(W)" : resultA === "L" ? "패배(L)" : "무승부(D)";
    logLine(`[세트 ${completedSets.length + 1}] 결과: ${resultText} (${scoreA}:${scoreB})`);

    if (syncOn && myRole === "HOST") pushFull(sharedSnapshot);

    if (scrimMode) {
      setBetweenOpen(true); // ⬅️ 다음세트 설정 모달 오픈
    } else {
      // 기존 시리즈 흐름 유지(요약 모달은 이미 열려 있음)
    }
  }

  function onTimeout() {
    if (phase === "MAP_PICK") {
      let chosen = selectedMap;
      const pool = filteredMapsForPick;
      if (!chosen && pool.length) chosen = pool[Math.floor(Math.random() * pool.length)].id;

      const choice: "PICKER" | "OPPONENT" = banStarterChoice ?? "PICKER";
      
      // 맵이 자동 선택되었으므로, 공수선택도 자동으로 처리 (null)
      setBanStarterChoice(choice);
      setSelectedMap(chosen || null);
      setAttackOrDefense(null);
      proceedToBanPhase(null); // 즉시 밴페이즈로
      return;
    }

    if (phase === "BAN_ORDER") {
      const choice: "PICKER" | "OPPONENT" = banStarterChoice ?? "PICKER";
      const starter: Team = choice === "OPPONENT" ? otherTeam(orderChooser) : orderChooser;

      setBanStarterChoice(choice);
      setTurn(starter);
      setPhase("HERO_BAN");

      if (syncOn) {
        patch({
          banStarterChoice: choice,
          turn: starter,
          phase: "HERO_BAN",
        });
      }
      return;
    }

    // (나머지 HERO_BAN/HERO_PICK 분기도 필요하면 같은 방식으로 phase/turn 등을 patch)
  }

  // ‼️ resetToHome 함수 수정 ‼️
  function resetToHome() {
    setRun(false);
    setTimer(TIMER.NORMAL);
    setShowSummaryOpen(false);
    setToast(null);
    setLogs([]);

    setReadyA(false);
    setReadyB(false);

    setCompletedSets([]);
    setUsedMaps(new Set());
    setUsedModesCycle(new Set());

    setSelectedMap(null);
    setMapPicker("A");
    setOrderChooser("A");
    setTurn("A");
    setBanStarterChoice(null);
    setRoleLock({});
    setPendingBan({ A: null, B: null });
    setAttackOrDefense(null); // ‼️ 초기화 추가

    setBans({ A: [], B: [] });
    setPickSlots({ A: [null, null, null, null, null], B: [null, null, null, null, null] });
    setActiveSlot({ A: 0, B: 0 });
    setPickLockedTeam({ A: false, B: false });
    setPickLocked(false);
    setWinnerThisSet(null);

    setStarted(false);

    // ‼️ 스크림 모드 관련 상태 초기화 추가 ‼️
    setScrimMode(false);
    setScrimActive(false);
    setScrimTime("");
    setPartMode("SOLO"); // 기본 모드로 리셋
    setFirstSetPicker("AUTO"); // 픽 순서 리셋
    setMode(MODE.FULL); // 시뮬레이션 범위 리셋

    // (1v1 모드) 다른 플레이어에게도 종료 알림
    if (syncOn && myRole === "HOST") {
      patch({
        started: false,
        scrimMode: false,
        scrimActive: false,
        scrimTime: "",
        attackOrDefense: null, // ‼️ 초기화 추가
      });
    }
  }

  /* === permission flags === */
  const canEditMapStuff = partMode === "SOLO" || canControlMapOrOrder(partMode, myRole, mapPicker);
  const canEditOrderStuff = partMode === "SOLO" || canControlMapOrOrder(partMode, myRole, orderChooser);
  const canBanThisTurn = partMode === "SOLO" || canControlBanTurn(partMode, myRole, turn);

  /* ============== UI ============== */
  return (
    <div className={"bp-root " + theme.root}>
      <header className={theme.header}>
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          {started ? (
            <div className="flex items-baseline gap-2">
              <div className="text-lg md:text-2xl font-extrabold">
                <span className="inline-block truncate max-w-[140px] md:max-w-[220px]" title={teamName.A}>
                  {teamName.A}
                </span>
                <span className="mx-2">
                  {winsA} : {winsB}
                </span>
                <span className="inline-block truncate max-w-[140px] md:max-w-[220px]" title={teamName.B}>
                  {teamName.B}
                </span>
                <span className="ml-2 text-xs md:text-sm opacity-70">
                  · BO{sets}
                  {seriesDone && t.scoreDone}
                </span>
              </div>
            </div>
          ) : (
            <h1 className="text-base font-bold">{t.title}</h1>
          )}

          <div className="ml-auto flex items-center gap-2">
            {started && (
              <>
                <button
                  className={`px-2 py-1 rounded border ${theme.btnBorder} text-xs`}
                  onClick={() => {
                    setSummaryTab("summary");
                    setShowSummaryOpen(true);
                  }}
                >
                  {t.openSummary}
                </button>
                <button
                  className={`px-2 py-1 rounded border ${theme.btnBorder} text-xs`}
                  onClick={() => {
                    setSummaryTab("log");
                    setShowSummaryOpen(true);
                  }}
                >
                  {t.openLogs}
                </button>
                {/* ‼️ '스크림 종료' 버튼 onClick 수정 ‼️ */}
                {started && scrimMode && (
                  <button
                    className={`px-2 py-1 rounded border ${theme.btnBorder} text-xs`}
                    onClick={() => {
                      setFrozenSummarySets(completedSets); // 1. 현재 세트 정보를 "얼립니다".
                      setShowScrimSummary(true); // 2. 모달을 띄웁니다.
                    }}
                  >
                    스크림 종료
                  </button>
                )}
              </>
            )}
            <button onClick={() => setLang((l) => (l === "ko" ? "en" : "ko"))} className={"px-2 py-1 rounded border text-xs " + theme.btnBorder}>
              {lang === "ko" ? STR.en.koBtn : STR.ko.enBtn}
            </button>
            <button onClick={() => setDark((d) => !d)} title={dark ? STR[lang].light : STR[lang].dark} className={`px-2 py-1 rounded border ${theme.btnBorder} text-xs`}>
              {dark ? STR[lang].light : STR[lang].dark}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-none px-4 lg:px-6 py-6 2xl:max-w-[1720px]">
        {!started ? (
          <Setup
            teamName={teamName}
            setTeamName={setTeamName}
            sets={sets}
            setSets={setSets}
            mode={mode}
            setMode={setMode}
            partMode={partMode}
            setPartMode={setPartMode}
            myRole={myRole}
            setMyRole={setMyRole}
            initialPicker={firstSetPicker}
            setInitialPicker={setInitialPickerSync}
            onStart={handleStart}
            dark={dark}
            t={t}
            joinUrl={joinUrl}
            readyA={readyA}
            readyB={readyB}
            setReadyA={setReadyA}
            setReadyB={setReadyB}
            scrimMode={scrimMode}
            setScrimMode={setScrimModeSync}
            scrimTime={scrimTime}
            setScrimTime={setScrimTimeSync}
          />
        ) : (
          <section className={`p-4 ${theme.panel}`}>
            <h2 className="font-semibold mb-3">
              {mode !== MODE.HERO_BAN_ONLY && phase === "MAP_PICK" && STR[lang].mapPick}
              {phase === "BAN_ORDER" && STR[lang].banOrder}
              {phase === "HERO_BAN" && STR[lang].heroBan}
              {phase === "HERO_PICK" && STR[lang].heroPick}
            </h2>

            {/* MAP PICK */}
            {mode !== MODE.HERO_BAN_ONLY && phase === "MAP_PICK" && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  {(["All", "Control", "Escort", "Hybrid", "Push", "Flashpoint"] as const).map((mt) => (
                    <button
                      key={mt}
                      onClick={() => setMapFilter((prev) => (prev === mt ? "All" : mt))}
                      className={"px-3 py-1 rounded-full border text-xs " + (mapFilter === mt ? theme.activeGreen : "border-neutral-300")}
                    >
                      {mapTypeLabel(mt)}
                    </button>
                  ))}
                  <div className="ml-auto text-xs">
                    {t.mapRight}: <b>{mapPicker === "A" ? teamName.A : teamName.B}</b>
                  </div>
                </div>

                <div className="mx-auto w-full max-w-[1440px] px-1 sm:px-2">
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                    {filteredMapsForPick.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          if (!canEditMapStuff) return;
                          setSelectedMap((prev) => {
                            const next = prev === m.id ? null : m.id;
                            if (syncOn) patch({ selectedMap: next }); // ★ 선택 즉시 서버에 반영
                            return next;
                          });
                        }}
                        className={"text-left rounded-xl border overflow-hidden " + (selectedMap === m.id ? "border-blue-500 ring-2 ring-blue-500/60" : "border-neutral-300")}
                      >
                        <div className="relative w-full aspect-square overflow-hidden">
                          <MapThumb id={m.id} />
                        </div>
                        <div className="px-3 py-2 text-[13px] font-medium flex items-center gap-2 overflow-hidden">
                          <MapTypeBadge type={m.type} lang={lang} />
                          <span className="truncate">{m.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3">
                  <div className="text-xs">{t.banOrder}:</div>
                  <button
                    className={`px-3 py-1 rounded-lg border text-xs ${banStarterChoice === "PICKER" ? theme.activeGreen : theme.btnBorder}`}
                    onClick={() => {
                      if (!canEditMapStuff) return;
                      const next = banStarterChoice === "PICKER" ? null : "PICKER";
                      setBanStarterChoice(next);
                      if (syncOn) patch({ banStarterChoice: next }); // ★
                    }}
                  >
                    {t.pickFirst}
                  </button>
                  <button
                    className={`px-3 py-1 rounded-lg border text-xs ${banStarterChoice === "OPPONENT" ? theme.activeGreen : theme.btnBorder}`}
                    onClick={() => {
                      if (!canEditMapStuff) return;
                      const next = banStarterChoice === "OPPONENT" ? null : "OPPONENT";
                      setBanStarterChoice(next);
                      if (syncOn) patch({ banStarterChoice: next }); // ★
                    }}
                  >
                    {t.pickSecond}
                  </button>
                  <div className="ml-auto text-xs">
                    {t.timeLeft}: <b>{timer}s</b>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    className={`px-3 py-2 rounded-lg border ${theme.btnBorder}`}
                    onClick={() =>
                      setRun((r) => {
                        const next = !r;
                        popToast(next ? t.play : t.pause);
                        return next;
                      })
                    }
                  >
                    {run ? t.pause : t.play}
                  </button>
                  <button
                    className={`px-3 py-2 rounded-lg border ${theme.btnBorder}`}
                    disabled={!selectedMap || !banStarterChoice || !canEditMapStuff}
                    onClick={() => canEditMapStuff && commitMap()}
                  >
                    {t.confirmMap}
                  </button>
                </div>
              </div>
            )}

            {/* BAN ORDER */}
            {phase === "BAN_ORDER" && (
              <div>
                <div className="text-xs mb-2">
                  {t.chooserRight}: <b>{orderChooser === "A" ? teamName.A : teamName.B}</b>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 rounded-lg border text-xs ${banStarterChoice === "PICKER" ? theme.activeGreen : theme.btnBorder}`}
                    onClick={() => {
                      if (!canEditOrderStuff) return;
                      setBanStarterChoice((v) => (v === "PICKER" ? null : "PICKER"));
                    }}
                  >
                    {t.pickFirst}
                  </button>
                  <button
                    className={`px-3 py-1 rounded-lg border text-xs ${banStarterChoice === "OPPONENT" ? theme.activeGreen : theme.btnBorder}`}
                    onClick={() => {
                      if (!canEditOrderStuff) return;
                      setBanStarterChoice((v) => (v === "OPPONENT" ? null : "OPPONENT"));
                    }}
                  >
                    {t.pickSecond}
                  </button>
                  <div className="ml-auto text-xs">
                    {t.timeLeft}: <b>{timer}s</b>
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    className={`px-3 py-2 rounded-lg border ${theme.btnBorder}`}
                    disabled={!banStarterChoice || !canEditOrderStuff}
                    onClick={() => canEditOrderStuff && confirmBanOrderClick()}
                  >
                    {t.confirm}
                  </button>
                </div>
              </div>
            )}

            {/* HERO BAN */}
            {phase === "HERO_BAN" && (
              <div>
                {/* 상단: 역할 필터 및 턴 정보 */}
                <div className="flex items-center gap-2 mb-2">
                  {(["Tank", "Damage", "Support"] as Role[])
                    .filter((r) => {
                      const lock = roleLock[r];
                      return !lock || lock === turn;
                    })
                    .map((r) => (
                      <button key={r} onClick={() => setFilterRole(r)} className={"px-3 py-1 rounded-full border text-xs " + (filterRole === r ? theme.activeGreen : "border-neutral-300")}>
                        {roleLabel(r)}
                      </button>
                    ))}
                  <div className="ml-auto text-xs">
                    {t.curTurn}: <b>{turn === "A" ? teamName.A : teamName.B}</b> · {t.timeLeft}: <b>{timer}s</b>
                  </div>
                </div>

                {/* 메인: 영웅 그리드 */}
                <div className="mx-auto w-full max-w-[1440px] px-1 sm:px-2">
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(156px,1fr))] md:[grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
                    {HEROES.filter((h) => h.role === filterRole).map((h) => {
                      // 1. 역할군 락 확인 (상대방이 먼저 밴 한 역할군인지)
                      const isLockedRole = roleLock[h.role] && roleLock[h.role] !== turn;
                      
                      // 2. [이번 세트]에 밴 되었는지 확인 (누구든 밴 했으면 선택 불가 + 빨간 줄)
                      const bannedThisSet = bans.A.includes(h.id) || bans.B.includes(h.id);
                      
                      // 3. [과거 세트]에 '현재 턴인 팀'이 밴 했었는지 확인 (중복 밴 불가 + 빨간 줄 X)
                      const bannedByThisTeamBefore = teamBanHistory[turn].has(h.id);
                      
                      // 클릭 비활성화 조건: 
                      // 내 턴 아님 OR 역할 잠김 OR 이번 세트 밴 됨 OR 내가 예전에 밴 했음 OR 이미 밴 카드 씀
                      const disabled = !canBanThisTurn || !!isLockedRole || bannedThisSet || bannedByThisTeamBefore || bans[turn].length >= 1;
                      
                      const selected = pendingBan[turn] === h.id;
                      
                      return (
                        <div
                          key={h.id}
                          onClick={() => {
                            if (disabled) return;
                            setPendingBan((p) => {
                              const next = { ...p, [turn]: p[turn] === h.id ? null : h.id };
                              if (syncOn) patch({ pendingBan: next });
                              return next;
                            });
                          }}
                          className={"cursor-pointer rounded-xl border overflow-hidden " + (disabled ? "opacity-50 border-neutral-200" : selected ? "border-blue-500 ring-2 ring-blue-500/60" : "border-neutral-300")}
                        >
                          <div className="relative w-full aspect-square overflow-hidden">
                            <HeroThumb id={h.id} contain={false} />
                            
                            {/* ★ 중요: 빨간 줄(BanSlashOverlay)은 오직 '이번 세트'에 밴 된 경우에만 표시 */}
                            {/* 과거에 밴 했던 영웅은 위 disabled 로직에 의해 흐려지기만 하고 빨간 줄은 안 뜸 */}
                            {(bannedThisSet) && <BanSlashOverlay />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 하단: 제어 버튼 */}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    className={`px-3 py-2 rounded-lg border ${theme.btnBorder}`}
                    onClick={() =>
                      setRun((r) => {
                        const next = !r;
                        popToast(next ? t.play : t.pause);
                        return next;
                      })
                    }
                  >
                    {run ? t.pause : t.play}
                  </button>
                  <button className={`px-3 py-2 rounded-lg border ${theme.btnBorder}`} disabled={!pendingBan[turn] || !canBanThisTurn} onClick={() => commitBan()}>
                    {t.confirmBan}
                  </button>
                </div>
              </div>
            )}
            
            {/* HERO PICK */}
            {phase === "HERO_PICK" && (
              <div className="h-[calc(100vh-180px)] overflow-hidden md:flex gap-4">
                <aside className="min-w-0 w-full md:w-[260px] lg:w-[300px] h-full pr-2">
                  <PickColumn
                    team="A"
                    teamName={teamName}
                    lang={lang}
                    t={t}
                    btnBorderClass={theme.btnBorder}
                    pickSlots={pickSlots}
                    pickLockedTeam={pickLockedTeam}
                    activeSlot={activeSlot}
                    setActiveSlot={setActiveSlot}
                    confirmPick={confirmPick}
                    canPickForTeam={canPickForTeam}
                    heroById={heroById}
                  />
                </aside>

                <main className="min-w-0 flex-1 h-full overflow-y-auto pr-2">
                  <PickCenter
                    lang={lang}
                    t={t}
                    filterRole={filterRole}
                    teamName={teamName}
                    bannedIds={allBannedThisSet}
                    pickedA={pickSlots.A}
                    pickedB={pickSlots.B}
                    onHeroClick={handleHeroClick}
                  />
                </main>

                <aside className="min-w-0 w-full md:w=[260px] md:w-[260px] lg:w-[300px] h-full">
                  <PickColumn
                    team="B"
                    teamName={teamName}
                    lang={lang}
                    t={t}
                    btnBorderClass={theme.btnBorder}
                    pickSlots={pickSlots}
                    pickLockedTeam={pickLockedTeam}
                    activeSlot={activeSlot}
                    setActiveSlot={setActiveSlot}
                    confirmPick={confirmPick}
                    canPickForTeam={canPickForTeam}
                    heroById={heroById}
                  />
                </aside>
              </div>
            )}
          </section>
        )}
      </main>

      {/* 토스트 */}
      {toast && <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 ${theme.panel} rounded-full px-3 py-1 text-xs shadow-lg`}>{toast}</div>}

      {/* 요약/로그 모달 */}
      {showSummaryOpen && (
        <SummaryLogModal
          teamName={teamName}
          completedSets={completedSets}
          logs={logs}
          tab={summaryTab}
          setTab={setSummaryTab}
          onClose={() => setShowSummaryOpen(false)}
          dark={dark}
          t={t}
          scrimMode={scrimMode}
          onFinishSet={(tm: Team) => {
            finishSet(tm);
            setShowSummaryOpen(false);
          }}
          onFinishSetA={(resultA, aScore, bScore) => {
            finishSetA(resultA, aScore, bScore);
            setShowSummaryOpen(false);
          }}
          seriesDone={seriesDone}
          onExitSeries={resetToHome}
          canEditWinner={canEditWinner}
        />
      )}

      {/* 스크림 모드 전용 '다음 세트 설정' 모달 */}
      <BetweenSetModal
        open={betweenOpen}
        onClose={() => setBetweenOpen(false)}
        defaultMapPicker={completedSets.length ? (completedSets[completedSets.length - 1].mapPicker === "A" ? "B" : "A") : "A"}
        defaultBanFirst={completedSets.length ? (completedSets[completedSets.length - 1].banFirst === "A" ? "B" : "A") : "A"}
        teamName={teamName}
        dark={dark}
        onConfirm={(mp, bf) => {
          const choice: "PICKER" | "OPPONENT" = bf === mp ? "PICKER" : "OPPONENT";

          // 다음 세트 초기화
          setSelectedMap(null);
          setBanStarterChoice(null);
          setAttackOrDefense(null); // ‼️ 초기화 추가
          setRoleLock({});
          setPendingBan({ A: null, B: null });
          setBans({ A: [], B: [] });
          setPickSlots({ A: [null, null, null, null, null], B: [null, null, null, null, null] });
          setActiveSlot({ A: 0, B: 0 });
          setPickLockedTeam({ A: false, B: false });
          setPickLocked(false);
          setWinnerThisSet(null);

          // 권리 지정
          setMapPicker(mp);
          setOrderChooser(mp);
          setBanStarterChoice(choice);
          setTurn(mp);
          setPhase(mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK");
          setRun(true);

          if (syncOn) {
            patch({
              selectedMap: null,
              bans: { A: [], B: [] },
              pickSlots: { A: [null, null, null, null, null], B: [null, null, null, null, null] },
              activeSlot: { A: 0, B: 0 },
              pickLockedTeam: { A: false, B: false },
              pickLocked: false,
              roleLock: {},
              pendingBan: { A: null, B: null },
              attackOrDefense: null, // ‼️ 초기화 추가
              mapPicker: mp,
              orderChooser: mp,
              banStarterChoice: choice,
              turn: mp,
              phase: mode === MODE.HERO_BAN_ONLY ? "BAN_ORDER" : "MAP_PICK",
              run: true,
            });
          }

          setBetweenOpen(false);
        }}
      />

      {/* ‼️ 선공/선수비 모달 렌더링 수정 ‼️ */}
      <AttackDefenseModal
        open={showSideModal}
        onClose={() => setShowSideModal(false)}
        onConfirm={(side) => {
          setAttackOrDefense(side); // 선택한 사이드 저장
          proceedToBanPhase(side); // 밴 페이즈로 진행
          setShowSideModal(false); // 모달 닫기
        }}
        dark={dark}
        // ‼️ teamName과 chooserTeam prop 제거 ‼️
      />

      {/* 스크림 모드 전용 '종료' 모달 */}
      {showScrimSummary && (
        <ScrimSummaryModal
          open={showScrimSummary}
          onClose={() => setShowScrimSummary(false)}
          sets={frozenSummarySets}
          teamName={teamName}
          dark={dark}
          setScrimActive={setScrimActive}
          syncOn={syncOn}
          myRole={myRole}
          patch={patch}
          onExitSeries={resetToHome}
          scrimTime={scrimTime}
        />
      )}
    </div>
  );
}

/* ================= Setup ================= */
function Setup(props: {
  teamName: Record<Team, string>;
  setTeamName: React.Dispatch<React.SetStateAction<Record<Team, string>>>;
  sets: number;
  setSets: (v: number) => void;
  mode: number;
  setMode: (v: number) => void;
  partMode: PartMode;
  setPartMode: (v: PartMode) => void;
  myRole: MyRole;
  setMyRole: (v: MyRole) => void;
  initialPicker: "AUTO" | Team;
  setInitialPicker: (v: "AUTO" | Team) => void;
  onStart: () => void;
  dark: boolean;
  t: I18n;
  joinUrl?: string;
  readyA: boolean;
  readyB: boolean;
  setReadyA: React.Dispatch<React.SetStateAction<boolean>>;
  setReadyB: React.Dispatch<React.SetStateAction<boolean>>;
  scrimMode: boolean;
  setScrimMode: (v: boolean) => void;
  scrimTime: string;
  setScrimTime: (v: string) => void;
}) {
  const canEditGlobal = props.partMode === "SOLO" || props.myRole === "HOST" || props.scrimMode;
  const canEditAName = props.partMode === "SOLO" || props.myRole === "HOST" || props.myRole === "A" || props.scrimMode;
  const canEditBName = props.partMode === "SOLO" || props.myRole === "B" || props.scrimMode;

  const { t, dark } = props;

  // 1. scrimMode가 true이면 "SCRIM", 아니면 partMode 값으로 현재 모드를 결정
  const currentCombinedMode = props.scrimMode ? "SCRIM" : props.partMode;

  // 2. 드롭다운 변경 시 scrimMode와 partMode를 동시에 업데이트하는 핸들러
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "SCRIM") {
      props.setScrimMode(true);
      props.setPartMode("SOLO"); // 스크림 모드는 SOLO 기반으로 설정
    } else if (value === "COACH_1V1") {
      props.setScrimMode(false);
      props.setPartMode("COACH_1V1");
    } else {
      // "SOLO"
      props.setScrimMode(false);
      props.setPartMode("SOLO");
    }
  };

  const fieldStyle = `w-full px-3 py-2 rounded-lg border ${dark ? "border-neutral-700 bg-neutral-900 text-white" : "border-neutral-300 bg-white text-neutral-900"}`;
  const boxStyle = `${dark ? "bg-neutral-800 border-neutral-700" : "bg-white border-neutral-200"} max-w-xl mx-auto border rounded-2xl p-6`;

  const guestLink = props.joinUrl ?? "";
  const hostLink = React.useMemo(() => {
    if (!props.joinUrl) return "";
    try {
      const u = new URL(props.joinUrl);
      u.searchParams.set("role", "HOST");
      return u.toString();
    } catch {
      return props.joinUrl;
    }
  }, [props.joinUrl]);

  const showBothLinks = props.myRole === "HOST" || props.myRole === "A";
  const canToggleA = props.myRole === "HOST" || props.myRole === "A";
  const canToggleB = props.myRole === "B";

  return (
    <div className={boxStyle}>
      <div className="text-base font-semibold mb-4">{t.startSettings}</div>

      <div className="grid gap-3">
        <label className="text-xs">{t.teamAName}</label>
        <input className={fieldStyle} value={props.teamName.A} onChange={(e) => props.setTeamName((p) => ({ ...p, A: e.target.value }))} disabled={!canEditAName} />
        <label className="text-xs">{t.teamBName}</label>
        <input className={fieldStyle} value={props.teamName.B} onChange={(e) => props.setTeamName((p) => ({ ...p, B: e.target.value }))} disabled={!canEditBName} />
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <div className="text-xs mb-1">{t.participation}</div>
          <select className={fieldStyle} value={currentCombinedMode} onChange={handleModeChange} disabled={!canEditGlobal}>
            <option value="SOLO">{t.solo}</option>
            {/* 대전 모드(1v1)는 이번 통합 단계에서 숨김 — 멀티플레이어 스텁 상태 */}
            <option value="SCRIM">{t.scrim}</option>
          </select>
        </div>
        <div>
          <div className="text-xs mb-1">{t.format}</div>
          <select className={fieldStyle} value={props.sets} onChange={(e) => props.setSets(Number(e.target.value))} disabled={!canEditGlobal}>
            <option value={3}>BO3</option>
            <option value={5}>BO5</option>
            <option value={7}>BO7</option>
          </select>
        </div>
      </div>

      {/* ‼️ "스크림 시간" 입력창 (텍스트 수정) ‼️ */}
      {props.scrimMode && (
        <div className="grid gap-3 mt-3">
          <div className="text-xs">스크림 시작 시간 (HH / 24h)</div>
          <input
            className={fieldStyle}
            value={props.scrimTime}
            onChange={(e) => props.setScrimTime(e.target.value)}
            disabled={!canEditGlobal}
            placeholder="HH (예: 16)"
          />
        </div>
      )}

      <div className="grid gap-3 mt-3">
        <div className="text-xs">{t.modeRange}</div>
        <select className={fieldStyle} value={props.mode} onChange={(e) => props.setMode(Number(e.target.value))} disabled={!canEditGlobal}>
          <option value={MODE.HERO_BAN_ONLY}>{t.mode1}</option>
          <option value={MODE.HERO_BAN_WITH_MAP}>{t.mode2}</option>
          <option value={MODE.FULL}>{t.mode3}</option>
        </select>
      </div>

      <>
        <div className="text-xs mt-3">{t.firstPicker}</div>
        <div className="flex gap-2 mt-1">
          <button
            className={`px-3 py-1 rounded-lg border ${props.initialPicker === "AUTO" ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300"}`}
            onClick={() => props.setInitialPicker("AUTO")}
            disabled={!canEditGlobal}
          >
            {t.random}
          </button>
          <button
            className={`px-3 py-1 rounded-lg border ${props.initialPicker === "A" ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300"}`}
            onClick={() => props.setInitialPicker("A")}
            disabled={!canEditGlobal}
          >
            A
          </button>
          <button
            className={`px-3 py-1 rounded-lg border ${props.initialPicker === "B" ? "border-emerald-500 ring-2 ring-emerald-500/60" : "border-neutral-300"}`}
            onClick={() => props.setInitialPicker("B")}
            disabled={!canEditGlobal}
          >
            B
          </button>
        </div>
      </>

      {props.partMode === "COACH_1V1" && (
        <>
          <div className="mt-4">
            <div className="text-xs font-semibold mb-2">로비 링크</div>
            <div className="grid gap-3">
              {showBothLinks && (
                <div>
                  <div className="text-xs mb-1">A 코치(호스트) 링크</div>
                  <div className="flex gap-2">
                    <input className={fieldStyle} value={hostLink} readOnly />
                    <button
                      type="button"
                      className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`}
                      onClick={() => navigator.clipboard.writeText(hostLink)}
                      disabled={!hostLink}
                    >
                      복사
                    </button>
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs mb-1">B 코치 초대 링크</div>
                <div className="flex gap-2">
                  <input className={fieldStyle} value={guestLink} readOnly />
                  <button
                    type="button"
                    className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"}`}
                    onClick={() => navigator.clipboard.writeText(guestLink)}
                    disabled={!guestLink}
                  >
                    복사
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Ready 버튼 */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"} ${props.readyA ? "ring-2 ring-emerald-500/60" : ""}`}
              onClick={() => canToggleA && props.setReadyA((v) => !v)}
              disabled={!canToggleA}
              title={canToggleA ? "" : "A팀 코치만 변경 가능"}
            >
              A 팀 READY: {props.readyA ? "ON" : "OFF"}
            </button>
            <button
              type="button"
              className={`px-3 py-2 rounded-lg border ${dark ? "border-neutral-700" : "border-neutral-300"} ${props.readyB ? "ring-2 ring-emerald-500/60" : ""}`}
              onClick={() => canToggleB && props.setReadyB((v) => !v)}
              disabled={!canToggleB}
              title={canToggleB ? "" : "B팀 코치만 변경 가능"}
            >
              B 팀 READY: {props.readyB ? "ON" : "OFF"}
            </button>
          </div>
        </>
      )}

      <button
        className={`w-full mt-4 px-4 py-3 rounded-xl border ${
          dark ? "border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-white" : "border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-900"
        }`}
        onClick={props.onStart}
        disabled={props.partMode === "COACH_1V1" && !(props.readyA && props.readyB)}
        title={props.partMode === "COACH_1V1" && !(props.readyA && props.readyB) ? "양 팀 READY 필요" : ""}
      >
        {t.start}
      </button>
    </div>
  );
}

/* 중앙 픽 그리드 */
type PickCenterProps = {
  lang: Lang;
  t: I18n;
  filterRole: Role;
  teamName: Record<Team, string>;
  bannedIds: string[];
  pickedA: (string | null)[];
  pickedB: (string | null)[];
  onHeroClick: (id: string) => void;
};
const PickCenter = React.memo(function PickCenter({ lang, t, filterRole, teamName, bannedIds, pickedA, pickedB, onHeroClick }: PickCenterProps) {
  return (
    <div className="w-full grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(168px,1fr))]">
      {HEROES.filter((h) => h.role === filterRole).map((h) => {
        const pickedAFlag = pickedA.includes(h.id);
        const pickedBFlag = pickedB.includes(h.id);
        const banned = bannedIds.includes(h.id);
        const borderClass = banned
          ? "border-neutral-200 opacity-50"
          : pickedAFlag && pickedBFlag
          ? "border-fuchsia-500 ring-2 ring-fuchsia-500/60"
          : pickedAFlag
          ? "border-blue-600 ring-2 ring-blue-600/60"
          : pickedBFlag
          ? "border-rose-600 ring-2 ring-rose-600/60"
          : "border-neutral-300";
        const nameLen = h.name?.length;
        const nameClass = nameLen <= 6 ? "text-[13px]" : nameLen <= 9 ? "text-[12px]" : "text-[11px]";
        return (
          <div key={h.id} onClick={() => onHeroClick(h.id)} className={["rounded-xl border overflow-hidden cursor-pointer flex flex-col", borderClass].join(" ")}>
            <div className="relative w-full aspect-square overflow-hidden">
              <HeroThumb id={h.id} contain={false} />
              {banned && <BanSlashOverlay />}
              <div className="absolute bottom-1 right-1 flex gap-1 z-30">
                {pickedAFlag && <span className="px-2 py-0.5 rounded-full bg-blue-600/80 text-[10px] text-white">{teamName.A}</span>}
                {pickedBFlag && <span className="px-2 py-0.5 rounded-full bg-rose-600/80 text-[10px] text-white">{teamName.B}</span>}
                {banned && <span className="px-2 py-0.5 rounded-full bg-red-600/80 text-[10px] text-white">{t.banned}</span>}
              </div>
            </div>
            <div className={["px-3 py-1 font-medium flex items-center gap-2 overflow-hidden", nameClass].join(" ")}>
              <RoleBadge role={h.role} lang={lang} className="shrink-0" />
              <span className="truncate leading-tight">{h.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});