import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Calendar, ChevronRight, Clock, RefreshCw, Filter, Trash2 } from 'lucide-react';
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";

const ScrimSessions = ({ onSelectScrim }) => {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const [scrims, setScrims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const filteredScrims = useMemo(() => {
    return scrims.filter(s => {
      if (startDate && s.date < startDate) return false;
      if (endDate && s.date > endDate) return false;
      return true;
    });
  }, [scrims, startDate, endDate]);

  const enterSelectMode = () => {
    setIsSelectMode(true);
    setSelectedIds(new Set());
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredScrims.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredScrims.map(s => s.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const totalMatches = scrims
      .filter(s => ids.includes(s.id))
      .reduce((sum, s) => sum + (s.matches?.length || 0), 0);

    const msg = `선택한 ${ids.length}개 세션을 삭제하시겠습니까?\n이 세션에 포함된 총 ${totalMatches}개의 매치도 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`;
    if (!window.confirm(msg)) return;

    setDeleting(true);
    try {
      const res = await axios.post('/api/sessions/delete-batch', { ids });
      if (res.data.warnings?.length > 0) {
        alert(`삭제 완료 (${res.data.deleted_count}개)\n경고:\n${res.data.warnings.join('\n')}`);
      }
      if (res.data.failed_ids?.length > 0) {
        alert(`일부 삭제 실패: ${res.data.failed_ids.join(', ')}`);
      }
      await fetchScrims();
      exitSelectMode();
    } catch (err) {
      alert(`삭제 실패: ${err.response?.data?.detail || err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div style={{ padding: '40px', color: theme.textSub, textAlign: 'center' }}>{t.loading}</div>;

  const allSelected = filteredScrims.length > 0 && selectedIds.size === filteredScrims.length;

  return (
    <div style={{ padding: '40px', maxWidth: '1200px', margin: '0 auto', color: theme.text }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', margin: 0 }}>{t.sessions}</h2>
          <p style={{ color: theme.textSub, fontSize: '14px', marginTop: '4px' }}>{t.viewHistory}</p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isSelectMode ? (
            <button
              onClick={exitSelectMode}
              style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textSub, padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}
            >
              선택 취소
            </button>
          ) : (
            <>
              <button
                onClick={enterSelectMode}
                style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.danger || '#ef4444', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}
              >
                <Trash2 size={15} /> 삭제
              </button>
              <button
                onClick={handleRebuildDB}
                disabled={rebuilding}
                style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textSub, padding: '10px 16px', borderRadius: '8px', cursor: rebuilding ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600' }}
              >
                <RefreshCw size={16} className={rebuilding ? "spin-anim" : ""} />
                {rebuilding ? "Rebuilding..." : "Rebuild DB"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 선택 모드 액션 바 */}
      {isSelectMode && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '12px 16px' }}>
          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text, flex: 1 }}>
            {selectedIds.size}개 선택됨
          </span>
          <button
            onClick={toggleSelectAll}
            style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.textSub, padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
          >
            {allSelected ? '전체 해제' : '전체 선택'}
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={selectedIds.size === 0 || deleting}
            style={{ background: selectedIds.size > 0 ? (theme.danger || '#ef4444') : theme.surfaceHighlight, border: 'none', color: selectedIds.size > 0 ? '#fff' : theme.textSub, padding: '6px 16px', borderRadius: '6px', cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed', fontSize: '13px', fontWeight: '700', opacity: deleting ? 0.6 : 1 }}
          >
            {deleting ? '삭제 중...' : '선택 삭제'}
          </button>
        </div>
      )}

      {/* 날짜 필터 바 */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '24px', background: theme.surface, padding: '16px', borderRadius: '12px', border: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', color: theme.textSub }}>
          <Filter size={18} /> {t.dateFilter}
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
          filteredScrims.map((scrim) => {
            const isChecked = selectedIds.has(scrim.id);
            return (
              <div
                key={scrim.id}
                onClick={() => isSelectMode ? toggleSelect(scrim.id) : onSelectScrim(scrim.id)}
                style={{
                  background: isChecked ? `${theme.danger || '#ef4444'}12` : theme.surface,
                  border: `1px solid ${isChecked ? (theme.danger || '#ef4444') : theme.border}`,
                  borderRadius: '12px', padding: '24px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {isSelectMode && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(scrim.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '18px', height: '18px', accentColor: theme.danger || '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                    />
                  )}
                  <div>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: theme.text }}>{scrim.scrim_name}</h3>
                    <div style={{ display: 'flex', gap: '16px', color: theme.textSub, fontSize: '13px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> {scrim.date}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={14} /> {scrim.matches ? scrim.matches.length : 0} {t.fightCount}</span>
                    </div>
                  </div>
                </div>
                {!isSelectMode && <ChevronRight size={20} color={theme.textSub} />}
              </div>
            );
          })
        )}
      </div>

      <style>{` .spin-anim { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } } `}</style>
    </div>
  );
};

export default ScrimSessions;
