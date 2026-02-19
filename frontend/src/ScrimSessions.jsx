import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Calendar, ChevronRight, Clock, RefreshCw } from 'lucide-react';
// [중요] ThemeContext, LanguageContext 적용
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const ScrimSessions = ({ onSelectScrim }) => {
  const { theme } = useTheme(); // [테마 훅]
  const { t } = useLanguage();  // [언어 훅]

  const [scrims, setScrims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false); 

  const fetchScrims = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/scrims');
      setScrims(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrims();
  }, []);

  const handleRebuildDB = async (e) => {
    e.stopPropagation();
    // (선택) confirm 메시지도 다국어 처리가 필요하다면 LanguageContext에 추가 가능
    // 여기서는 간단히 하드코딩 유지하거나 context에 추가하여 사용
    if (!window.confirm("DB를 복구하시겠습니까? (Rebuild DB?)")) return;

    setRebuilding(true);
    try {
      const res = await axios.post('http://127.0.0.1:8000/api/admin/rebuild-db');
      alert(`Done! ${res.data.count} scrims restored.`);
      fetchScrims(); 
    } catch (err) {
      console.error(err);
      alert("Error: Check backend logs.");
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) return <div style={{padding:'40px', color: theme.textSub, textAlign:'center'}}>{t.loading}</div>;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', color: theme.text }}>
      
      {/* 헤더 영역 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
            <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{t.sessions}</h2>
            <p style={{ color: theme.textSub, fontSize: '14px', marginTop: '4px' }}>{t.viewHistory}</p>
        </div>
        
        {/* DB 복구 버튼 */}
        <button 
            onClick={handleRebuildDB} 
            disabled={rebuilding}
            style={{ 
                background: theme.surface, 
                border: `1px solid ${theme.border}`, 
                color: theme.textSub, 
                padding: '10px 16px', borderRadius: '8px', cursor: rebuilding ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600',
                transition: 'all 0.2s'
            }}
            onMouseOver={e => !rebuilding && (e.currentTarget.style.borderColor = theme.text, e.currentTarget.style.color = theme.text)}
            onMouseOut={e => !rebuilding && (e.currentTarget.style.borderColor = theme.border, e.currentTarget.style.color = theme.textSub)}
        >
            <RefreshCw size={16} className={rebuilding ? "spin-anim" : ""} /> 
            {rebuilding ? "Rebuilding..." : "Rebuild DB"}
        </button>
      </div>

      {/* 목록 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {scrims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: theme.surface, borderRadius: '12px', border: `1px dashed ${theme.border}`, color: theme.textSub }}>
            <p>{t.noData}</p>
          </div>
        ) : (
          scrims.map((scrim) => (
            <div 
              key={scrim.id} 
              onClick={() => onSelectScrim(scrim.id)}
              style={{ 
                background: theme.surface, 
                border: `1px solid ${theme.border}`, 
                borderRadius: '12px', padding: '24px', 
                cursor: 'pointer', transition: 'transform 0.2s', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
              onMouseOver={e => e.currentTarget.style.borderColor = theme.borderHighlight}
              onMouseOut={e => e.currentTarget.style.borderColor = theme.border}
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
      
      <style>{`
        .spin-anim { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default ScrimSessions;