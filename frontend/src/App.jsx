import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  LayoutDashboard,
  History,
  Users,
  BarChart3,
  Moon,
  Sun,
  Upload,
  AlertCircle,
  Globe, 
  User // 개인 통계 아이콘 추가
} from "lucide-react";

// [Context] 테마와 언어 Provider 가져오기
import { ThemeProvider, useTheme } from "./ThemeContext";
import { LanguageProvider, useLanguage } from "./LanguageContext";

// [Components] 하위 컴포넌트들
import ScrimSessions from "./ScrimSessions";
import ScrimDetail from "./ScrimDetail";
import MatchStats from "./MatchStats";
import ScrimModal from "./ScrimModal";
import OverallStats from "./OverallStats";
import PlayerProfileView from "./PlayerProfileView"; // 💡 새로 추가한 컴포넌트 임포트

// ----------------------------------------------------------------------------------
// [ErrorBoundary] 렌더링 에러 방지
// ----------------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("❌ UI Runtime Error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 1000, margin: "0 auto", color: "#ef4444" }}>
          <div style={{ border: "1px solid rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.08)", padding: "14px 16px", borderRadius: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>System Error (Render Failed)</div>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>{String(this.state.error)}</div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 12, background: "#27272a", border: "1px solid #3f3f46", color: "#fff", padding: "10px 14px", borderRadius: 10, cursor: "pointer", fontWeight: 800 }}>
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------------------------------------
// [MainApp] 실제 앱 로직이 담긴 컴포넌트
// ----------------------------------------------------------------------------------
function MainApp() {
  const { theme, toggleTheme, isDarkMode } = useTheme();
  const { t, toggleLanguage, language } = useLanguage();

  // [State] 화면 네비게이션 및 데이터 관리
  const [currentView, setCurrentView] = useState("home"); // home | sessions | scrim | match | overall | personal
  const [activeScrimId, setActiveScrimId] = useState(null);
  const [activeMatchId, setActiveMatchId] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  
  // 💡 전체 스크림 데이터를 저장할 State (개인 통계 계산용)
  const [allScrims, setAllScrims] = useState([]); 

  const API_BASE = "http://127.0.0.1:8000";

  // --- API: 모든 스크림 데이터 불러오기 (개인 통계용) ---
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/scrims`);
        setAllScrims(res.data || []);
      } catch (err) {
        console.error("❌ Failed to fetch all scrims for stats:", err);
      }
    };
    fetchAllData();
  }, [currentView]); // 화면 전환 시 최신 데이터 갱신

  // --- 💡 데이터 가공 로직: 모든 매치를 순회하며 선수별 누적 통계 계산 ---
  const dynamicPlayersData = useMemo(() => {
    if (!allScrims || allScrims.length === 0) return [];

    const playerMap = {};

    allScrims.forEach(scrim => {
      const scrimName = scrim.scrim_name || scrim.date; // 트렌드 차트용 레이블
      
      scrim.matches?.forEach(match => {
        match.stats?.forEach(stat => {
          const pName = stat.player_name;
          if (!pName || pName === "Unknown") return;

          // 1. 선수 객체 초기화
          if (!playerMap[pName]) {
            // Tanks와 Supports 구분 로직 (기존과 동일)
            const tanks = ['디바', '둠피스트', '정커퀸', '마우가', '오리사', '라마트라', '라인하르트', '로드호그', '시그마', '윈스턴', '레킹볼', '자리야', '해저드', '도미나'];
            const supports = ['아나', '바티스트', '브리기테', '일리아리', '키리코', '라이프위버', '루시우', '메르시', '모이라', '젠야타', '주노', '미즈키', '제트팩 캣'];
            
            let role = '딜러';
            if (tanks.includes(stat.hero_name)) role = '탱크';
            if (supports.includes(stat.hero_name)) role = '지원';

            playerMap[pName] = {
              id: pName,
              name: pName,
              role: role, // 가장 처음 만난 영웅 기준 역할 (더 정확히 하려면 최다 플레이 시간 영웅 기준으로 개선 가능)
              _raw: { elims: 0, deaths: 0, fb: 0, heroDmg: 0, heal: 0, ultUsed: 0, playTime: 0, matchCount: 0, wins: 0 },
              overview: { kd: 0, damagePer10: 0, healPer10: 0, ultUsedPerMatch: 0, winRate: 0 },
              heroPool: {}, // 객체로 모은 뒤 나중에 배열로 변환
              recentTrend: [] // [{match: '스크림이름', kd: 2.5}, ...]
            };
          }

          const p = playerMap[pName];
          const playTimeSec = Number(stat.hero_time_played) || 0;
          const deaths = Number(stat.deaths) || 0;
          const fb = Number(stat.final_blows) || 0;
          
          // 2. 누적 스탯 합산
          p._raw.elims += Number(stat.eliminations) || 0;
          p._raw.fb += fb;
          p._raw.deaths += deaths;
          p._raw.heroDmg += Number(stat.hero_damage_dealt) || 0;
          p._raw.heal += Number(stat.healing_dealt) || 0;
          p._raw.ultUsed += Number(stat.ultimates_used) || 0;
          p._raw.playTime += playTimeSec;
          
          // 승패 (매치 결과와 팀이 일치하는지)
          if (!p._processedMatches) p._processedMatches = new Set();
          if (!p._processedMatches.has(match.id)) {
             p._raw.matchCount += 1;
             if (match.winner === stat.team_name) p._raw.wins += 1;
             p._processedMatches.add(match.id);
             
             // 최근 트렌드(K/D) 기록
             const matchKd = deaths > 0 ? fb / deaths : fb;
             p.recentTrend.push({ match: scrimName, kd: Number(matchKd.toFixed(2)) });
          }

          // 3. 영웅별 스탯 누적
          const hName = stat.hero_name;
          if (!p.heroPool[hName]) {
            p.heroPool[hName] = { hero: hName, playTime: 0, wins: 0, matches: 0, fb: 0, deaths: 0 };
          }
          p.heroPool[hName].playTime += playTimeSec;
          p.heroPool[hName].fb += fb;
          p.heroPool[hName].deaths += deaths;
          p.heroPool[hName].matches += 1;
          if (match.winner === stat.team_name) p.heroPool[hName].wins += 1;
        });
      });
    });

    // 4. 최종 데이터 정제 (평균 계산 및 포맷팅)
    const result = Object.values(playerMap).map(p => {
      const minutes = p._raw.playTime / 60;
      const per10 = (val) => minutes > 0 ? (val / minutes) * 10 : 0;
      
      p.overview.kd = p._raw.deaths > 0 ? p._raw.fb / p._raw.deaths : p._raw.fb;
      p.overview.damagePer10 = Math.round(per10(p._raw.heroDmg));
      p.overview.healPer10 = Math.round(per10(p._raw.heal));
      p.overview.ultUsedPerMatch = p._raw.matchCount > 0 ? (p._raw.ultUsed / p._raw.matchCount).toFixed(1) : 0;
      p.overview.winRate = p._raw.matchCount > 0 ? Math.round((p._raw.wins / p._raw.matchCount) * 100) : 0;

      // 영웅 배열 변환 및 정렬 (플레이 시간 순)
      p.heroPool = Object.values(p.heroPool)
        .map(h => ({
          hero: h.hero,
          playTime: h.playTime, // 렌더링 측에서 초 단위로 프로그레스 바 계산
          winRate: h.matches > 0 ? Math.round((h.wins / h.matches) * 100) : 0,
          kd: h.deaths > 0 ? (h.fb / h.deaths).toFixed(2) : h.fb.toFixed(2)
        }))
        .sort((a, b) => b.playTime - a.playTime)
        .slice(0, 5); // 모스트 영웅 상위 5개만

      // 최근 트렌드 최근 5경기만 남기기
      if (p.recentTrend.length > 5) {
        p.recentTrend = p.recentTrend.slice(-5);
      }

      return p;
    });

    return result.sort((a, b) => a.name.localeCompare(b.name)); // 이름순 정렬
  }, [allScrims]);


  // --- 네비게이션 함수들 ---
  const goHome = () => { setCurrentView("home"); setActiveScrimId(null); setActiveMatchId(null); };
  const goSessions = () => { setCurrentView("sessions"); setActiveScrimId(null); setActiveMatchId(null); };
  const goOverall = () => { setCurrentView("overall"); setActiveScrimId(null); setActiveMatchId(null); };
  const goPersonal = () => { setCurrentView("personal"); setActiveScrimId(null); setActiveMatchId(null); }; // 💡 탭 이동 함수

  const goToScrim = (scrimId) => { setActiveScrimId(scrimId); setCurrentView("scrim"); };
  const goToMatch = (matchId) => { setActiveMatchId(matchId); setCurrentView("match"); };

  // --- 스크림 생성 및 업로드 핸들러 (유지) ---
  const handleScrimSubmit = async (scrimData) => {
    setIsModalOpen(false);
    setUploading(true);
    setError(null);

    try {
      const payload = {
        scrimName: scrimData.scrimName || "이름 없는 스크림",
        videoUrl: scrimData.videoUrl || "",
        date: scrimData.date,
        startHour: scrimData.startHour || "00",
        endHour: scrimData.endHour || "00",
        matches: scrimData.matches.map((m) => ({
          map_name: m.map_name,
          start_time: m.start_time,
          end_time: m.end_time,
          result: m.result || "Unknown",
          hasPause: m.has_pause,
          pauses: m.pauses || []
        })),
        files: [] 
      };

      const createRes = await axios.post(`${API_BASE}/api/scrim/manual-register`, payload);
      const newScrimId = createRes.data.scrim_id;

      if (scrimData.files && scrimData.files.length > 0) {
        for (let i = 0; i < scrimData.files.length; i++) {
          const file = scrimData.files[i];
          if (!file) continue;
          const formData = new FormData();
          formData.append("scrim_id", newScrimId);
          formData.append("match_index", i + 1);
          formData.append("file", file);
          await axios.post(`${API_BASE}/api/matches/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
      }
      alert(t.success || "저장 완료!");
      goSessions(); 
    } catch (err) {
      let errMsg = err.message;
      if (err.response && err.response.data && err.response.data.detail) errMsg = JSON.stringify(err.response.data.detail, null, 2);
      setError(`Upload Failed: ${errMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const navButtonStyle = (isActive) => ({
    background: isActive ? theme.surfaceHighlight : "transparent",
    color: isActive ? theme.text : theme.textSub,
    border: "none", padding: "8px 12px", borderRadius: "6px", cursor: "pointer",
    display: "flex", alignItems: "center", gap: "8px", transition: "all 0.2s",
    fontWeight: isActive ? 600 : 500,
  });

  const Navbar = () => (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px", height: "64px", borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.surface, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
        <div onClick={goHome} style={{ fontSize: "18px", fontWeight: "800", cursor: "pointer", background: "linear-gradient(to right, #3b82f6, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        러너리그4 Scrim
        </div>

        <nav style={{ display: "flex", gap: "8px", fontSize: "14px", fontWeight: 500 }}>
          <button onClick={goHome} style={navButtonStyle(currentView === "home")}> <LayoutDashboard size={16} /> {t.dashboard} </button>
          <button onClick={goSessions} style={navButtonStyle(["sessions", "scrim", "match"].includes(currentView))}> <History size={16} /> {t.sessions} </button>
          <button onClick={goOverall} style={navButtonStyle(currentView === "overall")}> <BarChart3 size={16} /> {t.overall} </button>
          {/* 💡 개인 통계 버튼 추가 */}
          <button onClick={goPersonal} style={navButtonStyle(currentView === "personal")}> <User size={16} /> 개인 통계 </button>
          <button style={{ ...navButtonStyle(false), cursor: "not-allowed", opacity: 0.5 }}> <Users size={16} /> {t.teamManage} </button>
        </nav>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={toggleLanguage} style={{ background: theme.surfaceHighlight, border: "none", padding: "8px 12px", cursor: "pointer", borderRadius: "8px", display: "flex", alignItems: "center", gap: "6px", color: theme.text, fontSize: "13px", fontWeight: "bold" }}>
          <Globe size={18} /> {language.toUpperCase()}
        </button>
        <button onClick={toggleTheme} style={{ background: theme.surfaceHighlight, border: "none", padding: "8px", cursor: "pointer", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isDarkMode ? <Moon size={20} color={theme.textSub} /> : <Sun size={20} color="#f59e0b" />}
        </button>
      </div>
    </header>
  );

  const renderView = () => {
    if (currentView === "home") {
        // ... (기존 홈 화면 코드와 동일)
        return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "calc(100vh - 64px)" }}>
              <div style={{ textAlign: "center", maxWidth: "600px", padding: "0 20px" }}>
                <h2 style={{ marginBottom: "16px", fontSize: "32px", fontWeight: "800", color: theme.text }}>{t.title}</h2>
                <p style={{ color: theme.textSub, marginBottom: "40px", fontSize: "16px", lineHeight: "1.6" }}>{t.desc}<br />{t.desc2}</p>
                <div style={{ display: "flex", gap: "16px", justifyContent: "center" }}>
                  <button onClick={() => setIsModalOpen(true)} disabled={uploading} style={{ background: isDarkMode ? "#fff" : "#09090b", color: isDarkMode ? "#09090b" : "#fff", border: "none", padding: "14px 32px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "700" }}>
                    {uploading ? t.uploading : <><Upload size={20} /> {t.createScrim}</>}
                  </button>
                  <button onClick={goSessions} style={{ background: theme.surfaceHighlight, color: theme.text, border: `1px solid ${theme.borderHighlight}`, padding: "14px 32px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "600" }}>
                    <History size={20} /> {t.viewHistory}
                  </button>
                </div>
                {error && <div style={{ marginTop: "32px", color: theme.danger, background: isDarkMode ? "rgba(239, 68, 68, 0.1)" : "#fee2e2", padding: "12px 20px", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "14px" }}><AlertCircle size={16} /> {error}</div>}
              </div>
            </div>
          );
    }
    if (currentView === "sessions") return <ScrimSessions onSelectScrim={goToScrim} />;
    if (currentView === "scrim") return <ScrimDetail scrimId={activeScrimId} onSelectMatch={goToMatch} onBack={goSessions} onGoOverall={goOverall} />;
    if (currentView === "match") return <MatchStats matchId={activeMatchId} onBack={() => goToScrim(activeScrimId)} />;
    if (currentView === "overall") return <OverallStats onBack={goHome} onGoSessions={goSessions} />;
    
    // 💡 개인 통계 화면 렌더링 (가공된 선수 데이터 전달)
    if (currentView === "personal") {
      return (
        <div style={{ padding: '24px' }}>
            <PlayerProfileView playersData={dynamicPlayersData} />
        </div>
      );
    }

    return <div>404 Not Found</div>;
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: theme.bg, color: theme.text, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <Navbar />
      <ErrorBoundary>{renderView()}</ErrorBoundary>
      <ScrimModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleScrimSubmit} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <MainApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}