# 상태 머신 동치성/정합 테스트 (원본 JS 규칙 재현). pytest 없이도 단독 실행 가능.
import random
from banpick import state as sm
from banpick.data import HERO_BY_ID, MAPS


def _heroes_by_role(role, exclude=()):
    return [h["id"] for h in HERO_BY_ID.values() if h["role"] == role and h["id"] not in exclude]


def _first_pickable_map(st):
    for m in MAPS:
        if sm._map_pickable(st, m["id"]):
            return m["id"]
    return None


def test_full_draft():
    rng = random.Random(42)
    st = sm.new_state({"mode": 3, "sets": 3, "teamNameA": "레드", "teamNameB": "블루"}, rng=rng)
    sm.set_ready(st, "A", True)
    sm.set_ready(st, "B", True)
    sm.start(st, rng=rng)
    assert st["started"] and st["phase"] == "MAP_PICK"
    picker = st["mapPicker"]
    other = "B" if picker == "A" else "A"

    # 턴 강제: 비-선택자가 맵 픽 시도 → 거부
    try:
        sm.apply_map_pick(st, other, _first_pickable_map(st), "PICKER")
        assert False, "should reject non-picker"
    except sm.BanpickError as e:
        assert e.code == "NOT_YOUR_TURN"

    map_id = _first_pickable_map(st)
    sm.apply_map_pick(st, picker, map_id, "PICKER")  # 선밴=선택자
    assert st["phase"] == "HERO_BAN" and st["turn"] == picker

    # 밴: 선밴 팀 탱커 밴 → roleLock, 턴 전환
    banner = st["turn"]
    tank = _heroes_by_role("Tank")[0]
    # 상대가 먼저 밴 시도 → 거부
    try:
        sm.apply_ban(st, ("B" if banner == "A" else "A"), tank)
        assert False
    except sm.BanpickError as e:
        assert e.code == "NOT_YOUR_TURN"
    sm.apply_ban(st, banner, tank)
    assert st["roleLock"]["Tank"] == banner and st["turn"] != banner
    # 상대는 같은 역할(탱커) 밴 불가 → 딜러 밴
    banner2 = st["turn"]
    dmg = _heroes_by_role("Damage")[0]
    sm.apply_ban(st, banner2, dmg)
    assert st["phase"] == "HERO_PICK"
    assert len(st["bans"]["A"]) + len(st["bans"]["B"]) == 2

    banned = set(st["bans"]["A"]) | set(st["bans"]["B"])
    # 픽: 두 팀 각자 5슬롯(1v1 동시). 역할 순서 [Tank,Damage,Damage,Support,Support]
    for team in ("A", "B"):
        used = set(banned)
        for role in sm.SLOT_ROLES:
            hid = next(h for h in _heroes_by_role(role, exclude=used))
            used.add(hid)
            sm.apply_pick_toggle(st, team, hid)
        assert all(v is not None for v in st["pickSlots"][team]), st["pickSlots"][team]
        sm.apply_pick_lock(st, team)
    assert st["pickLocked"] and st["awaitingResult"]

    # 세트 결과 → A 승. BO3라 1승은 시리즈 미종료 → 다음 세트 초기화(패자 B가 선택권)
    sm.apply_set_result(st, "A")
    assert len(st["completedSets"]) == 1
    assert st["completedSets"][0]["winner"] == "A"
    assert not st["seriesDone"]
    assert st["mapPicker"] == "B"  # 직전 패자가 다음 선택권
    assert map_id in st["usedMaps"]
    print("test_full_draft OK — bans:", st["completedSets"][0]["bans"],
          "picks sizes:", {k: len(v) for k, v in st["completedSets"][0]["picks"].items()})


def test_series_end():
    rng = random.Random(1)
    st = sm.new_state({"mode": 1, "sets": 3}, rng=rng)  # 밴만 모드(빠른 세트)
    sm.set_ready(st, "A", True); sm.set_ready(st, "B", True)
    sm.start(st, rng=rng)
    # 밴만: BAN_ORDER → HERO_BAN → 2밴 → awaitingResult
    def play_ban_set(winner):
        chooser = st["orderChooser"]
        sm.apply_ban_order(st, chooser, "PICKER")
        b1 = st["turn"]
        sm.apply_ban(st, b1, _heroes_by_role("Tank")[0])
        b2 = st["turn"]
        sm.apply_ban(st, b2, _heroes_by_role("Damage")[0])
        assert st["awaitingResult"]
        sm.apply_set_result(st, winner)
    play_ban_set("A")
    play_ban_set("A")
    assert st["seriesDone"] is True  # 2승(BO3) → 종료
    print("test_series_end OK — winsA reached targetWins")


if __name__ == "__main__":
    test_full_draft()
    test_series_end()
    print("ALL PASS")
