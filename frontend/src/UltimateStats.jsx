import React, { useMemo, useState, useEffect } from 'react';
import { Zap, Calendar, Target, Activity, Users } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend } from 'recharts';
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

// 💡 전역 초록 형광색 상수
const NEON_GREEN = '#39FF14';

// 영웅 이미지 예외 처리
const getHeroImageSrc = (heroName) => {
    if (!heroName || heroName === 'Unknown') return null;
    
    const exactFileNames = {
        'D.Va': 'D.Va',
        '디바': 'D.Va',
        '솔저: 76': 'Soldier76',
        '솔저 76': 'Soldier76',
        '솔져: 76': 'Soldier76',
        '솔져 76': 'Soldier76',
        'Soldier: 76': 'Soldier76',
        '제트팩 캣': '제트팩 캣',
        'Jetpack Cat': 'Jetpack Cat'
    };

    let fileName = exactFileNames[heroName];
    if (!fileName) {
        fileName = heroName.replace(/[\s.:]/g, ''); 
    }
    
    return `/heroes/${fileName}.png`;
};

export default function UltimateStats({ allScrims }) {
    const { theme } = useTheme();
    const { t } = useLanguage();

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [baseTeam, setBaseTeam] = useState("All");

    const allTeams = useMemo(() => {
        const teams = new Set();
        allScrims.forEach(s => s.matches?.forEach(m => {
            if (m.team_1_name) teams.add(m.team_1_name);
            if (m.team_2_name) teams.add(m.team_2_name);
        }));
        return [...teams].filter(Boolean);
    }, [allScrims]);

    const ultAnalysis = useMemo(() => {
        if (!allScrims || allScrims.length === 0) return { countStats: [], heroStats: [] };

        const countMap = { 0: { wins: 0, total: 0 }, 1: { wins: 0, total: 0 }, 2: { wins: 0, total: 0 }, 3: { wins: 0, total: 0 }, 4: { wins: 0, total: 0 }, 5: { wins: 0, total: 0 } };
        const heroUltMap = {};

        allScrims.forEach(scrim => {
            if (startDate && scrim.date < startDate) return;
            if (endDate && scrim.date > endDate) return;

            (scrim.matches || []).forEach(match => {
                const t1Name = match.team_1_name;
                const t2Name = match.team_2_name;

                (match.rounds || []).forEach(round => {
                    const events = round.events || [];
                    if (events.length === 0) return;

                    let currentFight = null;
                    const FIGHT_GAP = 20;

                    const processPerspective = (fight, teamName, enemyName) => {
                        let myDeaths = 0, enemyDeaths = 0;
                        let myUltsUsed = 0;
                        const myHeroesUsedUlt = [];

                        fight.events.forEach(ev => {
                            if (ev.event_type === 'kill') {
                                if (ev.target_team === teamName) myDeaths++;
                                else if (ev.target_team === enemyName) enemyDeaths++;
                            }
                            if (ev.event_type === 'ultimate_start') {
                                if (ev.player_team === teamName) {
                                    myUltsUsed++;
                                    myHeroesUsedUlt.push(ev.player_hero);
                                }
                            }
                        });

                        if (myDeaths === 0 && enemyDeaths === 0) return;
                        const isWin = myDeaths < enemyDeaths;

                        const cappedCount = Math.min(myUltsUsed, 5);
                        countMap[cappedCount].total++;
                        if (isWin) countMap[cappedCount].wins++;

                        myHeroesUsedUlt.forEach(hero => {
                            if (!heroUltMap[hero]) heroUltMap[hero] = { uses: 0, wins: 0 };
                            heroUltMap[hero].uses++;
                            if (isWin) heroUltMap[hero].wins++;
                        });
                    };

                    const processFight = (fight) => {
                        if (!fight || fight.events.length === 0) return;
                        if (baseTeam === 'All' || baseTeam === t1Name) processPerspective(fight, t1Name, t2Name);
                        if (baseTeam === 'All' || baseTeam === t2Name) processPerspective(fight, t2Name, t1Name);
                    };

                    events.forEach(ev => {
                        if (ev.event_type !== 'kill' && ev.event_type !== 'ultimate_start') return;
                        if (!currentFight || ev.timestamp > currentFight.endTime) {
                            if (currentFight) processFight(currentFight);
                            currentFight = { endTime: ev.timestamp + FIGHT_GAP, events: [ev] };
                        } else {
                            currentFight.events.push(ev);
                            currentFight.endTime = ev.timestamp + FIGHT_GAP; 
                        }
                    });
                    if (currentFight) processFight(currentFight); 
                });
            });
        });

        const countStats = Object.keys(countMap).map(count => ({
            name: count === '5' ? '5개 이상' : `${count}개`,
            uses: countMap[count].total,
            winRate: countMap[count].total > 0 ? Math.round((countMap[count].wins / countMap[count].total) * 100) : 0
        }));

        const heroStats = Object.entries(heroUltMap)
            .map(([hero, data]) => ({ hero, uses: data.uses, winRate: data.uses > 0 ? Math.round((data.wins / data.uses) * 100) : 0 }))
            .filter(h => h.uses >= 5) 
            .sort((a, b) => b.winRate - a.winRate);

        return { countStats, heroStats };
    }, [allScrims, startDate, endDate, baseTeam]);

    return (
        <div style={{ padding: "40px", maxWidth: 1200, margin: "0 auto", color: theme.text }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems:'center', marginBottom:'24px' }}>
                <h1 style={{ fontSize: 24, fontWeight: 900, margin:0, display:'flex', alignItems:'center', gap:'10px' }}>
                    <Zap size={24} color={NEON_GREEN}/> {t.ultStatsTitle}
                </h1>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: theme.textSub }}>
                    <Users size={18}/> {t.baseTeam}
                </div>
                <select value={baseTeam} onChange={e => setBaseTeam(e.target.value)} style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '8px 12px', borderRadius: '8px', outline: 'none', fontWeight: 'bold' }}>
                    <option value="All">{t.allTeams}</option>
                    {allTeams.map(team => <option key={team} value={team}>{team}</option>)}
                </select>

                <div style={{ width: '1px', height: '24px', background: theme.border, margin: '0 8px' }}></div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: theme.textSub }}>
                    <Calendar size={18}/> {t.dateFilter}
                </div>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '8px 12px', borderRadius: '8px', colorScheme: theme.mode === 'dark' ? 'dark' : 'light' }} />
                <span style={{ color: theme.textSub }}>~</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '8px 12px', borderRadius: '8px', colorScheme: theme.mode === 'dark' ? 'dark' : 'light' }} />
                {(startDate || endDate) && <button onClick={() => { setStartDate(""); setEndDate(""); }} style={{ background: 'transparent', border: 'none', color: theme.danger, cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }}>초기화</button>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px' }}>
                    <h3 style={{fontSize:'18px', fontWeight:'bold', marginBottom:'24px', display:'flex', alignItems:'center', gap:'8px'}}><Activity size={20} color={theme.primary}/> {t.ultCountVsWin}</h3>
                    <div style={{ width: '100%', height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={ultAnalysis.countStats}>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                                <XAxis dataKey="name" stroke={theme.textSub} fontSize={13} tickLine={false} axisLine={false}/>
                                <YAxis stroke={theme.textSub} fontSize={13} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v)=>`${v}%`}/>
                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: theme.surfaceHighlight, border: 'none', borderRadius: '8px', color: theme.text }} formatter={(value, name) => [name === 'winRate' ? `${value}%` : value, name === 'winRate' ? t.winRate : t.fightCount]} />
                                <Legend />
                                <Bar dataKey="winRate" name={t.winRate} radius={[6, 6, 0, 0]} barSize={40}>
                                    {/* 💡 승률이 50% 이상이면 형광색, 아니면 빨간색 적용 */}
                                    {ultAnalysis.countStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.winRate >= 50 ? NEON_GREEN : theme.danger} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px', maxHeight: '460px', overflowY: 'auto' }}>
                    <h3 style={{fontSize:'18px', fontWeight:'bold', marginBottom:'20px', display:'flex', alignItems:'center', gap:'8px'}}><Target size={20} color={theme.warning}/> {t.ultEfficiency}</h3>
                    {ultAnalysis.heroStats.length === 0 ? <div style={{textAlign:'center', color:theme.textSub, marginTop:'40px'}}>{t.noData}</div> : (
                        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'14px'}}>
                            <thead style={{ position: 'sticky', top: '-24px', background: theme.surface, zIndex: 1 }}>
                                <tr style={{borderBottom:`1px solid ${theme.border}`, color: theme.textSub, textAlign:'left'}}>
                                    <th style={{padding:'12px'}}>{t.hero}</th>
                                    <th style={{padding:'12px', textAlign:'center'}}>{t.ultUses} (총합)</th>
                                    <th style={{padding:'12px', textAlign:'right'}}>{t.winRate} (가치)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ultAnalysis.heroStats.map((h, i) => (
                                    <tr key={i} style={{borderBottom:`1px solid ${theme.border}`}}>
                                        <td style={{padding:'12px', display:'flex', alignItems:'center', gap:'12px', fontWeight:'bold'}}>
                                            <span style={{color: theme.textSub, width:'20px'}}>{i+1}</span>
                                            <img src={getHeroImageSrc(h.hero)} alt={h.hero} style={{width:'32px', height:'32px', borderRadius:'6px', background:'#000'}}/>
                                            {h.hero}
                                        </td>
                                        <td style={{padding:'12px', textAlign:'center'}}>{h.uses}회</td>
                                        <td style={{
                                            padding:'12px', 
                                            textAlign:'right', 
                                            color: h.winRate >= 50 ? NEON_GREEN : theme.danger, 
                                            fontWeight:'900', 
                                            fontSize:'16px',
                                            textShadow: h.winRate >= 50 ? `0 0 8px ${NEON_GREEN}40` : 'none'
                                        }}>{h.winRate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}