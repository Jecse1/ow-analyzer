import React, { useState, useMemo } from 'react';
import { Shield, Sword, PlusCircle, Crosshair, ArrowUpDown, Calendar, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useTheme } from "./ThemeContext";

const normalizeName = (name) => (name ? name.trim() : "");

const HERO_ALIAS_MAP = {
    '솔저: 76': '솔저76', '솔저 : 76': '솔저76', 'D.Va': '디바', 'Widowmaker': '위도우메이커', 'Tracer': '트레이서', 'Sojourn': '소전', 'Sierra': '시에라'
};

const getDisplayHeroName = (rawName) => {
    if (!rawName) return "";
    const clean = rawName.trim();
    return HERO_ALIAS_MAP[clean] || clean;
};

const getRoleInfo = (heroName) => {
    const name = getDisplayHeroName(heroName);
    const tanks = ['디바', 'D.Va', '둠피스트', 'Doomfist', '정커퀸', 'Junker Queen', '마우가', 'Mauga', '오리사', 'Orisa', '라마트라', 'Ramattra', '라인하르트', 'Reinhardt', '로드호그', 'Roadhog', '시그마', 'Sigma', '윈스턴', 'Winston', '레킹볼', 'Wrecking Ball', '자리야', 'Zarya', '해저드', 'Hazard', '도미나', 'Domina'];
    const supports = ['아나', 'Ana', '바티스트', 'Baptiste', '브리기테', 'Brigitte', '일리아리', 'Illari', '키리코', 'Kiriko', '라이프위버', 'Lifeweaver', '루시우', 'Lucio', '메르시', 'Mercy', '모이라', 'Moira', '젠야타', 'Zenyatta', '주노', 'Juno', '미즈키', 'Mizuki', '제트팩 캣', 'Jetpack Cat', '우양', 'Wuyang'];
    if (tanks.includes(name)) return { label: '탱커', order: 1 };
    if (supports.includes(name)) return { label: '힐러', order: 3 };
    return { label: '딜러', order: 2 };
};

const getRoleIconSrc = (roleLabel) => {
    if (roleLabel === '탱커' || roleLabel === '탱크') return '/roles/tank.png';
    if (roleLabel === '딜러') return '/roles/damage.png';
    if (roleLabel === '힐러' || roleLabel === '지원') return '/roles/support.png';
    return null;
};

const getHeroImageSrc = (heroName) => {
    if (!heroName || heroName === 'Unknown') return null;
    const exactFileNames = {
        'D.Va': 'dva', '디바': 'dva',
        '솔저: 76': 'soldier76', '솔저 76': 'soldier76', 'Soldier: 76': 'soldier76',
        '제트팩 캣': 'jetpackcat', 'Jetpack Cat': 'jetpackcat', '시에라': 'sierra'
    };
    const displayName = getDisplayHeroName(heroName);
    let fileName = exactFileNames[heroName] || exactFileNames[displayName];
    if (!fileName) { fileName = displayName.replace(/[\s.:]/g, ''); }
    return `/heroes/${fileName}.png`;
};

// 💡 전체 스킬 풀
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
    '루시우': { 'Ability 1': '분위 전환', 'Ability 2': '볼륨을 높여라', 'Ultimate': '소리 방벽' },
    '메르시': { 'Ability 1': '수호천사', 'Ability 2': '부활', 'Ultimate': '발키리' },
    '모이라': { 'Ability 1': '소멸', 'Ability 2': '생체 구슬', 'Ultimate': '융화' },
    '젠야타': { 'Ability 1': '조화의 구슬', 'Ability 2': '부조화의 구슬', 'Ultimate': '초월' },
    '우양': { 'Ability 1': '격류', 'Ability 2': '수호의 파도', 'Ultimate': '해일 폭발' },
    '도미나': { 'Ability 1': '소닉 리펄서', 'Ability 2': '수정 발사', 'Ultimate': '판옵티콘' },
    '미즈키': { 'Ability 1': '종이 인형 분신술', 'Ability 2': '속박 사슬', 'Ultimate': '결계 성역' },
    '제트팩 캣': { 'Ability 1': '생명줄', 'Ability 2': '골골대기', 'Ultimate': '납치한다냥' },
    '시에라': { 'Ability 1': '앵커 드론', 'Ability 2': '진동 폭약', 'Ultimate': '개척자' },
};

const getAbilityName = (heroName, abilityRaw) => {
    if (!abilityRaw) return "기본 발사";
    const cleanAbility = String(abilityRaw).trim();
    if (cleanAbility === '0' || cleanAbility === 'null') return '기본 발사';
    if (cleanAbility.toLowerCase().includes('primary')) return '기본 발사';
    if (cleanAbility.toLowerCase().includes('secondary')) return '보조 발사';
    if (cleanAbility.toLowerCase().includes('melee')) return '근접 공격';
    
    const displayHero = getDisplayHeroName(heroName);
    let skillName = cleanAbility;
    
    if (HERO_SKILL_MAP[displayHero] && HERO_SKILL_MAP[displayHero][cleanAbility]) {
        skillName = HERO_SKILL_MAP[displayHero][cleanAbility];
    } else if (HERO_SKILL_MAP[heroName] && HERO_SKILL_MAP[heroName][cleanAbility]) {
        skillName = HERO_SKILL_MAP[heroName][cleanAbility];
    }
    
    if (cleanAbility === 'Ability 1') return skillName === 'Ability 1' ? '기술 1 (Shift)' : `${skillName} (Shift)`;
    if (cleanAbility === 'Ability 2') return skillName === 'Ability 2' ? '기술 2 (E)' : `${skillName} (E)`;
    if (cleanAbility === 'Ultimate') return skillName === 'Ultimate' ? '궁극기 (Q)' : `${skillName} (Q)`;
    
    return skillName;
};

const getTopN = (arr, key, n = 5) => {
    const counts = {};
    arr.forEach(item => {
        const val = item[key];
        if (val) counts[val] = (counts[val] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
};

export default function FirstKillStats({ allScrims }) {
    const { theme } = useTheme();
    const [selectedRole, setSelectedRole] = useState('All');
    const [sortConfig, setSortConfig] = useState({ key: 'rate', direction: 'desc' });
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [expandedPlayer, setExpandedPlayer] = useState(null);
    
    const [selectedMyTeam, setSelectedMyTeam] = useState('All');
    const [selectedEnemyTeam, setSelectedEnemyTeam] = useState('All');

    const teamList = useMemo(() => {
        const teams = new Set();
        if (!allScrims) return [];
        allScrims.forEach(s => s.matches?.forEach(m => m.stats?.forEach(p => p.team_name && teams.add(p.team_name))));
        return Array.from(teams);
    }, [allScrims]);

    const filteredScrims = useMemo(() => {
        if (!allScrims) return [];
        return allScrims.filter(scrim => {
            if (!scrim.date) return true;
            const sDate = new Date(scrim.date);
            if (startDate && new Date(startDate) > sDate) return false;
            if (endDate && new Date(endDate) < sDate) return false;
            return true;
        });
    }, [allScrims, startDate, endDate]);

    const playerStats = useMemo(() => {
        const pMap = {};

        if (!filteredScrims || filteredScrims.length === 0) return [];

        filteredScrims.forEach(scrim => {
            const matches = scrim.matches || [];
            
            matches.forEach(match => {
                const teamsInMatch = new Set((match.stats || []).map(s => s.team_name).filter(Boolean));
                if (selectedMyTeam !== 'All' && !teamsInMatch.has(selectedMyTeam)) return;
                if (selectedEnemyTeam !== 'All' && !teamsInMatch.has(selectedEnemyTeam)) return;

                const rounds = match.rounds || [];
                const matchEvents = rounds.flatMap(r => r.events || []).sort((a,b) => a.timestamp - b.timestamp);
                
                const fights = [];
                let curF = null;
                matchEvents.forEach(ev => {
                    if (ev.event_type !== 'kill' && ev.event_type !== 'ultimate_start') return;
                    if (!curF || ev.timestamp > curF.fixedEndTime) {
                        if (curF) fights.push(curF);
                        curF = { startTime: ev.timestamp, fixedEndTime: ev.timestamp + 20, first_kill_event: null };
                    }
                    if (ev.event_type === 'kill' && !curF.first_kill_event) {
                        curF.first_kill_event = ev;
                    }
                });
                if (curF) fights.push(curF);

                const matchFightsCount = fights.length;

                (match.stats || []).forEach(p => {
                    const name = normalizeName(p.player_name);
                    if (!name || name === "Unknown") return;

                    if (selectedMyTeam !== 'All' && p.team_name !== selectedMyTeam) return;

                    if (!pMap[name]) {
                        const roleData = getRoleInfo(p.hero_name);
                        pMap[name] = { 
                            name, hero: p.hero_name, roleLabel: roleData.label, roleOrder: roleData.order,
                            totalFights: 0, firstKills: 0, killLogs: [] 
                        };
                    }
                    pMap[name].totalFights += matchFightsCount;
                });

                fights.forEach(f => {
                    if (f.first_kill_event) {
                        const ev = f.first_kill_event;
                        const name = normalizeName(ev.player_name);
                        if (pMap[name]) {
                            pMap[name].firstKills += 1;
                            pMap[name].killLogs.push({
                                targetName: normalizeName(ev.target_name),
                                targetHero: ev.target_hero,
                                // 💡 스킬명|희생자이름|희생자영웅 순서로 저장
                                detailedSkill: `${getAbilityName(ev.player_hero, ev.ability)}|${normalizeName(ev.target_name)}|${ev.target_hero}`
                            });
                        }
                    }
                });
            });
        });

        return Object.values(pMap).filter(p => p.totalFights > 0);
    }, [filteredScrims, selectedMyTeam, selectedEnemyTeam]);

    const sortedData = useMemo(() => {
        let filtered = playerStats;
        if (selectedRole !== 'All') filtered = playerStats.filter(p => p.roleLabel === selectedRole);

        return [...filtered].sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];
            if (sortConfig.key === 'rate') {
                valA = a.totalFights > 0 ? (a.firstKills / a.totalFights) : 0;
                valB = b.totalFights > 0 ? (b.firstKills / b.totalFights) : 0;
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [playerStats, selectedRole, sortConfig]);

    const handleSort = (key) => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
    const toggleExpand = (playerName) => setExpandedPlayer(expandedPlayer === playerName ? null : playerName);

    const SUCCESS_COLOR = "#10b981";
    const selectStyle = { background: theme.bg, color: theme.text, border: `1px solid ${theme.borderHighlight}`, padding: '8px 12px', borderRadius: '8px', outline: 'none', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' };

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', color: theme.text }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Crosshair size={36} color={SUCCESS_COLOR} /> 퍼킬 분석 (First Kill Stats)
                </h1>
                <p style={{ color: theme.textSub, marginTop: '8px' }}>한타를 터뜨리는 캐리력과 주력 희생양, 사용 스킬을 상세히 분석합니다.</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {['All', '탱커', '딜러', '힐러'].map(role => (
                        <button key={role} onClick={() => setSelectedRole(role)}
                            style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid', borderColor: selectedRole === role ? '#3b82f6' : theme.border, background: selectedRole === role ? '#3b82f620' : theme.surface, color: selectedRole === role ? '#3b82f6' : theme.textSub, cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {role === 'All' ? <Users size={16}/> : <img src={getRoleIconSrc(role)} alt={role} style={{ width: 16, height: 16, filter: 'invert(1)', opacity: selectedRole === role ? 1 : 0.5 }} />}
                            {role === 'All' ? '전체 포지션' : role}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: theme.surfaceHighlight, padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: theme.textSub }}>특정 매치업:</span>
                        <select value={selectedMyTeam} onChange={e => setSelectedMyTeam(e.target.value)} style={selectStyle}>
                            <option value="All">우리 팀 (전체)</option>
                            {teamList.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <span style={{ fontSize: '12px', color: theme.textSub, fontWeight: 'bold' }}>VS</span>
                        <select value={selectedEnemyTeam} onChange={e => setSelectedEnemyTeam(e.target.value)} style={selectStyle}>
                            <option value="All">상대 팀 (전체)</option>
                            {teamList.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: theme.surfaceHighlight, padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                        <Calendar size={16} color={theme.textSub} />
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: theme.text, outline: 'none', fontSize: '13px' }} />
                        <span style={{ color: theme.textSub }}>~</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: 'transparent', border: 'none', color: theme.text, outline: 'none', fontSize: '13px' }} />
                    </div>
                </div>
            </div>

            <div style={{ background: theme.bg, borderRadius: '16px', border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: theme.surfaceHighlight }}>
                        <tr>
                            <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: theme.textSub }}>#</th>
                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', color: theme.textSub, cursor:'pointer' }} onClick={() => handleSort('name')}>선수명 <ArrowUpDown size={12} style={{display:'inline'}}/></th>
                            <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: theme.textSub }}>포지션</th>
                            <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', color: theme.textSub, cursor:'pointer' }} onClick={() => handleSort('totalFights')}>한타 횟수 <ArrowUpDown size={12} style={{display:'inline'}}/></th>
                            <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', color: theme.textSub, cursor:'pointer' }} onClick={() => handleSort('firstKills')}>퍼킬 횟수 <ArrowUpDown size={12} style={{display:'inline'}}/></th>
                            <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', color: SUCCESS_COLOR, cursor:'pointer', fontWeight:'900' }} onClick={() => handleSort('rate')}>퍼킬 비율 (%) <ArrowUpDown size={12} style={{display:'inline'}}/></th>
                            <th style={{ padding: '16px', width: '40px' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((p, idx) => {
                            const rate = p.totalFights > 0 ? (p.firstKills / p.totalFights) * 100 : 0;
                            const isCarry = rate >= 10; 
                            const isExpanded = expandedPlayer === p.name;
                            const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';

                            return (
                                <React.Fragment key={p.name}>
                                    <tr onClick={() => toggleExpand(p.name)} style={{ background: isExpanded ? theme.surfaceHighlight : rowBg, borderBottom: isExpanded ? 'none' : `1px solid ${theme.border}40`, transition: 'background 0.2s', cursor: 'pointer' }} onMouseOver={e=>e.currentTarget.style.background=theme.surfaceHighlight} onMouseOut={e=>e.currentTarget.style.background=isExpanded ? theme.surfaceHighlight : rowBg}>
                                        <td style={{ padding: '16px', textAlign: 'center', color: theme.textSub }}>{idx + 1}</td>
                                        <td style={{ padding: '16px', fontWeight: 'bold' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <img src={getHeroImageSrc(p.hero)} style={{ width: 30, height: 30, borderRadius: 4, background: '#000' }} />
                                                <span style={{ color: isExpanded ? SUCCESS_COLOR : theme.text }}>{p.name}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center' }}>
                                            <img src={getRoleIconSrc(p.roleLabel)} style={{ width: 20, height: 20, objectFit: 'contain', filter: 'invert(1)', opacity: 0.6 }} />
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>{p.totalFights.toLocaleString()}회</td>
                                        <td style={{ padding: '16px', textAlign: 'right', fontWeight: 'bold' }}>{p.firstKills}회</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <div style={{ position: 'relative', width: '100%', height: '24px', background: theme.surface, borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(rate * 2, 100)}%`, background: isCarry ? '#10b98180' : '#10b98140' }} />
                                                <span style={{ position: 'relative', zIndex: 1, paddingRight: '8px', fontWeight: '900', fontSize: '13px', color: isCarry ? SUCCESS_COLOR : theme.text }}>{rate.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'center', color: theme.textSub }}>
                                            {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                        </td>
                                    </tr>
                                    
                                    {isExpanded && (
                                        <tr style={{ background: theme.surfaceHighlight, borderBottom: `2px solid ${theme.border}` }}>
                                            <td colSpan="7" style={{ padding: '0 24px 24px 24px' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', background: theme.bg, padding: '20px', borderRadius: '12px', border: `1px solid ${theme.border}40` }}>
                                                    <div>
                                                        <h4 style={{ fontSize: '13px', color: theme.textSub, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Crosshair size={14} color={SUCCESS_COLOR}/> 주요 희생양 (Player)</h4>
                                                        {getTopN(p.killLogs, 'targetName', 5).map((target, i) => {
                                                            const pct = p.firstKills > 0 ? (target.count / p.firstKills) * 100 : 0;
                                                            return (
                                                                <div key={i} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', padding: '6px 8px', marginBottom: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${SUCCESS_COLOR}20`, zIndex: 0 }} />
                                                                    <span style={{ position: 'relative', zIndex: 1, fontSize: '13px' }}>{target.name}</span>
                                                                    <span style={{ position: 'relative', zIndex: 1, fontSize: '13px', fontWeight: 'bold', color: SUCCESS_COLOR }}>{target.count}회 <span style={{fontSize:'10px', color:theme.textSub, fontWeight:'normal'}}>({pct.toFixed(0)}%)</span></span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    <div>
                                                        <h4 style={{ fontSize: '13px', color: theme.textSub, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Shield size={14} color={SUCCESS_COLOR}/> 집중 공략 영웅 (Hero)</h4>
                                                        {getTopN(p.killLogs, 'targetHero', 5).map((hero, i) => {
                                                            const pct = p.firstKills > 0 ? (hero.count / p.firstKills) * 100 : 0;
                                                            return (
                                                                <div key={i} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', marginBottom: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${SUCCESS_COLOR}20`, zIndex: 0 }} />
                                                                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <img src={getHeroImageSrc(hero.name)} style={{ width: 18, height: 18, borderRadius: 2 }} onError={e=>e.currentTarget.style.display='none'}/>
                                                                        <span style={{ fontSize: '13px' }}>{getDisplayHeroName(hero.name)}</span>
                                                                    </div>
                                                                    <span style={{ position: 'relative', zIndex: 1, fontSize: '13px', fontWeight: 'bold' }}>{hero.count}회</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                    <div>
                                                        <h4 style={{ fontSize: '13px', color: theme.textSub, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Sword size={14} color={SUCCESS_COLOR}/> 결정타 스킬 (누구에게 적중?)</h4>
                                                        {getTopN(p.killLogs, 'detailedSkill', 5).map((log, i) => {
                                                            // 💡 스킬명 ➔ 희생자이름 [희생자영웅아이콘] 파싱
                                                            const [skill, tName, tHero] = log.name.split('|');
                                                            const pct = p.firstKills > 0 ? (log.count / p.firstKills) * 100 : 0;
                                                            return (
                                                                <div key={i} style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', marginBottom: '4px', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', overflow: 'hidden' }}>
                                                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: `${SUCCESS_COLOR}20`, zIndex: 0 }} />
                                                                    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: theme.text }}>{skill}</span>
                                                                        <span style={{ color: theme.textSub, fontSize: '11px', margin: '0 2px' }}>➔</span>
                                                                        <span style={{ color: theme.textSub, fontSize: '12px' }}>{tName}</span>
                                                                        <img src={getHeroImageSrc(tHero)} style={{ width: 16, height: 16, borderRadius: 2 }} onError={e=>e.currentTarget.style.display='none'}/>
                                                                    </div>
                                                                    <span style={{ position: 'relative', zIndex: 1, fontSize: '13px', fontWeight: 'bold' }}>{log.count}회</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {sortedData.length === 0 && (
                            <tr>
                                <td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: theme.textSub }}>조건에 맞는 데이터가 없습니다.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}