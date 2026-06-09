import React, { useState, useMemo, useEffect } from 'react';
import axios from 'axios';
import { Swords, Youtube, Map as MapIcon, Users, Clock } from 'lucide-react';
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { buildVideoLink, hasVideo } from "./utils/videoLink";

const API_BASE = "";

// 우리 팀(기준 팀). 매치마다 team1/team2 중 한쪽이 FLC이고, 나머지가 상대팀이다.
const OUR_TEAM = "FLC";
const opponentOf = (it) => (it.team1_name === OUR_TEAM ? it.team2_name : it.team1_name);

// 재생 기점: 각 라운드 시작 후 이 초만큼 뒤. (백엔드 round_start_sec는 real 좌표라 그대로 +가능)
const ROUND_START_LEAD_SEC = 10;

const fmtClock = (sec) => {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
};

export default function FirstFightStats() {
    const { theme } = useTheme();
    const { t } = useLanguage();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedOpponent, setSelectedOpponent] = useState('All');
    const [selectedMap, setSelectedMap] = useState('All');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const res = await axios.get(`${API_BASE}/api/first-fights`);
                if (alive) setItems(res.data || []);
            } catch (err) {
                console.error("❌ Failed to fetch first-fights:", err);
                if (alive) setError(err);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const opponentList = useMemo(() => {
        const teams = new Set();
        items.forEach(it => { const o = opponentOf(it); if (o) teams.add(o); });
        return Array.from(teams).sort();
    }, [items]);

    const mapList = useMemo(() => {
        const maps = new Set();
        items.forEach(it => { if (it.map_name) maps.add(it.map_name); });
        return Array.from(maps).sort();
    }, [items]);

    const filtered = useMemo(() => {
        return items.filter(it => {
            if (selectedOpponent !== 'All' && opponentOf(it) !== selectedOpponent) return false;
            if (selectedMap !== 'All' && it.map_name !== selectedMap) return false;
            return true;
        });
    }, [items, selectedOpponent, selectedMap]);

    const ACCENT = "#f59e0b";
    const selectStyle = { background: theme.bg, color: theme.text, border: `1px solid ${theme.borderHighlight}`, padding: '8px 12px', borderRadius: '8px', outline: 'none', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' };

    return (
        <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', color: theme.text }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '32px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Swords size={36} color={ACCENT} /> {t.ffTitle}
                </h1>
                <p style={{ color: theme.textSub, marginTop: '8px' }}>{t.ffDesc}</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: theme.surfaceHighlight, padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                    <Users size={16} color={theme.textSub} />
                    <select value={selectedOpponent} onChange={e => setSelectedOpponent(e.target.value)} style={selectStyle}>
                        <option value="All">{t.ffAllOpponents}</option>
                        {opponentList.map(tm => <option key={tm} value={tm}>{tm}</option>)}
                    </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: theme.surfaceHighlight, padding: '8px 16px', borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                    <MapIcon size={16} color={theme.textSub} />
                    <select value={selectedMap} onChange={e => setSelectedMap(e.target.value)} style={selectStyle}>
                        <option value="All">{t.ffAllMaps}</option>
                        {mapList.map(mp => <option key={mp} value={mp}>{mp}</option>)}
                    </select>
                </div>
            </div>

            <div style={{ background: theme.bg, borderRadius: '16px', border: `1px solid ${theme.border}`, overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ background: theme.surfaceHighlight }}>
                        <tr>
                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', color: theme.textSub }}>{t.ffColDate}</th>
                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', color: theme.textSub }}>{t.ffColMap}</th>
                            <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: theme.textSub }}>{t.ffColRound}</th>
                            <th style={{ padding: '16px', textAlign: 'left', fontSize: '13px', color: theme.textSub }}>{t.ffColMatchup}</th>
                            <th style={{ padding: '16px', textAlign: 'right', fontSize: '13px', color: theme.textSub }}>{t.ffColTime}</th>
                            <th style={{ padding: '16px', textAlign: 'center', fontSize: '13px', color: theme.textSub }}>{t.ffColLink}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((it, idx) => {
                            const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)';
                            const videoUrl = it.video_url || "";
                            const match = { video_url: videoUrl, video_offset: it.video_offset, game_setup_sec: it.game_setup_sec, pauses: it.pauses || [] };
                            const jumpTs = Math.max(0, (Number(it.round_start_sec) || 0) + ROUND_START_LEAD_SEC);
                            const link = hasVideo(videoUrl) ? buildVideoLink(videoUrl, jumpTs, match) : null;
                            return (
                                <tr key={`${it.match_id}-${it.round_number ?? 'm'}-${idx}`} style={{ background: rowBg, borderBottom: `1px solid ${theme.border}40` }}>
                                    <td style={{ padding: '16px', fontSize: '13px', color: theme.textSub }}>{it.session_date || '-'}</td>
                                    <td style={{ padding: '16px', fontWeight: 'bold' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <MapIcon size={16} color={ACCENT} /> {it.map_name}
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center', color: theme.textSub }}>
                                        {it.round_number != null ? `R${it.round_number}` : '-'}
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{ fontWeight: 'bold', color: ACCENT }}>{OUR_TEAM}</span>
                                        <span style={{ color: theme.textSub, margin: '0 6px', fontSize: '12px' }}>vs</span>
                                        <span style={{ fontWeight: 'bold' }}>{opponentOf(it)}</span>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right', color: theme.textSub }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={13} /> {fmtClock(it.start_game_timestamp)}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'center' }}>
                                        {link ? (
                                            <a href={link} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', background: `${theme.danger}20`, color: theme.danger, textDecoration: 'none', fontWeight: 'bold', fontSize: '13px' }}>
                                                <Youtube size={16} /> {t.ffWatch}
                                            </a>
                                        ) : (
                                            <span style={{ color: theme.textSub, fontSize: '12px' }}>{t.ffNoVideo}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: theme.textSub }}>
                                    {error ? t.ffError : t.noFilteredData}
                                </td>
                            </tr>
                        )}
                        {loading && (
                            <tr>
                                <td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: theme.textSub }}>{t.ffLoading}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
