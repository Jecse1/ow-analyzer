import React, { useState, useMemo } from 'react';
import { User, Zap, Target, Crosshair, Shield, Activity, BarChart2, TrendingUp } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line
} from 'recharts';

// [헬퍼] 영웅 이름 및 이미지 처리 (기존 코드와 동일하게 맞춰주시면 됩니다)
const getHeroImageSrc = (heroName) => {
  if (!heroName || heroName === 'Unknown') return null;
  const fileName = heroName.replace(/[\s.:]/g, ''); 
  return `/heroes/${fileName}.png`;
};

const getRoleIconSrc = (roleLabel) => {
    if (roleLabel === '탱크') return '/roles/tank.png';
    if (roleLabel === '딜러') return '/roles/damage.png';
    if (roleLabel === '지원') return '/roles/support.png';
    return null;
};

// --- [샘플 데이터] 프론트엔드 테스트용 (추후 백엔드 API와 연결) ---
const MOCK_PLAYERS = [
  {
    id: 'p1', name: '안란 (Anran)', role: '딜러',
    overview: { kd: 3.2, damagePer10: 10500, healPer10: 0, ultUsedPerMatch: 4.5, winRate: 65 },
    heroPool: [
      { hero: '트레이서', playTime: 120, winRate: 70, kd: 3.5 },
      { hero: '에코', playTime: 80, winRate: 60, kd: 2.8 },
      { hero: '소전', playTime: 45, winRate: 50, kd: 2.5 }
    ],
    recentTrend: [ { match: '1', kd: 2.5 }, { match: '2', kd: 3.0 }, { match: '3', kd: 2.8 }, { match: '4', kd: 4.1 }, { match: '5', kd: 3.6 } ]
  },
  {
    id: 'p2', name: '우양 (Wooyang)', role: '지원',
    overview: { kd: 1.8, damagePer10: 4200, healPer10: 11200, ultUsedPerMatch: 5.2, winRate: 58 },
    heroPool: [
      { hero: '아나', playTime: 150, winRate: 60, kd: 1.5 },
      { hero: '키리코', playTime: 90, winRate: 55, kd: 2.1 }
    ],
    recentTrend: [ { match: '1', kd: 1.2 }, { match: '2', kd: 1.8 }, { match: '3', kd: 1.5 }, { match: '4', kd: 2.2 }, { match: '5', kd: 2.0 } ]
  },
  {
    id: 'p3', name: '도미나 (Domina)', role: '탱크',
    overview: { kd: 2.5, damagePer10: 8500, healPer10: 0, ultUsedPerMatch: 3.8, winRate: 62 },
    heroPool: [
      { hero: '디바', playTime: 180, winRate: 65, kd: 2.7 },
      { hero: '윈스턴', playTime: 60, winRate: 50, kd: 2.0 }
    ],
    recentTrend: [ { match: '1', kd: 2.0 }, { match: '2', kd: 2.2 }, { match: '3', kd: 3.1 }, { match: '4', kd: 2.4 }, { match: '5', kd: 2.8 } ]
  }
];

const PlayerProfileView = ({ playersData = MOCK_PLAYERS }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState(playersData[0]?.id);
  
  const selectedPlayer = useMemo(() => {
    return playersData.find(p => p.id === selectedPlayerId) || playersData[0];
  }, [selectedPlayerId, playersData]);

  // --- 공통 스타일 정의 ---
  const cardStyle = { background: '#18181b', border: '1px solid #27272a', borderRadius: '16px', padding: '24px' };
  const statBoxStyle = { background: '#09090b', border: '1px solid #27272a', borderRadius: '12px', padding: '16px', flex: 1 };

  return (
    <div style={{ display: 'flex', gap: '24px', maxWidth: '1400px', margin: '0 auto', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}>
      
      {/* 1. 왼쪽 사이드바: 선수 목록 */}
      <div style={{ width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '12px', paddingLeft: '8px' }}>선수 명단</div>
        {playersData.map(player => {
          const isSelected = player.id === selectedPlayerId;
          const roleIcon = getRoleIconSrc(player.role);
          
          return (
            <div 
              key={player.id}
              onClick={() => setSelectedPlayerId(player.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '16px',
                background: isSelected ? '#27272a' : '#18181b',
                border: `1px solid ${isSelected ? '#52525b' : '#27272a'}`,
                borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#09090b', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {roleIcon ? <img src={roleIcon} style={{ width: '20px', filter: 'invert(1)' }} alt="role" /> : <User size={20} color="#a1a1aa" />}
              </div>
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{player.name}</div>
                <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '4px' }}>{player.role}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. 오른쪽 메인 패널: 선수 상세 통계 */}
      {selectedPlayer && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* 헤더 프로필 */}
          <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#27272a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
               <User size={40} color="#71717a" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 800 }}>{selectedPlayer.name}</h2>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', color: '#a1a1aa', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Shield size={16}/> {selectedPlayer.role}</span>
                <span>•</span>
                <span>스크림 승률 <strong style={{ color: '#4ade80' }}>{selectedPlayer.overview.winRate}%</strong></span>
              </div>
            </div>
          </div>

          {/* 주요 스탯 요약 (요청하신 궁극기 사용량 포함) */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={statBoxStyle}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}><Target size={16}/> 평균 K/D</div>
              <div style={{ fontSize: '24px', fontWeight: 800 }}>{selectedPlayer.overview.kd.toFixed(2)}</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}><Crosshair size={16}/> 10분당 피해량</div>
              <div style={{ fontSize: '24px', fontWeight: 800 }}>{selectedPlayer.overview.damagePer10.toLocaleString()}</div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}><Activity size={16}/> 10분당 치유량</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: selectedPlayer.overview.healPer10 > 0 ? '#4ade80' : '#fff' }}>
                {selectedPlayer.overview.healPer10 > 0 ? selectedPlayer.overview.healPer10.toLocaleString() : '-'}
              </div>
            </div>
            <div style={statBoxStyle}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', marginBottom: '8px', display:'flex', alignItems:'center', gap:'6px' }}><Zap size={16}/> 경기당 궁극기 사용</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: '#60a5fa' }}>{selectedPlayer.overview.ultUsedPerMatch}회</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* 모스트 영웅 (Hero Pool) */}
            <div style={cardStyle}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', display:'flex', alignItems:'center', gap:'8px' }}>
                <BarChart2 size={18}/> 모스트 영웅 (플레이 시간 순)
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {selectedPlayer.heroPool.map((hero, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <img 
                      src={getHeroImageSrc(hero.hero)} 
                      alt={hero.hero} 
                      style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#27272a' }} 
                      onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 'bold' }}>{hero.hero}</span>
                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>승률 {hero.winRate}% (K/D {hero.kd})</span>
                      </div>
                      {/* 프로그레스 바 */}
                      <div style={{ width: '100%', height: '8px', background: '#27272a', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${(hero.playTime / selectedPlayer.heroPool[0].playTime) * 100}%`, height: '100%', background: '#60a5fa' }}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 최근 스크림 K/D 트렌드 */}
            <div style={cardStyle}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '20px', display:'flex', alignItems:'center', gap:'8px' }}>
                <TrendingUp size={18}/> 최근 K/D 폼 (Form)
              </div>
              <div style={{ width: '100%', height: '220px' }}>
                <ResponsiveContainer>
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
          </div>

        </div>
      )}
    </div>
  );
};

export default PlayerProfileView;