// src/LanguageContext.jsx
import React, { createContext, useState, useContext } from 'react';

const LanguageContext = createContext();

export const translations = {
  ko: {
    back: "뒤로", loading: "데이터 로딩 중...", noData: "데이터가 없습니다.", add: "추가",
    dashboard: "대시보드", sessions: "스크림 세션", overall: "전체 통계", teamManage: "팀 관리 (준비중)",
    title: "스크림 데이터 센터", desc: "오버워치 스크림 로그를 업로드하여 팀의 퍼포먼스를 분석하세요.", desc2: "데이터는 서버에 안전하게 저장됩니다.",
    createScrim: "스크림 생성하기", viewHistory: "기록 보기", uploading: "업로드 중...",
    modalTitle: "스크림 기록 생성", step1Title: "기본 정보 입력", step1Desc: "스크림 날짜와 시간을 입력해주세요.",
    scrimName: "스크림 이름", scrimNamePlace: "예: 2024-05-20 vs T1 스크림", videoUrl: "유튜브 전체 영상 링크",
    date: "날짜", time: "시간", next: "다음: 경기 입력하기", prev: "이전", save: "저장 및 완료", success: "스크림 저장 완료!",
    backToList: "목록으로 돌아가기", totalDuration: "총 경기 시간", roundScore: "라운드 스코어",
    finalBlows: "최종 타격", fightWins: "전투 승리", ultEconomy: "궁극기 효율", lowerBetter: "낮을수록 좋음",
    lead: "우세", draw: "무승부", win: "승리", tabStats: "스텟", tabKillLog: "킬 로그", tabChart: "차트",
    tabEvent: "이벤트", tabPlayer: "플레이어 통계", totalCumulative: "전체 (누적)", round: "라운드",
    fightSurvivors: "한타별 생존 인원", survivors: "명 생존", duration: "지속", avgSurvivors: "평균 생존",
    firstBloodAnalysis: "선취점 분석 승률", standard: "기준", situation: "상황", fightCount: "전투 횟수",
    winRate: "승률", fbSecured: "선취점 획득 시", fbSuffered: "선취점 허용 시", ultsPerFight: "한타 당 궁극기 사용",
    fbByRole: "역할별 결정타", cumulativeDmg: "라운드별 누적 영웅 피해", dmgEfficiency: "딜링 효율성 분석",
    heroDmgDealt: "가한 영웅 피해", battery: "딜만 넣는 배터리 (비효율)", carry: "캐리 (딜+킬)", role: "역할",
    player: "플레이어", team: "팀", playTime: "시간", elims: "처치", deaths: "죽음", assists: "지원",
    heroDmg: "영웅 딜", barrierDmg: "방벽 딜", healRcvd: "받은 힐", dhRatio: "딜:힐 비", healing: "준 힐",
    dmgTaken: "받은 딜", ults: "궁극기", fight: "전투", noEvents: "이벤트 없음", noUlts: "궁극기 사용 기록 없음",
    events: "이벤트", ultimatesUsed: "사용된 궁극기", pickRate: "점유율", soloKills: "단독 처치", ultUsage: "궁극기 사용",
    per10: "/ 10분", tank: "탱크", dps: "딜러", support: "지원",
    filterPlaceholder: "필터 입력 (예: 리장 타워, 우양, 루시우, 승리 ...)", filterTip: "선수 이름, 맵, 영웅 등을 입력하여 상세 분석을 해보세요.",
    searchedGames: "검색된 경기", avgWinRate: "평균 승률", avgKills: "평균 처치", avgDeaths: "평균 데스", avgDmg: "평균 딜량",
    tabHighlights: "하이라이트 & 요약", tabHeroes: "영웅별 통계", tabMaps: "맵별 통계", highlights: "하이라이트",
    noMoments: "조건에 맞는 장면이 없습니다.", heroStatsTitle: "영웅별 성적 (필터 기준)", mapStatsTitle: "맵별 통계",
    hero: "영웅", gamesPlayed: "게임 수", kda: "KDA",
    dateFilter: "기간 설정", startDate: "시작일", endDate: "종료일", allDates: "전체 기간",
    ultStatsTitle: "궁극기 가치 및 한타 분석", ultCountVsWin: "팀 궁극기 투자 개수 대비 한타 승률", ultEfficiency: "영웅별 궁극기 가치 (한타 승률 순)",
    ultUses: "사용 횟수",
    baseTeam: "기준 팀", allTeams: "전체 팀",
    matchStart: "경기 시작 시점", matchEnd: "경기 종료 시점",
    matchStartTip: "영상에서 전투 시작(카운트다운 끝) 시점"
  },
  en: {
    back: "Back", loading: "Loading data...", noData: "No data available.", add: "Add",
    dashboard: "Dashboard", sessions: "Sessions", overall: "Overall Stats", teamManage: "Team Manage (WIP)",
    title: "Scrim Data Center", desc: "Upload Overwatch scrim logs to analyze team performance.", desc2: "Data is safely stored on the server.",
    createScrim: "Create Scrim", viewHistory: "View History", uploading: "Uploading...",
    modalTitle: "Create Scrim Record", step1Title: "Basic Information", step1Desc: "Please enter the scrim date and time.",
    scrimName: "Scrim Name", scrimNamePlace: "ex: 2024-05-20 vs T1 Scrim", videoUrl: "Video URL",
    date: "Date", time: "Time", next: "Next", prev: "Prev", save: "Save", success: "Scrim saved successfully!",
    backToList: "Back to List", totalDuration: "Total Duration", roundScore: "Round Score",
    finalBlows: "Final Blows", fightWins: "Fight Wins", ultEconomy: "Ult Economy", lowerBetter: "Lower is better",
    lead: "Lead", draw: "Draw", win: "Win", tabStats: "Stats", tabKillLog: "Kill Log", tabChart: "Charts",
    tabEvent: "Events", tabPlayer: "Player Stats", totalCumulative: "Total (Cumulative)", round: "Round",
    fightSurvivors: "Survivors per Fight", survivors: "Alive", duration: "Dur", avgSurvivors: "Avg Survivors",
    firstBloodAnalysis: "First Blood Analysis", standard: "Perspective", situation: "Situation", fightCount: "Fights",
    winRate: "Win Rate", fbSecured: "First Kill Secured", fbSuffered: "First Death Suffered", ultsPerFight: "Ults per Fight",
    fbByRole: "Final Blows by Role", cumulativeDmg: "Cumulative Dmg by Round", dmgEfficiency: "Damage Efficiency",
    heroDmgDealt: "Hero Damage Dealt", battery: "Trash Damage", carry: "Carry", role: "Role",
    player: "Player", team: "Team", playTime: "Time", elims: "Elims", deaths: "Deaths", assists: "Assists",
    heroDmg: "Hero Dmg", barrierDmg: "Barrier Dmg", healRcvd: "Heal Rcvd", dhRatio: "D/H Ratio", healing: "Healing",
    dmgTaken: "Dmg Taken", ults: "Ults", fight: "Fight", noEvents: "No events.", noUlts: "No ultimates recorded.",
    events: "Events", ultimatesUsed: "Ultimates Used", pickRate: "Pick Rate", soloKills: "Solo Kills", ultUsage: "Ultimates Used",
    per10: "/ 10m", tank: "Tank", dps: "DPS", support: "Support",
    filterPlaceholder: "Filter (ex: Lijiang, Lucio, Win...)", filterTip: "Use filters (Player, Map, Hero) for detailed analysis.",
    searchedGames: "Searched Games", avgWinRate: "Avg Win Rate", avgKills: "Avg Kills", avgDeaths: "Avg Deaths", avgDmg: "Avg Dmg",
    tabHighlights: "Highlights & Summary", tabHeroes: "Hero Stats", tabMaps: "Map Stats", highlights: "Highlights",
    noMoments: "No moments found matching conditions.", heroStatsTitle: "Hero Stats (Filtered)", mapStatsTitle: "Map Stats",
    hero: "Hero", gamesPlayed: "Games", kda: "KDA",
    dateFilter: "Date Range", startDate: "Start Date", endDate: "End Date", allDates: "All Time",
    ultStatsTitle: "Ultimate Value & Fight Analysis", ultCountVsWin: "Fight Win Rate by Ult Count", ultEfficiency: "Ultimate Efficiency (by Win Rate)",
    ultUses: "Uses",
    baseTeam: "Base Team", allTeams: "All Teams",
    matchStart: "Game Start Time", matchEnd: "Game End Time",
    matchStartTip: "Video timestamp when countdown ends (setup_complete)"
  }
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('ko');
  const toggleLanguage = () => setLanguage(prev => prev === 'ko' ? 'en' : 'ko');
  const t = translations[language];

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);