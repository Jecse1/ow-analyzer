"""Verify: DB-recomputed fights vs JSON fights."""
import asyncio
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from db.database import AsyncSessionLocal, init_db
from db.models import Match as DBMatch, Round as DBRound, Event as DBEvent
from services.fight_analysis import compute_fights

DATA_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scrim_data.json")


def ev_to_dict(ev):
    return {
        "event_type": ev.event_type,
        "timestamp": ev.timestamp,
        "game_timestamp": ev.game_timestamp or 0,
        "player_team": ev.player_team or "",
        "target_team": ev.target_team or "",
        "target_name": ev.target_name or "",
        "target_hero": ev.target_hero or "",
        "player_name": ev.player_name or "",
        "player_hero": ev.player_hero or "",
        "ability": ev.ability or "",
    }


async def verify():
    await init_db()

    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    json_meta = {}
    for scrim in data:
        for m in scrim.get("matches", []):
            json_meta[m["id"]] = {
                "map": m.get("map_name", "?"),
                "json_fights": len(m.get("fights", [])),
                "json_events": sum(len(r.get("events", [])) for r in m.get("rounds", [])),
            }

    # DB event counts by type
    from sqlalchemy import func as sa_func
    from db.database import AsyncSessionLocal as ASL
    async with ASL() as db:
        from db.models import Event as DBEvent2
        rows = (await db.execute(
            select(DBEvent2.event_type, sa_func.count()).group_by(DBEvent2.event_type)
        )).all()
        print("=== DB event counts by type ===")
        total_ev = 0
        for et, cnt in sorted(rows, key=lambda x: -x[1]):
            print(f"  {et}: {cnt}")
            total_ev += cnt
        print(f"  TOTAL: {total_ev}")
        print()

    async with ASL() as db:
        result = await db.execute(
            select(DBMatch).options(
                selectinload(DBMatch.rounds).selectinload(DBRound.events)
            )
        )
        db_matches = result.scalars().all()

        print("=== Per-match: JSON fight count vs DB-recomputed ===")
        total_ok = total_diff = 0
        for m in db_matches:
            jd = json_meta.get(m.id, {})
            all_evs = [ev_to_dict(ev) for rnd in (m.rounds or []) for ev in (rnd.events or [])]
            db_ev_count = len(all_evs)
            db_fights = compute_fights(all_evs, m.team1_name, m.team2_name)
            json_fc = jd.get("json_fights", 0)
            db_fc = len(db_fights)
            status = "OK  " if json_fc == db_fc else "DIFF"
            if json_fc != db_fc:
                total_diff += 1
            else:
                total_ok += 1
            map_name = jd.get("map", "?")[:20].ljust(20)
            print(f"  [{status}] {map_name} JSON={json_fc:2d} DB={db_fc:2d}  ev_db={db_ev_count} ev_json={jd.get('json_events',0)}")

        print()
        print(f"Summary: {total_ok} matches same count, {total_diff} differ")
        print("(DIFF = algorithm difference between old build_fight_summaries and new computeFights — expected)")


if __name__ == "__main__":
    asyncio.run(verify())
