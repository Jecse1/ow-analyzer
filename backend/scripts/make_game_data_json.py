# -*- coding: utf-8 -*-
"""
make_game_data_json.py — 현재 코드 상수에서 game_data/heroes.json, maps.json 을 기계 추출.

STEP 1-2. 수기 입력 금지: 모든 값은 main.py / log_normalizer.py / banpick/data.py 의
현재 값에서 추출한다. 승인된 델타 2건만 이 단계에서 반영:
  (A) banpick 에 dmon(디몬,Tank) 1건 추가  → D.Mon 엔트리 banpick 필드
  (E) KOREAN_HERO_MAP 에 프레야/벤데타/우양 3키 추가 → 각 엔트리 koreanHeroMap 에 반영
      (값 = log_normalizer _HERO_EN2KO_EXPLICIT 의 역방향)

skills 는 프론트 HERO_SKILL_MAP(정본: MatchStats.jsx, 다수값)에서 추출(프론트 무수정, 읽기만).
image 는 프론트 리졸버 getHeroImageSrc 의 실제 basename 규칙을 그대로 재현(값 무변경).

생성 후 game_data 로더로 재구성해 dumps/before.json 과 대조(자기검증). 불일치 시 예외.
"""
from __future__ import annotations
import os
import re
import sys
import json

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
_FRONT_SRC = os.path.join(os.path.dirname(_BACKEND), "frontend", "src")
# 소스(main/log_normalizer/banpick)는 "리팩토링 전 리터럴"에서 읽어야 오염이 없다.
# (리팩토링 후 main 은 game_data 파생이라 self-import 순환 오염이 발생하고, before.json 은
#  sort_keys 덤프라 KHM 순서가 소실된다.) GAMEDATA_SRC_BACKEND 로 before 워크트리 backend 지정.
_SRC_BACKEND = os.environ.get("GAMEDATA_SRC_BACKEND", _BACKEND)
if _BACKEND not in sys.path:
    sys.path.append(_BACKEND)           # game_data(현재) 로더용 — 뒤
if _SRC_BACKEND not in sys.path:
    sys.path.insert(0, _SRC_BACKEND)    # main/log_normalizer/banpick 소스 — 앞(우선)

import main                      # noqa: E402
import log_normalizer           # noqa: E402
from banpick import data as bp  # noqa: E402

# ── 델타 ─────────────────────────────────────────────────────────────────────
# (A) banpick 디몬 추가 — 승인된 유일한 백엔드 델타.
DELTA_A_BANPICK = {"id": "dmon", "name": "디몬", "role": "Tank"}
# (E 롤백) 프레야/벤데타/우양은 정본 영웅이지만 KOREAN_HERO_MAP 에는 넣지 않는다.
#   근거: KOREAN_HERO_MAP 은 parse 의 이미지 파일명 소스(main.py KOREAN_HERO_MAP.get(hero,hero)).
#   키를 추가하면 한국어 로그의 이 영웅 이미지가 존재하는 한글파일(벤데타.png)→없는 영문파일
#   (Vendetta.png)로 바뀌어 깨진다. 영어 로그 정규화는 log_normalizer._HERO_EN2KO_EXPLICIT
#   가 이미 담당하므로 KHM 추가는 불필요. 아래는 "로스터 포함용"일 뿐(koreanHeroMap 은 빔).
EXTRA_ROSTER = {"프레야": "Freja", "벤데타": "Vendetta", "우양": "Wuyang"}


# ── 프론트 리졸버 재현(image) ────────────────────────────────────────────────
_EXACT_FILE_NAMES = {
    "D.Va": "dva", "디바": "dva", "D.Mon": "디몬", "디몬": "디몬",
    "솔저: 76": "soldier76", "솔저 76": "soldier76", "Soldier: 76": "soldier76",
    "제트팩 캣": "jetpackcat", "Jetpack Cat": "jetpackcat", "시에라": "sierra",
}
_HERO_ALIAS_MAP = {
    "솔저: 76": "솔저76", "솔저 : 76": "솔저76", "D.Va": "디바", "D.Mon": "디몬",
    "Widowmaker": "위도우메이커", "Tracer": "트레이서", "Sojourn": "소전", "Sierra": "시에라",
}


def _display_hero_name(raw: str) -> str:
    c = (raw or "").strip()
    return _HERO_ALIAS_MAP.get(c, c)


def image_basename(hero_name: str) -> str:
    dn = _display_hero_name(hero_name)
    fn = _EXACT_FILE_NAMES.get(hero_name) or _EXACT_FILE_NAMES.get(dn)
    if not fn:
        fn = re.sub(r"[\s.:]", "", dn)
    return fn


# ── skills 추출(프론트 MatchStats.jsx / 정본) ────────────────────────────────
def extract_skill_map(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"const HERO_SKILL_MAP\s*=\s*\{", text)
    if not m:
        raise RuntimeError(f"HERO_SKILL_MAP not found in {path}")
    # 블록 끝(최상위 '};') 찾기
    start = m.end()
    depth = 1
    i = start
    while i < len(text) and depth > 0:
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    block = text[start:i - 1]
    out: dict = {}
    # 엔트리: '영웅': { '슬롯':'값', ... }
    for em in re.finditer(r"'([^']+)'\s*:\s*\{([^}]*)\}", block):
        hero = em.group(1)
        body = em.group(2)
        slots = {}
        for sm in re.finditer(r"'([^']+)'\s*:\s*'([^']*)'", body):
            slots[sm.group(1)] = sm.group(2)
        out[hero] = slots
    return out


SKILL_MAP = extract_skill_map(os.path.join(_FRONT_SRC, "MatchStats.jsx"))


# ── 영웅 로스터 & 리졸버 ─────────────────────────────────────────────────────
KHM = dict(main.KOREAN_HERO_MAP)                 # ko -> en (source order)
EXPLICIT = dict(log_normalizer._HERO_EN2KO_EXPLICIT)  # en -> ko
ROLE = dict(main.HERO_ROLE_DATA)                 # form -> role

# 정본 영어 로스터: KHM 값(고유) + 델타E 영웅(Freja/Vendetta/Wuyang)
roster_en: list = []
seen = set()
for _ko, _en in KHM.items():
    if _en not in seen:
        seen.add(_en)
        roster_en.append(_en)
for _ko, _en in EXTRA_ROSTER.items():
    if _en not in seen:
        seen.add(_en)
        roster_en.append(_en)

# form(영/한) -> 정본 영어
_EN_ALIAS = {"Lúcio": "Lucio", "Torbjörn": "Torbjorn"}   # 영어 이형
_KO2EN = dict(KHM)
for _en, _ko in EXPLICIT.items():
    _KO2EN.setdefault(_ko, _en)
for _ko, _en in EXTRA_ROSTER.items():
    _KO2EN.setdefault(_ko, _en)
_KO_SPECIAL = {"솔저76": "Soldier: 76"}   # 코드상 유일 이형(솔저 무공백)


def resolve_en(form: str):
    if form in seen:
        return form
    if form in _EN_ALIAS:
        return _EN_ALIAS[form]
    if form in _KO2EN:
        return _KO2EN[form]
    if form in _KO_SPECIAL:
        return _KO_SPECIAL[form]
    return None


# 정본 한국어(logName) 결정
def canonical_ko(en: str):
    # D.Va/D.Mon 등 로그가 영문으로 기록(explicit 항등) → 영문이 logName
    if en in EXPLICIT and EXPLICIT[en] == en:
        return en
    # KHM 에 한국어 키가 있으면 첫 키(소스 순서)
    for k, v in KHM.items():
        if v == en:
            return k
    # 로스터 전용 영웅(프레야/벤데타/우양) — KHM 미수록, ko 는 explicit 역방향과 동일
    for k, v in EXTRA_ROSTER.items():
        if v == en:
            return k
    # explicit 역방향(예외)
    if en in EXPLICIT:
        return EXPLICIT[en]
    return en


# banpick 이름 -> 정본 영어
bp_by_en: dict = {}
for h in bp.HEROES:
    en = resolve_en(h["name"])
    if en is None:
        raise RuntimeError(f"banpick hero name unresolved: {h}")
    bp_by_en[en] = dict(h)
# 델타 A: dmon → D.Mon
bp_by_en["D.Mon"] = dict(DELTA_A_BANPICK)

# roleForms 를 영웅별로 귀속(코드상 HERO_ROLE_DATA 키 전량)
forms_by_en: dict = {en: [] for en in roster_en}
role_by_en: dict = {}
for form, r in ROLE.items():
    en = resolve_en(form)
    if en is None:
        raise RuntimeError(f"role form unresolved: {form!r}")
    forms_by_en.setdefault(en, []).append(form)
    role_by_en[en] = r   # 한 영웅의 모든 form 은 동일 role

# KHM 키를 영웅별로 귀속(소스 순서 보존)
khm_by_en: dict = {en: {} for en in roster_en}
for k, v in KHM.items():
    khm_by_en.setdefault(v, {})[k] = v
# (E 롤백) 프레야/벤데타/우양 은 koreanHeroMap 을 비워둔다 → 로더가 KHM 파생에서 제외.
# 원본 KOREAN_HERO_MAP 에 없던 영웅이므로 khm_by_en[en] 은 이미 {} 이다.

# aliases 후보: KHM 키, roleForms, banpick 이름, 영어 이형 — logName/en/ko 제외(코드 파생만)
en_alias_forms_by_en: dict = {en: set() for en in roster_en}
for src_form, tgt_en in _EN_ALIAS.items():
    en_alias_forms_by_en.setdefault(tgt_en, set()).add(src_form)


def skill_for(logname: str, ko: str, aliases: list):
    for key in [logname, ko] + list(aliases):
        if key in SKILL_MAP:
            return SKILL_MAP[key]
    return None


# ── 영웅 엔트리 생성 ─────────────────────────────────────────────────────────
heroes_entries = []
for en in roster_en:
    logname = canonical_ko(en)
    ko = logname
    role = role_by_en.get(en, "other")
    khm = dict(khm_by_en.get(en, {}))
    forms = list(forms_by_en.get(en, []))
    banp = bp_by_en.get(en)
    # aliases(코드 파생): 모든 관련 표기 - {logname, en, ko}
    alias_set = set()
    alias_set.update(khm.keys())
    alias_set.update(forms)
    if banp:
        alias_set.add(banp["name"])
    alias_set.update(en_alias_forms_by_en.get(en, set()))
    alias_set.discard(logname)
    alias_set.discard(en)
    alias_set.discard(ko)
    aliases = sorted(alias_set)
    # id: banpick id(하이픈 제거) 우선, 없으면 영어 슬러그
    if banp:
        hid = banp["id"].replace("-", "")
    else:
        hid = re.sub(r"[^a-z0-9]", "", en.lower())
    entry = {
        "id": hid,
        "logName": logname,
        "en": en,
        "ko": ko,
        "role": role,
        "image": image_basename(logname),
        "aliases": aliases,
        "skills": skill_for(logname, ko, aliases),
        "koreanHeroMap": khm,
        "roleForms": forms,
        "banpick": banp,
    }
    heroes_entries.append(entry)

heroes_doc = {
    "_meta": {
        "note": "SSOT. 정본 키=로그 표기. 승인 델타: (A)banpick dmon, (E)KHM 프레야/벤데타/우양.",
        "generated_by": "scripts/make_game_data_json.py",
    },
    "heroes": heroes_entries,
    "heroEn2koExplicit": dict(EXPLICIT),
}


# ── 맵 엔트리 생성 ───────────────────────────────────────────────────────────
MTD = dict(main.MAP_TYPE_DATA)                 # name -> maptype (source order)
CKW = list(main.CONTROL_MAP_KEYWORDS)
MEN2KO = dict(log_normalizer.MAP_EN2KO)        # en -> ko
MODE = dict(log_normalizer.MODE_EN2KO)

_TYPE_KO2ID = {"쟁탈": "control", "화물": "escort", "혼합": "hybrid",
               "밀기": "push", "플래시포인트": "flashpoint", "격돌": "clash"}
_TYPE_EN2ID = {"Control": "control", "Escort": "escort", "Hybrid": "hybrid",
               "Push": "push", "Flashpoint": "flashpoint", "Clash": "clash"}
_MODE_KO_BY_ID = {}
for _en, _ko in MODE.items():
    _MODE_KO_BY_ID[_TYPE_EN2ID[_en]] = _ko


def _is_ascii_word(s: str) -> bool:
    return any("a" <= c.lower() <= "z" for c in s)


def _type_id(val: str) -> str:
    return _TYPE_KO2ID.get(val) or _TYPE_EN2ID.get(val) or "unknown"


# 인접 그룹핑(소스 순서) + 값 불일치 stray 분리
groups = []          # 각 그룹: {"forms": {key:val}, "en": en|None, "typeid": ...}
buf = {}             # 대기 중 한국어 {key:val}
for key, val in MTD.items():
    if _is_ascii_word(key):
        # 영어 앵커 → 현재 buf 중 같은 타입만 이 맵으로, 다른 타입은 각자 독립 엔트리
        tid = _type_id(val)
        same, stray = {}, []
        for k, v in buf.items():
            if _type_id(v) == tid:
                same[k] = v
            else:
                stray.append((k, v))
        for k, v in stray:
            groups.append({"forms": {k: v}, "en": None, "typeid": _type_id(v)})
        same[key] = val
        groups.append({"forms": same, "en": key, "typeid": tid})
        buf = {}
    else:
        buf[key] = val
# 잔여 한국어(영어 앵커 없이 끝) → 각자 독립 엔트리
for k, v in buf.items():
    groups.append({"forms": {k: v}, "en": None, "typeid": _type_id(v)})

# 후보정: MAP_EN2KO(en->ko) 의 ko 는 반드시 해당 en 그룹 소속이어야 함
en_to_group = {g["en"]: g for g in groups if g["en"]}
for en, ko in MEN2KO.items():
    tgt = en_to_group.get(en)
    if tgt is None or ko in tgt["forms"]:
        continue
    # ko 를 현재 소속 그룹에서 제거해 en 그룹으로 이동(값 유지)
    for g in groups:
        if g is not tgt and ko in g["forms"]:
            val = g["forms"].pop(ko)
            tgt["forms"][ko] = val
            break
# 빈 그룹 제거
groups = [g for g in groups if g["forms"]]

# 컨트롤 키워드 귀속: 각 키워드가 부분문자열로 매칭되는 (control 타입) 그룹에 배정
ckw_assign = {id(g): [] for g in groups}
for kw in CKW:
    hit = None
    for g in groups:
        if g["typeid"] != "control":
            continue
        if any(kw in k for k in g["forms"].keys()):
            hit = g
            break
    if hit is None:
        raise RuntimeError(f"control keyword unassigned: {kw!r}")
    ckw_assign[id(hit)].append(kw)

# banpick 맵 귀속: 정규화(공백/콜론 제거) 일치
def _norm(s: str) -> str:
    return re.sub(r"[\s:·]", "", s)


bp_maps_by_group = {id(g): None for g in groups}
group_norm_keys = {id(g): {_norm(k) for k in g["forms"].keys()} for g in groups}
for m in bp.MAPS:
    nm = _norm(m["name"])
    placed = False
    for g in groups:
        if nm in group_norm_keys[id(g)]:
            bp_maps_by_group[id(g)] = dict(m)
            placed = True
            break
    if not placed:
        # 매칭 실패 → 독립 엔트리로 추가(진단용)
        ng = {"forms": {}, "en": None, "typeid": _TYPE_EN2ID.get(m["type"], "unknown")}
        groups.append(ng)
        ckw_assign[id(ng)] = []
        bp_maps_by_group[id(ng)] = dict(m)
        group_norm_keys[id(ng)] = set()


def canonical_map_ko(g) -> str:
    if g["en"] and g["en"] in MEN2KO:
        return MEN2KO[g["en"]]
    # 첫 한국어 키(소스 순서 유지: forms 삽입 순서)
    for k in g["forms"].keys():
        if not _is_ascii_word(k):
            return k
    return next(iter(g["forms"].keys()))


maps_entries = []
for g in groups:
    en = g["en"]
    ko = canonical_map_ko(g)
    tid = g["typeid"]
    ko_keys = [k for k in g["forms"].keys() if not _is_ascii_word(k)]
    aliases = sorted(set(ko_keys) - {ko})
    banp = bp_maps_by_group.get(id(g))
    if banp:
        mid = banp["id"]
    elif en:
        mid = re.sub(r"[^a-z0-9]", "", en.lower())
    else:
        mid = re.sub(r"[^a-z0-9가-힣]", "", ko.lower())
    entry = {
        "id": mid,
        "ko": ko,
        "en": en,
        "type": tid,
        "typeLabelKo": _TYPE_KO2ID and next((kko for kko, kid in _TYPE_KO2ID.items() if kid == tid), None),
        "modeLabelKo": _MODE_KO_BY_ID.get(tid),
        "aliases": aliases,
        "controlKeyword": bool(ckw_assign.get(id(g))),
        "mapTypeData": dict(g["forms"]),
        "controlKeywords": list(ckw_assign.get(id(g), [])),
        "en2ko": ({en: MEN2KO[en]} if (en and en in MEN2KO) else {}),
        "banpick": banp,
    }
    maps_entries.append(entry)

maps_doc = {
    "_meta": {
        "note": "SSOT. 맵 타입(화물)과 모드(호위) 별도. 정본 ko=로그(MAP_EN2KO) 우선.",
        "generated_by": "scripts/make_game_data_json.py",
    },
    "maps": maps_entries,
    "modeEn2ko": dict(MODE),
}

# ── 파일 기록 ────────────────────────────────────────────────────────────────
_GD = os.path.join(_BACKEND, "game_data")
os.makedirs(_GD, exist_ok=True)
for fname, doc in [("heroes.json", heroes_doc), ("maps.json", maps_doc)]:
    with open(os.path.join(_GD, fname), "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"[gen] wrote game_data/{fname}", file=sys.stderr)

print(f"[gen] heroes={len(heroes_entries)} maps={len(maps_entries)}", file=sys.stderr)

# ── 자기검증: 로더로 재구성 → before.json 과 대조(델타 반영) ──────────────────
before = json.load(open(os.path.join(_BACKEND, "dumps", "before.json"), encoding="utf-8"))

# 로더 import(방금 쓴 JSON 을 읽음)
import importlib
import game_data as gd
importlib.reload(gd)

# 로더가 제공하는 파생값으로 각 구조 재구성
def _reverse_khm(khm):
    r = {}
    for ko, en in khm.items():
        r.setdefault(en, ko)
    return r

recon = {}
recon["main.KOREAN_HERO_MAP"] = dict(gd.KOREAN_HERO_MAP)
recon["main.TANKS"] = sorted(gd.TANKS, key=str)
recon["main.SUPPORTS"] = sorted(gd.SUPPORTS, key=str)
recon["main._FIGHTLAB_TANKS"] = sorted(gd.FIGHTLAB_TANKS, key=str)
recon["main._FIGHTLAB_SUPPORTS"] = sorted(gd.FIGHTLAB_SUPPORTS, key=str)
recon["main._FIGHTLAB_DAMAGE"] = sorted(gd.FIGHTLAB_DAMAGE, key=str)
# HERO_ROLE_DATA: main.py 와 동일 로직(loop)
hrd = {}
for _h in gd.FIGHTLAB_TANKS: hrd[_h] = "tank"
for _h in gd.FIGHTLAB_SUPPORTS: hrd[_h] = "support"
for _h in gd.FIGHTLAB_DAMAGE: hrd[_h] = "damage"
recon["main.HERO_ROLE_DATA"] = hrd
recon["main.MAP_TYPE_DATA"] = dict(gd.MAP_TYPE_DATA)
recon["main.CONTROL_MAP_KEYWORDS"] = sorted(gd.CONTROL_MAP_KEYWORDS, key=str)
# log_normalizer HERO_EN2KO(final) = reverse(KHM) + explicit
he = _reverse_khm(gd.KOREAN_HERO_MAP)
he.update(gd.HERO_EN2KO_EXPLICIT)
recon["log_normalizer.HERO_EN2KO"] = he
recon["log_normalizer._HERO_EN2KO_EXPLICIT"] = dict(gd.HERO_EN2KO_EXPLICIT)
recon["log_normalizer.MAP_EN2KO"] = dict(gd.MAP_EN2KO)
recon["log_normalizer.MODE_EN2KO"] = dict(gd.MODE_EN2KO)
recon["banpick.HEROES"] = sorted([dict(h) for h in gd.BANPICK_HEROES],
                                 key=lambda d: json.dumps(d, ensure_ascii=False, sort_keys=True))
recon["banpick.MAPS"] = sorted([dict(m) for m in gd.BANPICK_MAPS],
                               key=lambda d: json.dumps(d, ensure_ascii=False, sort_keys=True))

# 기대 델타 적용 후 대조
expected = json.loads(json.dumps(before, ensure_ascii=False))  # deep copy
# (E 롤백) KOREAN_HERO_MAP 무변경 — 승인 델타는 (A) banpick dmon 1건뿐.
expected["banpick.HEROES"] = sorted(
    expected["banpick.HEROES"] + [DELTA_A_BANPICK],
    key=lambda d: json.dumps(d, ensure_ascii=False, sort_keys=True))  # (A)

def _canon(v):
    return json.dumps(v, ensure_ascii=False, sort_keys=True)

problems = []
for k in sorted(set(recon) | set(expected)):
    if k not in recon:
        problems.append(f"MISSING in recon: {k}"); continue
    if k not in expected:
        problems.append(f"EXTRA in recon: {k}"); continue
    if _canon(recon[k]) != _canon(expected[k]):
        # 상세 diff
        rv, ev = recon[k], expected[k]
        if isinstance(rv, dict) and isinstance(ev, dict):
            only_r = {x: rv[x] for x in rv if x not in ev or ev[x] != rv[x]}
            only_e = {x: ev[x] for x in ev if x not in rv or rv[x] != ev[x]}
            problems.append(f"DIFF {k}: recon_only={only_r} expected_only={only_e}")
        else:
            R, E = set(map(str, rv)), set(map(str, ev))
            problems.append(f"DIFF {k}: recon-exp={sorted(R-E)} exp-recon={sorted(E-R)}")

if problems:
    print("\n=== SELF-VERIFY FAILED ===", file=sys.stderr)
    for p in problems:
        print("  " + p, file=sys.stderr)
    raise SystemExit(2)

print("[verify] SELF-VERIFY OK — 재구성값이 before + 델타(A,E) 와 정확히 일치", file=sys.stderr)
