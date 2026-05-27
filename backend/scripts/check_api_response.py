"""Simulate GET /api/matches/{id} response and verify Phase 3 structure."""
import asyncio
import sys
import os
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from db.database import AsyncSessionLocal, init_db
from db.models import Match as DBMatch, Round as DBRound
from services.fight_analysis import compute_fights, format_fights_for_api, compute_fight_metrics


MATCH_ID = "1b659144-9bfb-40be-99ae-669d34bd3a8d"


def ev_to_dict(ev):
    d = {
        "event_type": ev.event_type,
        "timestamp": ev.timestamp,
        "game_timestamp": ev.game_timestamp if ev.game_timestamp is not None else 0,
    }
    et = ev.event_type
    if et in ("kill", "ultimate_start"):
        d.update({"player_name": ev.player_name or "", "player_team": ev.player_team or "",
                  "player_hero": ev.player_hero or "", "player_hero_img": ev.player_hero_img or "",
                  "ability": ev.ability or ""})
        if et == "kill":
            d.update({"target_name": ev.target_name or "", "target_team": ev.target_team or "",
                      "target_hero": ev.target_hero or "", "target_hero_img": ev.target_hero_img or ""})
    elif et == "match_start":
        d["desc"] = ev.description or ""
    elif et == "round_start":
        d.update({"round_number": ev.round_number, "attacker": ev.attacker or ""})
    elif et == "round_end":
        d.update({"round_number": ev.round_number, "winner": ev.winner or ""})
    elif et == "match_end":
        d.update({"winner": ev.winner or "", "score_t1": ev.score_t1, "score_t2": ev.score_t2})
    elif et == "objective_captured":
        d["capturing_team"] = ev.capturing_team or ""
    elif et == "objective_updated":
        d.update({"new_index": ev.new_index, "old_index": ev.old_index})
    elif et == "payload_progress":
        d["team"] = ev.team or ""
    return d


async def check():
    await init_db()
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(DBMatch)
            .options(
                selectinload(DBMatch.rounds).selectinload(DBRound.player_stats),
                selectinload(DBMatch.rounds).selectinload(DBRound.events),
                selectinload(DBMatch.pauses),
            )
            .where(DBMatch.id == MATCH_ID)
        )
        m = result.scalars().first()
        if not m:
            print("Match not found")
            return

        t1, t2 = m.team1_name, m.team2_name

        print("=== Match metadata ===")
        print(f"team_1_name: {t1}")
        print(f"team_2_name: {t2}")
        print(f"map_name: {m.map_name}")

        all_events_dicts = []
        rounds_out = []
        for r in (m.rounds or []):
            evs = [ev_to_dict(ev) for ev in (r.events or [])]
            all_events_dicts.extend(evs)
            r_fights_raw = compute_fights(evs, t1, t2)
            r_fights = format_fights_for_api(r_fights_raw, t1, t2)
            rounds_out.append({
                "round_number": r.round_number,
                "events": evs,
                "fights": r_fights,
                "stats_count": len(r.player_stats or []),
            })

        match_fights_raw = compute_fights(all_events_dicts, t1, t2)
        match_fights = format_fights_for_api(match_fights_raw, t1, t2)
        metrics = compute_fight_metrics(match_fights, t1, t2)

        print()
        print("=== Structure ===")
        print(f"rounds: {len(rounds_out)}")
        print(f"match.fights: {len(match_fights)}")
        print(f"fight_metrics: {metrics}")

        print()
        print("=== Round details ===")
        for r in rounds_out:
            rn = r["round_number"]
            print(f"  round {rn}: events={len(r['events'])} stats={r['stats_count']} fights={len(r['fights'])}")

        print()
        print("=== Event type distribution (all rounds) ===")
        counter = Counter(e["event_type"] for e in all_events_dicts)
        for et, cnt in sorted(counter.items(), key=lambda x: -x[1]):
            print(f"  {et}: {cnt}")

        ms_evs = [e for e in all_events_dicts if e.get("event_type") == "match_start"]
        print()
        print(f"=== match_start events: {len(ms_evs)} ===")
        if ms_evs:
            print(f"  keys: {sorted(ms_evs[0].keys())}")
            print(f"  desc present: {'desc' in ms_evs[0]}")
            print(f"  desc value: {repr(ms_evs[0].get('desc'))}")

        print()
        print("=== First match fight (compute_fights internal format) ===")
        if match_fights_raw:
            f = match_fights_raw[0]
            print(f"  keys: {sorted(f.keys())}")
            print(f"  startTime: {f.get('startTime')}")
            print(f"  fixedEndTime: {f.get('fixedEndTime')}")
            print(f"  winner: {f.get('winner')}")
            print(f"  t1Kills: {f.get('t1Kills')}, t2Kills: {f.get('t2Kills')}")
            print(f"  team1_deaths: {f.get('team1_deaths')}, team2_deaths: {f.get('team2_deaths')}")
            print(f"  events in fight: {len(f.get('events', []))}")
            print(f"  duration_sec: {f.get('duration_sec')}")
            print(f"  first_pick_team: {f.get('first_pick_team')}")
            print(f"  first_pick_player: {f.get('first_pick_player')}")
            print(f"  first_pick_hero: {f.get('first_pick_hero')}")
            print(f"  first_pick_event keys: {sorted(f['first_pick_event'].keys()) if f.get('first_pick_event') else 'None'}")

        print()
        print("=== API format fight (match.fights[0]) ===")
        if match_fights:
            f = match_fights[0]
            print(f"  keys: {sorted(f.keys())}")
            print(f"  fight_index: {f.get('fight_index')}")
            print(f"  start_timestamp: {f.get('start_timestamp')}")
            print(f"  end_timestamp: {f.get('end_timestamp')}")
            print(f"  winner: {f.get('winner')}")
            print(f"  kills count: {len(f.get('kills', []))}")

        # Verify all match fights have reasonable values
        print()
        print("=== Fight sanity check ===")
        for i, f in enumerate(match_fights_raw):
            t1k = f.get("t1Kills", 0)
            t2k = f.get("t2Kills", 0)
            t1d = f.get("team1_deaths", 0)
            t2d = f.get("team2_deaths", 0)
            dur = f.get("duration_sec", 0)
            w = f.get("winner", "?")
            issues = []
            if t1k + t2k == 0:
                issues.append("0 kills")
            if dur < 0:
                issues.append(f"negative duration {dur}")
            if t1d > 5 or t2d > 5:
                issues.append(f"deaths>5: t1={t1d} t2={t2d}")
            status = "WARN:" + ",".join(issues) if issues else "ok"
            print(f"  fight {i+1}: t1k={t1k} t2k={t2k} t1d={t1d} t2d={t2d} dur={dur:.1f}s win={w} [{status}]")


if __name__ == "__main__":
    asyncio.run(check())
