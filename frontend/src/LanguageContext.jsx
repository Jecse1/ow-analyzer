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
    matchStartTip: "영상에서 전투 시작(카운트다운 끝) 시점",
    navUltimateStats: "궁극기 통계", navFirstKill: "퍼킬 통계", navFirstDeath: "퍼뎃 통계", navPersonal: "개인 통계",
    // FirstKillStats
    fkTitle: "퍼킬 분석", fkDesc: "한타를 터뜨리는 캐리력과 주력 희생양, 사용 스킬을 상세히 분석합니다.",
    allPositions: "전체 포지션", matchup: "특정 매치업:", myTeamAll: "우리 팀 (전체)", enemyTeamAll: "상대 팀 (전체)",
    position: "포지션", fkColFights: "한타 횟수", fkColCount: "퍼킬 횟수", fkColRate: "퍼킬 비율 (%)",
    timesUnit: "회", fkTopVictims: "주요 희생양 (Player)", fkTopHeroes: "집중 공략 영웅 (Hero)", fkKillSkill: "결정타 스킬 (누구에게 적중?)",
    noFilteredData: "조건에 맞는 데이터가 없습니다.",
    // FirstDeathStats
    fdTitle: "퍼뎃 분석", fdDesc: "선수들의 생존 능력과, 주로 누구에게/어떤 스킬에 먼저 죽었는지를 상세히 분석합니다.",
    fdColCount: "퍼뎃 횟수", fdColRate: "퍼뎃 비율 (%)",
    fdNemesis: "천적 (Player)", fdWatchHeroes: "경계 대상 영웅 (Hero)", fdDeadlySkill: "치명적 스킬 (누구의 스킬을 맞았는가)",
    // PlayerProfileView
    all: "전체", ppNoPlayers: "집계된 선수 데이터가 없습니다.", ppRosterTitle: "선수단 목록", ppSearchPlaceholder: "선수 검색...",
    ppOverallKd: "종합 K/D", ppDmgPer10: "10분당 딜량", ppHealPer10: "10분당 힐량", ppUltPerMatch: "경기당 궁극기",
    ppHeroPool: "모스트 영웅 풀", ppNoHeroes: "영웅 플레이 기록이 없습니다.", ppRecentForm: "최근 K/D 폼 (Form)",
    ppSelectPrompt: "왼쪽 목록에서 선수를 선택해주세요.",
    // MatchStats
    msNoFights: "기록된 전투(킬)가 없습니다.", msUltEffWin: "효율적 승리 (덜 씀)", msUltSaveLoss: "궁 아끼다 패배", msUltOverInvest: "과투자 (2개 이상 초과)",
    msLostFightTitle: "패배 한타 저항력 (Kill Exchange in Lost Fights)", msAvgKillRateOnLoss: "패배 시 평균 적 처치율",
    msAvgWord: "평균 ", msKillsUnit: "명 처치", msLossUnit: "회 패배", msResistKills: "저항 킬 수",
    msMomentumTitle: "한타 모멘텀 (연속 승률 및 턴 뒤집기)", msWinRateAfterWin: "자리 먹었을 때 승률", msWinToWin: "(승리 ➔ 승리)", msSnowball: "유리함을 굳히는 능력",
    msWinRateAfterLoss: "자리 못 먹었을 때 승률", msLossToWin: "(패배 ➔ 승리)", msComeback: "턴을 뒤집는 능력",
    msFirstDeathAnalysis: "선취점 획득 및 개인별 데스 분석 (First Deaths)", msFirstKillCountTeam: "선취점 획득 횟수 (팀)", msFirstDeathRank: "퍼스트 데스 순위",
    msPlayerHero: "선수 (Hero)", msFirstBloodDeaths: "퍼블 데스", msDeathCause: "주요 데스 원인 (누구의 스킬을 맞았는가)", msNoDataShort: "데이터 없음",
    msUltSummary: "궁극기 종합 (Ultimates)", msTotalUlts: "총 궁극기 사용 횟수 (Total Ultimates Used)", msFirstUltInFight: "한타 첫 궁극기 사용 (Used Ult First in Fight)", msUltTiming: "궁극기 사용 타이밍 (Timing)",
    msPhaseEarly: "초반 (진입)", msPhaseMid: "중반", msPhaseLate: "후반", msUltExchange: "궁극기 교환비 및 과투자 (Ult Exchange)",
    msAvgConsumed: "평균 소모", msWonFight: "승리한 한타:", msLostFightLabel: "패배한 한타:", msCountUnit: "개",
    msNoVideo: "해당 경기는 영상 기록이 없습니다", msTabStats: "스텟표", msTabKill: "킬 로그", msTabChart: "상세 분석 차트", msTabTimeline: "타임라인", msTabCompare: "선수 비교",
    // Common (buttons / delete dialogs)
    delete: "삭제", reset: "초기화", cancelSelection: "선택 취소", selectAll: "전체 선택", deselectAll: "전체 해제",
    selectedCount: "선택됨", deleting: "삭제 중...", deleteSelected: "선택 삭제", deleteConfirmPre: "선택한 ",
    sdIrreversible: "이 작업은 되돌릴 수 없습니다.", sdDeleteDone: "삭제 완료", sdWarnings: "경고:",
    sdPartialFail: "일부 삭제 실패: ", sdDeleteFail: "삭제 실패: ", sdDeleteMatchPost: "개 매치를 삭제하시겠습니까?",
    ssDeleteSessionMid: "개 세션을 삭제하시겠습니까?\n이 세션에 포함된 총 ", ssDeleteSessionPost: "개의 매치도 함께 삭제됩니다.",
    ssRebuildConfirm: "DB를 복구하시겠습니까? (Rebuild DB?)",
    // ScrimModal
    smCloseConfirm: "입력 중인 내용이 사라집니다. 정말 닫으시겠습니까?", smEnterName: "스크림 이름을 입력해주세요.", smMinOneMatch: "최소 1개의 경기를 기록해주세요.",
    smMatchPre: "", smMatchPost: "번 경기: ", smPauseSelectedWarn: "'퍼즈 있음'을 선택하셨습니다. 퍼즈 구간을 추가하거나 '아니오'를 선택해주세요.",
    smPauseTimeWarn: "퍼즈 시작/종료 시간을 모두 입력해주세요. (예: 10:00)", smYoutubeLink: "유튜브 영상 링크", smOptional: "(선택)",
    smTeam1Label: "1팀 이름 (왼쪽)", smTeam2Label: "2팀 이름 (오른쪽)", smStartPlaceholder: "예: 03:30 (전투 시작)",
    // UltimateStats
    ultFivePlus: "5개 이상", ultTotal: "총합", ultValue: "가치",
    // OverallStats
    osAnalysis: "분석", osTabFights: "한타 통계", osWinBadge: "승", osLossBadge: "패", osAllAvg: "전체 평균",
    osNoMatchDataPre: "", osNoMatchDataPost: "의 경기 데이터가 없습니다", osNoFightData: "분석할 한타 데이터가 없습니다",
    osLostFightsSuffix: "회 패배 한타", osResistDescPre: "패배한 한타에서 상대를 ", osResistDescMid: "명 처치 → ", osResistDescPost: "% 처치율. 값이 높을수록 지면서도 교환을 잘 함.",
    osFirstDeathTop3: "퍼스트 데스 TOP 3", osFirstDeathLabel: "퍼스트 데스", osLostFightCarryTop3: "패배 한타 캐리 TOP 3", osNoMin10: "최소 10회 이상 참여 선수 없음",
    osKillsPerFight: "킬/한타", osTotalWord: "총 ", osKillUnit: "킬", osMin10Note: "* 최소 10회 이상 패배 한타 참여 기준",
    osMomentumNotePre: "* 매치 경계를 넘지 않음 · Draw 한타 제외 · 대상 매치: ", osMomentumNotePost: "경기", osEliminated: "사망", osKill: "킬"
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
    matchStartTip: "Video timestamp when countdown ends (setup_complete)",
    navUltimateStats: "Ultimate Stats", navFirstKill: "First Kill Stats", navFirstDeath: "First Death Stats", navPersonal: "Personal Stats",
    // FirstKillStats
    fkTitle: "First Kill Stats", fkDesc: "Detailed breakdown of fight-opening carry potential, top victims, and abilities used.",
    allPositions: "All Roles", matchup: "Matchup:", myTeamAll: "My Team (All)", enemyTeamAll: "Enemy Team (All)",
    position: "Role", fkColFights: "Teamfights", fkColCount: "First Kills", fkColRate: "First Kill %",
    timesUnit: "", fkTopVictims: "Top Victims (Player)", fkTopHeroes: "Targeted Heroes (Hero)", fkKillSkill: "Finishing Ability (on whom?)",
    noFilteredData: "No data matches the filter.",
    // FirstDeathStats
    fdTitle: "First Death Stats", fdDesc: "Detailed analysis of player survivability and who/what ability they died to first.",
    fdColCount: "First Deaths", fdColRate: "First Death %",
    fdNemesis: "Nemesis (Player)", fdWatchHeroes: "Threat Heroes (Hero)", fdDeadlySkill: "Deadly Ability (hit by whom)",
    // PlayerProfileView
    all: "All", ppNoPlayers: "No player data available.", ppRosterTitle: "Roster", ppSearchPlaceholder: "Search player...",
    ppOverallKd: "Overall K/D", ppDmgPer10: "Damage / 10min", ppHealPer10: "Healing / 10min", ppUltPerMatch: "Ults / Match",
    ppHeroPool: "Most Played Heroes", ppNoHeroes: "No hero play records.", ppRecentForm: "Recent K/D Form",
    ppSelectPrompt: "Select a player from the list on the left.",
    // MatchStats
    msNoFights: "No recorded fights (kills).", msUltEffWin: "Efficient Win (fewer ults)", msUltSaveLoss: "Lost While Saving Ults", msUltOverInvest: "Over-Investment (2+ excess)",
    msLostFightTitle: "Resistance in Lost Fights (Kill Exchange)", msAvgKillRateOnLoss: "Avg Enemy Kill Rate on Loss",
    msAvgWord: "avg ", msKillsUnit: " kills", msLossUnit: " losses", msResistKills: "Resist Kills",
    msMomentumTitle: "Teamfight Momentum (Streaks & Turnovers)", msWinRateAfterWin: "Win Rate After Winning", msWinToWin: "(Win ➔ Win)", msSnowball: "Snowballing ability",
    msWinRateAfterLoss: "Win Rate After Losing", msLossToWin: "(Loss ➔ Win)", msComeback: "Comeback ability",
    msFirstDeathAnalysis: "First Kills & Individual Death Analysis", msFirstKillCountTeam: "First Kills (Team)", msFirstDeathRank: "First Death Ranking",
    msPlayerHero: "Player (Hero)", msFirstBloodDeaths: "First Deaths", msDeathCause: "Main Death Causes (hit by whose ability)", msNoDataShort: "No data",
    msUltSummary: "Ultimate Summary", msTotalUlts: "Total Ultimates Used", msFirstUltInFight: "Used Ult First in Fight", msUltTiming: "Ultimate Timing",
    msPhaseEarly: "Early (Initiation)", msPhaseMid: "Midfight", msPhaseLate: "Late", msUltExchange: "Ult Exchange & Over-Investment",
    msAvgConsumed: "Avg Consumed", msWonFight: "Won fights:", msLostFightLabel: "Lost fights:", msCountUnit: "",
    msNoVideo: "No video record for this match", msTabStats: "Stats Table", msTabKill: "Kill Log", msTabChart: "Analysis Charts", msTabTimeline: "Timeline", msTabCompare: "Player Comparison",
    // Common (buttons / delete dialogs)
    delete: "Delete", reset: "Reset", cancelSelection: "Cancel", selectAll: "Select All", deselectAll: "Deselect All",
    selectedCount: "selected", deleting: "Deleting...", deleteSelected: "Delete Selected", deleteConfirmPre: "Delete ",
    sdIrreversible: "This action cannot be undone.", sdDeleteDone: "Deleted", sdWarnings: "Warnings:",
    sdPartialFail: "Partial delete failure: ", sdDeleteFail: "Delete failed: ", sdDeleteMatchPost: " selected matches?",
    ssDeleteSessionMid: " selected sessions?\nThis will also delete a total of ", ssDeleteSessionPost: " included matches.",
    ssRebuildConfirm: "Rebuild DB?",
    // ScrimModal
    smCloseConfirm: "Your input will be lost. Close anyway?", smEnterName: "Please enter a scrim name.", smMinOneMatch: "Please record at least one match.",
    smMatchPre: "Match ", smMatchPost: ": ", smPauseSelectedWarn: "You selected 'Has Pause'. Add a pause range or select 'No'.",
    smPauseTimeWarn: "Enter both pause start/end times. (ex: 10:00)", smYoutubeLink: "YouTube Video Link", smOptional: "(Optional)",
    smTeam1Label: "Team 1 Name (Left)", smTeam2Label: "Team 2 Name (Right)", smStartPlaceholder: "ex: 03:30 (fight start)",
    // UltimateStats
    ultFivePlus: "5+", ultTotal: "Total", ultValue: "Value",
    // OverallStats
    osAnalysis: "Analysis", osTabFights: "Teamfight Stats", osWinBadge: "Win", osLossBadge: "Loss", osAllAvg: "All Avg",
    osNoMatchDataPre: "No match data for ", osNoMatchDataPost: "", osNoFightData: "No teamfight data to analyze",
    osLostFightsSuffix: " lost fights", osResistDescPre: "Eliminated ", osResistDescMid: " enemies in lost fights → ", osResistDescPost: "% kill rate. Higher means better trades even in losses.",
    osFirstDeathTop3: "First Death TOP 3", osFirstDeathLabel: "First Death", osLostFightCarryTop3: "Lost Fight Carry TOP 3", osNoMin10: "No players with 10+ participations",
    osKillsPerFight: "kills/fight", osTotalWord: "", osKillUnit: " kills", osMin10Note: "* Based on 10+ lost fight participations",
    osMomentumNotePre: "* No match-boundary crossing · Draw fights excluded · Matches: ", osMomentumNotePost: " games", osEliminated: "eliminated", osKill: "kill"
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