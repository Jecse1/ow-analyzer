"""
Idempotent JSON → DB import script.
Run from backend/ directory:
    python -m scripts.import_json_to_db

Strategy:
- sessions/matches/pauses: SKIP if already exists (id-based)
- rounds/player_stats/events: DELETE existing for match then re-insert
  (ensures fresh data when match has been re-analyzed)
- JSON fights are ignored — fights are always recomputed from events at query time
"""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete
from db.database import AsyncSessionLocal, init_db
from db.models import (
    Session as DBSession, Match as DBMatch, Pause as DBPause,
    Round as DBRound, PlayerStat as DBPlayerStat, Event as DBEvent,
)

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scrim_data.json")

_NUMERIC_FIELDS = [
    "eliminations", "final_blows", "deaths",
    "all_damage_dealt", "barrier_damage_dealt", "hero_damage_dealt",
    "healing_dealt", "healing_received", "self_healing",
    "damage_taken", "damage_blocked", "defensive_assists", "offensive_assists",
    "ultimates_earned", "ultimates_used", "multikill_best", "multikills",
    "solo_kills", "objective_kills", "environmental_kills", "environmental_deaths",
    "hero_time_played",
]


def _pint(val, default=0):
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        return default


def _pfloat(val, default=0.0):
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


def _build_db_event(ev: dict, round_id: int, match_id: str) -> DBEvent:
    et = ev.get("event_type", "")
    return DBEvent(
        round_id=round_id,
        match_id=match_id,
        event_type=et,
        timestamp=_pfloat(ev.get("timestamp", 0)),
        game_timestamp=_pfloat(ev.get("game_timestamp")) if ev.get("game_timestamp") is not None else None,
        # kill, ultimate_start
        player_name=ev.get("player_name"),
        player_team=ev.get("player_team"),
        player_hero=ev.get("player_hero"),
        player_hero_img=ev.get("player_hero_img"),
        ability=ev.get("ability"),
        # kill only
        target_name=ev.get("target_name"),
        target_team=ev.get("target_team"),
        target_hero=ev.get("target_hero"),
        target_hero_img=ev.get("target_hero_img"),
        # round_start, round_end
        round_number=_pint(ev["round_number"]) if ev.get("round_number") is not None else None,
        # round_end, match_end
        winner=ev.get("winner"),
        # round_start
        attacker=ev.get("attacker"),
        # match_start ("desc" in JSON → "description" in DB)
        description=ev.get("desc"),
        # match_end
        score_t1=_pint(ev["score_t1"]) if ev.get("score_t1") is not None else None,
        score_t2=_pint(ev["score_t2"]) if ev.get("score_t2") is not None else None,
        # objective_captured
        capturing_team=ev.get("capturing_team"),
        # objective_updated
        new_index=_pint(ev["new_index"]) if ev.get("new_index") is not None else None,
        old_index=_pint(ev["old_index"]) if ev.get("old_index") is not None else None,
        # payload_progress
        team=ev.get("team"),
    )


async def _import_rounds_for_match(db, match_id: str, match: dict) -> tuple[int, int, int]:
    """Delete existing rounds/player_stats/events for match_id, then re-insert.
    Returns (rounds_inserted, player_stats_inserted, events_inserted).
    SQLite FK cascade is disabled by default — delete child tables explicitly in order.
    """
    await db.execute(delete(DBEvent).where(DBEvent.match_id == match_id))
    await db.execute(delete(DBPlayerStat).where(DBPlayerStat.match_id == match_id))
    await db.execute(delete(DBRound).where(DBRound.match_id == match_id))

    rounds_inserted = 0
    ps_inserted = 0
    ev_inserted = 0

    for rnd in match.get("rounds", []):
        db_round = DBRound(
            match_id=match_id,
            round_number=_pint(rnd.get("round_number", 0)),
            winner=rnd.get("winner", ""),
            duration_sec=_pfloat(rnd.get("duration_sec", 0)),
            final_blows_t1=_pint(rnd.get("final_blows_t1", 0)),
            final_blows_t2=_pint(rnd.get("final_blows_t2", 0)),
        )
        db.add(db_round)
        await db.flush()  # get db_round.id

        for stat in rnd.get("stats", []):
            db_ps = DBPlayerStat(
                round_id=db_round.id,
                match_id=match_id,
                team_name=stat.get("team_name", ""),
                player_name=stat.get("player_name", ""),
                hero_name=stat.get("hero_name", ""),
                hero_image=stat.get("hero_image", ""),
                slot_index=_pint(stat.get("slot_index", -1)),
                **{f: _pfloat(stat.get(f, 0)) for f in _NUMERIC_FIELDS},
            )
            db.add(db_ps)
            ps_inserted += 1

        for ev in rnd.get("events", []):
            db.add(_build_db_event(ev, db_round.id, match_id))
            ev_inserted += 1

        rounds_inserted += 1

    return rounds_inserted, ps_inserted, ev_inserted


async def import_all():
    await init_db()

    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    scrims = data if isinstance(data, list) else data.get("scrims", [])

    ins_sessions = ins_matches = ins_pauses = ins_rounds = ins_ps = ins_ev = 0
    skp_sessions = skp_matches = 0

    async with AsyncSessionLocal() as db:
        for scrim in scrims:
            scrim_id = str(scrim.get("id", ""))
            if not scrim_id:
                continue

            if await db.get(DBSession, scrim_id):
                skp_sessions += 1
            else:
                db.add(DBSession(
                    id=scrim_id,
                    scrim_name=scrim.get("scrim_name", ""),
                    date=scrim.get("date", ""),
                    start_time=scrim.get("start_time", ""),
                    end_time=scrim.get("end_time", ""),
                ))
                ins_sessions += 1

            for match in scrim.get("matches", []):
                match_id = str(match.get("id", ""))
                if not match_id:
                    continue

                if await db.get(DBMatch, match_id):
                    skp_matches += 1
                    # rounds always re-sync (includes events)
                    r, ps, ev = await _import_rounds_for_match(db, match_id, match)
                    ins_rounds += r
                    ins_ps += ps
                    ins_ev += ev
                    continue

                team1 = match.get("team1_name") or match.get("team_1_name") or ""
                team2 = match.get("team2_name") or match.get("team_2_name") or ""

                db.add(DBMatch(
                    id=match_id,
                    session_id=scrim_id,
                    match_index=_pint(match.get("match_index", 0)),
                    map_name=match.get("map_name", ""),
                    team1_name=team1,
                    team2_name=team2,
                    winner=match.get("winner", ""),
                    score_t1=_pint(match.get("score_t1", 0)),
                    score_t2=_pint(match.get("score_t2", 0)),
                    result=match.get("result", ""),
                    video_url=match.get("video_url", ""),
                    video_offset=_pint(match.get("video_offset", 0)),
                    duration_sec=_pfloat(match.get("duration_sec", 0)),
                    total_final_blows_t1=_pint(match.get("total_final_blows_t1", 0)),
                    total_final_blows_t2=_pint(match.get("total_final_blows_t2", 0)),
                ))
                ins_matches += 1
                await db.flush()  # match must exist before rounds FK

                for pause in match.get("pauses", []):
                    s = _pint(pause.get("start_sec", 0))
                    e = _pint(pause.get("end_sec", 0))
                    db.add(DBPause(match_id=match_id, start_sec=s, end_sec=e,
                                   duration=_pint(pause.get("duration", e - s))))
                    ins_pauses += 1

                r, ps, ev = await _import_rounds_for_match(db, match_id, match)
                ins_rounds += r
                ins_ps += ps
                ins_ev += ev

        await db.commit()

    print("Import complete.")
    print(f"  Sessions:     {ins_sessions} inserted, {skp_sessions} skipped")
    print(f"  Matches:      {ins_matches} inserted, {skp_matches} skipped")
    print(f"  Pauses:       {ins_pauses} inserted")
    print(f"  Rounds:       {ins_rounds} inserted")
    print(f"  PlayerStats:  {ins_ps} inserted")
    print(f"  Events:       {ins_ev} inserted")


if __name__ == "__main__":
    asyncio.run(import_all())
