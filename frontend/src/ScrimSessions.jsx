import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Calendar, ChevronRight, Clock, RefreshCw, Filter } from 'lucide-react';
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const ScrimSessions = ({ onSelectScrim }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const [scrims, setScrims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false); 
  
  // 날짜 필터 상태
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const fetchScrims = async () => {
    try {
      const res = await axios.get('/api/scrims');
      setScrims(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchScrims(); }, []);

  const handleRebuildDB = async (e) => {
    e.stopPropagation();
    if (!window.confirm("DB를 복구하시겠습니까? (Rebuild DB?)")) return;
    setRebuilding(true);
    try {
      const res = await axios.post('/api/admin/rebuild-db');
      alert(`Done! ${res.data.count} scrims restored.`);
      fetchScrims(); 
    } catch (err) {
      console.error(err);
      alert("Error: Check backend logs.");
    } finally {
      setRebuilding(false);
    }
  };

  // 날짜 필터링 적용
  const filteredScrims = useMemo(() => {
      return scrims.filter(s => {
          if (!startDate && !endDate) return true;
          if (startDate && s.date < startDate) return false;
          if (endDate && s.date > endDate) return false;
          return true;
      });
  }, [scrims, startDate, endDate]);

  if (loading) return <div style={{padding:'40px', color: theme.textSub, textAlign:'center'}}>{t.loading}</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', color: theme.text }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{t.sessions}</h2>
            <p style={{ color: theme.textSub, fontSize: '14px', marginTop: '4px' }}>{t.viewHistory}</p>
        </div>
        
        <button 
            onClick={handleRebuildDB} 
            disabled={rebuilding}
            style={{ 
                background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textSub, 
                padding: '10px 16px', borderRadius: '8px', cursor: rebuilding ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600'
            }}
        >
            <RefreshCw size={16} className={rebuilding ? "spin-anim" : ""} /> 
            {rebuilding ? "Rebuilding..." : "Rebuild DB"}
        </button>
      </div>

      {/* 날짜 필터 바 */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: theme.textSub }}>
              <Filter size={18}/> {t.dateFilter}
          </div>
          <input 
              type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '8px 12px', borderRadius: '8px', colorScheme: theme.mode === 'dark' ? 'dark' : 'light' }} 
          />
          <span style={{ color: theme.textSub }}>~</span>
          <input 
              type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ background: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: '8px 12px', borderRadius: '8px', colorScheme: theme.mode === 'dark' ? 'dark' : 'light' }} 
          />
          {(startDate || endDate) && (
              <button onClick={() => { setStartDate(""); setEndDate(""); }} style={{ background: 'transparent', border: 'none', color: theme.danger, cursor: 'pointer', fontWeight: 'bold', marginLeft: 'auto' }}>
                  초기화
              </button>
          )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {filteredScrims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: theme.surface, borderRadius: '12px', border: `1px dashed ${theme.border}`, color: theme.textSub }}>
            <p>{t.noData}</p>
          </div>
        ) : (
          filteredScrims.map((scrim) => (
            <div 
              key={scrim.id} onClick={() => onSelectScrim(scrim.id)}
              style={{ 
                background: theme.surface, border: `1px solid ${theme.border}`, 
                borderRadius: '12px', padding: '24px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: theme.text }}>{scrim.scrim_name}</h3>
                <div style={{ display: 'flex', gap: '16px', color: theme.textSub, fontSize: '13px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14}/> {scrim.date}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14}/> {scrim.matches ? scrim.matches.length : 0} {t.fightCount}</span>
                </div>
              </div>
              <ChevronRight size={20} color={theme.textSub} />
            </div>
          ))
        )}
      </div>
      
      <style>{` .spin-anim { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } } `}</style>
    </div>
  );
};

export default ScrimSessions;