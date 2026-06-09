from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import asynccontextmanager
import uvicorn
import json
import os
import sys
import glob
import uuid
import re
import threading
import tempfile

# Ensure backend/ is on sys.path so the `db` package resolves regardless of cwd
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

_DB_IMPORT_ERROR = None
try:
    from sqlalchemy import select
    from db.database import init_db, AsyncSessionLocal
    from db.models import Session as DBSession, Match as DBMatch, Pause as DBPause, Round as DBRound, PlayerStat as DBPlayerStat, Event as DBEvent
    from services.fight_analysis import compute_fights, format_fights_for_api, compute_fight_metrics as fa_compute_fight_metrics
    _DB_AVAILABLE = True
except Exception as _e:
    _DB_AVAILABLE = False
    _DB_IMPORT_ERROR = f"{type(_e).__name__}: {_e}"
    print(f"[DB] Import failed: {_DB_IMPORT_ERROR}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if _DB_AVAILABLE:
        try:
            await init_db()
            print("[DB] Initialized successfully")
        except Exception as e:
            print(f"[DB] Init failed: {e}")
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "scrim_data.json"
ROW_DATA_DIR = "scrim_rowdata_log"
_json_lock = threading.Lock()

if not os.path.exists(ROW_DATA_DIR):
    os.makedirs(ROW_DATA_DIR)

# --- 상수 및 매핑 데이터 ---
TANKS = [
    'D.Va', 'Doomfist', 'Junker Queen', 'Mauga', 'Orisa', 'Ramattra', 'Reinhardt',
    'Roadhog', 'Sigma', 'Winston', 'Wrecking Ball', 'Zarya', 'Hazard', 'Domina',
    '디바', '둠피스트', '정커퀸', '마우가', '오리사', '라마트라', '라인하르트',
    '로드호그', '시그마', '윈스턴', '레킹볼', '자리야', '해저드', '도미나'
]
SUPPORTS = [
    'Ana', 'Baptiste', 'Brigitte', 'Illari', 'Kiriko', 'Lifeweaver', 'Lucio',
    'Mercy', 'Moira', 'Zenyatta', 'Juno', 'Mizuki', 'Jetpack Cat',
    '아나', '바티스트', '브리기테', '일리아리', '키리코', '라이프위버', '루시우',
    '메르시', '모이라', '젠야타', '주노', '미즈키', '제트팩 캣'
]

PLAYER_ROLE_OVERRIDES = {
    "우양": 2,     # support
    "벤데타": 1,   # dps
}

KOREAN_HERO_MAP = {
    '디바': 'D.Va', '둠피스트': 'Doomfist', '정커퀸': 'Junker Queen', '마우가': 'Mauga', '오리사': 'Orisa',
    '라마트라': 'Ramattra', '라인하르트': 'Reinhardt', '로드호그': 'Roadhog', '시그마': 'Sigma',
    '윈스턴': 'Winston', '레킹볼': 'Wrecking Ball', '자리야': 'Zarya', '해저드': 'Hazard', '도미나': 'Domina',
    '애쉬': 'Ashe', '바스티온': 'Bastion', '캐서디': 'Cassidy', '에코': 'Echo', '겐지': 'Genji',
    '한조': 'Hanzo', '정크랫': 'Junkrat', '메이': 'Mei', '파라': 'Pharah', '리퍼': 'Reaper',
    '소전': 'Sojourn', '솔저: 76': 'Soldier: 76', '솔저 76': 'Soldier: 76', '솜브라': 'Sombra',
    '시메트라': 'Symmetra', '토르비욘': 'Torbjorn', '트레이서': 'Tracer', '벤처': 'Venture',
    '위도우메이커': 'Widowmaker', '안란': 'Anran', '엠레': 'Emre',
    '아나': 'Ana', '바티스트': 'Baptiste', '브리기테': 'Brigitte', '일리아리': 'Illari', '주노': 'Juno',
    '키리코': 'Kiriko', '라이프위버': 'Lifeweaver', '루시우': 'Lucio', '메르시': 'Mercy',
    '모이라': 'Moira', '젠야타': 'Zenyatta', '미즈키': 'Mizuki', '제트팩 캣': 'Jetpack Cat',
    '시에라': 'Sierra'
}

MAP_TYPE_DATA = {
    "네팔": "쟁탈", "Nepal": "Control", "리장 타워": "쟁탈", "Lijiang Tower": "Control",
    "부산": "쟁탈", "Busan": "Control", "오아시스": "쟁탈", "Oasis": "Control",
    "일리오스": "쟁탈", "Ilios": "Control", "남극 반도": "쟁탈", "Antarctic Peninsula": "Control",
    "사모아": "쟁탈", "Samoa": "Control",
    "도라도": "화물", "Dorado": "Escort", "리알토": "화물", "Rialto": "Escort",
    "서킷 로얄": "화물", "Circuit Royal": "Escort", "쓰레기촌": "화물", "Junkertown": "Escort",
    "66번 국도": "화물", "Route 66": "Escort", "감시 기지: 지브raltar": "화물", "Watchpoint: Gibraltar": "Escort",
    "샴발리 수도원": "화물", "Shambali Monastery": "Escort", "하바나": "화물", "Havana": "Escort",
    "눔바니": "혼합", "Numbani": "Hybrid", "미드타운": "혼합", "Midtown": "Hybrid",
    "블리자드 월드": "혼합", "Blizzard World": "Hybrid", "아이헨발데": "혼합", "Eichenwalde": "Hybrid",
    "왕의 길": "혼합", "King's Row": "Hybrid", "파라이소": "혼합", "Paraíso": "Hybrid",
    "할리우드": "혼합", "Hollywood": "Hybrid",
    "뉴 퀸 스트리트": "밀기", "New Queen Street": "Push", "콜로세오": "밀기", "Colosseo": "Push",
    "에스페란사": "밀기", "Esperança": "Push", "이스페란사": "밀기", "룬아사피": "밀기", "루나사피": "밀기", "Runasapi": "Push",
    "뉴 정크 시티": "플래시포인트", "New Junk City": "Flashpoint", "수라바사": "플래시포인트", "Suravasa": "Flashpoint",
    "하나오카": "격돌", "Hanaoka": "Clash", "아누비스의 왕좌": "격돌", "Throne of Anubis": "Clash"
}

NUMERIC_FIELDS = [
    "eliminations", "final_blows", "deaths",
    "all_damage_dealt", "barrier_damage_dealt", "hero_damage_dealt",
    "healing_dealt", "healing_received", "self_healing",
    "damage_taken", "damage_blocked", "defensive_assists", "offensive_assists",
    "ultimates_earned", "ultimates_used", "multikill_best", "multikills",
    "solo_kills", "objective_kills", "environmental_kills", "environmental_deaths",
    "hero_time_played"
]

FIGHT_QUIET_GAP_SEC = 20
CONTROL_MAP_KEYWORDS = [
    "네팔", "Nepal", "리장", "Lijiang", "부산", "Busan", "오아시스", "Oasis",
    "일리오스", "Ilios", "남극", "Antarctic", "사모아", "Samoa",
]

def normalize_team_name(name: str) -> str:
    try:
        return (name or "").strip().lower()
    except:
        return ""

def is_control_map(map_name: str) -> bool:
    mn = (map_name or "").lower()
    for kw in CONTROL_MAP_KEYWORDS:
        if kw.lower() in mn:
            return True
    return False

# DB에 저장된 맵명은 공백이 없는 경우가 많아(예: "왕의길", "서킷로얄") MAP_TYPE_DATA 키("왕의 길")와
# 직접 매칭되지 않는다. 공백을 제거한 정규화 lookup 테이블을 한 번만 만들어 둔다. (MAP_TYPE_DATA 자체는 불변)
_MAP_TYPE_DATA_NOSPACE = {k.replace(" ", ""): v for k, v in MAP_TYPE_DATA.items()}
# 플래시포인트/밀기 = 매치 단위(첫 한타 1개), 그 외 = 라운드 단위. ko/en 값 모두 포함.
_MATCH_LEVEL_MAP_TYPES = {"밀기", "Push", "플래시포인트", "Flashpoint"}

def resolve_map_type(map_name: str) -> str:
    """map_name -> map_type(쟁탈/화물/혼합/밀기/플래시포인트/격돌/...). 응답 전용 lookup.
    공백 무시 매칭 → is_control_map 폴백 → 그래도 없으면 'Unknown'(안전 기본값)."""
    if not map_name:
        return "Unknown"
    mt = MAP_TYPE_DATA.get(map_name) or _MAP_TYPE_DATA_NOSPACE.get(map_name.replace(" ", ""))
    if mt:
        return mt
    if is_control_map(map_name):
        return "쟁탈"
    return "Unknown"

def is_match_level_map(map_type: str) -> bool:
    """플래시포인트/밀기는 매치 전체에서 첫 한타 1개만. 그 외(Unknown 포함)는 라운드 단위(안전 기본값)."""
    return map_type in _MATCH_LEVEL_MAP_TYPES

def safe_float(x: Any, default: float = 0.0) -> float:
    try:
        return float(x)
    except:
        return default

class PauseInput(BaseModel):
    start: str
    end: str

class MatchSegment(BaseModel):
    map_name: str
    team1Name: str = Field(default="1팀")
    team2Name: str = Field(default="2팀")
    start_time: str = Field(alias="start_time")
    end_time: str = Field(alias="end_time")
    result: str
    video_url: str = Field(default="", alias="videoUrl")
    has_pause: bool = Field(default=False, alias="hasPause")
    pauses: List[PauseInput] = []

    class Config:
        populate_by_name = True
        allow_population_by_field_name = True
        extra = "ignore" 

class ScrimManualInput(BaseModel):
    scrim_name: str = Field(alias="scrimName")
    date: str
    start_time: str = Field(alias="startHour")
    end_time: str = Field(alias="endHour")
    matches: List[MatchSegment]
    files: Optional[List[Any]] = None 

    class Config:
        populate_by_name = True
        allow_population_by_field_name = True
        extra = "ignore"

def time_str_to_seconds(t_str):
    try:
        if not t_str: return 0
        t_str = str(t_str).strip()
        t_str = re.sub(r'[.\-\s]', ':', t_str)
        parts = t_str.split(':')
        if len(parts) == 1:
            return int(parts[0])
        elif len(parts) == 2:
            m = int(parts[0])
            s = int(parts[1])
            return m * 60 + s
        elif len(parts) == 3:
            h = int(parts[0])
            m = int(parts[1])
            s = int(parts[2])
            return h * 3600 + m * 60 + s
        return 0
    except:
        return 0

def parse_log_timestamp(line: str) -> float:
    try:
        if not line.startswith("["):
            return 0.0
        time_part = line.split("]")[0].strip("[")
        return time_str_to_seconds(time_part)
    except:
        return 0.0

# DEPRECATED (Phase 5): scrim_data.json is no longer the source of truth. Kept for recovery only.
def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

# DEPRECATED (Phase 5): No longer called in normal operation.
def save_data(data):
    dir_name = os.path.dirname(os.path.abspath(DATA_FILE))
    fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)
        os.replace(tmp_path, DATA_FILE)
    except Exception:
        try: os.unlink(tmp_path)
        except Exception: pass
        raise

def _delete_scrim_files(scrim_id: str) -> list[str]:
    """scrim_id 관련 파일 전부 삭제, 실패한 파일 경로 반환"""
    warnings = []
    patterns = [
        f"{ROW_DATA_DIR}/{scrim_id}_meta.json",
        *glob.glob(f"{ROW_DATA_DIR}/{scrim_id}_*.txt"),
    ]
    for path in patterns:
        if os.path.exists(path):
            try:
                os.remove(path)
                print(f"[DELETE] 파일 삭제: {path}")
            except Exception as e:
                warnings.append(f"파일 삭제 실패 ({path}): {e}")
    return warnings

def _delete_match_file(scrim_id: str, match_index: int) -> list[str]:
    """매치 로그 파일 삭제, 실패 시 warning 반환"""
    warnings = []
    path = f"{ROW_DATA_DIR}/{scrim_id}_{match_index}.txt"
    if os.path.exists(path):
        try:
            os.remove(path)
            print(f"[DELETE] 파일 삭제: {path}")
        except Exception as e:
            warnings.append(f"파일 삭제 실패 ({path}): {e}")
    return warnings

def get_role_score(hero_name: str) -> int:
    if hero_name in TANKS: return 0
    if hero_name in SUPPORTS: return 2
    return 1

def get_player_role_score(player_name: str, hero_name: str) -> int:
    if player_name in PLAYER_ROLE_OVERRIDES: return PLAYER_ROLE_OVERRIDES[player_name]
    return get_role_score(hero_name)

def build_fight_summaries(kill_events: List[Dict[str, Any]], team1: str, team2: str, quiet_gap_sec: int = FIGHT_QUIET_GAP_SEC):
    kills = []
    for ev in kill_events:
        gt = ev.get("game_timestamp", 0)
        kills.append((gt, ev))
    kills.sort(key=lambda x: x[0])

    if not kills: return []

    n_team1 = normalize_team_name(team1)
    n_team2 = normalize_team_name(team2)

    fights = []
    cur = [kills[0][1]]
    last_t = kills[0][0]

    for i in range(1, len(kills)):
        t, ev = kills[i]
        if (t - last_t) <= quiet_gap_sec:
            cur.append(ev)
            last_t = t
        else:
            fights.append(cur)
            cur = [ev]
            last_t = t
    fights.append(cur)

    out = []
    for idx, group in enumerate(fights):
        first = group[0]
        last = group[-1]

        start_game = float(first.get("game_timestamp", 0))
        end_game = float(last.get("game_timestamp", 0))
        start_play = float(first.get("timestamp", start_game))
        end_play = float(last.get("timestamp", end_game))

        t1_deaths = 0
        t2_deaths = 0
        for k in group:
            tgt = normalize_team_name(k.get("target_team", ""))
            if tgt == n_team1:
                t1_deaths += 1
            elif tgt == n_team2:
                t2_deaths += 1

        first_pick_team_raw = first.get("target_team", "")
        last_pick_team_raw = last.get("target_team", "")

        out.append({
            "fight_index": idx + 1,
            "start_game_timestamp": start_game,
            "end_game_timestamp": end_game,
            "start_timestamp": start_play,
            "end_timestamp": end_play,
            "duration_sec": max(0.0, end_game - start_game),
            "team1": team1,
            "team2": team2,
            "team1_deaths": t1_deaths,
            "team2_deaths": t2_deaths,
            "first_pick_team": first_pick_team_raw,
            "last_pick_team": last_pick_team_raw,
            "total_kills": len(group),
            "kills": [{
                "t": float(x.get("timestamp", 0)),
                "gt": float(x.get("game_timestamp", 0)),
                "killer": x.get("player_name", ""),
                "killer_team": x.get("player_team", ""),
                "target": x.get("target_name", ""),
                "target_team": x.get("target_team", ""),
                "ability": x.get("ability", ""),
            } for x in group]
        })
    return out

def compute_fight_metrics(fights: List[Dict[str, Any]], team1: str, team2: str):
    if not fights:
        return {
            "fights": 0, "avg_fight_duration_sec": 0,
            "avg_team1_deaths": 0, "avg_team2_deaths": 0, "avg_total_deaths": 0,
            "first_pick_advantage_rate": None
        }
    n = len(fights)
    sum_dur = 0.0; sum_t1 = 0.0; sum_t2 = 0.0
    fp_cnt = 0; fp_adv = 0
    n_team1 = normalize_team_name(team1)
    n_team2 = normalize_team_name(team2)

    for f in fights:
        sum_dur += float(f.get("duration_sec", 0))
        sum_t1 += float(f.get("team1_deaths", 0))
        sum_t2 += float(f.get("team2_deaths", 0))

        fp_raw = f.get("first_pick_team", "")
        fp = normalize_team_name(fp_raw)
        if fp == n_team1 or fp == n_team2:
            fp_cnt += 1
            fp_deaths = f.get("team1_deaths", 0) if fp == n_team1 else f.get("team2_deaths", 0)
            op_deaths = f.get("team2_deaths", 0) if fp == n_team1 else f.get("team1_deaths", 0)
            if fp_deaths < op_deaths:
                fp_adv += 1

    return {
        "fights": n,
        "avg_fight_duration_sec": sum_dur / n,
        "avg_team1_deaths": sum_t1 / n,
        "avg_team2_deaths": sum_t2 / n,
        "avg_total_deaths": (sum_t1 + sum_t2) / n,
        "first_pick_advantage_rate": (fp_adv / fp_cnt) if fp_cnt > 0 else None
    }

def parse_overwatch_log(log_text: str, custom_t1: str = None, custom_t2: str = None):
    log_t1 = "1팀"
    log_t2 = "2팀"
    
    for line in log_text.splitlines():
        if ",match_start," in line:
            parts = line.strip().split(',')
            try:
                base_idx = parts.index("match_start")
                log_t1 = parts[base_idx + 4].strip()
                log_t2 = parts[base_idx + 5].strip()
            except: pass
            break

    def map_team(t_raw):
        t = t_raw.strip()
        if custom_t1 and t == log_t1: return custom_t1
        if custom_t2 and t == log_t2: return custom_t2
        if custom_t1 and t in ["Team 1", "1팀"]: return custom_t1
        if custom_t2 and t in ["Team 2", "2팀"]: return custom_t2
        return t

    raw_rounds_map = {}
    stat_clumps = [] 
    
    events = []
    team_names = set()
    processed_events = set()
    round_scores = {}
    round_attackers = {}

    first_team_name = None
    second_team_name = None
    game_mode = "Unknown"
    map_name = "Unknown"

    match_end_score_t1: Optional[int] = None
    match_end_score_t2: Optional[int] = None
    match_end_winner: Optional[str] = None
    match_end_game_time: Optional[float] = None

    lines = log_text.splitlines()
    for line in lines:
        line = line.replace("****", "kill")
        
        clean_line = line.strip()
        real_timestamp = parse_log_timestamp(clean_line)
        play_timestamp = max(0, real_timestamp - 8)
        parts = clean_line.split(',')
        
        if ",match_start," in clean_line:
            try:
                base_idx = parts.index("match_start")
                # 💡 [버그 픽스] 시간 문자열([00:00:00]) 때문에 발생하는 에러 해결
                game_time = parse_log_timestamp(clean_line)
                map_name = parts[base_idx + 2].strip()
                game_mode = parts[base_idx + 3].strip()
                first_team_name = map_team(parts[base_idx + 4])
                second_team_name = map_team(parts[base_idx + 5])

                events.append({
                    "event_type": "match_start",
                    "timestamp": real_timestamp,
                    "game_timestamp": game_time,
                    "desc": "경기 시작"
                })
            except: pass

        elif ",match_end," in clean_line:
            try:
                base_idx = parts.index("match_end")
                tail = [p.strip() for p in parts[base_idx + 1:]]
                nums = []
                for t in tail:
                    try: nums.append(int(float(t)))
                    except: continue
                if len(nums) >= 2:
                    match_end_score_t1 = nums[-2]
                    match_end_score_t2 = nums[-1]

                if first_team_name and second_team_name:
                    n1 = normalize_team_name(first_team_name)
                    n2 = normalize_team_name(second_team_name)
                    for t in tail:
                        nt = normalize_team_name(map_team(t))
                        if nt == n1: match_end_winner = first_team_name; break
                        if nt == n2: match_end_winner = second_team_name; break
                
                if len(tail) > 0: match_end_game_time = safe_float(tail[0], None)

                events.append({
                    "event_type": "match_end",
                    "timestamp": play_timestamp,
                    "game_timestamp": match_end_game_time if match_end_game_time else 0.0,
                    "winner": match_end_winner,
                    "score_t1": match_end_score_t1,
                    "score_t2": match_end_score_t2
                })
            except: pass

        elif ",round_start," in clean_line:
            try:
                base_idx = parts.index("round_start")
                game_time = float(parts[base_idx + 1])
                r_num = int(float(parts[base_idx + 2]))
                attacker_name = map_team(parts[base_idx + 3])
                round_attackers[r_num] = attacker_name

                events.append({
                    "event_type": "round_start",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "round_number": r_num,
                    "attacker": attacker_name
                })
            except: continue

        elif ",round_end," in clean_line:
            try:
                base_idx = parts.index("round_end")
                game_time = float(parts[base_idx + 1])
                r_num = int(float(parts[base_idx + 2]))
                winner = map_team(parts[base_idx + 3])
                s1 = int(float(parts[base_idx + 4]))
                s2 = int(float(parts[base_idx + 5]))
                round_scores[r_num] = {"t1": s1, "t2": s2, "winner": winner}

                events.append({
                    "event_type": "round_end",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "round_number": r_num,
                    "winner": winner
                })
            except: continue

        elif ",objective_captured," in clean_line or ",point_captured," in clean_line:
            try:
                try: base_idx = parts.index("objective_captured")
                except ValueError: base_idx = parts.index("point_captured")
                
                game_time = float(parts[base_idx + 1])
                capturing_team = map_team(parts[base_idx + 3])

                events.append({
                    "event_type": "objective_captured",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "capturing_team": capturing_team
                })
            except: continue

        elif ",payload_progress," in clean_line:
            try:
                base_idx = parts.index("payload_progress")
                game_time = float(parts[base_idx + 1])
                round_num = int(float(parts[base_idx + 2]))
                team_name = map_team(parts[base_idx + 3])
                
                events.append({
                    "event_type": "payload_progress",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "round": round_num,
                    "team": team_name
                })
            except: continue

        elif ",objective_updated," in clean_line:
            try:
                base_idx = parts.index("objective_updated")
                game_time = float(parts[base_idx + 1])
                round_num = int(float(parts[base_idx + 2]))
                old_idx = int(float(parts[base_idx + 3]))
                new_idx = int(float(parts[base_idx + 4]))
                events.append({
                    "event_type": "objective_updated",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "round": round_num,
                    "old_index": old_idx,
                    "new_index": new_idx
                })
            except: continue

        elif ",player_stat," in clean_line:
            try:
                base_idx = parts.index("player_stat")
                game_time = float(parts[base_idx + 1])

                p_team = map_team(parts[base_idx + 3])
                p_name = parts[base_idx + 4].strip()
                p_hero_kr = parts[base_idx + 5].strip()
                p_hero_en = KOREAN_HERO_MAP.get(p_hero_kr, p_hero_kr)
                team_names.add(p_team)

                def get_val(idx):
                    try: return float(parts[base_idx + idx])
                    except: return 0.0

                stat_entry = {
                    "team_name": p_team, "player_name": p_name, "hero_name": p_hero_kr, "hero_image": p_hero_en,
                    "slot_index": -1,
                    "eliminations": get_val(6), "final_blows": get_val(7), "deaths": get_val(8),
                    "all_damage_dealt": get_val(9), "barrier_damage_dealt": get_val(10), "hero_damage_dealt": get_val(11),
                    "healing_dealt": get_val(12), "healing_received": get_val(13), "self_healing": get_val(14),
                    "damage_taken": get_val(15), "damage_blocked": get_val(16), "defensive_assists": get_val(17),
                    "offensive_assists": get_val(18), "ultimates_earned": get_val(19), "ultimates_used": get_val(20),
                    "hero_time_played": get_val(38)
                }

                key = (p_team, p_name, p_hero_kr)

                matched_clump = None
                for c in stat_clumps:
                    if abs(c["time"] - game_time) < 45.0:
                        matched_clump = c
                        break
                
                if not matched_clump:
                    matched_clump = {"time": game_time, "stats": {}}
                    stat_clumps.append(matched_clump)
                
                if key in matched_clump["stats"]:
                    existing = matched_clump["stats"][key]
                    if stat_entry["hero_time_played"] >= existing["hero_time_played"]:
                        matched_clump["stats"][key] = stat_entry
                else:
                    matched_clump["stats"][key] = stat_entry

            except: continue

        elif ",kill," in clean_line:
            try:
                base_idx = parts.index("kill")
                game_time = float(parts[base_idx + 1])
                p_name = parts[base_idx + 3].strip()
                p_hero = parts[base_idx + 4].strip()
                t_name = parts[base_idx + 6].strip()
                t_hero = parts[base_idx + 7].strip()
                ability = parts[base_idx + 8].strip()

                event_key = (game_time, "kill", p_name, t_name)
                if event_key in processed_events: continue
                processed_events.add(event_key)

                events.append({
                    "event_type": "kill",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "player_team": map_team(parts[base_idx + 2]),
                    "player_name": p_name, "player_hero": p_hero,
                    "player_hero_img": KOREAN_HERO_MAP.get(p_hero, p_hero),
                    "target_team": map_team(parts[base_idx + 5]),
                    "target_name": t_name, "target_hero": t_hero,
                    "target_hero_img": KOREAN_HERO_MAP.get(t_hero, t_hero),
                    "ability": ability
                })
            except: continue

        elif ",ultimate_start," in clean_line:
            try:
                base_idx = parts.index("ultimate_start")
                game_time = float(parts[base_idx + 1])
                p_name = parts[base_idx + 3].strip()
                p_hero = parts[base_idx + 4].strip()

                event_key = (game_time, "ultimate_start", p_name)
                if event_key in processed_events: continue
                processed_events.add(event_key)

                events.append({
                    "event_type": "ultimate_start",
                    "timestamp": play_timestamp,
                    "game_timestamp": game_time,
                    "player_team": map_team(parts[base_idx + 2]),
                    "player_name": p_name, "player_hero": p_hero,
                    "player_hero_img": KOREAN_HERO_MAP.get(p_hero, p_hero),
                    "ability": "Ultimate"
                })
            except: continue

    valid_clumps = [c for c in stat_clumps if c["time"] > 5.0]
    valid_clumps.sort(key=lambda x: x["time"])
    
    for idx, c in enumerate(valid_clumps):
        raw_rounds_map[idx + 1] = c["stats"]

    if (game_mode == "Unknown" or game_mode == "") and map_name != "Unknown":
        game_mode = MAP_TYPE_DATA.get(map_name, "Unknown")
    if (game_mode == "Unknown" or game_mode == "") and is_control_map(map_name):
        game_mode = "Control"

    # 💡 [버그 픽스] 팀 이름을 알파벳 순서(O2->PF)로 정렬하던 위험한 로직 제거!
    if first_team_name and second_team_name:
        t1, t2 = first_team_name, second_team_name
    else:
        t1 = custom_t1 if custom_t1 else "Team 1"
        t2 = custom_t2 if custom_t2 else "Team 2"

    valid_round_nums = sorted(list(raw_rounds_map.keys()))
    total_rounds_count = len(valid_round_nums) 

    clean_rounds_map = assign_persistent_slots(raw_rounds_map, valid_round_nums)

    return {
        "rounds_stats": clean_rounds_map,
        "events": events,
        "team_1_name": t1,
        "team_2_name": t2,
        "total_rounds": total_rounds_count,
        "round_scores": round_scores,
        "game_mode": game_mode,
        "map_name": map_name,
        "round_attackers": round_attackers,
        "match_end_score_t1": match_end_score_t1,
        "match_end_score_t2": match_end_score_t2,
        "match_end_winner": match_end_winner,
    }

def assign_persistent_slots(raw_rounds_map, valid_round_nums):
    clean_map = {}
    team_slot_history = {}
    last_known_stats = {}
    current_team_players = {}

    for r in valid_round_nums:
        round_data = raw_rounds_map[r]
        clean_map[r] = {}
        current_team_players[r] = {}

        team_players = {}
        for key, stat in round_data.items():
            t_name = stat['team_name']
            if t_name not in team_players:
                team_players[t_name] = []
            team_players[t_name].append(stat)

        for t_name, entries in team_players.items():
            if t_name not in team_slot_history:
                team_slot_history[t_name] = {}
            if t_name not in last_known_stats:
                last_known_stats[t_name] = {}

            player_groups = {}
            for entry in entries:
                p_name = entry['player_name']
                if p_name not in player_groups:
                    player_groups[p_name] = []
                player_groups[p_name].append(entry)

            current_team_players[r][t_name] = set(player_groups.keys())
            used_slots = set()
            unassigned_players = []

            for p_name, p_entries in player_groups.items():
                last_known_stats[t_name][p_name] = [e.copy() for e in p_entries]
                if p_name in team_slot_history[t_name]:
                    slot = team_slot_history[t_name][p_name]
                    used_slots.add(slot)
                    for entry in p_entries:
                        entry['slot_index'] = slot
                        clean_map[r][(t_name, p_name, entry['hero_name'])] = entry
                else:
                    unassigned_players.append((p_name, p_entries))

            def get_rep_hero(entries):
                return max(entries, key=lambda x: x['hero_time_played'])['hero_name']

            unassigned_players.sort(key=lambda x: (get_player_role_score(x[0], get_rep_hero(x[1])), x[0]))

            for p_name, p_entries in unassigned_players:
                rep_hero = get_rep_hero(p_entries)
                role_score = get_player_role_score(p_name, rep_hero)
                preferred_slots = []
                if role_score == 0: preferred_slots = [0, 1, 2, 3, 4]
                elif role_score == 1: preferred_slots = [1, 2, 0, 3, 4]
                else: preferred_slots = [3, 4, 1, 2, 0]

                assigned_slot = -1
                for s in preferred_slots:
                    if s not in used_slots:
                        assigned_slot = s; break
                if assigned_slot == -1:
                    assigned_slot = 5
                    while assigned_slot in used_slots: assigned_slot += 1

                team_slot_history[t_name][p_name] = assigned_slot
                used_slots.add(assigned_slot)
                last_known_stats[t_name][p_name] = [e.copy() for e in p_entries]
                for entry in p_entries:
                    entry['slot_index'] = assigned_slot
                    clean_map[r][(t_name, p_name, entry['hero_name'])] = entry

        for t_name, history in team_slot_history.items():
            present = set()
            if t_name in current_team_players[r]:
                present = current_team_players[r][t_name]
            for p_name, slot in history.items():
                if p_name not in present:
                    if t_name in last_known_stats and p_name in last_known_stats[t_name]:
                        ghost_entries = last_known_stats[t_name][p_name]
                        for g_entry in ghost_entries:
                            new_ghost = g_entry.copy()
                            new_ghost['slot_index'] = slot
                            clean_map[r][(t_name, p_name, new_ghost['hero_name'])] = new_ghost
    return clean_map

def calculate_pure_stats(parsed, target_match):
    rounds_map = parsed["rounds_stats"]
    total_rounds = parsed["total_rounds"]
    round_scores = parsed.get("round_scores", {})
    game_mode = parsed.get("game_mode", "")
    map_name = parsed.get("map_name", "")
    round_attackers = parsed.get("round_attackers", {})

    team1 = parsed["team_1_name"]
    team2 = parsed["team_2_name"]
    n_team1 = normalize_team_name(team1)
    n_team2 = normalize_team_name(team2)

    final_t1_score = 0
    final_t2_score = 0
    
    score_match_end_t1 = parsed.get("match_end_score_t1")
    score_match_end_t2 = parsed.get("match_end_score_t2")
    
    score_round_end_t1 = 0
    score_round_end_t2 = 0
    if round_scores:
        max_r = max(round_scores.keys())
        score_round_end_t1 = round_scores[max_r].get("t1", 0)
        score_round_end_t2 = round_scores[max_r].get("t2", 0)
        
    score_round_wins_t1 = 0
    score_round_wins_t2 = 0
    for r_data in round_scores.values():
        r_w = normalize_team_name(r_data.get("winner", ""))
        if r_w == n_team1: score_round_wins_t1 += 1
        elif r_w == n_team2: score_round_wins_t2 += 1
        
    score_obj_t1 = 0
    score_obj_t2 = 0
    for r_num in range(1, total_rounds + 1):
        attacker = normalize_team_name(round_attackers.get(r_num, ""))
        max_idx = 0
        for ev in parsed["events"]:
            if ev.get("event_type") == "objective_updated" and ev.get("round") == r_num:
                idx = ev.get("new_index", 0)
                if idx > max_idx:
                    max_idx = idx
        if attacker == n_team1: score_obj_t1 += max_idx
        elif attacker == n_team2: score_obj_t2 += max_idx

    is_push = any(k in map_name for k in ["밀기", "Push", "에스페란사", "이스페란사", "뉴 퀸", "콜로세오", "룬아사피", "루나사피"])
    has_payload = any(e.get("event_type") == "payload_progress" for e in parsed["events"])
    is_hybrid_escort = has_payload or any(k in game_mode for k in ["Escort", "화물", "Hybrid", "혼합"])

    if is_push:
        final_t1_score = 0
        final_t2_score = 0
    elif is_hybrid_escort:
        final_t1_score = score_obj_t1
        final_t2_score = score_obj_t2
    else:
        # 💡 [버그 픽스] match_end 점수가 0점일 때 False로 처리되는 현상 방지 (is not None 사용)
        if score_match_end_t1 is not None and score_match_end_t2 is not None:
            final_t1_score = score_match_end_t1
            final_t2_score = score_match_end_t2
        elif score_round_end_t1 > 0 or score_round_end_t2 > 0:
            final_t1_score = score_round_end_t1
            final_t2_score = score_round_end_t2
        else:
            final_t1_score = score_round_wins_t1
            final_t2_score = score_round_wins_t2

    target_match["score_t1"] = final_t1_score
    target_match["score_t2"] = final_t2_score

    if final_t1_score > final_t2_score:
        match_winner = team1
        target_match["result"] = f"{team1} 승 ({final_t1_score} : {final_t2_score})"
    elif final_t2_score > final_t1_score:
        match_winner = team2
        target_match["result"] = f"{team2} 승 ({final_t1_score} : {final_t2_score})"
    else:
        match_winner = "Draw"
        target_match["result"] = f"무승부 ({final_t1_score} : {final_t2_score})"
        
    target_match["winner"] = match_winner

    round_end_times = {}
    for r in range(1, total_rounds + 1):
        max_t = 0
        for stat in rounds_map.get(r, {}).values():
            if stat['hero_time_played'] > max_t:
                max_t = stat['hero_time_played']
        round_end_times[r] = max_t

    player_snapshots = {}
    player_snapshots[0] = {}

    for r in range(1, total_rounds + 1):
        player_snapshots[r] = {}
        for p_key, heroes_map in player_snapshots[r - 1].items():
            player_snapshots[r][p_key] = {h: s.copy() for h, s in heroes_map.items()}

        current_logs = rounds_map.get(r, {})
        for key, log_stat in current_logs.items():
            t_name, p_name, h_name = key
            p_key = (t_name, p_name)
            if p_key not in player_snapshots[r]:
                player_snapshots[r][p_key] = {}
            player_snapshots[r][p_key][h_name] = log_stat.copy()

    actual_rounds_temp = []
    for r in range(1, total_rounds + 1):
        pure_round_stats = []
        r_fb_t1, r_fb_t2 = 0, 0

        prev_time = round_end_times.get(r - 1, 0)
        curr_time = round_end_times.get(r, 0)
        pure_duration = max(0, curr_time - prev_time)

        round_events = []
        for ev in parsed["events"]:
            t = ev.get("game_timestamp", 0)
            if r == 1:
                if t <= curr_time: round_events.append(ev)
            else:
                if prev_time < t <= curr_time: round_events.append(ev)

        r_winner = round_scores.get(r, {}).get("winner", "Unknown")
        round_kills = [e for e in round_events if e.get("event_type") == "kill"]
        round_fights = build_fight_summaries(round_kills, team1, team2)

        for p_key, heroes_map in player_snapshots[r].items():
            team_name, player_name = p_key
            curr_total = {f: 0.0 for f in NUMERIC_FIELDS}
            main_hero = "Unknown"
            max_pure_time = -1
            main_hero_img = ""

            for h_name, stat in heroes_map.items():
                for f in NUMERIC_FIELDS:
                    curr_total[f] += stat.get(f, 0)

            prev_heroes_map = player_snapshots[r - 1].get(p_key, {})
            prev_total = {f: 0.0 for f in NUMERIC_FIELDS}
            for h_name, stat in prev_heroes_map.items():
                for f in NUMERIC_FIELDS:
                    prev_total[f] += stat.get(f, 0)

            pure_stat = {}
            has_data = False
            for f in NUMERIC_FIELDS:
                diff = curr_total[f] - prev_total[f]
                pure_stat[f] = max(0, diff)
                if pure_stat[f] > 0: has_data = True

            for h_name, curr_h_stat in heroes_map.items():
                prev_h_stat = prev_heroes_map.get(h_name, {})
                pure_h_time = max(0, curr_h_stat.get('hero_time_played', 0) - prev_h_stat.get('hero_time_played', 0))
                if pure_h_time > max_pure_time:
                    max_pure_time = pure_h_time
                    main_hero = h_name
                    main_hero_img = curr_h_stat.get('hero_image', '')

            if has_data or pure_stat['hero_time_played'] > 0:
                final_entry = pure_stat
                final_entry['team_name'] = team_name
                final_entry['player_name'] = player_name
                final_entry['hero_name'] = main_hero
                final_entry['hero_image'] = main_hero_img
                any_hero_stat = next(iter(heroes_map.values()))
                final_entry['slot_index'] = any_hero_stat.get('slot_index', -1)

                pure_round_stats.append(final_entry)
                if normalize_team_name(team_name) == n_team1:
                    r_fb_t1 += final_entry["final_blows"]
                else:
                    r_fb_t2 += final_entry["final_blows"]

        actual_rounds_temp.append({
            "round_number": r,
            "stats": pure_round_stats,
            "events": round_events,
            "final_blows_t1": r_fb_t1,
            "final_blows_t2": r_fb_t2,
            "duration_sec": pure_duration,
            "winner": r_winner,
            "fights": round_fights
        })

    actual_rounds = []
    for r_data in actual_rounds_temp:
        if r_data["duration_sec"] < 15.0 and len(actual_rounds) >= 1:
            continue
        r_data["round_number"] = len(actual_rounds) + 1
        actual_rounds.append(r_data)
        
    target_match["rounds"] = actual_rounds

    total_stats_map = {}
    for round_data in actual_rounds:
        for stat in round_data["stats"]:
            key = (stat["team_name"], stat["player_name"])
            if key not in total_stats_map:
                total_stats_map[key] = {"base": stat.copy(), "play_times": {}}
                for f in NUMERIC_FIELDS:
                    total_stats_map[key]["base"][f] = 0

            for f in NUMERIC_FIELDS:
                total_stats_map[key]["base"][f] += stat.get(f, 0)

            h_name = stat["hero_name"]
            if h_name not in total_stats_map[key]["play_times"]:
                total_stats_map[key]["play_times"][h_name] = 0
            total_stats_map[key]["play_times"][h_name] += stat.get("hero_time_played", 0)

    final_total_stats = []
    for agg in total_stats_map.values():
        stat_entry = agg["base"]
        best_h = max(agg["play_times"], key=agg["play_times"].get) if agg["play_times"] else "Unknown"
        stat_entry["hero_name"] = best_h
        stat_entry["hero_image"] = KOREAN_HERO_MAP.get(best_h, best_h)
        final_total_stats.append(stat_entry)

    target_match["stats"] = final_total_stats
    target_match["team_1_name"] = team1
    target_match["team_2_name"] = team2
    target_match["total_final_blows_t1"] = sum(r["final_blows_t1"] for r in actual_rounds)
    target_match["total_final_blows_t2"] = sum(r["final_blows_t2"] for r in actual_rounds)
    target_match["timeline"] = {"duration_sec": round_end_times.get(total_rounds, 0)}

    match_kills = [e for e in parsed["events"] if e.get("event_type") == "kill"]
    fights = build_fight_summaries(match_kills, team1, team2)
    target_match["fights"] = fights
    target_match["fight_metrics"] = compute_fight_metrics(fights, team1, team2)

    return target_match

def _db_event_to_dict(ev: "DBEvent") -> dict:
    d: dict = {
        "event_type": ev.event_type,
        "timestamp": ev.timestamp,
        "game_timestamp": ev.game_timestamp if ev.game_timestamp is not None else 0,
    }
    et = ev.event_type
    if et in ("kill", "ultimate_start"):
        d.update({
            "player_name": ev.player_name or "",
            "player_team": ev.player_team or "",
            "player_hero": ev.player_hero or "",
            "player_hero_img": ev.player_hero_img or "",
            "ability": ev.ability or "",
        })
        if et == "kill":
            d.update({
                "target_name": ev.target_name or "",
                "target_team": ev.target_team or "",
                "target_hero": ev.target_hero or "",
                "target_hero_img": ev.target_hero_img or "",
            })
    elif et == "round_start":
        d.update({"round_number": ev.round_number, "attacker": ev.attacker or ""})
    elif et == "round_end":
        d.update({"round_number": ev.round_number, "winner": ev.winner or ""})
    elif et == "match_start":
        d["desc"] = ev.description or ""  # frontend expects "desc" key
    elif et == "match_end":
        d.update({"winner": ev.winner or "", "score_t1": ev.score_t1, "score_t2": ev.score_t2})
    elif et == "objective_captured":
        d["capturing_team"] = ev.capturing_team or ""
    elif et == "objective_updated":
        d.update({"new_index": ev.new_index, "old_index": ev.old_index})
    elif et == "payload_progress":
        d["team"] = ev.team or ""
    return d


def _db_player_stat_to_dict(ps: "DBPlayerStat") -> dict:
    return {
        "team_name": ps.team_name,
        "player_name": ps.player_name,
        "hero_name": ps.hero_name,
        "hero_image": ps.hero_image or "",
        "slot_index": ps.slot_index if ps.slot_index is not None else -1,
        **{f: getattr(ps, f) or 0 for f in NUMERIC_FIELDS},
    }


def _db_round_to_dict(r: "DBRound", t1_name: str = "", t2_name: str = "") -> dict:
    events = [_db_event_to_dict(ev) for ev in (r.events or [])]
    round_fights = format_fights_for_api(compute_fights(events, t1_name, t2_name), t1_name, t2_name)
    return {
        "round_number": r.round_number,
        "winner": r.winner or "",
        "duration_sec": r.duration_sec or 0,
        "final_blows_t1": r.final_blows_t1 or 0,
        "final_blows_t2": r.final_blows_t2 or 0,
        "stats": [_db_player_stat_to_dict(ps) for ps in (r.player_stats or [])],
        "events": events,
        "fights": round_fights,
    }


def _aggregate_match_stats(m: "DBMatch") -> list:
    """(player_name, team_name) 기준으로 매치 전체 PlayerStat 합산.
    한 선수가 여러 영웅을 플레이해도 한 행. 대표 영웅은 가장 오래 플레이한 영웅."""
    grouped: dict = {}
    for rnd in (m.rounds or []):
        for ps in (rnd.player_stats or []):
            key = (ps.player_name, ps.team_name)
            if key not in grouped:
                grouped[key] = {
                    "player_name": ps.player_name,
                    "team_name": ps.team_name,
                    "slot_index": ps.slot_index if ps.slot_index is not None else -1,
                    "hero_name": ps.hero_name,
                    "hero_image": ps.hero_image or "",
                    "heroes_played": [],
                    **{f: 0.0 for f in NUMERIC_FIELDS},
                }
            for f in NUMERIC_FIELDS:
                grouped[key][f] += getattr(ps, f) or 0
            heroes = grouped[key]["heroes_played"]
            existing = next((h for h in heroes if h["hero_name"] == ps.hero_name), None)
            if existing:
                existing["hero_time_played"] += ps.hero_time_played or 0
            else:
                heroes.append({
                    "hero_name": ps.hero_name,
                    "hero_image": ps.hero_image or "",
                    "hero_time_played": ps.hero_time_played or 0,
                })

    for v in grouped.values():
        if v["heroes_played"]:
            top = max(v["heroes_played"], key=lambda h: h["hero_time_played"])
            v["hero_name"] = top["hero_name"]
            v["hero_image"] = top["hero_image"]
            v["heroes_played"].sort(key=lambda h: -h["hero_time_played"])

    return list(grouped.values())


def _db_match_to_dict(m: "DBMatch", *, full: bool = False) -> dict:
    """full=False → 경량 (no rounds/stats), /api/scrims list 용.
    full=True  → 완전 (rounds+stats+events 포함), /api/scrims와 /api/matches/{id} 용."""
    dur = m.duration_sec or 0
    base = {
        "id": m.id,
        "match_index": m.match_index,
        "map_name": m.map_name,
        "team1_name": m.team1_name,
        "team2_name": m.team2_name,
        "team_1_name": m.team1_name,
        "team_2_name": m.team2_name,
        "winner": m.winner or "",
        "score_t1": m.score_t1 or 0,
        "score_t2": m.score_t2 or 0,
        "result": m.result or "",
        "video_url": m.video_url or "",
        "video_offset": m.video_offset or 0,
        "game_setup_sec": m.game_setup_sec,  # None = 기존 매치 (옛날 방식)
        "duration_sec": dur,
        "total_final_blows_t1": m.total_final_blows_t1 or 0,
        "total_final_blows_t2": m.total_final_blows_t2 or 0,
        "pauses": [{"start_sec": p.start_sec, "end_sec": p.end_sec, "duration": p.duration} for p in (m.pauses or [])],
        "rounds": [], "stats": [], "fights": [], "fight_metrics": {},
        "timeline": {"duration_sec": dur},
    }
    if full:
        t1, t2 = m.team1_name, m.team2_name
        base["rounds"] = [_db_round_to_dict(r, t1, t2) for r in (m.rounds or [])]
        base["stats"] = _aggregate_match_stats(m)
        # Compute duration from rounds (DB column may be 0 due to import bug)
        round_dur = sum(r.duration_sec or 0 for r in (m.rounds or []))
        if round_dur > 0:
            base["duration_sec"] = round_dur
            base["timeline"] = {"duration_sec": round_dur}
        # Compute match-level fights from all events across rounds
        all_events = [ev for rnd in (m.rounds or []) for ev in (rnd.events or [])]
        all_events_dicts = [_db_event_to_dict(ev) for ev in all_events]
        match_fights_raw = compute_fights(all_events_dicts, t1, t2)
        base["fights"] = format_fights_for_api(match_fights_raw, t1, t2)
        base["fight_metrics"] = fa_compute_fight_metrics(base["fights"], t1, t2)
    return base


def _db_session_to_dict(s: "DBSession", *, full: bool = False) -> dict:
    return {
        "id": s.id,
        "scrim_name": s.scrim_name,
        "date": s.date,
        "start_time": s.start_time or "",
        "end_time": s.end_time or "",
        "matches": [_db_match_to_dict(m, full=full) for m in (s.matches or [])],
    }


@app.post("/api/scrim/manual-register")
async def register_scrim_manual(request: Request):
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        raw_body = await request.json()
        data = ScrimManualInput(**raw_body)
    except Exception as e:
        print(f"❌ [DEBUG] Validation Error: {e}")
        raise HTTPException(status_code=422, detail=f"Validation Error: {str(e)}")

    try:
        dt = datetime.strptime(data.date, "%Y-%m-%d")
        base_id = f"{dt.strftime('%y%m%d')}{data.start_time.zfill(2)}{data.end_time.zfill(2)}"
    except:
        base_id = datetime.now().strftime("%y%m%d%H%M")

    new_scrim_id = base_id
    counter = 0
    while os.path.exists(f"{ROW_DATA_DIR}/{new_scrim_id}_meta.json"):
        counter += 1
        new_scrim_id = f"{base_id}_{counter}"

    processed_matches = []
    
    for idx, match in enumerate(data.matches):
        video_offset = time_str_to_seconds(match.start_time)
        processed_pauses = []
        if match.pauses and len(match.pauses) > 0:
            for p in match.pauses:
                s_sec = time_str_to_seconds(p.start)
                e_sec = time_str_to_seconds(p.end)
                
                if s_sec > 0 and e_sec > 0 and s_sec != e_sec:
                    if s_sec > e_sec:
                        s_sec, e_sec = e_sec, s_sec
                    
                    processed_pauses.append({
                        "start_sec": s_sec,
                        "end_sec": e_sec,
                        "duration": e_sec - s_sec
                    })
        
        processed_pauses.sort(key=lambda x: x["start_sec"])

        processed_matches.append({
            "id": str(uuid.uuid4()),
            "match_index": idx + 1,
            "map_name": match.map_name,
            "team1_name": match.team1Name,
            "team2_name": match.team2Name,
            "result": match.result,
            "video_url": match.video_url or "",
            "video_offset": video_offset,
            "pauses": processed_pauses,
            "timeline": {"duration_sec": 0},
            "rounds": [], "stats": [],
            "fights": [], "fight_metrics": {}
        })

    new_scrim = {
        "id": new_scrim_id,
        "scrim_name": data.scrim_name,
        "date": data.date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "matches": processed_matches
    }

    with open(f"{ROW_DATA_DIR}/{new_scrim_id}_meta.json", "w", encoding="utf-8") as f:
        json.dump(new_scrim, f, ensure_ascii=False, indent=4)

    try:
        async with AsyncSessionLocal() as db:
            existing = await db.get(DBSession, new_scrim_id)
            if not existing:
                db.add(DBSession(
                    id=new_scrim_id,
                    scrim_name=data.scrim_name,
                    date=data.date,
                    start_time=data.start_time,
                    end_time=data.end_time,
                ))
            for m in processed_matches:
                db.add(DBMatch(
                    id=m["id"],
                    session_id=new_scrim_id,
                    match_index=m["match_index"],
                    map_name=m["map_name"],
                    team1_name=m["team1_name"],
                    team2_name=m["team2_name"],
                    result=m["result"],
                    video_url=m["video_url"],
                    video_offset=m["video_offset"],
                ))
                for p in m["pauses"]:
                    db.add(DBPause(
                        match_id=m["id"],
                        start_sec=p["start_sec"],
                        end_sec=p["end_sec"],
                        duration=p["duration"],
                    ))
            await db.commit()
            print(f"[DB] register OK: {new_scrim_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB write failed: {e}")

    return {"status": "success", "scrim_id": new_scrim_id}

@app.post("/api/matches/upload")
async def upload_match_log(scrim_id: str = Form(...), match_index: int = Form(...), file: UploadFile = File(...)):
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")

    content = await file.read()
    try:
        log_text = content.decode("utf-8")
    except:
        log_text = content.decode("cp949", errors="ignore")

    with open(f"{ROW_DATA_DIR}/{scrim_id}_{match_index}.txt", "w", encoding="utf-8") as f:
        f.write(log_text)

    try:
        from sqlalchemy.orm import selectinload as _sil
        from sqlalchemy import delete as sa_delete
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBMatch)
                .where(DBMatch.session_id == scrim_id, DBMatch.match_index == match_index, DBMatch.deleted_at.is_(None))
                .options(_sil(DBMatch.pauses))
            )
            db_match = result.scalars().first()
            if not db_match:
                raise HTTPException(status_code=404, detail="Match not found")

            match_id_val = db_match.id
            c_t1 = db_match.team1_name
            c_t2 = db_match.team2_name

            parsed = parse_overwatch_log(log_text, custom_t1=c_t1, custom_t2=c_t2)
            target_match: dict = {}
            calculate_pure_stats(parsed, target_match)

            db_match.winner = target_match.get("winner", "")
            db_match.score_t1 = target_match.get("score_t1", 0)
            db_match.score_t2 = target_match.get("score_t2", 0)
            db_match.result = target_match.get("result", "")
            db_match.duration_sec = target_match.get("timeline", {}).get("duration_sec", 0)
            db_match.total_final_blows_t1 = target_match.get("total_final_blows_t1", 0)
            db_match.total_final_blows_t2 = target_match.get("total_final_blows_t2", 0)

            # 신규 방식: setup_complete의 real_timestamp 추출 → game_setup_sec 저장
            # -8 보정 없이 real_ts 그대로 저장. events.timestamp는 이미 (real_ts - 8)이므로
            # 빼면 자연스럽게 8초 전 점프 효과 발생 (사용자 의도 유지)
            game_setup_sec = None
            for _line in log_text.splitlines():
                if ",setup_complete," in _line:
                    _real_ts = parse_log_timestamp(_line.strip())
                    game_setup_sec = max(0, _real_ts)
                    break
            db_match.game_setup_sec = game_setup_sec

            await db.execute(sa_delete(DBEvent).where(DBEvent.match_id == match_id_val))
            await db.execute(sa_delete(DBPlayerStat).where(DBPlayerStat.match_id == match_id_val))
            await db.execute(sa_delete(DBRound).where(DBRound.match_id == match_id_val))

            for rnd in target_match.get("rounds", []):
                db_round = DBRound(
                    match_id=match_id_val,
                    round_number=rnd.get("round_number", 0),
                    winner=rnd.get("winner", ""),
                    duration_sec=rnd.get("duration_sec", 0),
                    final_blows_t1=rnd.get("final_blows_t1", 0),
                    final_blows_t2=rnd.get("final_blows_t2", 0),
                )
                db.add(db_round)
                await db.flush()
                for stat in rnd.get("stats", []):
                    db.add(DBPlayerStat(
                        round_id=db_round.id,
                        match_id=match_id_val,
                        team_name=stat.get("team_name", ""),
                        player_name=stat.get("player_name", ""),
                        hero_name=stat.get("hero_name", ""),
                        hero_image=stat.get("hero_image", ""),
                        slot_index=stat.get("slot_index", -1),
                        **{f: stat.get(f, 0) for f in NUMERIC_FIELDS},
                    ))
                for ev in rnd.get("events", []):
                    et = ev.get("event_type", "")
                    db.add(DBEvent(
                        round_id=db_round.id,
                        match_id=match_id_val,
                        event_type=et,
                        timestamp=float(ev.get("timestamp", 0)),
                        game_timestamp=float(ev.get("game_timestamp", 0)) if ev.get("game_timestamp") is not None else None,
                        player_name=ev.get("player_name"),
                        player_team=ev.get("player_team"),
                        player_hero=ev.get("player_hero"),
                        player_hero_img=ev.get("player_hero_img"),
                        ability=ev.get("ability"),
                        target_name=ev.get("target_name"),
                        target_team=ev.get("target_team"),
                        target_hero=ev.get("target_hero"),
                        target_hero_img=ev.get("target_hero_img"),
                        round_number=int(ev["round_number"]) if ev.get("round_number") is not None else None,
                        winner=ev.get("winner"),
                        attacker=ev.get("attacker"),
                        description=ev.get("desc"),
                        score_t1=int(ev["score_t1"]) if ev.get("score_t1") is not None else None,
                        score_t2=int(ev["score_t2"]) if ev.get("score_t2") is not None else None,
                        capturing_team=ev.get("capturing_team"),
                        new_index=int(ev["new_index"]) if ev.get("new_index") is not None else None,
                        old_index=int(ev["old_index"]) if ev.get("old_index") is not None else None,
                        team=ev.get("team"),
                    ))
            await db.commit()
            print(f"[DB] upload OK: match={match_id_val}")
            return {"status": "success"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

@app.get("/api/admin/db-status")
async def db_status():
    if not _DB_AVAILABLE:
        return {"db_available": False, "error": _DB_IMPORT_ERROR or "DB modules not installed"}
    try:
        from sqlalchemy import func as sa_func
        async with AsyncSessionLocal() as db:
            db_sessions  = (await db.execute(select(sa_func.count()).select_from(DBSession).where(DBSession.deleted_at.is_(None)))).scalar()
            db_sess_del  = (await db.execute(select(sa_func.count()).select_from(DBSession).where(DBSession.deleted_at.isnot(None)))).scalar()
            db_matches   = (await db.execute(select(sa_func.count()).select_from(DBMatch).where(DBMatch.deleted_at.is_(None)))).scalar()
            db_match_del = (await db.execute(select(sa_func.count()).select_from(DBMatch).where(DBMatch.deleted_at.isnot(None)))).scalar()
            db_rounds    = (await db.execute(select(sa_func.count()).select_from(DBRound))).scalar()
            db_ps        = (await db.execute(select(sa_func.count()).select_from(DBPlayerStat))).scalar()
            db_events    = (await db.execute(select(sa_func.count()).select_from(DBEvent))).scalar()

        return {
            "db_available": True,
            "db": {
                "sessions": db_sessions, "sessions_deleted": db_sess_del,
                "matches": db_matches, "matches_deleted": db_match_del,
                "rounds": db_rounds, "player_stats": db_ps, "events": db_events,
            },
            "soft_deleted": {"sessions": db_sess_del, "matches": db_match_del},
            "legacy_json_backup_exists": os.path.exists("scrim_data.json.phase5_backup"),
        }
    except Exception as e:
        return {"db_available": True, "error": str(e)}


@app.post("/api/admin/rebuild-db")
async def rebuild_database():
    import shutil as _shutil
    from sqlalchemy import delete as sa_delete

    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")

    db_path = "data/scrim.db"
    backup_path = f"data/scrim.db.before_rebuild_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    try:
        _shutil.copy(db_path, backup_path)
        print(f"[REBUILD] DB backup: {backup_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {e}")

    print("[REBUILD] raw 파일 파싱 시작...")
    meta_files = sorted(glob.glob(f"{ROW_DATA_DIR}/*_meta.json"), reverse=True)
    new_scrims: list = []
    parse_errors: list[str] = []

    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                scrim_obj = json.load(f)
            scrim_id = scrim_obj["id"]
            log_files = glob.glob(f"{ROW_DATA_DIR}/{scrim_id}_*.txt")
            if not log_files:
                print(f"[REBUILD] 경고: {scrim_id} 로그 없음 (메타만 등록)")
            for log_path in sorted(log_files):
                base_name = os.path.basename(log_path)
                try:
                    match_index = int(base_name.replace(f"{scrim_id}_", "").replace(".txt", ""))
                except:
                    continue
                with open(log_path, "r", encoding="utf-8") as lf:
                    log_text = lf.read()
                target_match = next((m for m in scrim_obj.get("matches", []) if m.get("match_index") == match_index), None)
                if target_match:
                    offset_save = target_match.get("video_offset", 0)
                    pauses_save = target_match.get("pauses", [])
                    c_t1 = target_match.get("team1_name", "1팀")
                    c_t2 = target_match.get("team2_name", "2팀")
                    parsed = parse_overwatch_log(log_text, custom_t1=c_t1, custom_t2=c_t2)
                    calculate_pure_stats(parsed, target_match)
                    target_match["video_offset"] = offset_save
                    target_match["pauses"] = pauses_save
                    # setup_complete real_timestamp 추출 (-8 보정 없이)
                    _gss = None
                    for _line in log_text.splitlines():
                        if ",setup_complete," in _line:
                            _real_ts = parse_log_timestamp(_line.strip())
                            _gss = max(0, _real_ts)
                            break
                    target_match["game_setup_sec"] = _gss
            new_scrims.append(scrim_obj)
        except Exception as e:
            parse_errors.append(f"{os.path.basename(meta_path)}: {e}")
            print(f"[REBUILD] 파싱 실패: {meta_path}: {e}")

    print(f"[REBUILD] 파싱 완료: {len(new_scrims)} scrims. DB 재구축 시작...")

    total_sessions = total_matches = total_rounds = total_events = 0
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(sa_delete(DBEvent))
            await db.execute(sa_delete(DBPlayerStat))
            await db.execute(sa_delete(DBRound))
            await db.execute(sa_delete(DBPause))
            await db.execute(sa_delete(DBMatch))
            await db.execute(sa_delete(DBSession))
            await db.flush()

            for scrim_obj in new_scrims:
                scrim_id = scrim_obj["id"]
                db.add(DBSession(
                    id=scrim_id,
                    scrim_name=scrim_obj.get("scrim_name", ""),
                    date=scrim_obj.get("date", ""),
                    start_time=scrim_obj.get("start_time", ""),
                    end_time=scrim_obj.get("end_time", ""),
                ))
                total_sessions += 1

                for m in scrim_obj.get("matches", []):
                    match_id_val = m.get("id") or str(uuid.uuid4())
                    db.add(DBMatch(
                        id=match_id_val,
                        session_id=scrim_id,
                        match_index=m.get("match_index", 0),
                        map_name=m.get("map_name", ""),
                        team1_name=m.get("team1_name") or m.get("team_1_name", ""),
                        team2_name=m.get("team2_name") or m.get("team_2_name", ""),
                        winner=m.get("winner", ""),
                        score_t1=m.get("score_t1", 0),
                        score_t2=m.get("score_t2", 0),
                        result=m.get("result", ""),
                        video_url=m.get("video_url", ""),
                        video_offset=m.get("video_offset", 0),
                        game_setup_sec=m.get("game_setup_sec"),
                        duration_sec=m.get("timeline", {}).get("duration_sec", 0),
                        total_final_blows_t1=m.get("total_final_blows_t1", 0),
                        total_final_blows_t2=m.get("total_final_blows_t2", 0),
                    ))
                    for p in m.get("pauses", []):
                        db.add(DBPause(
                            match_id=match_id_val,
                            start_sec=p.get("start_sec", 0),
                            end_sec=p.get("end_sec", 0),
                            duration=p.get("duration", 0),
                        ))
                    total_matches += 1
                    await db.flush()

                    for rnd in m.get("rounds", []):
                        db_round = DBRound(
                            match_id=match_id_val,
                            round_number=rnd.get("round_number", 0),
                            winner=rnd.get("winner", ""),
                            duration_sec=rnd.get("duration_sec", 0),
                            final_blows_t1=rnd.get("final_blows_t1", 0),
                            final_blows_t2=rnd.get("final_blows_t2", 0),
                        )
                        db.add(db_round)
                        await db.flush()
                        total_rounds += 1

                        for stat in rnd.get("stats", []):
                            db.add(DBPlayerStat(
                                round_id=db_round.id,
                                match_id=match_id_val,
                                team_name=stat.get("team_name", ""),
                                player_name=stat.get("player_name", ""),
                                hero_name=stat.get("hero_name", ""),
                                hero_image=stat.get("hero_image", ""),
                                slot_index=stat.get("slot_index", -1),
                                **{f: stat.get(f, 0) for f in NUMERIC_FIELDS},
                            ))
                        for ev in rnd.get("events", []):
                            et = ev.get("event_type", "")
                            db.add(DBEvent(
                                round_id=db_round.id,
                                match_id=match_id_val,
                                event_type=et,
                                timestamp=float(ev.get("timestamp", 0)),
                                game_timestamp=float(ev.get("game_timestamp", 0)) if ev.get("game_timestamp") is not None else None,
                                player_name=ev.get("player_name"),
                                player_team=ev.get("player_team"),
                                player_hero=ev.get("player_hero"),
                                player_hero_img=ev.get("player_hero_img"),
                                ability=ev.get("ability"),
                                target_name=ev.get("target_name"),
                                target_team=ev.get("target_team"),
                                target_hero=ev.get("target_hero"),
                                target_hero_img=ev.get("target_hero_img"),
                                round_number=int(ev["round_number"]) if ev.get("round_number") is not None else None,
                                winner=ev.get("winner"),
                                attacker=ev.get("attacker"),
                                description=ev.get("desc"),
                                score_t1=int(ev["score_t1"]) if ev.get("score_t1") is not None else None,
                                score_t2=int(ev["score_t2"]) if ev.get("score_t2") is not None else None,
                                capturing_team=ev.get("capturing_team"),
                                new_index=int(ev["new_index"]) if ev.get("new_index") is not None else None,
                                old_index=int(ev["old_index"]) if ev.get("old_index") is not None else None,
                                team=ev.get("team"),
                            ))
                            total_events += 1

            await db.commit()
            print(f"[REBUILD] 완료: sessions={total_sessions} matches={total_matches} rounds={total_rounds} events={total_events}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB rebuild failed: {e}")

    return {
        "success": True,
        "backup_created": backup_path,
        "sessions": total_sessions,
        "matches": total_matches,
        "rounds": total_rounds,
        "events": total_events,
        "parse_errors": parse_errors,
    }

@app.get("/api/scrims")
async def get_scrim_list():
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.deleted_at.is_(None))
                .options(
                    selectinload(DBSession.matches).selectinload(DBMatch.pauses),
                )
                .order_by(DBSession.date.desc(), DBSession.id.desc())
            )
            sessions = result.scalars().all()
            for s in sessions:
                s.matches = [m for m in (s.matches or []) if m.deleted_at is None]
            return [_db_session_to_dict(s, full=False) for s in sessions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def _db_match_to_dict_events_only(m: "DBMatch") -> dict:
    """stats + rounds.events만. dynamicPlayersData, UltimateStats, FirstKillStats, FirstDeathStats 전용."""
    return {
        "id": m.id,
        "match_index": m.match_index,
        "map_name": m.map_name,
        "team1_name": m.team1_name,
        "team2_name": m.team2_name,
        "team_1_name": m.team1_name,
        "team_2_name": m.team2_name,
        "winner": m.winner or "",
        "stats": _aggregate_match_stats(m),
        "rounds": [
            {
                "round_number": r.round_number,
                "events": [_db_event_to_dict(ev) for ev in (r.events or [])]
            }
            for r in (m.rounds or [])
        ],
    }


def _db_session_to_dict_events_only(s: "DBSession") -> dict:
    return {
        "id": s.id,
        "scrim_name": s.scrim_name,
        "date": s.date,
        "matches": [
            _db_match_to_dict_events_only(m)
            for m in (s.matches or [])
            if m.deleted_at is None
        ],
    }


@app.get("/api/scrims/full-events")
async def get_scrims_full_events():
    """UltimateStats, FirstKillStats, FirstDeathStats, dynamicPlayersData 전용.
    stats + rounds.events 포함. fights/pauses/timeline/fight_metrics 제외."""
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.deleted_at.is_(None))
                .options(
                    selectinload(DBSession.matches).options(
                        selectinload(DBMatch.rounds).selectinload(DBRound.player_stats),
                        selectinload(DBMatch.rounds).selectinload(DBRound.events),
                    )
                )
                .order_by(DBSession.date.desc(), DBSession.id.desc())
            )
            sessions = result.scalars().all()
            for s in sessions:
                s.matches = [m for m in (s.matches or []) if m.deleted_at is None]
            return [_db_session_to_dict_events_only(s) for s in sessions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


def _build_match_pauses(m: "DBMatch") -> list:
    return [{"start_sec": p.start_sec, "end_sec": p.end_sec, "duration": p.duration}
            for p in (m.pauses or [])]


def _first_fight_from_events(events: list, t1: str, t2: str):
    """compute_fights/format_fights_for_api 재사용. 가장 먼저 시작된 한타 1개(dict) 또는 None."""
    ev_dicts = [_db_event_to_dict(ev) for ev in (events or [])]
    fights = format_fights_for_api(compute_fights(ev_dicts, t1, t2), t1, t2)
    return fights[0] if fights else None


def _round_start_sec(r: "DBRound", m: "DBMatch") -> float:
    """라운드 시작 시점을 '실제(real) 좌표' 초로 반환. buildVideoLink가 game_setup_sec를 빼서
    영상 위치로 환산하므로, 여기서는 -8 보정을 되돌린 real 좌표를 돌려준다 (round 1 == game_setup_sec).

    events.timestamp는 -8 보정된 stored 좌표, rounds.duration_sec는 게임시간 누적이므로
    (round_end_ts - duration_sec)는 stored 좌표의 라운드 시작이고, +8 하면 real 좌표가 된다.
    round_start 이벤트 자체는 결측/부정확이 많아 쓰지 않는다.
    """
    round_end_ts = None
    for ev in (r.events or []):
        if ev.event_type == "round_end" and ev.timestamp is not None:
            if round_end_ts is None or ev.timestamp > round_end_ts:
                round_end_ts = ev.timestamp
    if round_end_ts is not None and r.duration_sec is not None:
        return (round_end_ts - r.duration_sec) + 8.0
    # 폴백 1: 1라운드는 game_setup_sec(=real 좌표 라운드 시작)
    if r.round_number == 1 and m.game_setup_sec is not None:
        return float(m.game_setup_sec)
    # 폴백 2: 라운드 첫 교전 이벤트(real 좌표). round_end 결측 + 비1라운드인 드문 경우.
    kts = [ev.timestamp for ev in (r.events or [])
           if ev.event_type in ("kill", "ultimate_start") and ev.timestamp is not None]
    if kts:
        return min(kts) + 8.0
    return 0.0


def _first_fight_item(m: "DBMatch", s: "DBSession", map_type: str,
                      round_number, fight: dict, round_start_sec: float) -> dict:
    """첫 한타 1건을 평탄한 응답 항목으로 직렬화."""
    return {
        "session_id": s.id,
        "session_date": s.date,
        "match_id": m.id,
        "match_index": m.match_index,
        "map_name": m.map_name,
        "map_type": map_type,
        "team1_name": m.team1_name,
        "team2_name": m.team2_name,
        "round_number": round_number,
        "start_timestamp": fight.get("start_timestamp"),
        "start_game_timestamp": fight.get("start_game_timestamp"),
        "round_start_sec": round_start_sec,  # real 좌표 라운드 시작 (영상 점프 기준점)
        "video_url": m.video_url or "",
        "video_offset": m.video_offset or 0,
        "game_setup_sec": m.game_setup_sec,
        "pauses": _build_match_pauses(m),
    }


@app.get("/api/first-fights")
async def get_first_fights():
    """첫 한타(첫 교전) 모아보기 전용. 맵 종류 규칙에 따라 라운드/매치별 첫 한타를 평탄한 리스트로 반환.
    - 쟁탈/화물/혼합/격돌: 라운드마다 첫 한타 1개씩 (round_number 채움).
    - 플래시포인트/밀기: 매치 전체에서 가장 먼저 시작된 한타 1개만 (round_number = None).
    한타가 0개인 라운드/매치는 건너뜀. soft-delete(deleted_at) 숨김. compute_fights 재사용·미수정.
    """
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.deleted_at.is_(None))
                .options(
                    selectinload(DBSession.matches).options(
                        selectinload(DBMatch.pauses),
                        selectinload(DBMatch.rounds).selectinload(DBRound.events),
                    )
                )
                .order_by(DBSession.date.desc(), DBSession.id.desc())
            )
            sessions = result.scalars().all()

            items: list = []
            for s in sessions:
                for m in (s.matches or []):
                    if m.deleted_at is not None:
                        continue
                    t1, t2 = m.team1_name, m.team2_name
                    map_type = resolve_map_type(m.map_name)
                    rounds = m.rounds or []
                    if is_match_level_map(map_type):
                        # 매치 전체 이벤트에서 첫 한타 1개 (가장 먼저 시작된 = 첫 라운드의 첫 한타)
                        all_events = [ev for r in rounds for ev in (r.events or [])]
                        fight = _first_fight_from_events(all_events, t1, t2)
                        if fight and rounds:
                            rs = _round_start_sec(rounds[0], m)  # 첫 라운드 시작 기준
                            items.append(_first_fight_item(m, s, map_type, None, fight, rs))
                    else:
                        # 라운드마다 첫 한타 1개씩
                        for r in rounds:
                            fight = _first_fight_from_events(r.events or [], t1, t2)
                            if fight:
                                rs = _round_start_sec(r, m)
                                items.append(_first_fight_item(m, s, map_type, r.round_number, fight, rs))
            return items
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


@app.get("/api/scrims/{scrim_id}")
async def get_scrim_detail(scrim_id: str):
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.id == scrim_id, DBSession.deleted_at.is_(None))
                .options(selectinload(DBSession.matches).selectinload(DBMatch.pauses))
            )
            session = result.scalars().first()
            if not session:
                raise HTTPException(status_code=404, detail="Scrim not found")
            session.matches = [m for m in (session.matches or []) if m.deleted_at is None]
            return _db_session_to_dict(session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

# DEPRECATED (Phase 5): No longer used. Kept for manual recovery only.
def _find_session_in_json(scrim_id: str) -> dict | None:
    for scrim in load_data():
        if scrim.get("id") == scrim_id:
            return scrim
    return None


# DEPRECATED (Phase 5): No longer used. Kept for manual recovery only.
def _find_match_in_json(match_id: str) -> dict | None:
    for scrim in load_data():
        for m in scrim.get("matches", []):
            if m.get("id") == match_id:
                return m
    return None


@app.get("/api/matches/{match_id}")
async def get_match_detail(match_id: str):
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBMatch)
                .where(DBMatch.id == match_id, DBMatch.deleted_at.is_(None))
                .options(
                    selectinload(DBMatch.rounds).selectinload(DBRound.player_stats),
                    selectinload(DBMatch.rounds).selectinload(DBRound.events),
                    selectinload(DBMatch.pauses),
                )
            )
            db_match = result.scalars().first()
            if not db_match:
                raise HTTPException(status_code=404, detail="Match not found")
            return _db_match_to_dict(db_match, full=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

class BatchDeleteRequest(BaseModel):
    ids: List[str]

# ── 세션 단건 삭제 ─────────────────────────────────────────────
@app.delete("/api/sessions/{scrim_id}")
async def delete_session(scrim_id: str):
    # 1. DB soft delete
    if _DB_AVAILABLE:
        try:
            from sqlalchemy.orm import selectinload as _sil
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(DBSession)
                    .where(DBSession.id == scrim_id, DBSession.deleted_at.is_(None))
                    .options(_sil(DBSession.matches))
                )
                sess = result.scalars().first()
                if not sess:
                    raise HTTPException(status_code=404, detail=f"Session {scrim_id} not found")
                if sess:
                    now = datetime.utcnow()
                    sess.deleted_at = now
                    for m in (sess.matches or []):
                        if m.deleted_at is None:
                            m.deleted_at = now
                    await db.commit()
                    print(f"[DB] soft-delete session: {scrim_id}")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[DB] delete_session failed: {e}")

    print(f"[DELETE] 세션 삭제: {scrim_id}  ({datetime.now().isoformat()})")
    warnings = _delete_scrim_files(scrim_id)
    return {"success": True, "deleted_count": 1, "warnings": warnings, "failed_ids": []}

# ── 세션 배치 삭제 ─────────────────────────────────────────────
@app.post("/api/sessions/delete-batch")
async def delete_sessions_batch(req: BatchDeleteRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids 배열이 비어 있습니다")

    deleted_ids: list[str] = []
    failed_ids: list[str] = []

    # 1. DB soft delete
    if _DB_AVAILABLE:
        try:
            from sqlalchemy.orm import selectinload as _sil
            async with AsyncSessionLocal() as db:
                now = datetime.utcnow()
                for sid in req.ids:
                    result = await db.execute(
                        select(DBSession)
                        .where(DBSession.id == sid, DBSession.deleted_at.is_(None))
                        .options(_sil(DBSession.matches))
                    )
                    sess = result.scalars().first()
                    if sess:
                        sess.deleted_at = now
                        for m in (sess.matches or []):
                            if m.deleted_at is None:
                                m.deleted_at = now
                        deleted_ids.append(sid)
                    else:
                        failed_ids.append(sid)
                await db.commit()
            print(f"[DB] soft-delete sessions batch: {deleted_ids}")
        except Exception as e:
            print(f"[DB] delete_sessions_batch failed: {e}")
            # Fallback: treat all as to-delete via JSON only
            deleted_ids = list(req.ids)
            failed_ids = []
    else:
        deleted_ids = list(req.ids)

    print(f"[DELETE] 세션 배치 삭제: {deleted_ids}  ({datetime.now().isoformat()})")
    warnings: list[str] = []
    for sid in deleted_ids:
        warnings.extend(_delete_scrim_files(sid))

    return {
        "success": len(failed_ids) == 0,
        "deleted_count": len(deleted_ids),
        "warnings": warnings,
        "failed_ids": failed_ids,
    }

# ── 매치 단건 삭제 ─────────────────────────────────────────────
@app.delete("/api/matches/{match_id}")
async def delete_match(match_id: str):
    found_scrim_id = None
    found_match_index = None

    # 1. DB soft delete
    if _DB_AVAILABLE:
        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(DBMatch).where(DBMatch.id == match_id, DBMatch.deleted_at.is_(None))
                )
                m = result.scalars().first()
                if m:
                    found_scrim_id = m.session_id
                    found_match_index = m.match_index
                    m.deleted_at = datetime.utcnow()
                    await db.commit()
                    print(f"[DB] soft-delete match: {match_id}")
        except Exception as e:
            print(f"[DB] delete_match failed: {e}")

    if not found_scrim_id:
        raise HTTPException(status_code=404, detail=f"Match {match_id} not found")
    warnings: list[str] = []

    print(f"[DELETE] 매치 삭제: {match_id} (scrim={found_scrim_id}, index={found_match_index})  ({datetime.now().isoformat()})")
    warnings.extend(_delete_match_file(found_scrim_id, found_match_index))
    return {"success": True, "deleted_count": 1, "warnings": warnings, "failed_ids": []}

# ── 매치 배치 삭제 ─────────────────────────────────────────────
@app.post("/api/matches/delete-batch")
async def delete_matches_batch(req: BatchDeleteRequest):
    if not req.ids:
        raise HTTPException(status_code=400, detail="ids 배열이 비어 있습니다")

    # [(scrim_id, match_index, match_id)]
    db_deleted: list[tuple[str, int, str]] = []
    failed_ids: list[str] = []

    # 1. DB soft delete
    if _DB_AVAILABLE:
        try:
            async with AsyncSessionLocal() as db:
                now = datetime.utcnow()
                for mid in req.ids:
                    result = await db.execute(
                        select(DBMatch).where(DBMatch.id == mid, DBMatch.deleted_at.is_(None))
                    )
                    m = result.scalars().first()
                    if m:
                        m.deleted_at = now
                        db_deleted.append((m.session_id, m.match_index, mid))
                    else:
                        failed_ids.append(mid)
                await db.commit()
            print(f"[DB] soft-delete matches batch: {[x[2] for x in db_deleted]}")
        except Exception as e:
            print(f"[DB] delete_matches_batch failed: {e}")
            db_deleted = [(None, None, mid) for mid in req.ids]
            failed_ids = []

    warnings: list[str] = []
    print(f"[DELETE] 매치 배치 삭제: {[x[2] for x in db_deleted]}  ({datetime.now().isoformat()})")
    for scrim_id, match_index, _ in db_deleted:
        if scrim_id and match_index is not None:
            warnings.extend(_delete_match_file(scrim_id, match_index))

    return {
        "success": len(failed_ids) == 0,
        "deleted_count": len(db_deleted),
        "warnings": warnings,
        "failed_ids": failed_ids,
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)