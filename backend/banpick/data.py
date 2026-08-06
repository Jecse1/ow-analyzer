# 자동 생성: 원본 밴픽(BanpickApp.tsx)의 HERO_CSV/MAP_CSV를 그대로 옮김.
# 서버 권위 검증(역할/밴/픽 적법성)용 데이터. 프론트와 동일 소스라 id/name/role/type 일치.

HERO_CSV = """
#id,name,role
// Tank
 dva,디바,Tank
 doomfist,둠피스트,Tank
 ramattra,라마트라,Tank
 reinhardt,라인하르트,Tank
 wrecking-ball,레킹볼,Tank
 roadhog,로드호그,Tank
 mauga,마우가,Tank
 sigma,시그마,Tank
 orisa,오리사,Tank
 winston,윈스턴,Tank
 zarya,자리야,Tank
 junker-queen,정커퀸,Tank
 hazard,해저드,Tank
 domina,도미나,Tank
// Damage
 genji,겐지,Damage
 reaper,리퍼,Damage
 mei,메이,Damage
 bastion,바스티온,Damage
 venture,벤처,Damage
 sojourn,소전,Damage
 soldier-76,솔저 76,Damage
 sombra,솜브라,Damage
 symmetra,시메트라,Damage
 ashe,애쉬,Damage
 echo,에코,Damage
 widowmaker,위도우메이커,Damage
 junkrat,정크랫,Damage
 cassidy,캐서디,Damage
 torbjorn,토르비욘,Damage
 tracer,트레이서,Damage
 pharah,파라,Damage
 freja,프레야,Damage
 hanzo,한조,Damage
 vendetta,벤데타,Damage
 anran,안란,Damage
 emre,엠레,Damage
 shion,시온,Damage
// Support
 lifeweaver,라이프위버,Support
 lucio,루시우,Support
 mercy,메르시,Support
 moira,모이라,Support
 baptiste,바티스트,Support
 brigitte,브리기테,Support
 ana,아나,Support
 wuyang,우양,Support
 illari,일리아리,Support
 zenyatta,젠야타,Support
 juno,주노,Support
 kiriko,키리코,Support
 mizuki,미즈키,Support
 jetpack-cat,제트팩 캣,Support
 sierra,시에라,Support
"""

MAP_CSV = """
#id,name,type
 antarctic,남극반도,Control
 nepal,네팔,Control
 lijiang,리장 타워,Control
 busan,부산,Control
 samoa,사모아,Control
 oasis,오아시스,Control
 ilios,일리오스,Control
 route66,66번 국도,Escort
 gibraltar,감시기지 지브롤터,Escort
 dorado,도라도,Escort
 rialto,리알토,Escort
 shambali,샴발리 수도원,Escort
 circuit,서킷 로얄,Escort
 junkertown,쓰레기촌,Escort
 havana,하바나,Escort
 numbani,눔바니,Hybrid
 midtown,미드타운,Hybrid
 blizzardworld,블리자드 월드,Hybrid
 eichenwalde,아이헨발데,Hybrid
 kingsrow,왕의 길,Hybrid
 paraiso,파라이수,Hybrid
 hollywood,할리우드,Hybrid
 neoncross,네온 교차로,Hybrid
 newqueenstreet,뉴 퀸 스트리트,Push
 esperanca,이스페란사,Push
 colosseo,콜로세오,Push
 lunasafi,루나사피,Push
 newjunkcity,뉴 정크 시티,Flashpoint
 suravasa,수라바사,Flashpoint
 atliss,아틀리스,Flashpoint
"""


def _parse(csv, keys):
    rows = []
    for line in csv.strip().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("//"):
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < len(keys):
            continue
        rows.append(dict(zip(keys, parts)))
    return rows

HEROES = _parse(HERO_CSV, ["id", "name", "role"])   # role: Tank|Damage|Support
MAPS = _parse(MAP_CSV, ["id", "name", "type"])       # type: Control|Escort|Hybrid|Push|Flashpoint

HERO_BY_ID = {h["id"]: h for h in HEROES}
MAP_BY_ID = {m["id"]: m for m in MAPS}

def hero_role(hero_id):
    h = HERO_BY_ID.get(hero_id)
    return h["role"] if h else None

def map_exists(map_id):
    return map_id in MAP_BY_ID
