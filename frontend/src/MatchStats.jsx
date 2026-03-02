import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Clock, ChevronLeft, Trophy, Zap, Crosshair, Sword, List, BarChart2, Skull, Activity, Target, PlayCircle, User, ChevronDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, AreaChart, Area, ComposedChart, ScatterChart, Scatter, ZAxis, Brush, Cell, ReferenceArea, ReferenceLine
} from 'recharts';

import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

// --- 색상 및 상수 ---
const COLOR_TEAM1 = '#60a5fa'; 
const COLOR_TEAM2 = '#f87171'; 
const NEON_GREEN = '#39FF14'; 

// [헬퍼] 이름 정규화
const normalizeName = (name) => (name ? name.trim() : "");

// 💡 [핵심 버그 수정] 어떤 팀 이름(T1, O2 등 숫자가 포함된 이름)이 들어와도 정확히 매칭되도록 로직 수정
const checkIsTeam1 = (teamName, t1Name) => {
    if (!teamName) return false;
    if (teamName === t1Name) return true;
    // 과거 데이터(팀명 입력 안 한 옛날 스크림) 호환용
    return teamName === '1팀' || teamName === 'Team 1';
};

const checkIsTeam2 = (teamName, t2Name) => {
    if (!teamName) return false;
    if (teamName === t2Name) return true;
    // 과거 데이터 호환용
    return teamName === '2팀' || teamName === 'Team 2';
};

const resolveTeamColor = (teamName, t1Name, t2Name) => {
    if (!teamName) return '#9ca3af'; 
    if (checkIsTeam1(teamName, t1Name)) return COLOR_TEAM1;
    if (checkIsTeam2(teamName, t2Name)) return COLOR_TEAM2;
    return '#9ca3af';
};

const HERO_ALIAS_MAP = {
    '솔저: 76': '솔저76', '솔저 : 76': '솔저76', 'D.Va': '디바', 'Widowmaker': '위도우메이커', 'Tracer': '트레이서', 'Sojourn': '소전'
};

const HERO_SKILL_MAP = {
    '디바': { 'Ability 1': '부스터', 'Ability 2': '마이크로 미사일', 'Ultimate': '자폭' },
    '둠피스트': { 'Ability 1': '지진 강타', 'Ability 2': '파워 블락', 'Ultimate': '파멸의 일격' },
    '정커퀸': { 'Ability 1': '지휘의 외침', 'Ability 2': '육식 도살', 'Ultimate': '광란' },
    '마우가': { 'Ability 1': '돌파', 'Ability 2': '터질 듯한 심장', 'Ultimate': '케이지 혈투' },
    '오리사': { 'Ability 1': '방어 강화', 'Ability 2': '투창', 'Ultimate': '대지의 창' },
    '라마트라': { 'Ability 1': '네메시스 형태', 'Ability 2': '탐식의 소용돌이', 'Ultimate': '절멸' },
    '라인하르트': { 'Ability 1': '돌진', 'Ability 2': '화염 강타', 'Ultimate': '대지분쇄' },
    '로드호그': { 'Ability 1': '갈고리 사슬', 'Ability 2': '숨 돌리기', 'Ultimate': '돼재앙' },
    '시그마': { 'Ability 1': '키네틱 손아귀', 'Ability 2': '강착', 'Ultimate': '중력 붕괴' },
    '윈스턴': { 'Ability 1': '점프 팩', 'Ability 2': '방벽 생성기', 'Ultimate': '원시의 분노' },
    '레킹볼': { 'Ability 1': '구르기', 'Ability 2': '적응형 보호막', 'Ultimate': '지뢰밭' },
    '자리야': { 'Ability 1': '입자 방벽', 'Ability 2': '방벽 씌우기', 'Ultimate': '중력자탄' },
    '해저드': { 'Ability 1': '가시', 'Ability 2': '매복', 'Ultimate': '폭우' },
    '애쉬': { 'Ability 1': '충격 샷건', 'Ability 2': '다이너마이트', 'Ultimate': 'B.O.B' },
    '바스티온': { 'Ability 1': '설정: 강습', 'Ability 2': 'A-36 전술 수류탄', 'Ultimate': '설정: 포격' },
    '캐서디': { 'Ability 1': '구르기', 'Ability 2': '자석 수류탄', 'Ultimate': '황야의 무법자' },
    '에코': { 'Ability 1': '비행', 'Ability 2': '광선 집중', 'Ultimate': '복제' },
    '겐지': { 'Ability 1': '질풍참', 'Ability 2': '튕겨내기', 'Ultimate': '용검' },
    '한조': { 'Ability 1': '폭풍 화살', 'Ability 2': '음파 화살', 'Ultimate': '용의 일격' },
    '정크랫': { 'Ability 1': '충격 지뢰', 'Ability 2': '강철 덫', 'Ultimate': '죽이는 타이어' },
    '메이': { 'Ability 1': '급속 빙결', 'Ability 2': '빙벽', 'Ultimate': '눈보라' },
    '파라': { 'Ability 1': '점프 추진기', 'Ability 2': '충격탄', 'Ultimate': '포화' },
    '리퍼': { 'Ability 1': '망령화', 'Ability 2': '그림자 밟기', 'Ultimate': '죽음의 꽃' },
    '소전': { 'Ability 1': '파워 슬라이드', 'Ability 2': '분열 사격', 'Ultimate': '오버클럭' },
    '솔저: 76': { 'Ability 1': '질주', 'Ability 2': '생체장', 'Ultimate': '전술 조준경' },
    '솔저76': { 'Ability 1': '질주', 'Ability 2': '생체장', 'Ultimate': '전술 조준경' },
    '솜브라': { 'Ability 1': '은신', 'Ability 2': '바이러스', 'Ultimate': 'EMP' },
    '시메트라': { 'Ability 1': '감시 포탑', 'Ability 2': '순간이동기', 'Ultimate': '광자 방벽' },
    '토르비욘': { 'Ability 1': '포탑 설치', 'Ability 2': '과부하', 'Ultimate': '초고열 용광로' },
    '트레이서': { 'Ability 1': '점멸', 'Ability 2': '시간 역행', 'Ultimate': '펄스 폭탄' },
    '위도우메이커': { 'Ability 1': '갈고리 발사', 'Ability 2': '맹독 지뢰', 'Ultimate': '적외선 투시' },
    '벤처': { 'Ability 1': '잠복', 'Ability 2': '드릴 돌진', 'Ultimate': '지각 충격' },
    '벤데타': { 'Ability 1': '소용돌이 질주', 'Ability 2': '치솟는 베기', 'Ultimate': '갈라내는 칼날' },
    '아나': { 'Ability 1': '수면총', 'Ability 2': '생체 수류탄', 'Ultimate': '나노 강화제' },
    '바티스트': { 'Ability 1': '치유 파동', 'Ability 2': '불사 장치', 'Ultimate': '증폭 매트릭스' },
    '브리기테': { 'Ability 1': '방패 밀쳐내기', 'Ability 2': '도리깨 투척', 'Ultimate': '집결' },
    '일리아리': { 'Ability 1': '분출', 'Ability 2': '치유의 태양석', 'Ultimate': '태양 작렬' },
    '주노': { 'Ability 1': '글라이드 부스트', 'Ability 2': '하이퍼 링', 'Ultimate': '궤도 광선' },
    '키리코': { 'Ability 1': '순보', 'Ability 2': '정화의 방울', 'Ultimate': '여우길' },
    '라이프위버': { 'Ability 1': '연꽃 단상', 'Ability 2': '구원의 손길', 'Ultimate': '생명의 나무' },
    '루시우': { 'Ability 1': '분위기 전환', 'Ability 2': '볼륨을 높여라', 'Ultimate': '소리 방벽' },
    '메르시': { 'Ability 1': '수호천사', 'Ability 2': '부활', 'Ultimate': '발키리' },
    '모이라': { 'Ability 1': '소멸', 'Ability 2': '생체 구슬', 'Ultimate': '융화' },
    '젠야타': { 'Ability 1': '조화의 구슬', 'Ability 2': '부조화의 구슬', 'Ultimate': '초월' },
    '우양': { 'Ability 1': '격류', 'Ability 2': '수호의 파도', 'Ultimate': '해일 폭발' },
    '도미나': { 'Ability 1': '소닉 리펄서', 'Ability 2': '수정 발사', 'Ultimate': '판옵티콘' },
    '미즈키': { 'Ability 1': '종이 인형 분신술', 'Ability 2': '속박 사슬', 'Ultimate': '결계 성역' },
    '제트팩 캣': { 'Ability 1': '생명줄', 'Ability 2': '골골대기', 'Ultimate': '납치한다냥' },
};

const getDisplayHeroName = (rawName) => {
    if (!rawName) return "";
    const clean = rawName.trim();
    return HERO_ALIAS_MAP[clean] || clean;
};

const getHeroImageSrc = (heroName) => {
  if (!heroName || heroName === 'Unknown') return null;

  const exactFileNames = {
    'D.Va': 'dva',
    '디바': 'dva',
    '솔저: 76': 'soldier76',
    '솔저 76': 'soldier76',
    '솔져: 76': 'soldier76',
    '솔져 76': 'soldier76',
    'Soldier: 76': 'soldier76',
    '제트팩 캣': 'jetpackcat',
    'Jetpack Cat': 'jetpackcat'
  };

  const displayName = getDisplayHeroName(heroName);
  let fileName = exactFileNames[heroName] || exactFileNames[displayName];
  
  if (!fileName) {
    fileName = displayName.replace(/[\s.:]/g, ''); 
  }

  return `/heroes/${fileName}.png`;
};

const getRoleInfo = (heroName) => {
    const name = getDisplayHeroName(heroName);
    const tanks = ['디바', '둠피스트', '정커퀸', '마우가', '오리사', '라마트라', '라인하르트', '로드호그', '시그마', '윈스턴', '레킹볼', '자리야', '해저드', '도미나'];
    const supports = ['아나', '바티스트', '브리기테', '일리아리', '키리코', '라이프위버', '루시우', '메르시', '모이라', '젠야타', '주노', '우양', '미즈키', '제트팩 캣'];
    
    if (tanks.includes(name) || tanks.includes(heroName)) return { label: 'tank', order: 1 };
    if (supports.includes(name) || supports.includes(heroName)) return { label: 'support', order: 3 };
    return { label: 'dps', order: 2 };
};

const getRoleIconSrc = (roleLabel) => {
    if (roleLabel === 'tank') return '/roles/tank.png';
    if (roleLabel === 'dps') return '/roles/damage.png';
    if (roleLabel === 'support') return '/roles/support.png';
    return null;
};

const getAbilityName = (heroName, abilityRaw) => {
    if (!abilityRaw) return "기본 발사";
    const cleanAbility = abilityRaw.trim();
    if (cleanAbility.toLowerCase().includes('primary')) return '기본 발사';
    if (cleanAbility.toLowerCase().includes('secondary')) return '보조 발사';
    if (cleanAbility.toLowerCase().includes('melee')) return '근접 공격';
    const displayHero = getDisplayHeroName(heroName);
    if (HERO_SKILL_MAP[displayHero] && HERO_SKILL_MAP[displayHero][cleanAbility]) return HERO_SKILL_MAP[displayHero][cleanAbility];
    if (HERO_SKILL_MAP[heroName] && HERO_SKILL_MAP[heroName][cleanAbility]) return HERO_SKILL_MAP[heroName][cleanAbility];
    if (cleanAbility === 'Ability 1') return '기술 1 (Shift)';
    if (cleanAbility === 'Ability 2') return '기술 2 (E)';
    if (cleanAbility === 'Ultimate') return '궁극기 (Q)';
    return cleanAbility;
};

// =================================================================================
// [신규 차트 컴포넌트들]
// =================================================================================

const FightSurvivorsChart = ({ fights, team1Name, team2Name, theme, t }) => {
  if (!fights || fights.length === 0) return <div style={{ padding: '40px', textAlign: 'center', color: theme.textSub, fontSize: '13px' }}>{t.noData}</div>;

  const data = fights.map((fight, index) => ({
    name: `${index + 1}`,
    t1Survivors: Math.max(0, 5 - (fight.team1_deaths || 0)),
    t2Survivors: Math.max(0, 5 - (fight.team2_deaths || 0)),
    winner: fight.winner,
    duration: fight.duration_sec ? fight.duration_sec.toFixed(1) : 0
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}`, padding: '10px', borderRadius: '8px', fontSize:'12px', color: theme.text }}>
          <p style={{ fontWeight: 'bold', marginBottom: '4px' }}>{t.fight} {label}</p>
          <div style={{ color: COLOR_TEAM1 }}>{team1Name}: {d.t1Survivors}{t.survivors}</div>
          <div style={{ color: COLOR_TEAM2 }}>{team2Name}: {d.t2Survivors}{t.survivors}</div>
          <div style={{ color: theme.textSub, marginTop:'4px' }}>{t.duration}: {d.duration}s</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height: 250 }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} barGap={2} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
          <XAxis dataKey="name" stroke={theme.textSub} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 5]} stroke={theme.textSub} fontSize={11} tickLine={false} axisLine={false} tickCount={6} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: theme.surfaceHighlight, opacity: 0.4 }} />
          <Bar dataKey="t1Survivors" fill={COLOR_TEAM1} radius={[3, 3, 0, 0]} barSize={12} animationDuration={800} />
          <Bar dataKey="t2Survivors" fill={COLOR_TEAM2} radius={[3, 3, 0, 0]} barSize={12} animationDuration={800} />
          <ReferenceLine y={2.5} stroke={theme.borderHighlight} strokeDasharray="3 3" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const AverageSurvivorsChart = ({ fights, team1Name, team2Name, theme, t }) => {
    if (!fights || fights.length === 0) return null;

    const t1Total = fights.reduce((acc, f) => acc + Math.max(0, 5 - (f.team1_deaths || 0)), 0);
    const t2Total = fights.reduce((acc, f) => acc + Math.max(0, 5 - (f.team2_deaths || 0)), 0);
    const count = fights.length;

    const data = [
        { name: team1Name, avg: parseFloat((t1Total / count).toFixed(2)), fill: COLOR_TEAM1 },
        { name: team2Name, avg: parseFloat((t2Total / count).toFixed(2)), fill: COLOR_TEAM2 }
    ];

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ backgroundColor: theme.surface, border: `1px solid ${theme.border}`, padding: '8px', borderRadius: '6px', fontSize:'11px', color: theme.text }}>
                    {payload[0].payload.name}: {payload[0].value} (avg)
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ width: '100%', height: 250, display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{ fontSize:'12px', color: theme.textSub, marginBottom:'10px' }}>{t.avgSurvivors}</div>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                    <XAxis dataKey="name" stroke={theme.textSub} fontSize={10} tickLine={false} axisLine={false} interval={0} tickFormatter={(val) => val.length > 5 ? val.substring(0,5)+'..' : val} />
                    <YAxis domain={[0, 5]} stroke={theme.textSub} fontSize={10} tickLine={false} axisLine={false} tickCount={6}/>
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]} barSize={24} label={{ position: 'top', fill: theme.text, fontSize: 11 }}>
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};

// =================================================================================
// [1] 스텟 뷰 (StatsView)
// =================================================================================
const StatsView = ({ activeRoundTab, setActiveRoundTab, displayStats, rounds, t1Name, t2Name }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const SafeMatchTable = ({ stats }) => {
    const [sortConfig, setSortConfig] = useState({ key: 'default', direction: 'asc' });

    if (!stats || !Array.isArray(stats) || stats.length === 0) {
      return <div style={{ padding: '60px', textAlign: 'center', color: theme.textSub, border: `1px dashed ${theme.border}`, borderRadius: '16px', background: theme.surface, fontSize: '14px' }}>{t.noData}</div>;
    }

    const handleSort = (key) => {
      let direction = 'desc';
      if (['player_name', 'team_name', 'role_order', 'default'].includes(key)) direction = 'asc';
      if (sortConfig.key === key && sortConfig.direction === direction) {
        direction = direction === 'asc' ? 'desc' : 'asc';
      }
      setSortConfig({ key, direction });
    };

    const fmt = (val) => (typeof val === 'number' ? Math.round(val).toLocaleString() : '0');
    const fmtDec = (val) => (typeof val === 'number' ? val.toFixed(2) : '0.00');

    let processedStats = stats.map(row => {
        if (!row) return null;
        const finalBlows = Number(row.final_blows) || 0;
        const elims = Number(row.eliminations) || 0;
        const deaths = Number(row.deaths) || 0;
        const assists = (Number(row.offensive_assists) || 0) + (Number(row.defensive_assists) || 0);
        const heroDmg = Number(row.hero_damage_dealt) || 0;
        const healingReceived = Number(row.healing_received) || 0;
        const dhRatio = healingReceived > 0 ? (heroDmg / healingReceived) : heroDmg > 0 ? 999 : 0;
        
        return {
            ...row,
            role_label: getRoleInfo(row.hero_name).label,
            role_order: getRoleInfo(row.hero_name).order,
            eliminations: elims,
            kd: deaths > 0 ? (finalBlows / deaths) : finalBlows, 
            kda: deaths > 0 ? ((finalBlows + assists) / deaths) : (finalBlows + assists),
            assists: assists,
            dh_ratio: dhRatio
        };
    }).filter(x => x !== null);

    processedStats.sort((a, b) => {
        if (sortConfig.key === 'default') {
             const teamA = a.team_name || "";
             const teamB = b.team_name || "";
             if (teamA !== teamB) return teamA.localeCompare(teamB);
             if (a.role_order !== b.role_order) return a.role_order - b.role_order;
             return (Number(b.hero_damage_dealt) || 0) - (Number(a.hero_damage_dealt) || 0);
        }
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const thStyle = { padding: '10px 4px', textAlign: 'right', fontSize: '12px', fontWeight: 'bold', color: theme.textSub, borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap', background: theme.bg, cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, zIndex: 20 };
    const thStyleLeft = { ...thStyle, textAlign: 'left', position: 'sticky', left: 0, zIndex: 30, background: theme.bg, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)' }; 
    const thStyleCenter = { ...thStyle, textAlign: 'center' };
    const tdStyle = { padding: '8px 4px', textAlign: 'right', fontSize: '12px', color: theme.text, borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap', verticalAlign: 'middle' };
    const tdStyleLeft = { ...tdStyle, textAlign: 'left', fontWeight: 'bold', position: 'sticky', left: 0, zIndex: 10, background: theme.bg, boxShadow: '2px 0 5px -2px rgba(0,0,0,0.1)', fontSize: '12px' };
    const tdStyleCenter = { ...tdStyle, textAlign: 'center' };
    const renderSortIcon = (key) => (sortConfig.key !== key && sortConfig.key !== 'default' ? <span style={{opacity:0.2, fontSize:'10px'}}> ↕</span> : (sortConfig.direction === 'asc' ? ' ▲' : ' ▼'));

    return (
      <div style={{ width: '100%', overflowX: 'auto', background: theme.bg, borderRadius: '16px', border: `1px solid ${theme.border}`, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '100%' }}> 
          <thead>
            <tr>
              <th style={{...thStyleCenter, width:'30px'}} onClick={()=>handleSort('default')}>#</th>
              <th style={{...thStyleCenter, width:'40px'}} onClick={()=>handleSort('role_order')}>{t.role}{renderSortIcon('role_order')}</th>
              <th style={thStyleLeft} onClick={()=>handleSort('player_name')}>{t.player}{renderSortIcon('player_name')}</th>
              <th style={thStyleCenter} onClick={()=>handleSort('team_name')}>{t.team}{renderSortIcon('team_name')}</th>
              <th style={thStyleCenter} onClick={()=>handleSort('hero_time_played')}>{t.playTime}{renderSortIcon('hero_time_played')}</th>
              <th style={{...thStyle, color: theme.text}} onClick={()=>handleSort('eliminations')}>{t.elims}{renderSortIcon('eliminations')}</th>
              <th style={thStyle} onClick={()=>handleSort('final_blows')}>{t.finalBlows}{renderSortIcon('final_blows')}</th> 
              <th style={thStyle} onClick={()=>handleSort('deaths')}>{t.deaths}{renderSortIcon('deaths')}</th>
              <th style={thStyle} onClick={()=>handleSort('kd')}>K/D{renderSortIcon('kd')}</th>
              <th style={thStyle} onClick={()=>handleSort('assists')}>{t.assists}{renderSortIcon('assists')}</th>
              <th style={thStyle} onClick={()=>handleSort('hero_damage_dealt')}>{t.heroDmg}{renderSortIcon('hero_damage_dealt')}</th>
              <th style={{...thStyle, color: theme.textSub}} onClick={()=>handleSort('barrier_damage_dealt')}>{t.barrierDmg}{renderSortIcon('barrier_damage_dealt')}</th>
              <th style={thStyle} onClick={()=>handleSort('healing_received')}>{t.healRcvd}{renderSortIcon('healing_received')}</th>
              <th style={{...thStyle, color: theme.textSub, minWidth:'80px'}} onClick={()=>handleSort('dh_ratio')}>{t.dhRatio}{renderSortIcon('dh_ratio')}</th>
              <th style={thStyle} onClick={()=>handleSort('healing_dealt')}>{t.healing}{renderSortIcon('healing_dealt')}</th>
              <th style={thStyle} onClick={()=>handleSort('damage_taken')}>{t.dmgTaken}{renderSortIcon('damage_taken')}</th>
              <th style={{...thStyle, paddingRight:'16px'}} onClick={()=>handleSort('ultimates_used')}>{t.ults}{renderSortIcon('ultimates_used')}</th>
            </tr>
          </thead>
          <tbody>
            {processedStats.map((row, idx) => {
              const teamColor = resolveTeamColor(row.team_name, t1Name, t2Name);
              const isTeamChange = sortConfig.key === 'default' && idx > 0 && (row.team_name || "") !== (processedStats[idx-1]?.team_name || "");
              const roleIconSrc = getRoleIconSrc(row.role_label);
              let dhColor = theme.textSub;
              if (row.dh_ratio >= 1.5) dhColor = theme.success;
              else if (row.dh_ratio > 0 && row.dh_ratio <= 0.8) dhColor = theme.danger;
              
              return (
                <React.Fragment key={idx}>
                  {isTeamChange && (<tr><td colSpan="18" style={{borderBottom: `2px solid ${theme.borderHighlight}`}}></td></tr>)}
                  <tr style={{ background: 'transparent' }} onMouseOver={e=>e.currentTarget.style.background=theme.surfaceHighlight} onMouseOut={e=>e.currentTarget.style.background='transparent'}>
                    <td style={{...tdStyleCenter, color: theme.textDim}}>{idx + 1}</td>
                    <td style={{...tdStyleCenter, padding:'4px'}}>
                        <div style={{display:'flex', justifyContent:'center', alignItems:'center'}}>
                            {roleIconSrc && (
                                <img src={roleIconSrc} alt={row.role_label} style={{width:'20px', height:'20px', objectFit:'contain'}} onError={(e) => {e.currentTarget.style.display = 'none';}} />
                            )}
                        </div>
                    </td>
                    <td style={{...tdStyleLeft, color: theme.text}}>
                        <span>{row.player_name}</span>
                    </td>
                    <td style={{...tdStyleCenter, color: teamColor, fontWeight: 'bold'}}>{row.team_name}</td>
                    <td style={tdStyleCenter}>{Math.floor((row.hero_time_played || 0) / 60)}m {Math.floor((row.hero_time_played || 0) % 60)}s</td>
                    <td style={{...tdStyle, fontWeight:'bold', color: theme.text}}>{row.eliminations}</td>
                    <td style={{...tdStyle, color: theme.textSub}}>{row.final_blows}</td>
                    <td style={{...tdStyle, color: theme.danger}}>{row.deaths}</td>
                    <td style={{...tdStyle, color: row.kd >= 3 ? NEON_GREEN : theme.textSub, fontWeight: row.kd >= 3 ? 'bold' : 'normal', textShadow: row.kd >= 3 ? `0 0 8px ${NEON_GREEN}40` : 'none'}}>{fmtDec(row.kd)}</td>
                    <td style={tdStyle}>{row.assists}</td>
                    <td style={tdStyle}>{fmt(row.hero_damage_dealt)}</td>
                    <td style={{...tdStyle, color: theme.textSub}}>{fmt(row.barrier_damage_dealt)}</td>
                    <td style={tdStyle}>{fmt(row.healing_received)}</td>
                    <td style={{...tdStyle, color: dhColor, fontWeight:'bold'}}>{fmtDec(row.dh_ratio)}</td>
                    <td style={tdStyle}>{fmt(row.healing_dealt)}</td>
                    <td style={tdStyle}>{fmt(row.damage_taken)}</td>
                    <td style={{...tdStyle, paddingRight:'16px'}}>{row.ultimates_used}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <>
      <SafeMatchTable stats={displayStats} />
    </>
  );
};

// =================================================================================
// [2] 킬 로그 뷰 (KillLogView)
// =================================================================================
const KillLogView = ({ fights, activeRoundTab, t1Name, t2Name }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}m ${s}s`;
  };

  const filteredFights = useMemo(() => {
    let targetFights = fights;
    if (activeRoundTab !== 'overview') {
        targetFights = fights.filter(f => true);
    }
    return targetFights.map(fight => {
        const uniqueEvents = [];
        const seen = new Set();
        fight.events.forEach(ev => {
            const key = `${Math.floor(ev.timestamp)}-${ev.player_name}-${ev.target_name}-${ev.ability}`;
            if (!seen.has(key)) {
                seen.add(key);
                uniqueEvents.push(ev);
            }
        });
        return { ...fight, events: uniqueEvents };
    });
  }, [fights, activeRoundTab]);

  const KillerDisplay = ({ heroName, heroImage, playerName, teamColor }) => {
    const imgSrc = getHeroImageSrc(heroName);
    const displayName = getDisplayHeroName(heroName); 
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', minWidth: 0 }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', minWidth: 0 }}>
            <span style={{ color: theme.text, fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            <span style={{ color: teamColor, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playerName}</span>
        </div>
        {imgSrc && (
            <img src={imgSrc} alt={displayName} style={{ width: '36px', height: '36px', borderRadius: '6px', border: `2px solid ${teamColor}`, backgroundColor: theme.surfaceHighlight, flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        </div>
    );
  };

  const VictimDisplay = ({ heroName, heroImage, playerName, teamColor }) => {
    const imgSrc = getHeroImageSrc(heroName);
    const displayName = getDisplayHeroName(heroName); 
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px', minWidth: 0 }}>
        {imgSrc && (
            <img src={imgSrc} alt={displayName} style={{ width: '36px', height: '36px', borderRadius: '6px', border: `2px solid ${teamColor}`, backgroundColor: theme.surfaceHighlight, flexShrink: 0 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', minWidth: 0 }}>
            <span style={{ color: theme.text, fontWeight: '700', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</span>
            <span style={{ color: teamColor, fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{playerName}</span>
        </div>
        </div>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      {filteredFights.length === 0 ? (
        <div style={{padding:'60px', textAlign:'center', color: theme.textSub, fontSize:'14px'}}>기록된 전투(킬)가 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {filteredFights.map((fight, fIdx) => (
            <div key={fIdx} style={{ background: theme.bg, borderRadius: '16px', border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', background: theme.surface, borderBottom: `1px solid ${theme.border}` }}>
                <div style={{ display:'flex', gap:'12px', alignItems:'center' }}>
                  <span style={{ fontSize: '15px', fontWeight: 'bold', color: theme.text }}>{t.fight} {fIdx + 1}</span>
                  <span style={{ fontSize: '13px', color: theme.textSub }}>{formatTime(fight.startTime)} - {formatTime(fight.fixedEndTime)}</span>
                </div>
                <div style={{ fontSize: '14px' }}>
                  <span style={{ color: theme.textSub }}>{t.win}: </span>
                  <span style={{ color: resolveTeamColor(fight.winner, t1Name, t2Name), fontWeight: 'bold' }}>
                    {fight.winner} ({fight.t1Kills} vs {fight.t2Kills})
                  </span>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                  {fight.events.map((ev, idx) => {
                      if (ev.event_type !== 'kill') return null;
                      const killerTeamColor = checkIsTeam1(ev.player_team, t1Name) ? COLOR_TEAM1 : COLOR_TEAM2;
                      const victimTeamColor = checkIsTeam1(ev.target_team, t1Name) ? COLOR_TEAM1 : COLOR_TEAM2;
                      return (
                          <tr key={idx} style={{ borderBottom: idx !== fight.events.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                            <td style={{ padding: '12px 24px', color: theme.textSub, fontSize: '13px', width: '80px', whiteSpace: 'nowrap' }}>{formatTime(ev.timestamp)}</td>
                            <td style={{ padding: '8px', width: '35%' }}>
                                <KillerDisplay heroName={ev.player_hero} heroImage={ev.player_hero_img} playerName={ev.player_name} teamColor={killerTeamColor} />
                            </td>
                            <td style={{ padding: '0', textAlign: 'center', color: theme.textSub, width: '40px' }}><Sword size={18} strokeWidth={1.5}/></td>
                            <td style={{ padding: '8px', width: '35%' }}>
                                <VictimDisplay heroName={ev.target_hero} heroImage={ev.target_hero_img} playerName={ev.target_name} teamColor={victimTeamColor} />
                            </td>
                            <td style={{ padding: '16px 32px', color: theme.textSub, fontSize: '14px', textAlign: 'right', width: '120px' }}>
                                {getAbilityName(ev.player_hero, ev.ability)}
                            </td>
                          </tr>
                      );
                  })}
                  </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =================================================================================
// [3] 차트 뷰 (ChartView)
// =================================================================================
const ChartView = ({ matchData, rounds, fights, t1Name, t2Name }) => { 
  const { theme } = useTheme();
  const { t } = useLanguage();

  const team1Name = t1Name;
  const team2Name = t2Name;

  const [fbTargetTeam, setFbTargetTeam] = useState(team1Name);

  useEffect(() => {
      if (team1Name) {
          if (fbTargetTeam !== team1Name && fbTargetTeam !== team2Name) {
              setFbTargetTeam(team1Name);
          }
      }
  }, [team1Name, team2Name, fbTargetTeam]);

  const firstBloodStats = useMemo(() => {
    if (!fights || fights.length === 0) return null;
    let securedTotal = 0, securedWins = 0, sufferedTotal = 0, sufferedWins = 0;
    fights.forEach(fight => {
        const kills = (fight.events || []).filter(e => e.event_type === 'kill').sort((a, b) => a.timestamp - b.timestamp);
        if (kills.length > 0) {
            const firstKill = kills[0];
            const fightWinner = fight.winner;
            if (firstKill.player_team === fbTargetTeam) {
                securedTotal++;
                if (fightWinner === fbTargetTeam) securedWins++;
            } else if (firstKill.target_team === fbTargetTeam) {
                sufferedTotal++;
                if (fightWinner === fbTargetTeam) sufferedWins++;
            }
        }
    });
    return {
        secured: { total: securedTotal, wins: securedWins, rate: securedTotal ? Math.round(securedWins / securedTotal * 100) : 0 },
        suffered: { total: sufferedTotal, wins: sufferedWins, rate: sufferedTotal ? Math.round(sufferedWins / sufferedTotal * 100) : 0 }
    };
  }, [fights, fbTargetTeam]);

  const ultsPerFightData = useMemo(() => {
    if (!rounds) return [];
    return rounds.map((round, idx) => ({
        name: `R${idx + 1}`,
        t1: round.stats.reduce((sum, stat) => sum + (checkIsTeam1(stat.team_name, t1Name) ? (stat.ultimates_used || 0) : 0), 0),
        t2: round.stats.reduce((sum, stat) => sum + (checkIsTeam2(stat.team_name, t2Name) ? (stat.ultimates_used || 0) : 0), 0)
    }));
  }, [rounds, t1Name, t2Name]);

  const roleFinalBlowsData = useMemo(() => {
    if (!matchData || !matchData.stats) return [];
    const data = [{ role: '탱크', t1: 0, t2: 0 }, { role: '딜러', t1: 0, t2: 0 }, { role: '지원', t1: 0, t2: 0 }];
    (matchData.stats || []).forEach(stat => {
        const role = getRoleInfo(stat.hero_name).label;
        const entry = data.find(d => d.role === t[role] || d.role === role) || data.find(d => d.role === '탱크' && role === 'tank') || data.find(d => d.role === '딜러' && role === 'dps') || data.find(d => d.role === '지원' && role === 'support');
        if (entry) { if (checkIsTeam1(stat.team_name, t1Name)) entry.t1 += (stat.final_blows || 0); else entry.t2 += (stat.final_blows || 0); }
    });
    return data.map(d => ({ ...d, roleDisplay: d.role === '탱크' ? t.tank : (d.role === '딜러' ? t.dps : t.support) }));
  }, [matchData, t, t1Name, t2Name]);

  const cumulativeDamageData = useMemo(() => {
    if (!matchData || !matchData.rounds) return [];
    return matchData.rounds.map((round, idx) => {
        let t1RoundDmg = 0; let t2RoundDmg = 0;
        (round.stats || []).forEach(stat => { 
            if(checkIsTeam1(stat.team_name, t1Name)) t1RoundDmg += Math.round(Number(stat.hero_damage_dealt) || 0); 
            else t2RoundDmg += Math.round(Number(stat.hero_damage_dealt) || 0); 
        });
        return { name: `${t.round} ${idx + 1}`, t1: t1RoundDmg, t2: t2RoundDmg };
    });
  }, [matchData, t, t1Name, t2Name]);

  const scatterData = useMemo(() => {
    if (!matchData || !matchData.stats) return [];
    const sourceData = matchData.stats.filter(item => { 
        const dmg = Number(item.hero_damage_dealt) || 0;
        const heal = Number(item.healing_dealt) || 0;
        return !(dmg === 0 && heal === 0);
    });
    const processed = [];
    sourceData.forEach((item, index) => {
        processed.push({
            x: Math.round(Number(item.hero_damage_dealt) || 0),
            y: Number(item.final_blows) || 0,
            name: normalizeName(item.player_name),
            hero: item.hero_name,
            hero_image: item.hero_image,
            fill: resolveTeamColor(item.team_name, t1Name, t2Name) 
        });
    });
    return processed;
  }, [matchData, t1Name, t2Name]);

  const ScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div style={{ backgroundColor: theme.surface, border: `2px solid ${data.fill}`, padding: '12px', borderRadius: '8px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'4px' }}>
                    <img src={getHeroImageSrc(data.hero)} width="24" height="24" style={{borderRadius:'4px', background:'#000'}}/>
                    <span style={{color: theme.text, fontWeight:'bold'}}>{data.name}</span>
                </div>
                <div style={{ fontSize: '12px', color: theme.textSub }}>
                    <p>Dmg: {data.x.toLocaleString()}</p>
                    <p>Final Blows: {data.y}</p>
                </div>
            </div>
        );
    } return null;
  };
   
  const cardStyle = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', marginBottom: '24px' };
  const titleStyle = { color: theme.text, fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', display:'flex', alignItems:'center', gap:'10px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
        
        <div style={cardStyle}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
                <div style={titleStyle}><Target size={18}/> {t.firstBloodAnalysis}</div>
                <select 
                    value={fbTargetTeam} 
                    onChange={(e) => setFbTargetTeam(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: '8px', background: theme.surfaceHighlight, color: theme.text, border: `1px solid ${theme.borderHighlight}`, fontSize: '13px', cursor: 'pointer', outline: 'none' }}
                >
                    <option value={team1Name}>{team1Name} {t.standard}</option>
                    <option value={team2Name}>{team2Name} {t.standard}</option>
                </select>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', color: theme.text, fontSize: '14px', minWidth: '600px' }}>
                    <thead>
                        <tr style={{ borderBottom: `1px solid ${theme.border}`, color: theme.textSub }}>
                            <th style={{ padding: '12px', textAlign: 'left' }}>{t.situation} ({fbTargetTeam})</th>
                            <th style={{ padding: '12px', textAlign: 'center' }}>{t.fightCount}</th>
                            <th style={{ padding: '12px', textAlign: 'center' }}>{t.win}</th>
                            <th style={{ padding: '12px', textAlign: 'right' }}>{t.winRate}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '16px', fontWeight: 'bold', color: theme.success }}>{t.fbSecured}</td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>{firstBloodStats?.secured.total}</td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>{firstBloodStats?.secured.wins}</td>
                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold', color: NEON_GREEN }}>{firstBloodStats?.secured.rate}%</td>
                        </tr>
                        <tr>
                            <td style={{ padding: '16px', fontWeight: 'bold', color: theme.danger }}>{t.fbSuffered}</td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>{firstBloodStats?.suffered.total}</td>
                            <td style={{ padding: '16px', textAlign: 'center' }}>{firstBloodStats?.suffered.wins}</td>
                            <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>{firstBloodStats?.suffered.rate}%</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div style={cardStyle}>
            <div style={titleStyle}><Activity size={18}/> {t.fightSurvivors}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '24px' }}>
                <div style={{ minWidth: 0 }}>
                    <FightSurvivorsChart 
                        fights={fights} 
                        team1Name={team1Name} 
                        team2Name={team2Name} 
                        theme={theme}
                        t={t}
                    />
                </div>
                
                <div style={{ borderLeft: `1px solid ${theme.border}`, paddingLeft: '24px', minWidth: 0 }}>
                    <AverageSurvivorsChart 
                        fights={fights} 
                        team1Name={team1Name} 
                        team2Name={team2Name} 
                        theme={theme}
                        t={t}
                    />
                </div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={titleStyle}><Zap size={18}/> {t.ultsPerFight}</div>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={ultsPerFightData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                            <XAxis dataKey="name" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} width={30}/>
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: theme.surface, border: 'none', borderRadius: '8px', color: theme.text, fontSize:'13px' }} />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize:'12px'}}/>
                            <Bar dataKey="t1" name={team1Name} fill={NEON_GREEN} radius={[4, 4, 0, 0]} barSize={32} />
                            <Bar dataKey="t2" name={team2Name} fill={COLOR_TEAM2} radius={[4, 4, 0, 0]} barSize={32} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={titleStyle}><Crosshair size={18}/> {t.fbByRole}</div>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <BarChart data={roleFinalBlowsData}>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                            <XAxis dataKey="roleDisplay" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} width={30}/>
                            <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: theme.surface, border: 'none', borderRadius: '8px', color: theme.text, fontSize:'13px' }} />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize:'12px'}}/>
                            <Bar dataKey="t1" name={team1Name} fill={NEON_GREEN} radius={[4, 4, 0, 0]} barSize={36} />
                            <Bar dataKey="t2" name={team2Name} fill={COLOR_TEAM2} radius={[4, 4, 0, 0]} barSize={36} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            <div style={{ ...cardStyle, marginBottom: 0 }}>
                <div style={titleStyle}><Zap size={18}/> {t.cumulativeDmg}</div>
                <div style={{ width: '100%', height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={cumulativeDamageData}>
                            <defs>
                                <linearGradient id="colorTeam1" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={NEON_GREEN} stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor={NEON_GREEN} stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorTeam2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLOR_TEAM2} stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor={COLOR_TEAM2} stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false} />
                            <XAxis dataKey="name" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} width={40}/>
                            <Tooltip contentStyle={{ backgroundColor: theme.surface, border: 'none', borderRadius: '8px', color: theme.text, fontSize:'13px' }} />
                            <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize:'12px'}}/>
                            <Area type="monotone" dataKey="t1" name={team1Name} stroke={NEON_GREEN} fillOpacity={1} fill="url(#colorTeam1)" />
                            <Area type="monotone" dataKey="t2" name={team2Name} stroke={COLOR_TEAM2} fillOpacity={1} fill="url(#colorTeam2)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

        <div style={cardStyle}>
            <div style={titleStyle}><Crosshair size={18}/> {t.dmgEfficiency}</div>
            <div style={{ width: '100%', height: 350 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 50, left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} />
                        <XAxis type="number" dataKey="x" name="딜량" stroke={theme.textSub} fontSize={12} label={{ value: t.heroDmgDealt, position: 'insideBottom', offset: -30, fill: theme.textSub }} />
                        <YAxis type="number" dataKey="y" name="결정타" stroke={theme.textSub} fontSize={12} label={{ value: t.finalBlows, angle: -90, position: 'insideLeft', fill: theme.textSub }} />
                        <ZAxis type="number" dataKey="z" range={[60, 60]} />
                        <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                        <Scatter name="Players" data={scatterData}>
                            {scatterData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                        </Scatter>
                        <Legend verticalAlign="top" height={36} content={() => (
                                <div style={{display:'flex', justifyContent:'center', gap:'16px', fontSize:'12px', color: theme.textSub}}>
                                    <span style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:10, height:10, borderRadius:'50%', background:COLOR_TEAM1}}></span>{team1Name}</span>
                                    <span style={{display:'flex', alignItems:'center', gap:'4px'}}><span style={{width:10, height:10, borderRadius:'50%', background:COLOR_TEAM2}}></span>{team2Name}</span>
                                </div>
                            )}
                        />
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', color: theme.textSub, marginTop:'8px', padding:'0 40px' }}>
                <span>◀ {t.battery}</span>
                <span>{t.carry} ▶</span>
            </div>
        </div>
    </div>
  );
};

// =================================================================================
// [4] 이벤트 뷰 (EventsView)
// =================================================================================
const EventsView = ({ matchData, t1Name, t2Name }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const formatTime = (sec) => {
    const isNegative = sec < 0;
    const absoluteSec = Math.abs(sec);
    const m = Math.floor(absoluteSec / 60);
    const s = Math.floor(absoluteSec % 60);
    return `${isNegative ? '-' : ''}${m}m ${s}s`;
  };

  const setupStartTime = useMemo(() => {
    if (!matchData?.rounds) return 0;
    const allEvents = matchData.rounds.flatMap(r => r.events || []);
    const setupEvent = allEvents.find(e => 
      e.event_type === 'setup_complete' || 
      (e.event_type && e.event_type.includes('setup_complete'))
    );
    return setupEvent ? setupEvent.timestamp : 0;
  }, [matchData]);

  const getYouTubeLink = (eventTimestamp) => {
      const baseUrl = matchData.video_url || "#";
      const userVideoOffset = Number(matchData.video_offset) || 0; 
      
      let targetVideoTime = userVideoOffset + eventTimestamp;
      
      const pauses = matchData.pauses || [];
      let totalPauseDuration = 0;
      
      for (const p of pauses) {
          if (p.start_sec < targetVideoTime) {
              const duration = p.end_sec - p.start_sec;
              totalPauseDuration += duration;
          }
      }
      
      const finalTime = Math.floor(targetVideoTime + totalPauseDuration);
      
      if (baseUrl.includes('?')) return `${baseUrl}&t=${finalTime}`;
      return `${baseUrl}?t=${finalTime}`;
  };

  const processedEvents = useMemo(() => {
    if (!matchData) return { general: [], ultimates: [] };
    
    const allEvents = (matchData.rounds || []).flatMap(r => r.events || []).sort((a, b) => a.timestamp - b.timestamp);
    
    const finalGeneral = [];
    const killsBuffer = []; 

    const setupEvent = allEvents.find(e => e.event_type === 'setup_complete');
    if (setupEvent) {
        finalGeneral.push({
            ...setupEvent,
            displayTime: 0,
            realTimestamp: setupEvent.timestamp,
            label: t.round,
            desc: `${t.round} 1 ${t.matchStart}`,
            color: theme.text
        });
    }

    allEvents.forEach((ev) => {
        const displayTime = ev.timestamp - setupStartTime;

        if (ev.event_type === 'round_start') {
            if (ev.round_number > 1) {
                 finalGeneral.push({ 
                     ...ev, 
                     displayTime, 
                     realTimestamp: ev.timestamp,
                     label: t.round, 
                     desc: `${t.round} ${ev.round_number} ${t.matchStart}` 
                 });
            }
            return; 
        } 
        
        if (ev.event_type === 'setup_complete') return;

        if (ev.event_type === 'round_end') {
            finalGeneral.push({ ...ev, displayTime, realTimestamp: ev.timestamp, label: t.round, desc: `${t.round} ${ev.round_number || '?'} ${t.matchEnd}` });
        } else if (ev.event_type === 'objective_captured') {
            const team = ev.capturing_team || ev.player_team || 'Unknown Team';
            finalGeneral.push({ ...ev, displayTime, realTimestamp: ev.timestamp, label: t.events, desc: `${team}: ${t.events}`, color: resolveTeamColor(team, t1Name, t2Name) });
        }
        
        if (ev.event_type === 'kill') {
            killsBuffer.push(ev);
            while(killsBuffer.length > 0 && ev.timestamp - killsBuffer[0].timestamp > 10) {
                killsBuffer.shift();
            }
            const killerName = ev.player_name;
            const recentKills = killsBuffer.filter(k => k.player_name === killerName);
            if (recentKills.length === 3) {
                 finalGeneral.push({ ...ev, displayTime, realTimestamp: ev.timestamp, label: 'Multi Kill', desc: `${killerName} Multi Kill`, color: resolveTeamColor(ev.player_team, t1Name, t2Name), hero: ev.player_hero });
            }
            if (recentKills.length === 4) {
                 finalGeneral.push({ ...ev, displayTime, realTimestamp: ev.timestamp, label: 'Multi Kill', desc: `${killerName} 4 Kills!`, color: resolveTeamColor(ev.player_team, t1Name, t2Name), hero: ev.player_hero });
            }
            if (recentKills.length >= 5) {
                 finalGeneral.push({ ...ev, displayTime, realTimestamp: ev.timestamp, label: 'Team Kill', desc: `${killerName} Team Kill!`, color: resolveTeamColor(ev.player_team, t1Name, t2Name), hero: ev.player_hero });
            }
        }
    });

    finalGeneral.sort((a, b) => a.displayTime - b.displayTime);

    const ultimates = allEvents.filter(e => e.event_type === 'ultimate_start').map(ev => ({
        ...ev,
        displayTime: ev.timestamp - setupStartTime,
        realTimestamp: ev.timestamp,
        desc: `${ev.player_name} (${getDisplayHeroName(ev.player_hero)})`
    }));

    return { general: finalGeneral, ultimates };
  }, [matchData, setupStartTime, theme, t, t1Name, t2Name]);

  const EventItem = ({ time, displayTime, label, desc, color, hero, url }) => (
    <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'flex-start', padding: '12px 0', borderBottom: `1px solid ${theme.border}`, textDecoration: 'none', color: 'inherit', transition: 'background 0.2s' }}
        onMouseOver={e => e.currentTarget.style.background = theme.surfaceHighlight}
        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
    >
        <div style={{ width: '80px', flexShrink: 0, fontSize: '13px', color: theme.text, fontWeight: 'bold', fontFamily: 'monospace' }}>
            {formatTime(displayTime)}
        </div>
        <div style={{ flexGrow: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                {hero && <img src={getHeroImageSrc(hero)} alt={hero} style={{width:'20px', height:'20px', borderRadius:'4px', background:'#000'}}/>}
                <span style={{ fontSize: '14px', fontWeight: 'bold', color: color || theme.text }}>
                     {label && <span style={{marginRight:'6px'}}>{label} -</span>} 
                     <span style={{fontWeight:'normal', color: theme.textSub}}>{desc}</span>
                </span>
            </div>
        </div>
        <PlayCircle size={16} color={theme.textSub} style={{marginTop:'4px'}}/>
    </a>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', width: '100%' }}>
        <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', maxHeight:'600px', overflowY:'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: theme.text, marginBottom: '8px', display:'flex', alignItems:'center', gap:'8px' }}>
                <Activity size={18}/> {t.events}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {processedEvents.general.length > 0 ? processedEvents.general.map((ev, idx) => (
                    <EventItem 
                        key={idx} 
                        time={ev.timestamp} 
                        displayTime={ev.displayTime}
                        label={ev.label} 
                        desc={ev.desc} 
                        color={ev.color} 
                        hero={ev.hero} 
                        url={getYouTubeLink(ev.realTimestamp)}
                    />
                )) : <div style={{padding:'20px', textAlign:'center', color: theme.textSub}}>{t.noEvents}</div>}
            </div>
        </div>

        <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '16px', padding: '24px', maxHeight:'600px', overflowY:'auto' }}>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: theme.text, marginBottom: '8px', display:'flex', alignItems:'center', gap:'8px' }}>
                <Zap size={18}/> {t.ultimatesUsed}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {processedEvents.ultimates.length > 0 ? processedEvents.ultimates.map((ev, idx) => (
                    <EventItem 
                        key={idx} 
                        time={ev.timestamp} 
                        displayTime={ev.displayTime}
                        desc={ev.desc} 
                        color={resolveTeamColor(ev.player_team, t1Name, t2Name)} 
                        hero={ev.player_hero} 
                        url={getYouTubeLink(ev.realTimestamp)}
                    />
                )) : <div style={{padding:'20px', textAlign:'center', color: theme.textSub}}>{t.noUlts}</div>}
            </div>
        </div>
    </div>
  );
};

// =================================================================================
// [5] 플레이어 통계 뷰 (PlayerStatsView)
// =================================================================================
const PlayerStatsView = ({ matchData, t1Name, t2Name }) => {
    const { theme } = useTheme();
    const { t } = useLanguage();

    const [selP1, setSelP1] = useState(normalizeName(matchData?.stats?.filter(p => checkIsTeam1(p.team_name, t1Name))[0]?.player_name));
    const [selP2, setSelP2] = useState(normalizeName(matchData?.stats?.filter(p => checkIsTeam2(p.team_name, t2Name))[0]?.player_name));

    const getPlayerHeroStats = (playerName, teamCheckFn) => {
        const heroMap = {};
        (matchData.rounds || []).forEach(r => {
            const entry = r.stats.find(s => normalizeName(s.player_name) === playerName && teamCheckFn(s.team_name));
            if (entry) {
                const h = entry.hero_name;
                if (!heroMap[h]) heroMap[h] = { ...entry };
                else {
                    heroMap[h].eliminations += entry.eliminations;
                    heroMap[h].hero_damage_dealt += entry.hero_damage_dealt;
                    heroMap[h].deaths += entry.deaths;
                    heroMap[h].final_blows += entry.final_blows;
                    heroMap[h].ultimates_used += entry.ultimates_used;
                    heroMap[h].hero_time_played += entry.hero_time_played;
                    heroMap[h].solo_kills = (heroMap[h].solo_kills || 0) + (entry.solo_kills || 0);
                }
            }
        });
        return Object.values(heroMap).sort((a,b) => b.hero_time_played - a.hero_time_played);
    };

    const PlayerSection = ({ teamLabel, teamColor, selPlayerName, setSelPlayerName, players, teamCheckFn }) => {
        const heroStats = getPlayerHeroStats(selPlayerName, teamCheckFn);
        const [selHeroIdx, setSelHeroIdx] = useState(0);
        useEffect(() => { setSelHeroIdx(0); }, [selPlayerName]);

        const curHero = heroStats[selHeroIdx] || heroStats[0];
        const getP10 = (v, t) => (!t || t === 0) ? "0.00" : ((v / t) * 600).toFixed(2);
        const gameDur = matchData?.timeline?.duration_sec || 1;

        const StatBox = ({ label, value, subValue, subLabel }) => (
            <div style={{ 
                background: theme.surfaceHighlight, 
                padding: '12px', 
                borderRadius: '8px', 
                border: `1px solid ${theme.border}`, 
                display:'flex', 
                flexDirection:'column', 
                justifyContent:'space-between',
                height: '84px' 
            }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'4px' }}>
                    <span style={{ fontSize: '11px', color: theme.textSub, fontWeight: '600', textTransform:'uppercase', letterSpacing:'0.5px' }}>{label}</span>
                </div>
                <div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: theme.text, lineHeight:'1.2' }}>{value}</div>
                    <div style={{ fontSize: '10px', color: theme.textSub, marginTop:'2px' }}>{subValue} {subLabel}</div>
                </div>
            </div>
        );

        return (
            <div style={{ flex: 1, display:'flex', flexDirection:'column' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'16px', paddingLeft:'4px' }}>
                      <div style={{ width:'8px', height:'8px', borderRadius:'50%', background: teamColor, boxShadow:`0 0 8px ${teamColor}` }}></div>
                      <div style={{ fontSize:'14px', fontWeight:'800', color: theme.text, letterSpacing:'0.5px' }}>{teamLabel}</div>
                </div>

                <div style={{ display:'flex', gap:'6px', marginBottom:'24px', flexWrap:'wrap' }}>
                    {players.map(p => (
                        <button key={p.player_name} onClick={() => setSelPlayerName(normalizeName(p.player_name))} 
                            style={{ 
                                padding: '6px 14px', 
                                borderRadius: '20px', 
                                background: selPlayerName === normalizeName(p.player_name) ? teamColor : theme.surface, 
                                border: '1px solid',
                                borderColor: selPlayerName === normalizeName(p.player_name) ? teamColor : theme.border,
                                color: selPlayerName === normalizeName(p.player_name) ? '#fff' : theme.textSub, 
                                cursor: 'pointer', 
                                fontWeight: '700', 
                                fontSize:'11px',
                                transition: 'all 0.2s'
                            }}>
                            {p.player_name}
                        </button>
                    ))}
                </div>

                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px', flexGrow: 1, boxShadow:'0 10px 15px -3px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                            <h2 style={{ fontSize: '32px', fontWeight: '900', margin: 0, color: theme.text, letterSpacing:'-0.5px' }}>{getDisplayHeroName(curHero?.hero_name)}</h2>
                            {heroStats.length > 1 && (
                                <div style={{ position:'relative' }}>
                                    <select 
                                        value={selHeroIdx} 
                                        onChange={(e) => setSelHeroIdx(Number(e.target.value))}
                                        style={{ 
                                            appearance: 'none', 
                                            padding: '6px 28px 6px 12px', 
                                            borderRadius: '6px', 
                                            background: theme.surfaceHighlight, 
                                            color: theme.text, 
                                            border: `1px solid ${theme.borderHighlight}`, 
                                            fontSize: '11px', 
                                            cursor: 'pointer', 
                                            outline: 'none',
                                            fontWeight: '700'
                                        }}
                                    >
                                        {heroStats.map((hs, i) => (
                                            <option key={i} value={i}>{getDisplayHeroName(hs.hero_name)} ({Math.round(hs.hero_time_played/60)}m)</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={12} style={{ position:'absolute', right:'8px', top:'50%', transform:'translateY(-50%)', pointerEvents:'none', color: theme.textSub }} />
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '20px' }}>
                        <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                            <div style={{ position:'relative', borderRadius:'12px', overflow:'hidden', border: `1px solid ${teamColor}40` }}>
                                <img src={getHeroImageSrc(curHero?.hero_name)} alt="hero" style={{ width: '100%', aspectRatio:'1/1', objectFit:'cover', background: theme.surfaceHighlight, display:'block' }} />
                                <div style={{ position:'absolute', inset:0, background: `linear-gradient(to top, ${teamColor}20, transparent)` }}></div>
                            </div>
                            
                            <div style={{ background: theme.bg, borderRadius:'8px', padding:'12px', border:`1px solid ${teamColor}40`, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center' }}>
                                <div style={{ fontSize: '10px', color: theme.textSub, marginBottom:'4px', display:'flex', alignItems:'center', gap:'4px' }}>
                                    <Zap size={10} fill={teamColor} stroke={teamColor}/> <span>{t.ultUsage}</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: '900', color: teamColor, lineHeight:'1' }}>{curHero?.ultimates_used || 0}</div>
                                <div style={{ fontSize: '9px', color: theme.textSub, marginTop:'4px' }}>{getP10(curHero?.ultimates_used || 0, curHero?.hero_time_played)} {t.per10}</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                            <StatBox label={t.playTime} value={`${Math.floor((curHero?.hero_time_played || 0) / 60)}m ${Math.round((curHero?.hero_time_played || 0) % 60)}s`} subValue={`${(((curHero?.hero_time_played || 0)/gameDur)*100).toFixed(1)}%`} subLabel={t.pickRate} />
                            <StatBox label={t.elims} value={`${curHero?.eliminations || 0}`} subValue={getP10(curHero?.eliminations || 0, curHero?.hero_time_played)} subLabel={t.per10} />
                            <StatBox label={t.deaths} value={`${curHero?.deaths || 0}`} subValue={getP10(curHero?.deaths || 0, curHero?.hero_time_played)} subLabel={t.per10} />
                            <StatBox label={t.heroDmg} value={Math.round(curHero?.hero_damage_dealt || 0).toLocaleString()} subValue={getP10(curHero?.hero_damage_dealt || 0, curHero?.hero_time_played)} subLabel={t.per10} />
                            <StatBox label={t.finalBlows} value={`${curHero?.final_blows || 0}`} subValue={getP10(curHero?.final_blows || 0, curHero?.hero_time_played)} subLabel={t.per10} />
                            <StatBox label={t.soloKills} value={`${curHero?.solo_kills || 0}`} subValue={getP10(curHero?.solo_kills || 0, curHero?.hero_time_played)} subLabel={t.per10} />
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const getUniquePlayers = (teamFn) => {
        const pMap = new Map();
        (matchData.stats || []).filter(p => teamFn(p.team_name)).forEach(p => {
            if (!pMap.has(normalizeName(p.player_name))) pMap.set(normalizeName(p.player_name), p);
        });
        return Array.from(pMap.values()).sort((a,b) => getRoleInfo(a.hero_name).order - getRoleInfo(b.hero_name).order);
    };

    const t1Players = getUniquePlayers((name) => checkIsTeam1(name, t1Name));
    const t2Players = getUniquePlayers((name) => checkIsTeam2(name, t2Name));

    return (
        <div style={{ display: 'flex', gap: '32px', width: '100%', paddingBottom: '60px' }}>
            <PlayerSection teamLabel={t1Name} teamColor={COLOR_TEAM1} selPlayerName={selP1} setSelPlayerName={setSelP1} players={t1Players} teamCheckFn={(name) => checkIsTeam1(name, t1Name)} />
            <PlayerSection teamLabel={t2Name} teamColor={COLOR_TEAM2} selPlayerName={selP2} setSelPlayerName={setSelP2} players={t2Players} teamCheckFn={(name) => checkIsTeam2(name, t2Name)} />
        </div>
    );
};

// =================================================================================
// [MatchStats Main] (메인 컴포넌트)
// =================================================================================
const MatchStats = ({ matchId, onBack, matchData: initialMatchData }) => { 
  const { theme } = useTheme();
  const { t } = useLanguage();

  const [activeMainTab, setActiveMainTab] = useState('stats'); 
  const [activeRoundTab, setActiveRoundTab] = useState('overview'); 
  const [loading, setLoading] = useState(true);
  
  const [fetchedMatchData, setFetchedMatchData] = useState(initialMatchData);

  useEffect(() => {
    if (initialMatchData) { setFetchedMatchData(initialMatchData); setLoading(false); return; }
    if (matchId) {
        axios.get(`/api/matches/${matchId}`)
            .then(res => setFetchedMatchData(res.data))
            .finally(() => setLoading(false));
    }
  }, [matchId, initialMatchData]);

  const dataSummary = useMemo(() => {
    if (!fetchedMatchData) return null;
    const rounds = fetchedMatchData.rounds || [];
    
    // 💡 백엔드에서 받아온 진짜 팀 이름을 최우선으로 사용! (동적 할당)
    const t1Name = fetchedMatchData.team_1_name || "1팀";
    const t2Name = fetchedMatchData.team_2_name || "2팀";

    const isControl = fetchedMatchData.game_mode === 'Control' || fetchedMatchData.game_mode === '쟁탈';
    
    let t1Score = isControl ? rounds.filter(r => r.winner === t1Name).length : (fetchedMatchData.score_t1 || 0);
    let t2Score = isControl ? rounds.filter(r => r.winner === t2Name).length : (fetchedMatchData.score_t2 || 0);

    const displayStats = activeRoundTab === 'overview' ? (fetchedMatchData.stats || []) : (rounds.find(r => r.round_number.toString() === activeRoundTab)?.stats || []);
    
    const targetEvents = activeRoundTab === 'overview' ? rounds.flatMap(r => r.events || []) : (rounds.find(r => r.round_number.toString() === activeRoundTab)?.events || []);
    
    const fights = []; 
    let curF = null;
    const FIGHT_DURATION_LIMIT = 20;
    
    targetEvents.sort((a,b)=>a.timestamp-b.timestamp).forEach(ev => {
        if (ev.event_type !== 'kill' && ev.event_type !== 'ultimate_start') return;
        
        if (!curF || ev.timestamp > curF.fixedEndTime) {
            if (curF) {
                curF.duration_sec = curF.events[curF.events.length-1].timestamp - curF.events[0].timestamp;
                fights.push(curF);
            }
            curF = { 
                startTime: ev.timestamp, 
                fixedEndTime: ev.timestamp + FIGHT_DURATION_LIMIT, 
                events: [ev], 
                t1Kills: 0, t2Kills: 0,
                team1_deaths: 0, team2_deaths: 0 
            };
        } else {
            curF.events.push(ev);
        }

        // 💡 1팀, 2팀 문자열 하드코딩 완전 제거 (동적 팀명 체크 로직 적용)
        if (ev.event_type === 'kill') { 
            if (checkIsTeam1(ev.player_team, t1Name)) curF.t1Kills++; 
            else if (checkIsTeam2(ev.player_team, t2Name)) curF.t2Kills++; 
            
            if (checkIsTeam1(ev.target_team, t1Name)) curF.team1_deaths++;
            else if (checkIsTeam2(ev.target_team, t2Name)) curF.team2_deaths++;
        }
    });
    
    if(curF) {
        curF.duration_sec = curF.events[curF.events.length-1].timestamp - curF.events[0].timestamp;
        fights.push(curF);
    }

    fights.forEach(f => {
        const t1Survivors = Math.max(0, 5 - f.team1_deaths);
        const t2Survivors = Math.max(0, 5 - f.team2_deaths);
        if (t1Survivors > t2Survivors) f.winner = t1Name;
        else if (t2Survivors > t1Survivors) f.winner = t2Name;
        else f.winner = 'Draw';
    });

    return { t1Score, t2Score, displayStats, rounds, fights, t1Name, t2Name };
  }, [fetchedMatchData, activeRoundTab]);

  if (loading || !dataSummary) return <div style={{ padding: '60px', color: theme.textSub, textAlign: 'center' }}>{t.loading}</div>;

  const btnStyle = (isActive) => ({ padding: '12px 24px', background: 'transparent', border: 'none', borderBottom: isActive ? `3px solid ${NEON_GREEN}` : '3px solid transparent', color: isActive ? NEON_GREEN : theme.textSub, fontWeight: 700, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' });

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', color: theme.text, boxSizing: 'border-box' }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: theme.textSub, cursor: 'pointer', marginBottom: '20px' }}><ChevronLeft size={16} /> {t.backToList}</button>
      <h1 style={{ fontSize: '32px', fontWeight: '900', marginBottom: '32px' }}>{fetchedMatchData.map_name}</h1>

      {activeMainTab !== 'compare' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '32px' }}>
            <div style={{ background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', color: theme.textSub }}><Clock size={14} style={{display:'inline', marginRight:4}}/> {t.totalDuration}</div>
                <div style={{ fontSize: '24px', fontWeight: '800' }}>{Math.floor(fetchedMatchData.timeline.duration_sec/60)}m {Math.floor(fetchedMatchData.timeline.duration_sec%60)}s</div>
            </div>
            <div style={{ background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', color: theme.textSub }}><Trophy size={14} style={{display:'inline', marginRight:4}}/> {t.roundScore}</div>
                <div style={{ fontSize: '24px', fontWeight: '800' }}>
                    <span style={{ color: COLOR_TEAM1 }}>{dataSummary.t1Score}</span> : <span style={{ color: COLOR_TEAM2 }}>{dataSummary.t2Score}</span>
                </div>
                <div style={{ fontSize: '11px', color: theme.textSub, marginTop: '2px' }}>
                    {dataSummary.t1Score === dataSummary.t2Score ? t.draw : (dataSummary.t1Score > dataSummary.t2Score ? `${dataSummary.t1Name} ${t.win}` : `${dataSummary.t2Name} ${t.win}`)}
                </div>
            </div>
            <div style={{ background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', color: theme.textSub }}><Skull size={14} style={{display:'inline', marginRight:4}}/> {t.finalBlows}</div>
                <div style={{ fontSize: '24px', fontWeight: '800' }}>
                    <span style={{color:COLOR_TEAM1}}>{fetchedMatchData.total_final_blows_t1}</span> <span style={{color: theme.textSub, fontSize:'18px', margin:'0 4px'}}>vs</span> <span style={{color:COLOR_TEAM2}}>{fetchedMatchData.total_final_blows_t2}</span>
                </div>
                <div style={{fontSize:'11px', color: theme.textSub, marginTop:2}}>{dataSummary.t1Name} vs {dataSummary.t2Name}</div>
            </div>
            <div style={{ background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', color: theme.textSub }}><Sword size={14} style={{display:'inline', marginRight:4}}/> {t.fightWins}</div>
                <div style={{ fontSize: '24px', fontWeight: '800' }}>
                    <span style={{color:COLOR_TEAM1}}>{dataSummary.fights.filter(f=>f.winner===dataSummary.t1Name).length}</span> <span style={{color: theme.textSub, fontSize:'18px', margin:'0 4px'}}>vs</span> <span style={{color:COLOR_TEAM2}}>{dataSummary.fights.filter(f=>f.winner===dataSummary.t2Name).length}</span>
                </div>
                <div style={{fontSize:'11px', color: theme.textSub, marginTop:2}}>{dataSummary.fights.filter(f=>f.winner===dataSummary.t1Name).length > dataSummary.fights.filter(f=>f.winner===dataSummary.t2Name).length ? `${dataSummary.t1Name} ${t.lead}` : (dataSummary.fights.filter(f=>f.winner===dataSummary.t1Name).length < dataSummary.fights.filter(f=>f.winner===dataSummary.t2Name).length ? `${dataSummary.t2Name} ${t.lead}` : t.draw)}</div>
            </div>
            <div style={{ background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ fontSize: '12px', color: theme.textSub }}><Zap size={14} style={{display:'inline', marginRight:4}}/> {t.ultEconomy}</div>
                <div style={{ fontSize: '24px', fontWeight: '800' }}>
                    <span style={{color:COLOR_TEAM1}}>{(dataSummary.fights.filter(f=>f.winner===dataSummary.t1Name).length ? ((fetchedMatchData.stats?.reduce((acc,s)=>acc+(checkIsTeam1(s.team_name, dataSummary.t1Name)?s.ultimates_used:0),0) || 0) / dataSummary.fights.filter(f=>f.winner===dataSummary.t1Name).length).toFixed(2) : "0.00")}</span>
                    <span style={{color: theme.textSub, fontSize:'18px', margin:'0 4px'}}>vs</span>
                    <span style={{color:COLOR_TEAM2}}>{(dataSummary.fights.filter(f=>f.winner===dataSummary.t2Name).length ? ((fetchedMatchData.stats?.reduce((acc,s)=>acc+(checkIsTeam2(s.team_name, dataSummary.t2Name)?s.ultimates_used:0),0) || 0) / dataSummary.fights.filter(f=>f.winner===dataSummary.t2Name).length).toFixed(2) : "0.00")}</span>
                </div>
                <div style={{fontSize:'11px', color: theme.textSub, marginTop:2}}>{t.lowerBetter}</div>
            </div>
        </div>
      )}

      {activeMainTab !== 'compare' && (
        <div style={{ marginBottom: '24px', display:'flex', gap:'8px' }}>
            <button onClick={() => setActiveRoundTab('overview')} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeRoundTab === 'overview' ? theme.surfaceHighlight : theme.bg, color: activeRoundTab === 'overview' ? theme.text : theme.textSub, fontWeight: 'bold', cursor: 'pointer', border: `1px solid ${theme.border}` }}>{t.totalCumulative}</button>
            {dataSummary.rounds.map(r => ( <button key={r.round_number} onClick={() => setActiveRoundTab(r.round_number.toString())} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: activeRoundTab === r.round_number.toString() ? theme.surfaceHighlight : theme.bg, color: activeRoundTab === r.round_number.toString() ? theme.text : theme.textSub, fontWeight: 'bold', cursor: 'pointer', border: `1px solid ${theme.border}` }}>{t.round} {r.round_number}</button> ))}
        </div>
      )}

      <div style={{ borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '12px', overflowX: 'auto', marginBottom: '24px' }}>
        <button onClick={() => setActiveMainTab('stats')} style={btnStyle(activeMainTab === 'stats')}><List size={18}/> {t.tabStats}</button>
        <button onClick={() => setActiveMainTab('kill')} style={btnStyle(activeMainTab === 'kill')}><Skull size={18}/> {t.tabKillLog}</button>
        <button onClick={() => setActiveMainTab('chart')} style={btnStyle(activeMainTab === 'chart')}><BarChart2 size={18}/> {t.tabChart}</button>
        <button onClick={() => setActiveMainTab('event')} style={btnStyle(activeMainTab === 'event')}><Activity size={18}/> {t.tabEvent}</button>
        <button onClick={() => setActiveMainTab('compare')} style={btnStyle(activeMainTab === 'compare')}><User size={18}/> {t.tabPlayer}</button>
      </div>

      {activeMainTab === 'stats' && <StatsView activeRoundTab={activeRoundTab} setActiveRoundTab={setActiveRoundTab} displayStats={dataSummary.displayStats} rounds={dataSummary.rounds} t1Name={dataSummary.t1Name} t2Name={dataSummary.t2Name} />}
      {activeMainTab === 'kill' && <KillLogView fights={dataSummary.fights} activeRoundTab={activeRoundTab} t1Name={dataSummary.t1Name} t2Name={dataSummary.t2Name} />}
      {activeMainTab === 'chart' && <ChartView matchData={fetchedMatchData} rounds={dataSummary.rounds} fights={dataSummary.fights} t1Name={dataSummary.t1Name} t2Name={dataSummary.t2Name} />}
      {activeMainTab === 'event' && <EventsView matchData={fetchedMatchData} t1Name={dataSummary.t1Name} t2Name={dataSummary.t2Name} />}
      {activeMainTab === 'compare' && <PlayerStatsView matchData={fetchedMatchData} t1Name={dataSummary.t1Name} t2Name={dataSummary.t2Name} />}
    </div>
  );
};

export default MatchStats;