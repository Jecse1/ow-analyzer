from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
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

# 응답 gzip 압축 — 1KB 이상 JSON 전송량 절감 (Accept-Encoding: gzip 클라이언트만)
# compresslevel=6: 기본값 9는 압축률 이득이 거의 없이 CPU만 수 배 소모 (저사양 서버 고려)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=6)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 밴픽 실시간 대결(WebSocket) — 격리 모듈. 기존 API/집계/DB 무변경, 라우터 등록만.
try:
    from banpick import router as banpick_router
    app.include_router(banpick_router)
except Exception as _e:
    print(f"[banpick] router not loaded: {_e}")

_json_lock = threading.Lock()

# [split] 응답 캐시 → cache.py (하위호환 re-export; _RESPONSE_CACHE 단일 객체 유지)
from cache import _RESPONSE_CACHE, _response_cache_get, _response_cache_store, _invalidate_response_cache


# [split] 상수·경로·게임데이터 파생 → config.py (하위호환 re-export)
from config import (
    KOREAN_HERO_MAP, TANKS, SUPPORTS, MAP_TYPE_DATA, CONTROL_MAP_KEYWORDS,
    _FIGHTLAB_TANKS, _FIGHTLAB_SUPPORTS, _FIGHTLAB_DAMAGE,
    PLAYER_ROLE_OVERRIDES, NUMERIC_FIELDS, FIGHT_QUIET_GAP_SEC,
    DATA_FILE, ROW_DATA_DIR,
    _MAP_TYPE_DATA_NOSPACE, _MATCH_LEVEL_MAP_TYPES,
    TRADE_WINDOW_SEC, HERO_ROLE_DATA,
    MIN_SAMPLE_FOR_PERCENTILE_FIGHTS, MIN_SAMPLE_FOR_PERCENTILE_ROUNDS, PERCENTILE_MIN_POOL,
)

# [split] 로그 파서·맵/팀/시간 헬퍼·역할점수 → parsers/log_parser.py (하위호환 re-export)
from parsers.log_parser import (
    normalize_team_name, is_control_map, resolve_map_type, is_match_level_map, safe_float,
    time_str_to_seconds, parse_log_timestamp,
    get_role_score, get_player_role_score,
    parse_overwatch_log, assign_persistent_slots,
)

# [split] 요청 Pydantic 모델 → schemas.py (하위호환 re-export)
from schemas import PauseInput, MatchSegment, ScrimManualInput, BatchDeleteRequest


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


# [split] 한타 요약/지표·fightlab 변환 → services/fight_metrics.py (하위호환 re-export)
from services.fight_metrics import (
    build_fight_summaries, compute_fight_metrics,
    _build_match_pauses, _fightlab_hero_role, _fightlab_side, _fight_to_record,
)


# [split] 순수 통계 계산 → services/stats.py (하위호환 re-export)
from services.stats import calculate_pure_stats, compute_player_fight_stats

# [split] DB→dict 직렬화 → serializers.py (하위호환 re-export)
from serializers import (
    _db_event_to_dict, _db_player_stat_to_dict, _db_round_to_dict,
    _aggregate_match_stats, _db_match_to_dict, _db_session_to_dict,
)


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

        # 승패 보정: 실제 팀명일 때만 인정(그 외 값은 무시 → 미보정)
        # 팀명/맵명 앞뒤 공백 제거 — ' FLC'처럼 저장되면 기준팀 필터·팀 목록이 갈라짐(260702-T1 #3 사례)
        t1_name = (match.team1Name or "").strip() or "1팀"
        t2_name = (match.team2Name or "").strip() or "2팀"
        wo = (match.winner_override or "").strip()
        if wo not in (t1_name, t2_name):
            wo = ""

        processed_matches.append({
            "id": str(uuid.uuid4()),
            "match_index": idx + 1,
            "map_name": (match.map_name or "").strip(),
            "team1_name": t1_name,
            "team2_name": t2_name,
            "result": match.result,
            "winner_override": wo,
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
                    winner_override=m.get("winner_override") or None,
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

    _invalidate_response_cache()
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
            _invalidate_response_cache()
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
            # 수기 승패 보정(winner_override)은 DB에만 있으므로 재구축 전 스냅샷 → 재구축 후 복원
            # (video_offset/pauses가 meta.json에서 보존되는 것과 같은 원칙)
            _wo_rows = await db.execute(select(DBMatch.id, DBMatch.winner_override)
                                        .where(DBMatch.winner_override.isnot(None)))
            _wo_snapshot = {row[0]: row[1] for row in _wo_rows}
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
                        winner_override=_wo_snapshot.get(match_id_val) or m.get("winner_override") or None,
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

    _invalidate_response_cache()
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
        # winner = 유효 승자(수기 보정 우선) — _db_match_to_dict와 동일 규칙.
        "winner": (m.winner_override or m.winner) or "",
        "winner_original": m.winner or "",
        "winner_override": m.winner_override or "",
        "stats": _aggregate_match_stats(m),
        "rounds": [
            {
                "round_number": r.round_number,
                # 라운드별 선수 스탯 — 전체 통계 탭이 matches/{id} 대신 이 응답을 쓰기 위해 필요.
                # (player_stats는 위 stats 집계용으로 이미 로드되어 있어 추가 DB 비용 없음)
                "stats": [_db_player_stat_to_dict(ps) for ps in (r.player_stats or [])],
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
    cache_key = "full-events"
    cached = _response_cache_get(cache_key)
    if cached is not None:
        return cached
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
            payload = [_db_session_to_dict_events_only(s) for s in sessions]
            return _response_cache_store(cache_key, payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")




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


# ─────────────────────────────────────────────────────────────────────────────
# 한타 분석 (베타) 전용: GET /api/fight-records
# compute_fights 재사용(미수정). 한타 1개 = 응답 항목 1개(평탄 리스트).
# ─────────────────────────────────────────────────────────────────────────────





@app.get("/api/fight-records")
async def get_fight_records(base_team: str = "FLC"):
    """한타 분석(베타) 탭 전용. 모든 한타를 평탄 리스트로 반환하고 프론트가 기간별 집계만 수행.
    - 한타 그룹핑/승자: compute_fights 재사용(미수정). 라운드 단위로 계산(기존 UltimateStats와 동일).
    - 승자 판정: 생존자 수 비교(fight_analysis.py). 무승부(동수)는 winner='unknown' → 프론트 집계 제외.
    - base_team(기본 FLC)이 참가하지 않은 매치는 건너뜀. soft-delete(deleted_at) 숨김.
    """
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    cache_key = f"fight-records:{base_team}"
    cached = _response_cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.deleted_at.is_(None))
                .options(
                    selectinload(DBSession.matches).selectinload(DBMatch.rounds).selectinload(DBRound.events),
                    selectinload(DBSession.matches).selectinload(DBMatch.pauses),
                )
                .order_by(DBSession.date.desc(), DBSession.id.desc())
            )
            sessions = result.scalars().all()

            records: list = []
            skipped_matches = 0
            for s in sessions:
                for m in (s.matches or []):
                    if m.deleted_at is not None:
                        continue
                    t1, t2 = m.team1_name, m.team2_name
                    if t1 == base_team:
                        our_side = 1
                    elif t2 == base_team:
                        our_side = 2
                    else:
                        skipped_matches += 1
                        continue
                    map_type = resolve_map_type(m.map_name)
                    for r in (m.rounds or []):
                        ev_dicts = [_db_event_to_dict(ev) for ev in (r.events or [])]
                        for f in compute_fights(ev_dicts, t1, t2):
                            records.append(_fight_to_record(f, our_side, t1, t2, s, m, map_type, r.round_number))

            total = len(records)
            unknown = sum(1 for rec in records if rec["fight_winner"] == "unknown")
            payload = {
                "meta": {
                    "base_team": base_team,
                    "trade_window_sec": TRADE_WINDOW_SEC,
                    "total_fights": total,
                    "winner_unknown_count": unknown,
                    "winner_unknown_rate": (unknown / total) if total > 0 else 0,
                    "skipped_matches_without_base_team": skipped_matches,
                },
                "records": records,
            }
            return _response_cache_store(cache_key, payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 한타 분석 (베타) [선수] 서브탭 전용: GET /api/player-fight-stats
# (매치 × 선수 × 영웅) 단위 가산(additive) 집계. 프론트가 기간/필터별로 합산만 수행.
# compute_fights 재사용(미수정). 기존 엔드포인트/필드 무변경 — 신규 추가만.
# ─────────────────────────────────────────────────────────────────────────────



@app.get("/api/player-fight-stats")
async def get_player_fight_stats(base_team: str = "FLC"):
    """선수별 한타/라운드 지표의 원자료.
    - 한타 지표: 라운드별 compute_fights 결과에서 선수·영웅 단위로 집계.
      · fights(한타 수)는 그 라운드에 player_stats 엔트리가 있는 선수(=출전)에게 라운드의 한타 수를 부여.
      · kp_sum/kp_fights: 팀 킬>0인 한타에서 (본인 킬/팀 킬)의 합과 그 한타 수 → 킬 관여율 = kp_sum/kp_fights.
      · first_kills/first_deaths: 한타 첫 킬의 킬러/희생자 기준.
      · ult_*: 한타 내 ultimate_start 기준. ult_fight_known은 승자 판정 가능한 궁 사용 한타 수.
    - 라운드 지표: player_stats(라운드 요약)를 그대로 합산. duration_sec 없는(<=0) 라운드는 제외.
    - side: base_team(FLC) 기준 'us'/'them'. 상대 선수도 동일 구조로 집계(백분위 풀·상대 시점용).
    """
    if not _DB_AVAILABLE:
        raise HTTPException(status_code=503, detail="Database not available")
    cache_key = f"player-fight-stats:{base_team}"
    cached = _response_cache_get(cache_key)
    if cached is not None:
        return cached
    try:
        from sqlalchemy.orm import selectinload
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(DBSession)
                .where(DBSession.deleted_at.is_(None))
                .options(
                    selectinload(DBSession.matches).options(
                        selectinload(DBMatch.rounds).selectinload(DBRound.events),
                        selectinload(DBMatch.rounds).selectinload(DBRound.player_stats),
                    )
                )
                .order_by(DBSession.date.desc(), DBSession.id.desc())
            )
            sessions = result.scalars().all()

            items = compute_player_fight_stats(sessions, base_team)

            payload = {
                "meta": {
                    "base_team": base_team,
                    "min_sample_for_percentile_fights": MIN_SAMPLE_FOR_PERCENTILE_FIGHTS,
                    "min_sample_for_percentile_rounds": MIN_SAMPLE_FOR_PERCENTILE_ROUNDS,
                    "percentile_min_pool": PERCENTILE_MIN_POOL,
                    "items": len(items),
                },
                "items": list(items.values()),
            }
            return _response_cache_store(cache_key, payload)
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
    _invalidate_response_cache()
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

    _invalidate_response_cache()
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
    _invalidate_response_cache()
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

    _invalidate_response_cache()
    return {
        "success": len(failed_ids) == 0,
        "deleted_count": len(db_deleted),
        "warnings": warnings,
        "failed_ids": failed_ids,
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)