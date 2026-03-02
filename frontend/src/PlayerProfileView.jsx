import React, { useState, useMemo } from 'react';
import { User, Zap, Target, Crosshair, Shield, Activity, BarChart2, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts';

// 💡 영웅 이미지 예외 처리 (무조건 소문자 파일 매핑)
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

  let fileName = exactFileNames[heroName];
  if (!fileName) {
    fileName = heroName.replace(/[\s.:]/g, ''); 
  }

  return `/heroes/${fileName}.png`;
};

const getRoleIconSrc = (roleLabel) => {
    if (roleLabel === '탱크') return '/roles/tank.png';
    if (roleLabel === '딜러') return '/roles/damage.png';
    if (roleLabel === '지원') return '/roles/support.png';
    return null;
};

export default function PlayerProfileView({ playersData = [] }) {
  const [selectedRole, setSelectedRole] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('All');

  const availableTeams = useMemo(() => {
      const teams = new Set(playersData.map(p => p.team));
      return [...teams].filter(Boolean);
  }, [playersData]);

  const filteredPlayers = useMemo(() => {
    return playersData.filter(p => {
      if (selectedTeam !== 'All' && p.team !== selectedTeam) return false;
      if (selectedRole !== 'All' && p.role !== selectedRole) return false;
      if (searchTerm && !p.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  }, [playersData, selectedRole, searchTerm, selectedTeam]);

  const [selectedPlayer, setSelectedPlayer] = useState(null);

  React.useEffect(() => {
    if (filteredPlayers.length > 0 && (!selectedPlayer || !filteredPlayers.find(p => p.id === selectedPlayer.id))) {
      setSelectedPlayer(filteredPlayers[0]);
    }
  }, [filteredPlayers]);

  const cardStyle = { background: '#18181b', borderRadius: '16px', border: '1px solid #27272a', padding: '24px' };

  if (!playersData || playersData.length === 0) {
      return <div style={{textAlign:'center', padding:'60px', color:'#a1a1aa'}}>데이터가 없습니다.</div>;
  }

  return (
    <div style={{ display: 'flex', gap: '24px', color: '#fff', maxWidth: '1400px', margin: '0 auto' }}>
      
      <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '900', display:'flex', alignItems:'center', gap:'8px' }}>
            <Users size={20} /> 선수단 목록
        </h2>
        
        <input 
            type="text" placeholder="선수 검색..." value={searchTerm} onChange={(e)=>setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '12px', background: '#18181b', border: '1px solid #27272a', borderRadius: '8px', color: '#fff', outline: 'none' }}
        />
        
        <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)} style={{ width: '100%', padding: '10px', background: '#27272a', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', outline: 'none' }}>
            <option value="All">전체 팀 (All Teams)</option>
            {availableTeams.map(team => <option key={team} value={team}>{team}</option>)}
        </select>

        <div style={{ display: 'flex', gap: '8px' }}>
            {['All', '탱크', '딜러', '지원'].map(role => (
                <button 
                    key={role} onClick={() => setSelectedRole(role)}
                    style={{ flex: 1, padding: '8px', background: selectedRole === role ? '#3b82f6' : '#27272a', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                    {role === 'All' ? '전체' : role}
                </button>
            ))}
        </div>

        <div style={{ ...cardStyle, flex: 1, padding: '12px', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
            {filteredPlayers.map(p => (
                <div 
                    key={p.id} onClick={() => setSelectedPlayer(p)}
                    style={{ padding: '12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', background: selectedPlayer?.id === p.id ? '#27272a' : 'transparent', borderBottom: '1px solid #27272a', transition: 'all 0.2s' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {getRoleIconSrc(p.role) ? <img src={getRoleIconSrc(p.role)} style={{width:18, filter:'invert(1)'}}/> : <User size={18}/>}
                    </div>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{p.name}</div>
                        <div style={{ fontSize: '12px', color: '#a1a1aa' }}>{p.team || "Unknown"} · {p.role}</div>
                    </div>
                </div>
            ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {selectedPlayer ? (
          <>
            <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '4px', fontWeight: 'bold' }}>{selectedPlayer.team || "소속 불명"} · {selectedPlayer.role}</div>
                <h1 style={{ fontSize: '32px', fontWeight: '900', margin: 0 }}>{selectedPlayer.name}</h1>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', color: '#a1a1aa' }}>평균 승률</div>
                <div style={{ 
                    fontSize: '28px', 
                    fontWeight: '900', 
                    color: selectedPlayer.overview.winRate >= 50 ? '#39FF14' : '#f87171',
                    textShadow: selectedPlayer.overview.winRate >= 50 ? '0 0 15px rgba(57, 255, 20, 0.5)' : 'none'
                }}>
                    {selectedPlayer.overview.winRate}%
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[
                    { label: '종합 K/D', value: selectedPlayer.overview.kd.toFixed(2), icon: Target, color: '#3b82f6' },
                    { label: '10분당 딜량', value: selectedPlayer.overview.damagePer10.toLocaleString(), icon: Crosshair, color: '#f59e0b' },
                    { label: '10분당 힐량', value: selectedPlayer.overview.healPer10.toLocaleString(), icon: Shield, color: '#10b981' },
                    { label: '경기당 궁극기', value: selectedPlayer.overview.ultUsedPerMatch, icon: Zap, color: '#8b5cf6' }
                ].map((stat, idx) => (
                    <div key={idx} style={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '12px', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a1a1aa', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}><stat.icon size={16} color={stat.color}/> {stat.label}</div>
                        <div style={{ fontSize: '24px', fontWeight: '900' }}>{stat.value}</div>
                    </div>
                ))}
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', display:'flex', alignItems:'center', gap:'8px' }}>
                <Activity size={18}/> 모스트 영웅 풀
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                {selectedPlayer.heroPool.map((h, i) => (
                  <div key={i} style={{ background: '#27272a', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img src={getHeroImageSrc(h.hero)} style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#000' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{h.hero}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#a1a1aa' }}>
                            <span>승률 <span style={{
                                color: h.winRate >= 50 ? '#39FF14' : '#f87171',
                                textShadow: h.winRate >= 50 ? '0 0 8px rgba(57, 255, 20, 0.4)' : 'none'
                            }}>{h.winRate}%</span></span>
                            <span>K/D <strong>{h.kd}</strong></span>
                        </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', display:'flex', alignItems:'center', gap:'8px' }}>
                <TrendingUp size={18}/> 최근 K/D 폼 (Form)
              </div>
              <div style={{ width: '100%', height: '220px' }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={selectedPlayer.recentTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="match" stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}세트`} />
                    <YAxis stroke="#71717a" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 0.5', 'dataMax + 0.5']} />
                    <Tooltip contentStyle={{ backgroundColor: '#27272a', border: 'none', borderRadius: '8px', color:'#fff' }} />
                    <Line type="monotone" dataKey="kd" name="K/D" stroke="#f87171" strokeWidth={3} dot={{ r: 4, fill: '#18181b', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
            <div style={{ ...cardStyle, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
                선수를 선택해주세요.
            </div>
        )}
      </div>
    </div>
  );
}