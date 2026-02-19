import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ChevronLeft, RefreshCw, Search, X, Youtube, Zap, Skull, Trophy, Map as MapIcon, User, Filter, BarChart2, PieChart } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";

// [중요] ThemeContext와 LanguageContext 가져오기
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const API_BASE = import.meta.env.PROD ? "" : "http://127.0.0.1:8000";

const KEYWORD_TYPES = { MAP: "MAP", HERO: "HERO", EVENT: "EVENT", RESULT: "RESULT", PLAYER: "PLAYER" };
const EVENT_KEYWORDS = { "궁극기": "ultimate_start", "궁": "ultimate_start", "ult": "ultimate_start", "처치": "kill", "킬": "kill", "kill": "kill", "죽음": "death", "데스": "death", "death": "death" };
const RESULT_KEYWORDS = { "승리": "win", "승": "win", "win": "win", "패배": "lose", "패": "lose", "lose": "lose", "무승부": "draw", "무": "draw", "draw": "draw" };
const KNOWN_MAPS = [ "왕의 길", "눔바니", "미드타운", "블리자드 월드", "아이헨발데", "파라이소", "할리우드", "도라도", "리알토", "서킷 로얄", "쓰레기촌", "66번 국도", "지브raltar", "샴발리", "하바나", "네팔", "리장", "부산", "오아시스", "일리오스", "남극", "사모아", "뉴 퀸 스트리트", "콜로세오", "에스페란사", "룬아사피", "뉴 정크 시티", "수라바사", "하나오카", "아누비스" ];
const KNOWN_HEROES = [ '디바', '둠피스트', '정커퀸', '마우가', '오리사', '라마트라', '라인하르트', '로드호그', '시그마', '윈스턴', '레킹볼', '자리야', '해저드', '애쉬', '바스티온', '캐서디', '에코', '겐지', '한조', '정크랫', '메이', '파라', '리퍼', '소전', '솔저76', '솜브라', '시메트라', '토르비욘', '트레이서', '위도우메이커', '벤처', '벤데타', '프레야', '아나', '바티스트', '브리기테', '일리아리', '주노', '키리코', '라이프위버', '루시우', '메르시', '모이라', '젠야타', '우양' ];

const normalize = (str) => (str || "").replace(/\s+/g, "").toLowerCase();

const getYouTubeLink = (videoUrl, offset, timestamp, pauses = []) => {
    if (!videoUrl) return "#";
    let targetVideoTime = (Number(offset) || 0) + timestamp;
    if (pauses && pauses.length > 0) {
        const sortedPauses = [...pauses].sort((a, b) => a.start_sec - b.start_sec);
        for (const p of sortedPauses) {
            if (p.start_sec <= targetVideoTime) {
                targetVideoTime += (p.end_sec - p.start_sec);
            }
        }
    }
    const finalTime = Math.floor(targetVideoTime);
    return videoUrl.includes('?') ? `${videoUrl}&t=${finalTime}` : `${videoUrl}?t=${finalTime}`;
};

export default function OverallStats({ onBack, onGoSessions }) {
  const { theme } = useTheme(); // [테마 훅]
  const { t } = useLanguage(); // [언어 훅]

  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [inputText, setInputText] = useState("");
  const [activeTags, setActiveTags] = useState([]); 
  const [activeTab, setActiveTab] = useState("dashboard");

  async function loadAll() {
    setLoading(true);
    try {
      const scrimsRes = await axios.get(`${API_BASE}/api/scrims`);
      const scrims = scrimsRes.data || [];
      const ids = [];
      const videoUrlMap = {}; 
      
      for (const s of scrims) {
        for (const m of s.matches || []) {
            ids.push(m.id);
            videoUrlMap[m.id] = s.video_url;
        }
      }

      const chunks = [];
      for (let i = 0; i < ids.length; i += 20) chunks.push(ids.slice(i, i + 20));
      
      const out = [];
      for (const c of chunks) {
        const resList = await Promise.all(c.map(id => axios.get(`${API_BASE}/api/matches/${id}`).then(r => r.data).catch(() => null)));
        for (const m of resList) {
            if (m) {
                if (!m.video_url) m.video_url = videoUrlMap[m.id];
                out.push(m);
            }
        }
      }
      setMatches(out);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setReloading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  const handleReload = () => { setReloading(true); loadAll(); };

  const addTag = (text) => {
    const cleanText = text.trim();
    if (!cleanText) return;
    if (activeTags.some(t => t.label === cleanText)) { setInputText(""); return; }

    let type = KEYWORD_TYPES.PLAYER;
    let value = cleanText;

    if (KNOWN_MAPS.some(m => cleanText.includes(m) || m.includes(cleanText))) type = KEYWORD_TYPES.MAP;
    else if (KNOWN_HEROES.some(h => normalize(cleanText) === normalize(h))) type = KEYWORD_TYPES.HERO;
    else if (EVENT_KEYWORDS[cleanText]) { type = KEYWORD_TYPES.EVENT; value = EVENT_KEYWORDS[cleanText]; }
    else if (RESULT_KEYWORDS[cleanText]) { type = KEYWORD_TYPES.RESULT; value = RESULT_KEYWORDS[cleanText]; }

    setActiveTags([...activeTags, { type, value, label: cleanText }]);
    setInputText("");
  };

  const removeTag = (index) => {
    const newTags = [...activeTags];
    newTags.splice(index, 1);
    setActiveTags(newTags);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') addTag(inputText); };

  const filteredData = useMemo(() => {
    if (!matches.length) return { stats: null, moments: [], heroStats: [], mapStats: [] };

    let targetMatches = matches;
    const mapTag = activeTags.find(t => t.type === KEYWORD_TYPES.MAP);
    const resultTag = activeTags.find(t => t.type === KEYWORD_TYPES.RESULT);
    const heroTag = activeTags.find(t => t.type === KEYWORD_TYPES.HERO);
    const playerTag = activeTags.find(t => t.type === KEYWORD_TYPES.PLAYER);

    if (mapTag) targetMatches = targetMatches.filter(m => m.map_name.includes(mapTag.label));
    if (resultTag) {
        targetMatches = targetMatches.filter(m => {
            const isWin = m.result.includes('승') || m.winner === m.team_1_name;
            if (resultTag.value === 'win') return isWin;
            if (resultTag.value === 'lose') return !isWin && !m.result.includes('무');
            if (resultTag.value === 'draw') return m.result.includes('무');
            return true;
        });
    }

    let totalWins = 0, totalGames = 0, totalKills = 0, totalDeaths = 0, totalDmg = 0;
    const heroMap = {}; 
    const mapMap = {};  

    targetMatches.forEach(m => {
        if (playerTag) {
            const playerInGame = m.stats.some(s => s.player_name.toLowerCase().includes(playerTag.label.toLowerCase()));
            if (!playerInGame) return;
        }

        if (heroTag) {
            const heroPlayed = m.stats.some(s => {
                const isHeroMatch = normalize(s.hero_name) === normalize(heroTag.label);
                if (playerTag) return isHeroMatch && s.player_name.toLowerCase().includes(playerTag.label.toLowerCase());
                return isHeroMatch;
            });
            if (!heroPlayed) return; 
        }

        const isWin = m.result.includes('승') || m.winner === m.team_1_name;
        totalGames++;
        if (isWin) totalWins++;

        if (!mapMap[m.map_name]) mapMap[m.map_name] = { games: 0, wins: 0 };
        mapMap[m.map_name].games++;
        if (isWin) mapMap[m.map_name].wins++;

        const targetStats = m.stats.filter(s => {
            if (!(s.team_name === m.team_1_name || s.team_name.includes('1'))) return false;
            if (playerTag && !s.player_name.toLowerCase().includes(playerTag.label.toLowerCase())) return false;
            return true;
        });

        targetStats.forEach(s => {
            totalKills += s.eliminations;
            totalDeaths += s.deaths;
            totalDmg += s.hero_damage_dealt;

            const hName = s.hero_name;
            if (!heroMap[hName]) heroMap[hName] = { games: 0, wins: 0, kills: 0, deaths: 0, dmg: 0, playTime: 0 };
            
            heroMap[hName].playTime += s.hero_time_played;
            heroMap[hName].kills += s.eliminations;
            heroMap[hName].deaths += s.deaths;
            heroMap[hName].dmg += s.hero_damage_dealt;
        });

        const playedHeroesInThisMatch = new Set(targetStats.map(s => s.hero_name));
        playedHeroesInThisMatch.forEach(hName => {
            if (heroMap[hName]) {
                heroMap[hName].games++;
                if (isWin) heroMap[hName].wins++;
            }
        });
    });

    const heroStatsArr = Object.entries(heroMap).map(([name, data]) => ({
        name,
        games: data.games,
        winRate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0,
        kda: data.deaths > 0 ? (data.kills / data.deaths).toFixed(2) : data.kills.toFixed(2),
        avgDmg: data.games > 0 ? Math.round(data.dmg / data.games) : 0,
        playTime: data.playTime
    })).sort((a, b) => b.games - a.games);

    const mapStatsArr = Object.entries(mapMap).map(([name, data]) => ({
        name,
        games: data.games,
        winRate: data.games > 0 ? Math.round((data.wins / data.games) * 100) : 0
    })).sort((a, b) => b.games - a.games);

    const eventTag = activeTags.find(t => t.type === KEYWORD_TYPES.EVENT);
    const moments = [];
    targetMatches.forEach(m => {
        (m.rounds || []).forEach(r => {
            (r.events || []).forEach(ev => {
                let isMatch = true;
                
                if (playerTag) {
                    if (!ev.player_name || !ev.player_name.toLowerCase().includes(playerTag.label.toLowerCase())) isMatch = false;
                }

                if (heroTag) {
                    const evHero = ev.player_hero || ev.hero; 
                    if (!evHero || normalize(evHero) !== normalize(heroTag.label)) isMatch = false;
                }

                if (eventTag) {
                    if (eventTag.value === 'ultimate_start' && ev.event_type !== 'ultimate_start') isMatch = false;
                    if (eventTag.value === 'kill' && ev.event_type !== 'kill') isMatch = false;
                } else {
                    if (ev.event_type !== 'ultimate_start' && ev.event_type !== 'kill') isMatch = false;
                }

                if (isMatch) {
                    moments.push({
                        id: m.id + ev.timestamp + ev.player_name,
                        matchName: m.map_name,
                        desc: ev.desc || (ev.event_type === 'kill' ? `${ev.player_name} 킬 ➜ ${ev.target_name}` : `${ev.player_name} 궁극기`),
                        hero: ev.player_hero || ev.hero,
                        timestamp: ev.timestamp,
                        videoUrl: m.video_url,
                        videoOffset: m.video_offset,
                        pauses: m.pauses,
                        type: ev.event_type
                    });
                }
            });
        });
    });

    const statDivisor = playerTag ? totalGames : (totalGames * 5); 
    
    return {
        stats: {
            totalGames,
            winRate: totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(1) : 0,
            avgKills: statDivisor > 0 ? (totalKills / statDivisor).toFixed(1) : 0,
            avgDeaths: statDivisor > 0 ? (totalDeaths / statDivisor).toFixed(1) : 0,
            avgDmg: statDivisor > 0 ? (totalDmg / statDivisor).toFixed(0) : 0,
        },
        heroStats: heroStatsArr,
        mapStats: mapStatsArr,
        moments: moments.slice(0, 60)
    };
  }, [matches, activeTags]);

  const tagColor = (type) => {
      switch(type) {
          case KEYWORD_TYPES.MAP: return theme.success;
          case KEYWORD_TYPES.HERO: return theme.primary;
          case KEYWORD_TYPES.EVENT: return theme.warning;
          case KEYWORD_TYPES.RESULT: return theme.danger;
          case KEYWORD_TYPES.PLAYER: return '#8b5cf6';
          default: return theme.textSub;
      }
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button 
        onClick={() => setActiveTab(id)}
        style={{
            flex: 1,
            padding: '12px',
            background: activeTab === id ? theme.surfaceHighlight : 'transparent',
            border: 'none',
            borderBottom: activeTab === id ? `2px solid ${theme.primary}` : `2px solid ${theme.border}`,
            color: activeTab === id ? theme.text : theme.textSub,
            fontWeight: 'bold',
            cursor: 'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:'8px',
            transition: 'all 0.2s'
        }}
    >
        <Icon size={16}/> {label}
    </button>
  );

  // [카드 컴포넌트] 내부 정의 (테마 사용)
  const Card = ({ title, value, color }) => (
    <div
      style={{
        border: `1px solid ${theme.border}`,
        background: theme.surface,
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}
    >
      <div style={{ color: theme.textSub, fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: color || theme.text }}>{value}</div>
    </div>
  );

  return (
    <div style={{ padding: "40px", maxWidth: 1200, margin: "0 auto", color: theme.text }}>
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems:'center', marginBottom:'24px' }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={onBack} style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: 10, padding: "10px 12px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <ChevronLeft size={16} /> {t.back}
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 900, margin:0 }}>{t.overall} & 분석</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onGoSessions} style={{ background: theme.surfaceHighlight, border: `1px solid ${theme.borderHighlight}`, color: theme.text, padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 700 }}>{t.sessions}</button>
          <button onClick={handleReload} disabled={reloading} style={{ background: theme.surfaceHighlight, border: `1px solid ${theme.borderHighlight}`, color: theme.text, padding: "10px 14px", borderRadius: 10, cursor: reloading ? "wait" : "pointer", fontWeight: 900, display: "inline-flex", gap: 8, alignItems: "center", opacity: reloading ? 0.7 : 1 }}>
            <RefreshCw size={16} className={reloading ? "spin" : ""} /> {t.reload}
          </button>
        </div>
      </div>

      {/* 검색 바 */}
      <div style={{ background: theme.surface, padding: '20px', borderRadius: '16px', border: `1px solid ${theme.border}`, marginBottom: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: theme.bg, padding: '12px 16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
            <Search size={20} color={theme.textSub} />
            <input 
                type="text" 
                placeholder={t.filterPlaceholder} 
                style={{ background: 'transparent', border: 'none', color: theme.text, fontSize: '16px', flex: 1, outline: 'none' }}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
            />
            {inputText && <button onClick={() => addTag(inputText)} style={{background: theme.primary, color:'#fff', border:'none', borderRadius:'6px', padding:'4px 12px', cursor:'pointer', fontWeight:'bold'}}>{t.add}</button>}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
            {activeTags.length === 0 && <span style={{fontSize:'13px', color: theme.textSub, paddingLeft:'4px', display:'flex', alignItems:'center', gap:'6px'}}><Filter size={12}/> {t.filterTip}</span>}
            {activeTags.map((tag, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: `${tagColor(tag.type)}20`, border: `1px solid ${tagColor(tag.type)}`, padding: '6px 12px', borderRadius: '20px', fontSize: '13px', color: tagColor(tag.type), fontWeight: 'bold' }}>
                    {tag.type === KEYWORD_TYPES.MAP && <MapIcon size={12}/>}
                    {tag.type === KEYWORD_TYPES.HERO && <Zap size={12}/>}
                    {tag.type === KEYWORD_TYPES.PLAYER && <User size={12}/>}
                    {tag.type === KEYWORD_TYPES.RESULT && <Trophy size={12}/>}
                    <span>{tag.label}</span>
                    <button onClick={() => removeTag(idx)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', display:'flex', alignItems:'center' }}><X size={14} /></button>
                </div>
            ))}
        </div>
      </div>

      {loading ? (
        <div style={{ color: theme.textSub, textAlign:'center', padding:'40px' }}>{t.loading}</div>
      ) : (
        <>
            {/* 요약 카드 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: '24px' }}>
                <Card title={t.searchedGames} value={`${filteredData.stats?.totalGames || 0} ${t.gamesPlayed}`} />
                <Card title={t.avgWinRate} value={`${filteredData.stats?.winRate}%`} color={Number(filteredData.stats?.winRate) >= 50 ? theme.success : theme.danger} />
                <Card title={t.avgKills} value={filteredData.stats?.avgKills} />
                <Card title={t.avgDeaths} value={filteredData.stats?.avgDeaths} />
                <Card title={t.avgDmg} value={Number(filteredData.stats?.avgDmg).toLocaleString()} />
            </div>

            {/* 탭 메뉴 */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, marginBottom: '24px' }}>
                <TabButton id="dashboard" label={t.tabHighlights} icon={Youtube} />
                <TabButton id="heroes" label={t.tabHeroes} icon={User} />
                <TabButton id="maps" label={t.tabMaps} icon={MapIcon} />
            </div>

            {/* 탭 컨텐츠 */}
            {activeTab === 'dashboard' && (
                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px' }}>
                    <div style={{ fontSize: '18px', fontWeight: '900', marginBottom: '16px', display:'flex', alignItems:'center', gap:'8px' }}>
                        <Youtube size={20} color={theme.danger} />
                        {t.highlights} ({filteredData.moments.length})
                    </div>
                    {filteredData.moments.length === 0 ? (
                        <div style={{ textAlign: 'center', color: theme.textSub, padding: '40px' }}>{t.noMoments}</div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                            {filteredData.moments.map((moment, idx) => (
                                <a 
                                    key={idx} 
                                    href={getYouTubeLink(moment.videoUrl, moment.videoOffset, moment.timestamp, moment.pauses)} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    style={{ 
                                        textDecoration: 'none', background: theme.bg, border: `1px solid ${theme.border}`, 
                                        borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px',
                                        transition: 'transform 0.2s, border-color 0.2s'
                                    }}
                                    onMouseOver={e => { e.currentTarget.style.borderColor = theme.borderHighlight; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                    onMouseOut={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.transform = 'translateY(0)'; }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '12px', color: theme.textSub, display:'flex', alignItems:'center', gap:'4px' }}>
                                            <MapIcon size={12}/> {moment.matchName}
                                        </div>
                                        <div style={{ fontSize: '11px', color: theme.textDim, fontFamily:'monospace' }}>
                                            {Math.floor(moment.timestamp/60)}:{Math.floor(moment.timestamp%60).toString().padStart(2,'0')}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: theme.text, display:'flex', alignItems:'center', gap:'6px' }}>
                                        {moment.type === 'ultimate_start' && <Zap size={14} color={theme.warning}/>}
                                        {moment.type === 'kill' && <Skull size={14} color={theme.danger}/>}
                                        {moment.desc}
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'heroes' && (
                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px' }}>
                    <h3 style={{fontSize:'18px', fontWeight:'bold', marginBottom:'20px'}}>{t.heroStatsTitle}</h3>
                    {filteredData.heroStats.length > 0 ? (
                        <>
                            <div style={{ width: '100%', height: 300, marginBottom: '30px' }}>
                                <ResponsiveContainer>
                                    <BarChart data={filteredData.heroStats.slice(0, 10)}>
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} vertical={false}/>
                                        <XAxis dataKey="name" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false}/>
                                        <YAxis stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: theme.surface, border: 'none', borderRadius: '8px', color: theme.text, fontSize:'13px' }}/>
                                        <Legend />
                                        <Bar dataKey="winRate" name={t.winRate} fill={theme.primary} radius={[4, 4, 0, 0]} barSize={30} />
                                        <Bar dataKey="games" name={t.gamesPlayed} fill={theme.borderHighlight} radius={[4, 4, 0, 0]} barSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'14px'}}>
                                <thead>
                                    <tr style={{borderBottom:`1px solid ${theme.border}`, color: theme.textSub, textAlign:'left'}}>
                                        <th style={{padding:'12px'}}>{t.hero}</th>
                                        <th style={{padding:'12px'}}>{t.gamesPlayed}</th>
                                        <th style={{padding:'12px'}}>{t.winRate}</th>
                                        <th style={{padding:'12px'}}>{t.avgDmg}</th>
                                        <th style={{padding:'12px'}}>{t.kda}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredData.heroStats.map((h, i) => (
                                        <tr key={i} style={{borderBottom:`1px solid ${theme.border}`}}>
                                            <td style={{padding:'12px', fontWeight:'bold'}}>{h.name}</td>
                                            <td style={{padding:'12px'}}>{h.games}</td>
                                            <td style={{padding:'12px', color: h.winRate >= 50 ? theme.success : theme.danger}}>{h.winRate}%</td>
                                            <td style={{padding:'12px'}}>{h.avgDmg.toLocaleString()}</td>
                                            <td style={{padding:'12px'}}>{h.kda}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    ) : <div style={{padding:'40px', textAlign:'center', color: theme.textSub}}>{t.noData}</div>}
                </div>
            )}

            {activeTab === 'maps' && (
                <div style={{ background: theme.surface, borderRadius: '16px', border: `1px solid ${theme.border}`, padding: '24px' }}>
                    <h3 style={{fontSize:'18px', fontWeight:'bold', marginBottom:'20px'}}>{t.mapStatsTitle}</h3>
                    {filteredData.mapStats.length > 0 ? (
                        <>
                            <div style={{ width: '100%', height: 300, marginBottom: '30px' }}>
                                <ResponsiveContainer>
                                    <BarChart data={filteredData.mapStats.slice(0, 10)} layout="vertical">
                                        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} horizontal={false}/>
                                        <XAxis type="number" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false}/>
                                        <YAxis dataKey="name" type="category" stroke={theme.textSub} fontSize={12} tickLine={false} axisLine={false} width={100}/>
                                        <Tooltip cursor={{fill: 'transparent'}} contentStyle={{ backgroundColor: theme.surface, border: 'none', borderRadius: '8px', color: theme.text, fontSize:'13px' }}/>
                                        <Bar dataKey="winRate" name={t.winRate} fill={theme.success} radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'12px'}}>
                                {filteredData.mapStats.map((m, i) => (
                                    <div key={i} style={{background: theme.bg, padding:'16px', borderRadius:'12px', border: `1px solid ${theme.border}`}}>
                                        <div style={{fontSize:'14px', fontWeight:'bold', marginBottom:'4px'}}>{m.name}</div>
                                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px'}}>
                                            <span style={{color: theme.textSub}}>{m.games} {t.gamesPlayed}</span>
                                            <span style={{color: m.winRate>=50 ? theme.success : theme.danger, fontWeight:'bold'}}>{m.winRate}% {t.winRate}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : <div style={{padding:'40px', textAlign:'center', color: theme.textSub}}>{t.noData}</div>}
                </div>
            )}
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}