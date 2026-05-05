from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import uvicorn
import json
import os
import glob
import uuid
import re

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "scrim_data.json"
ROW_DATA_DIR = "scrim_rowdata_log"

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
    has_pause: bool = Field(default=False, alias="hasPause")
    pauses: List[PauseInput] = []

    class Config:
        populate_by_name = True
        allow_population_by_field_name = True
        extra = "ignore" 

class ScrimManualInput(BaseModel):
    scrim_name: str = Field(alias="scrimName")
    video_url: str = Field(alias="videoUrl")
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

def load_data():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except:
        return []

def save_data(data):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

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
        # 비속어 필터(****)가 들어와도 무조건 kill로 자동 변환!
        line = line.replace("****", "kill")
        
        clean_line = line.strip()
        real_timestamp = parse_log_timestamp(clean_line)
        play_timestamp = max(0, real_timestamp - 8)
        parts = clean_line.split(',')
        
        if ",match_start," in clean_line:
            try:
                base_idx = parts.index("match_start")
                game_time = float(parts[0].replace('[', '').replace(']', '')) if parts[0].startswith('[') else 0.0
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
                    "timestamp": real_timestamp,
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

                # 💡 중복 스텟 생성 방지 로직: 45초 이내에 연속으로 들어온 스텟 로그는 단일 뭉치(라운드)로 합칩니다.
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

    if first_team_name and second_team_name:
        t1, t2 = first_team_name, second_team_name
    else:
        sorted_teams = sorted(list(team_names))
        t1 = sorted_teams[0] if len(sorted_teams) > 0 else "Team 1"
        t2 = sorted_teams[1] if len(sorted_teams) > 1 else "Team 2"

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
    
    score_match_end_t1 = parsed.get("match_end_score_t1") or 0
    score_match_end_t2 = parsed.get("match_end_score_t2") or 0
    
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
        if score_match_end_t1 > 0 or score_match_end_t2 > 0:
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

    # 💡 [핵심 버그 수정] 라운드 진행 시간이 15초 미만인 것은 중복/유령 라운드로 판단하여 제거합니다!
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

@app.post("/api/scrim/manual-register")
async def register_scrim_manual(request: Request):
    try:
        raw_body = await request.json()
        data = ScrimManualInput(**raw_body)
    except Exception as e:
        print(f"❌ [DEBUG] Validation Error: {e}")
        raise HTTPException(status_code=422, detail=f"Validation Error: {str(e)}")

    current_data = load_data()
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
            "video_offset": video_offset,
            "pauses": processed_pauses, 
            "timeline": {"duration_sec": 0},
            "rounds": [], "stats": [],
            "fights": [], "fight_metrics": {}
        })

    new_scrim = {
        "id": new_scrim_id,
        "scrim_name": data.scrim_name,
        "video_url": data.video_url,
        "date": data.date,
        "start_time": data.start_time,
        "end_time": data.end_time,
        "matches": processed_matches
    }

    current_data.insert(0, new_scrim)
    save_data(current_data)
    with open(f"{ROW_DATA_DIR}/{new_scrim_id}_meta.json", "w", encoding="utf-8") as f:
        json.dump(new_scrim, f, ensure_ascii=False, indent=4)
    return {"status": "success", "scrim_id": new_scrim_id}

@app.post("/api/matches/upload")
async def upload_match_log(scrim_id: str = Form(...), match_index: int = Form(...), file: UploadFile = File(...)):
    content = await file.read()
    try: log_text = content.decode("utf-8")
    except: log_text = content.decode("cp949", errors="ignore")

    with open(f"{ROW_DATA_DIR}/{scrim_id}_{match_index}.txt", "w", encoding="utf-8") as f:
        f.write(log_text)

    all_data = load_data()
    target_scrim = next((s for s in all_data if s['id'] == scrim_id), None)
    if target_scrim:
        target_match = next((m for m in target_scrim['matches'] if m['match_index'] == match_index), None)
        if target_match:
            offset_save = target_match.get("video_offset", 0)
            pauses_save = target_match.get("pauses", [])
            
            c_t1 = target_match.get("team1_name", "1팀")
            c_t2 = target_match.get("team2_name", "2팀")
            
            parsed = parse_overwatch_log(log_text, custom_t1=c_t1, custom_t2=c_t2)
            calculate_pure_stats(parsed, target_match)
            
            target_match["video_offset"] = offset_save
            target_match["pauses"] = pauses_save
            
            save_data(all_data)
            return {"status": "success"}
    raise HTTPException(status_code=404, detail="Match not found")

@app.post("/api/admin/rebuild-db")
async def rebuild_database():
    print("🔄 [SYSTEM] DB 재구축 시작...")
    new_data_list = []
    meta_files = glob.glob(f"{ROW_DATA_DIR}/*_meta.json")
    meta_files.sort(reverse=True)
    for meta_path in meta_files:
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                scrim_obj = json.load(f)
            scrim_id = scrim_obj["id"]

            log_files = glob.glob(f"{ROW_DATA_DIR}/{scrim_id}_*.txt")
            
            if not log_files:
                print(f"⚠️ 경고: {scrim_id}의 로그(.txt) 파일이 로컬에 없습니다. 계산을 건너뜁니다.")
            
            for log_path in log_files:
                base_name = os.path.basename(log_path)
                try: match_index = int(base_name.replace(f"{scrim_id}_", "").replace(".txt", ""))
                except: continue
                with open(log_path, "r", encoding="utf-8") as lf:
                    log_text = lf.read()

                target_match = next((m for m in scrim_obj['matches'] if m['match_index'] == match_index), None)
                if target_match:
                    offset_save = target_match.get("video_offset", 0)
                    pauses_save = target_match.get("pauses", [])
                    
                    c_t1 = target_match.get("team1_name", "1팀")
                    c_t2 = target_match.get("team2_name", "2팀")
                    
                    parsed = parse_overwatch_log(log_text, custom_t1=c_t1, custom_t2=c_t2)
                    calculate_pure_stats(parsed, target_match)
                    
                    target_match["video_offset"] = offset_save
                    target_match["pauses"] = pauses_save

            new_data_list.append(scrim_obj)
        except Exception as e:
            print(f"❌ 복구 실패: {e}")
    save_data(new_data_list)
    return {"status": "success", "count": len(new_data_list)}

@app.get("/api/scrims")
async def get_scrim_list():
    return load_data()

@app.get("/api/scrims/{scrim_id}")
async def get_scrim_detail(scrim_id: str):
    all_data = load_data()
    for scrim in all_data:
        if scrim['id'] == scrim_id:
            return scrim
    raise HTTPException(status_code=404, detail="Scrim not found")

@app.get("/api/matches/{match_id}")
async def get_match_detail(match_id: str):
    all_data = load_data()
    for scrim in all_data:
        base_video_url = scrim.get("video_url", "")
        for match in scrim['matches']:
            if match['id'] == match_id:
                out = match
                out["video_url"] = base_video_url
                return out
    raise HTTPException(status_code=404, detail="Match not found")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)