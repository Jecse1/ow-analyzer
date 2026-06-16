# -*- coding: utf-8 -*-
"""FLC 주간 스크림 보고 슬라이드(16:9, 1920x1080) 생성.
지표는 모두 hero_time_played 기반 10분당 정규화. 데이터에 없는 지표(한타승률/궁승률 등)는 만들지 않음."""
import sqlite3, os, math, sys
sys.path.insert(0, '.')
from services.fight_analysis import compute_fights
from collections import defaultdict, Counter
import matplotlib
matplotlib.use('Agg')
from matplotlib import font_manager as fm
import matplotlib.pyplot as plt

# ---- Korean font ----
FONT = r'C:\Windows\Fonts\malgun.ttf'
fm.fontManager.addfont(FONT)
plt.rcParams['font.family'] = fm.FontProperties(fname=FONT).get_name()
plt.rcParams['axes.unicode_minus'] = False

# ---- palette ----
BLUE = '#2b6cb0'      # FLC
BLUE_L = '#7aa9dd'
RED = '#c0392b'       # opponent
GRAY = '#8a8f98'
WIN = '#2b6cb0'
LOSS = '#c0392b'
INK = '#1a202c'
ROLE_C = {'T':'#6b46c1','D':'#c0392b','S':'#2f9e44'}

OUTDIR = os.path.join('reports', 'weekly_20260602')
os.makedirs(OUTDIR, exist_ok=True)
US = 'FLC'
ORD = ['ZETA','T1','VR','JDG','ONG']

c = sqlite3.connect('data/scrim.db'); cur = c.cursor()

# ===== match map =====
cur.execute('''SELECT m.id,m.team1_name,m.team2_name,m.winner,m.map_name FROM matches m JOIN sessions s ON m.session_id=s.id
  WHERE m.deleted_at IS NULL AND s.deleted_at IS NULL''')
M = {}
for mid,t1,t2,w,mp in cur.fetchall():
    opp = t2 if t1==US else t1
    res = 'W' if w==US else ('D' if w=='Draw' else 'L')
    M[mid] = dict(opp=opp, res=res, t1=t1, t2=t2, map=mp)

# ===== helper: per-10 aggregation =====
def fetch_stats():
    cur.execute('''SELECT match_id,team_name,player_name,hero_name,final_blows,deaths,eliminations,
      hero_damage_dealt,healing_dealt,damage_taken,damage_blocked,ultimates_earned,hero_time_played
      FROM player_stats''')
    return cur.fetchall()
ROWS = fetch_stats()

# ===== round win (kill-advantage proxy) per round_id =====
cur.execute('SELECT round_id,player_team FROM events WHERE event_type="kill"')
RK = defaultdict(lambda:[0,0])   # round_id -> [flc_kills, opp_kills]
for rid,pt in cur.fetchall():
    if rid is None: continue
    if pt==US: RK[rid][0]+=1
    elif pt: RK[rid][1]+=1
def someone_hero_winrate():
    cur.execute('SELECT round_id,hero_name,hero_time_played FROM player_stats WHERE team_name="FLC" AND player_name="Someone"')
    hr = defaultdict(list)
    for rid,h,tp in cur.fetchall():
        if tp and tp>30: hr[h].append(rid)
    out={}
    for h in ['시그마','라마트라','라인하르트','D.Va']:
        w=t=0
        for rid in hr.get(h,[]):
            f,o=RK.get(rid,[0,0])
            if f==o: continue
            t+=1; w+=(f>o)
        out[h]=(w,t,(w/t*100 if t else 0))
    return out
SOMEONE_WR = someone_hero_winrate()

# ===== ultimate usage -> fight win rate (compute_fights) =====
def ult_winrates():
    flc_ult=[0,0]; no_ult=[0,0]; firstult=[0,0]
    for mid,info in M.items():
        cur.execute('''SELECT event_type,timestamp,game_timestamp,player_name,player_team,player_hero,
          target_name,target_team,target_hero,ability FROM events WHERE match_id=?''',(mid,))
        evs=[dict(zip(['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability'],r)) for r in cur.fetchall()]
        if not evs: continue
        for f in compute_fights(evs, info['t1'], info['t2']):
            w=f['winner']
            if w==US: res=1
            elif w==info['opp']: res=0
            else: continue
            ults=[e for e in f['events'] if e['event_type']=='ultimate_start']
            if any(e['player_team']==US for e in ults): flc_ult[0]+=res; flc_ult[1]+=1
            else: no_ult[0]+=res; no_ult[1]+=1
            if ults and ults[0]['player_team']==US: firstult[0]+=res; firstult[1]+=1
    return flc_ult,no_ult,firstult
ULT_USE, ULT_NO, ULT_FIRST = ult_winrates()

# ===== 한타(전투) 승률 by 상대 (compute_fights, Draw 제외) =====
def fight_winrate_by_opp():
    rec = defaultdict(lambda:[0,0,0])  # opp -> [win, draw, total_decisive]; total counts W+L only
    overall=[0,0]
    for mid,info in M.items():
        cur.execute('''SELECT event_type,timestamp,game_timestamp,player_name,player_team,player_hero,
          target_name,target_team,target_hero,ability FROM events WHERE match_id=?''',(mid,))
        cols=['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability']
        evs=[dict(zip(cols,r)) for r in cur.fetchall()]
        if not evs: continue
        for f in compute_fights(evs, info['t1'], info['t2']):
            w=f['winner']
            if w==US:
                rec[info['opp']][0]+=1; rec[info['opp']][2]+=1; overall[0]+=1; overall[1]+=1
            elif w==info['opp']:
                rec[info['opp']][2]+=1; overall[1]+=1
            else:
                rec[info['opp']][1]+=1
    return rec, overall
FIGHT_WR, FIGHT_OVERALL = fight_winrate_by_opp()

# ===== 첫 킬(퍼블) 한타 분해 by 상대 =====
def fb_fight_decomp():
    cols=['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability']
    d=defaultdict(lambda: dict(flcfb=[0,0], oppfb=[0,0]))  # opp -> win/total when FLC/opp got first kill
    fp_decides=[0,0]
    for mid,info in M.items():
        cur.execute(f'SELECT {",".join(cols)} FROM events WHERE match_id=?',(mid,))
        evs=[dict(zip(cols,r)) for r in cur.fetchall()]
        if not evs: continue
        opp=info['opp']
        for f in compute_fights(evs, info['t1'], info['t2']):
            w=f['winner']
            if w not in (US,opp): continue
            flcwin = 1 if w==US else 0
            kills=[e for e in f['events'] if e['event_type']=='kill']
            if not kills: continue
            ft=kills[0]['player_team']
            if ft==US:
                d[opp]['flcfb'][0]+=flcwin; d[opp]['flcfb'][1]+=1
                fp_decides[0]+=flcwin; fp_decides[1]+=1   # first-pick team = FLC, did they win
            elif ft==opp:
                d[opp]['oppfb'][0]+=flcwin; d[opp]['oppfb'][1]+=1
                fp_decides[0]+=(1-flcwin); fp_decides[1]+=1  # first-pick team = opp, did they win
    return d, fp_decides
FB_FIGHT, FP_DECIDES = fb_fight_decomp()

# ===== 라운드 선킬 전환 by 상대 (RK proxy) =====
def round_firstkill():
    cur.execute('SELECT round_id,player_team,game_timestamp,match_id FROM events WHERE event_type="kill" ORDER BY round_id,game_timestamp')
    rk=defaultdict(list)
    for rid,pt,ts,mid in cur.fetchall():
        if rid is None: continue
        rk[rid].append((pt,mid))
    d=defaultdict(lambda: dict(fk=[0,0], conv=0))  # opp -> firstkill[got,decisive_total], conv(win count when got fk)
    for rid,ks in rk.items():
        if not ks: continue
        mid=ks[0][1]
        if mid not in M: continue
        o=M[mid]['opp']
        fl=sum(1 for pt,_ in ks if pt==US); op=sum(1 for pt,_ in ks if pt and pt!=US)
        if fl==op: continue
        d[o]['fk'][1]+=1
        if ks[0][0]==US:
            d[o]['fk'][0]+=1
            if fl>op: d[o]['conv']+=1
    return d
ROUND_FK = round_firstkill()

# ===== FLC 전체 탱 영웅 비교 =====
TANKS={'D.Va','마우가','시그마','라마트라','라인하르트','레킹볼','윈스턴','오리사','자리야','해저드','둠피스트'}
def tank_compare():
    cur.execute('''SELECT hero_name,round_id,final_blows,deaths,hero_damage_dealt,damage_blocked,hero_time_played
      FROM player_stats WHERE team_name="FLC"''')
    agg=defaultdict(lambda: defaultdict(float)); rnds=defaultdict(set)
    for h,rid,fb,de,hd,db,tp in cur.fetchall():
        if h not in TANKS or not tp or tp<30: continue
        a=agg[h]; a['t']+=tp; a['fb']+=fb or 0; a['de']+=de or 0; a['hd']+=hd or 0; a['db']+=db or 0
        rnds[h].add(rid)
    out={}
    for h in agg:
        a=agg[h]; t=a['t']; f=600/t
        w=tt=0
        for rid in rnds[h]:
            fl,op=RK.get(rid,[0,0])
            if fl==op: continue
            tt+=1; w+=(fl>op)
        out[h]=dict(R=len(rnds[h]), wr=(w/tt*100 if tt else 0), fb=a['fb']*f, de=a['de']*f,
                    hd=a['hd']*f, db=a['db']*f)
    return out
TANK = tank_compare()

# ===== 쟁탈/플래시포인트 첫 싸움 =====
CONTROL={'일리오스','오아시스','남극반도'}; FLASH={'수라바사','뉴정크시티'}
def first_fight_stats():
    fcols=['event_type','timestamp','game_timestamp','player_name','player_team','player_hero','target_name','target_team','target_hero','ability','round_id']
    cur.execute("SELECT DISTINCT round_id,match_id FROM events WHERE round_id IS NOT NULL")
    r2m={r[0]:r[1] for r in cur.fetchall()}
    rev=defaultdict(list)
    cur.execute(f"SELECT {','.join(fcols)} FROM events WHERE event_type IN ('kill','ultimate_start')")
    for r in cur.fetchall(): rev[r[-1]].append(dict(zip(fcols,r)))
    RH={'D.Va':'탱','마우가':'탱','시그마':'탱','라마트라':'탱','라인하르트':'탱','레킹볼':'탱','윈스턴':'탱','오리사':'탱','자리야':'탱','해저드':'탱','둠피스트':'탱',
        '루시우':'힐','주노':'힐','키리코':'힐','아나':'힐','모이라':'힐','브리기테':'힐','바티스트':'힐','일리아리':'힐','미즈키':'힐','제트팩 캣':'힐','우양':'힐','메르시':'힐','젠야타':'힐'}
    rl=lambda h: RH.get(h,'딜')
    rec={'control':[0,0,0],'flash':[0,0,0]}     # [W,D,L]
    fk={'won':[0,0],'lost':[0,0]}               # [flc_first_kill, total]
    ult={'won':[0,0],'lost':[0,0]}              # [flc_first_ult, total_with_ult]
    wintgt=Counter(); losevic=Counter(); wininit=Counter(); winrole=Counter(); loserole=Counter()
    for rid,evs in rev.items():
        mid=r2m.get(rid)
        if mid not in M: continue
        mp=M[mid]['map']
        bucket='control' if mp in CONTROL else ('flash' if mp in FLASH else None)
        if not bucket: continue
        info=M[mid]
        fights=compute_fights(evs, info['t1'], info['t2'])
        if not fights: continue
        f=fights[0]
        kills=[e for e in f['events'] if e['event_type']=='kill']
        ults=[e for e in f['events'] if e['event_type']=='ultimate_start']
        if not kills: continue
        opp=info['opp']; w=f['winner']; first=kills[0]; flcfk=first['player_team']==US
        rec[bucket][0 if w==US else (2 if w==opp else 1)]+=1
        if w==US:
            fk['won'][1]+=1; fk['won'][0]+=flcfk
            if ults: ult['won'][1]+=1; ult['won'][0]+=(ults[0]['player_team']==US)
            if flcfk:
                wintgt[first['target_hero']]+=1; winrole[rl(first['target_hero'])]+=1
                wininit[f"{first['player_name']}({first['player_hero']})"]+=1
        elif w==opp:
            fk['lost'][1]+=1; fk['lost'][0]+=flcfk
            if ults: ult['lost'][1]+=1; ult['lost'][0]+=(ults[0]['player_team']==US)
            fd=next((e['target_hero'] for e in kills if e['target_team']==US),None)
            if fd: losevic[fd]+=1; loserole[rl(fd)]+=1
    return dict(rec=rec,fk=fk,ult=ult,wintgt=wintgt,losevic=losevic,wininit=wininit,winrole=winrole,loserole=loserole)
FF = first_fight_stats()
FF_REC,FF_FK,FF_WINTGT,FF_LOSEVIC = FF['rec'],FF['fk'],FF['wintgt'],FF['losevic']

# ===== 힐러(서포터) 조합별 승률 (FLC vs 전체팀) =====
SUP={'루시우','주노','키리코','아나','모이라','브리기테','바티스트','일리아리','미즈키','제트팩 캣','우양','메르시','젠야타'}
def support_combo_winrate():
    cur.execute("SELECT round_id,player_team FROM events WHERE event_type='kill'")
    tk=defaultdict(lambda: defaultdict(int))
    for rid,pt in cur.fetchall():
        if rid is not None and pt: tk[rid][pt]+=1
    def rwin(rid):
        d=tk.get(rid,{})
        if len(d)<2: return None
        srt=sorted(d.items(),key=lambda x:-x[1])
        return None if srt[0][1]==srt[1][1] else srt[0][0]
    cur.execute('SELECT round_id,team_name,player_name,hero_name,hero_time_played FROM player_stats')
    best=defaultdict(dict)
    for rid,tm,pn,h,tp in cur.fetchall():
        if not tp or tp<30: continue
        k=(rid,tm)
        if pn not in best[k] or tp>best[k][pn][1]: best[k][pn]=(h,tp)
    supF=defaultdict(lambda:[0,0]); supA=defaultdict(lambda:[0,0])
    for (rid,tm),pl in best.items():
        w=rwin(rid)
        if w is None: continue
        sup=tuple(sorted(h for h,_ in pl.values() if h in SUP))
        if not sup: continue
        win=1 if tm==w else 0
        supA[sup][0]+=win; supA[sup][1]+=1
        if tm==US: supF[sup][0]+=win; supF[sup][1]+=1
    return supF,supA
SUP_F,SUP_A=support_combo_winrate()

# ===== 탱 교체 효과 (딜/힐 코어 고정, 탱만 변경) =====
def tank_swap():
    cur.execute("SELECT round_id,player_team FROM events WHERE event_type='kill'")
    tk=defaultdict(lambda: defaultdict(int))
    for rid,pt in cur.fetchall():
        if rid is not None and pt: tk[rid][pt]+=1
    def rwin(rid):
        d=tk.get(rid,{})
        if len(d)<2: return None
        s=sorted(d.items(),key=lambda x:-x[1])
        return None if s[0][1]==s[1][1] else s[0][0]
    cur.execute('SELECT round_id,team_name,player_name,hero_name,hero_time_played FROM player_stats')
    best=defaultdict(dict)
    for rid,tm,pn,h,tp in cur.fetchall():
        if not tp or tp<30: continue
        k=(rid,tm)
        if pn not in best[k] or tp>best[k][pn][1]: best[k][pn]=(h,tp)
    core=defaultdict(lambda: defaultdict(lambda:[0,0]))
    for (rid,tm),pl in best.items():
        if tm!=US: continue
        w=rwin(rid)
        if w is None: continue
        heroes=[h for h,_ in pl.values()]
        tanks=[h for h in heroes if h in TANKS]
        if len(tanks)!=1: continue
        cr=tuple(sorted(h for h in heroes if h not in TANKS))
        win=1 if tm==w else 0
        core[cr][tanks[0]][0]+=win; core[cr][tanks[0]][1]+=1
    bestcore=None; bestn=-1
    for cr,td in core.items():
        valid={t:v for t,v in td.items() if v[1]>=4}
        if len(valid)>=2:
            n=sum(v[1] for v in valid.values())
            if n>bestn: bestn=n; bestcore=(cr,valid)
    return bestcore
TANKSWAP=tank_swap()

# ===== 전체 5영웅 조합별 승률 (FLC) =====
def full_comp_winrate():
    cur.execute("SELECT round_id,player_team FROM events WHERE event_type='kill'")
    tk=defaultdict(lambda: defaultdict(int))
    for rid,pt in cur.fetchall():
        if rid is not None and pt: tk[rid][pt]+=1
    def rwin(rid):
        d=tk.get(rid,{})
        if len(d)<2: return None
        s=sorted(d.items(),key=lambda x:-x[1])
        return None if s[0][1]==s[1][1] else s[0][0]
    cur.execute('SELECT round_id,team_name,player_name,hero_name,hero_time_played FROM player_stats')
    best=defaultdict(dict)
    for rid,tm,pn,h,tp in cur.fetchall():
        if not tp or tp<30: continue
        k=(rid,tm)
        if pn not in best[k] or tp>best[k][pn][1]: best[k][pn]=(h,tp)
    rl=lambda h: 0 if h in TANKS else (2 if h in SUP else 1)   # 탱0 딜1 힐2
    compF=defaultdict(lambda:[0,0]); compO=defaultdict(lambda:[0,0])  # F=FLC, O=상대팀(FLC 제외)
    for (rid,tm),pl in best.items():
        w=rwin(rid)
        if w is None: continue
        heroes=tuple(sorted((h for h,_ in pl.values()), key=lambda h:(rl(h),h)))
        win=1 if tm==w else 0
        if tm==US: compF[heroes][0]+=win; compF[heroes][1]+=1
        else: compO[heroes][0]+=win; compO[heroes][1]+=1
    return compF,compO
FULLCOMP_F,FULLCOMP_O=full_comp_winrate()

def per10(rows, keyfn):
    agg = defaultdict(lambda: defaultdict(float))
    for r in rows:
        k = keyfn(r)
        if k is None: continue
        tp = r[12]
        if not tp or tp<30: continue
        agg[k]['t']+=tp
        agg[k]['fb']+=r[4] or 0; agg[k]['de']+=r[5] or 0; agg[k]['el']+=r[6] or 0
        agg[k]['hd']+=r[7] or 0; agg[k]['he']+=r[8] or 0; agg[k]['dt']+=r[9] or 0
        agg[k]['db']+=r[10] or 0; agg[k]['ue']+=r[11] or 0
    return agg
def p10(a,k): return a[k]/a['t']*600 if a['t'] else 0

def save(fig, name):
    path = os.path.join(OUTDIR, name)
    fig.savefig(path, dpi=100, facecolor='white', bbox_inches=None)
    plt.close(fig)
    print('saved', path)

def base_fig():
    fig = plt.figure(figsize=(19.2,10.8))
    return fig

def title_block(fig, title, sub=None):
    fig.text(0.5, 0.93, title, ha='center', va='top', fontsize=46, fontweight='bold', color=INK)
    if sub:
        fig.text(0.5, 0.865, sub, ha='center', va='top', fontsize=24, color='#555')

def insight(fig, text):
    fig.text(0.5, 0.05, text, ha='center', va='bottom', fontsize=26, color=BLUE, fontweight='bold')

def footnote(fig, text):
    fig.text(0.99, 0.01, text, ha='right', va='bottom', fontsize=14, color='#999')

def vlabels(ax, bars, fmt='{:.1f}', dy=0, fs=19):
    for b in bars:
        h=b.get_height()
        ax.text(b.get_x()+b.get_width()/2, h+dy, fmt.format(h), ha='center', va='bottom', fontsize=fs, fontweight='bold', color=INK)

# ============================================================
# SLIDE 1: COVER
# ============================================================
fig = base_fig()
fig.patch.set_facecolor(BLUE)
fig.text(0.5,0.62,'FLC 주간 스크림 보고', ha='center', fontsize=78, fontweight='bold', color='white')
fig.text(0.5,0.50,'2026.05.26 – 06.02  ·  11세션 57매치', ha='center', fontsize=34, color='#dce8f7')
fig.text(0.5,0.36,'32승  11무  14패', ha='center', fontsize=60, fontweight='bold', color='white')
fig.text(0.5,0.27,'승률 56% (무승부 제외 시 70%)', ha='center', fontsize=28, color='#dce8f7')
fig.text(0.99,0.02,'데이터 분석: scrim.db  ·  10분당 정규화', ha='right', fontsize=15, color='#bcd')
save(fig,'slide_01_cover.png')

# ============================================================
# SLIDE 2: 핵심 결론
# ============================================================
fig = base_fig()
title_block(fig,'핵심 결론')
lines = [
    ('1.  ZETA만 유일한 열세 — 3승 6패', '다른 4팀 전원 우세(JDG 9-0, VR 9-3, T1 7-4, ONG 4-1)'),
    ('2.  "선킬 따고도 한타 패배"가 반복', 'ZETA전 선킬 56% → 라운드 우위 41% (JDG는 64%→82% 전환)'),
    ('3.  패배 = 출력 부족 아닌 데스 폭증', '전 선수 death/10 +50~90%, 딜·힐은 승리 때와 거의 동일'),
    ('4.  궁극기 경제는 균형 — 과제 아님', 'ZETA전 매치당 -0.8개 (오차 수준)'),
]
y=0.74
for h,d in lines:
    fig.text(0.10,y,h, ha='left', fontsize=36, fontweight='bold', color=INK)
    fig.text(0.13,y-0.055,d, ha='left', fontsize=23, color='#555')
    y-=0.155
insight(fig,'한 줄 요약: FLC는 약하지 않다 — 어드밴티지를 못 굳혀서 진다')
save(fig,'slide_02_summary.png')

# ============================================================
# SLIDE 3: 팀별 vs FLC 비교 (FB/10, death/10)
# ============================================================
# per opponent: FLC stats in matches vs opp, and opp stats
opp_flc = {}; opp_opp = {}
for o in ORD:
    mids = [mid for mid,d in M.items() if d['opp']==o]
    fr = [r for r in ROWS if r[0] in mids and r[1]==US]
    orr= [r for r in ROWS if r[0] in mids and r[1]==o]
    af = per10(fr, lambda r:'x'); ao = per10(orr, lambda r:'x')
    opp_flc[o]=af['x']; opp_opp[o]=ao['x']

fig = base_fig()
title_block(fig,'팀별 비교 — FLC vs 상대', '10분당 정규화 · 상대별 누적')
import numpy as np
x = np.arange(len(ORD)); w=0.38
ax1 = fig.add_axes([0.07,0.30,0.40,0.46])
b1=ax1.bar(x-w/2,[p10(opp_flc[o],'fb') for o in ORD],w,color=BLUE,label='FLC')
b2=ax1.bar(x+w/2,[p10(opp_opp[o],'fb') for o in ORD],w,color=RED,label='상대')
ax1.set_title('처치(파이널블로) / 10분', fontsize=26, fontweight='bold', pad=12)
ax1.set_xticks(x); ax1.set_xticklabels(ORD, fontsize=20); ax1.tick_params(labelsize=16)
ax1.legend(fontsize=20, loc='upper right'); ax1.grid(axis='y',alpha=0.3)
vlabels(ax1,b1,'{:.1f}',fs=15); vlabels(ax1,b2,'{:.1f}',fs=15)

ax2 = fig.add_axes([0.56,0.30,0.40,0.46])
b3=ax2.bar(x-w/2,[p10(opp_flc[o],'de') for o in ORD],w,color=BLUE,label='FLC')
b4=ax2.bar(x+w/2,[p10(opp_opp[o],'de') for o in ORD],w,color=RED,label='상대')
ax2.set_title('데스 / 10분  (낮을수록 좋음)', fontsize=26, fontweight='bold', pad=12)
ax2.set_xticks(x); ax2.set_xticklabels(ORD, fontsize=20); ax2.tick_params(labelsize=16)
ax2.legend(fontsize=20, loc='upper right'); ax2.grid(axis='y',alpha=0.3)
vlabels(ax2,b3,'{:.1f}',fs=15); vlabels(ax2,b4,'{:.1f}',fs=15)
insight(fig,'ZETA전만 데스가 상대보다 많음 — 교전 손익에서 밀린다')
footnote(fig,'킬우위는 라운드 결과 프록시(공식 라운드 승패 데이터 불완전)')
save(fig,'slide_03_teams.png')

# ============================================================
# SLIDE 4: 한타(전투) 승률 by 상대
# ============================================================
fig = base_fig()
ow, ot = FIGHT_OVERALL
title_block(fig,'한타(전투) 승률 — 상대별', f'한타 단위(compute_fights) · 무승부 제외 · 전체 {ow}/{ot}={ow/ot*100:.0f}%')
ax = fig.add_axes([0.08,0.20,0.86,0.55])
labels4 = ORD + ['전체']
def fwr(o):
    w,d,t = FIGHT_WR[o]; return (w/t*100 if t else 0), w, t
vals4 = [fwr(o)[0] for o in ORD] + [ow/ot*100]
cnts4 = [(FIGHT_WR[o][0], FIGHT_WR[o][2]) for o in ORD] + [(ow, ot)]
cols4 = [(RED if labels4[i]=='ZETA' else (BLUE if labels4[i]!='전체' else '#1b4f8a')) for i in range(len(labels4))]
x4 = np.arange(len(labels4))
bars=ax.bar(x4, vals4, color=cols4, width=0.6)
ax.axhline(50,color='#aaa',ls='--',lw=1.2)
ax.set_ylim(0,80); ax.set_ylabel('한타 승률 (%)', fontsize=22)
ax.set_xticks(x4); ax.set_xticklabels(labels4, fontsize=22); ax.tick_params(labelsize=16)
ax.grid(axis='y',alpha=0.3)
for b,v,(w,t) in zip(bars,vals4,cnts4):
    ax.text(b.get_x()+b.get_width()/2, v+1, f'{v:.0f}%', ha='center', va='bottom', fontsize=26, fontweight='bold', color=INK)
    ax.text(b.get_x()+b.get_width()/2, 3, f'{w}/{t}', ha='center', va='bottom', fontsize=15, color='white')
insight(fig,'전체 한타 승률 56%지만 ZETA전만 50% 미만 — 한타 단위에서 ZETA에 밀린다')
footnote(fig,'승=한타 내 생존자 많은 팀(=사망 적은 팀). 무승부(동수) 제외')
save(fig,'slide_04_fightwin.png')

# ============================================================
# SLIDE 5: 왜 ZETA에 한타를 내주나 (1) — 첫 킬 싸움
# ============================================================
fpw, fpt = FP_DECIDES
fig = base_fig()
title_block(fig,'왜 ZETA에 한타를 내주나 ① — 첫 킬 싸움', f'첫 킬 딴 팀이 한타 {fpw/fpt*100:.0f}% 승리 ({fpw}/{fpt}) · 거의 결정적')
# LEFT: ZETA 첫킬 주체별 FLC 한타 승률
axA = fig.add_axes([0.07,0.20,0.38,0.55])
zf=FB_FIGHT['ZETA']
av=[zf['flcfb'][0]/zf['flcfb'][1]*100, zf['oppfb'][0]/zf['oppfb'][1]*100]
ba=axA.bar([0,1],av,color=[BLUE,RED],width=0.55)
axA.set_title('vs ZETA — 누가 첫 킬 따냐에 따른\nFLC 한타 승률', fontsize=22, fontweight='bold')
axA.set_ylim(0,100); axA.axhline(50,color='#aaa',ls='--',lw=1)
axA.set_xticks([0,1]); axA.set_xticklabels(['FLC가\n첫 킬','ZETA가\n첫 킬'],fontsize=20)
axA.tick_params(labelsize=15); axA.grid(axis='y',alpha=0.3)
for b,v,cc in zip(ba,av,[zf['flcfb'],zf['oppfb']]):
    axA.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=28,fontweight='bold',color=INK)
    axA.text(b.get_x()+b.get_width()/2,4,f'{cc[0]}/{cc[1]}',ha='center',va='bottom',fontsize=14,color='white')
# RIGHT: 퍼블(첫킬) 획득률 by 상대
axB = fig.add_axes([0.55,0.20,0.40,0.55])
def fbrate(o):
    z=FB_FIGHT[o]; tot=z['flcfb'][1]+z['oppfb'][1]; return (z['flcfb'][1]/tot*100 if tot else 0)
rr=[fbrate(o) for o in ORD]
colsB=[RED if o=='ZETA' else BLUE for o in ORD]
bb=axB.bar(range(len(ORD)),rr,color=colsB)
axB.set_title('첫 킬(퍼블) 획득률 — 상대별', fontsize=22, fontweight='bold')
axB.set_ylim(0,80); axB.axhline(50,color='#aaa',ls='--',lw=1)
axB.set_xticks(range(len(ORD))); axB.set_xticklabels(ORD,fontsize=19); axB.tick_params(labelsize=15)
axB.grid(axis='y',alpha=0.3)
for b,v in zip(bb,rr): axB.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=20,fontweight='bold',color=INK)
insight(fig,'첫 킬이 한타를 지배 — 그런데 vs ZETA는 첫 킬을 48%밖에 못 따낸다 (JDG 67%)')
footnote(fig,'한타 단위(compute_fights) · 무승부 제외 · 첫 킬=한타 첫 처치')
save(fig,'slide_05_firstpick.png')

# ============================================================
# SLIDE 6: 왜 ZETA에 한타를 내주나 (2) — 라운드 과확장
# ============================================================
fig = base_fig()
title_block(fig,'왜 ZETA에 한타를 내주나 ② — 퍼블 따고 과확장', '라운드 첫 킬은 따는데(56%) 그 라운드를 못 이긴다(44%)')
ax = fig.add_axes([0.08,0.20,0.86,0.55])
x6=np.arange(len(ORD)); w=0.38
fkrate=[ROUND_FK[o]['fk'][0]/ROUND_FK[o]['fk'][1]*100 for o in ORD]
conv=[ROUND_FK[o]['conv']/ROUND_FK[o]['fk'][0]*100 if ROUND_FK[o]['fk'][0] else 0 for o in ORD]
b1=ax.bar(x6-w/2,fkrate,w,color=GRAY,label='라운드 선킬 획득률')
b2=ax.bar(x6+w/2,conv,w,color=[RED if o=='ZETA' else BLUE for o in ORD],label='선킬 딴 라운드 승률(전환율)')
ax.axhline(50,color='#aaa',ls='--',lw=1); ax.set_ylim(0,100)
ax.set_xticks(x6); ax.set_xticklabels(ORD,fontsize=22); ax.set_ylabel('%',fontsize=20); ax.tick_params(labelsize=16)
ax.legend(fontsize=20, loc='upper left'); ax.grid(axis='y',alpha=0.3)
vlabels(ax,b1,'{:.0f}',fs=15); vlabels(ax,b2,'{:.0f}',fs=16)
insight(fig,'ZETA전: 선킬 딴 라운드도 44%만 승리 (VR 80%·JDG 86%) — 선킬 후 과확장하다 다이브에 후속 킬 내줌')
footnote(fig,'라운드 승=라운드 내 킬 우위(프록시) · 무승부 라운드 제외')
save(fig,'slide_06_overextend.png')

# ============================================================
# SLIDE 7: 승리 vs 패배 — death/10 폭증
# ============================================================
pl_wl = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))  # player->res->metric
for r in ROWS:
    mid=r[0]
    if r[1]!=US or mid not in M: continue
    tp=r[12]
    if not tp or tp<30: continue
    res=M[mid]['res']; a=pl_wl[r[2]][res]
    a['t']+=tp; a['de']+=r[5] or 0
players = ['Someone','HanBin','MER1T','CheckMate','SP1NT','ChiYo','Fielder']
def d10(p,res):
    a=pl_wl[p][res]; return a['de']/a['t']*600 if a['t'] else 0
fig = base_fig()
title_block(fig,'승리 vs 패배 — 데스 폭증', '같은 선수, 같은 출력. 차이는 오직 데스')
ax = fig.add_axes([0.08,0.18,0.86,0.56])
x=np.arange(len(players)); w=0.38
bw=ax.bar(x-w/2,[d10(p,'W') for p in players],w,color=WIN,label='승리 경기')
bl=ax.bar(x+w/2,[d10(p,'L') for p in players],w,color=LOSS,label='패배 경기')
ax.set_xticks(x); ax.set_xticklabels(players, fontsize=22)
ax.set_ylabel('데스 / 10분', fontsize=22); ax.tick_params(labelsize=16)
ax.legend(fontsize=24, loc='upper left'); ax.grid(axis='y',alpha=0.3)
vlabels(ax,bw,'{:.1f}',fs=17); vlabels(ax,bl,'{:.1f}',fs=17)
insight(fig,'패배 시 전원 데스 50~90% 증가 → 기량 아닌 규율·포지셔닝 문제')
save(fig,'slide_07_winloss.png')

# ============================================================
# SLIDE 8~10: 포지션별 — FLC vs 전체팀 선수
# ============================================================
ROLE_HERO={'D.Va':'T','마우가':'T','시그마':'T','라마트라':'T','라인하르트':'T','레킹볼':'T','윈스턴':'T','오리사':'T','자리야':'T','해저드':'T','둠피스트':'T',
 '루시우':'S','주노':'S','키리코':'S','아나':'S','모이라':'S','브리기테':'S','바티스트':'S','일리아리':'S','미즈키':'S','제트팩 캣':'S','우양':'S','메르시':'S','젠야타':'S'}
def hrole(h): return ROLE_HERO.get(h,'D')
LG=defaultdict(lambda: defaultdict(float)); LGrt=defaultdict(lambda: defaultdict(float))
for r in ROWS:
    tm,pn,h=r[1],r[2],r[3]; tp=r[12]
    if not tp or tp<30: continue
    a=LG[(tm,pn)]; a['t']+=tp; a['fb']+=r[4] or 0; a['de']+=r[5] or 0; a['el']+=r[6] or 0
    a['hd']+=r[7] or 0; a['he']+=r[8] or 0; a['dt']+=r[9] or 0; a['db']+=r[10] or 0
    LGrt[(tm,pn)][hrole(h)]+=tp
LGrole={k:max(LGrt[k],key=LGrt[k].get) for k in LGrt}
def lp10(k,key): a=LG[k]; return a[key]/a['t']*600 if a['t'] else 0

def role_bench_slide(role_letter, role_name, rc, metrics, fname, ins, minmin=30):
    pls=[k for k in LG if LGrole[k]==role_letter and LG[k]['t']>=minmin*60]
    fig=base_fig()
    title_block(fig, f'{role_name} — FLC vs 전체팀 선수', f'10분당 정규화 · 진한 색=FLC · 회색=상대 팀 · 표본 {minmin}분+ 선수')
    gx=[0.09,0.40,0.71]; gw=0.25
    for i,(lbl,fn,fmt,lower) in enumerate(metrics):
        ax=fig.add_axes([gx[i],0.12,gw,0.64])
        order=sorted(pls, key=lambda k:fn(k), reverse=not lower)   # best at top
        names=[f'{pn}·{tm}' for (tm,pn) in order]
        vals=[fn(k) for k in order]
        cols=[rc if tm==US else '#cdd1d8' for (tm,pn) in order]
        bars=ax.barh(range(len(order)), vals, color=cols)
        ax.invert_yaxis()
        ax.set_yticks(range(len(order))); ax.set_yticklabels(names, fontsize=12)
        for tl,(tm,pn) in zip(ax.get_yticklabels(), order):
            if tm==US: tl.set_fontweight('bold'); tl.set_color(rc)
        ax.set_title(lbl+(' (낮을수록↑)' if lower else ''), fontsize=20, fontweight='bold')
        ax.tick_params(labelsize=12); ax.grid(axis='x',alpha=0.3); ax.margins(x=0.16)
        for b,v in zip(bars,vals): ax.text(v,b.get_y()+b.get_height()/2,' '+fmt.format(v),va='center',fontsize=11,fontweight='bold')
    insight(fig, ins)
    save(fig, fname)

role_bench_slide('T','탱커 비교', ROLE_C['T'], [
    ('처치/10', lambda k:lp10(k,'fb'),'{:.1f}',False),
    ('데스/10', lambda k:lp10(k,'de'),'{:.1f}',True),
    ('막은피해/10(k)', lambda k:lp10(k,'db')/1000,'{:.1f}',False),
], 'slide_08_tank.png',
   'FLC 탱(Someone·HanBin): 전체팀 처치 1·3위 · 데스 최저권 · 막은피해 최상위 — 전체팀 톱급')

role_bench_slide('D','딜러 비교', ROLE_C['D'], [
    ('처치/10', lambda k:lp10(k,'fb'),'{:.1f}',False),
    ('영웅딜/10(k)', lambda k:lp10(k,'hd')/1000,'{:.1f}',False),
    ('데스/10', lambda k:lp10(k,'de'),'{:.1f}',True),
], 'slide_09_dps.png',
   'MER1T 처치·딜 전체팀 1위권 / SP1NT·CheckMate 데스 전체팀 최저 — 화력 대비 덜 죽는 딜러진')

role_bench_slide('S','서포터 비교', ROLE_C['S'], [
    ('힐량/10(k)', lambda k:lp10(k,'he')/1000,'{:.1f}',False),
    ('처치/10', lambda k:lp10(k,'fb'),'{:.1f}',False),
    ('데스/10', lambda k:lp10(k,'de'),'{:.1f}',True),
], 'slide_10_support.png',
   'Fielder 힐량 전체팀 공동 1위 / ChiYo 처치 상위·서폿 데스 최저 — 보호형+공격형 조합')

# ============================================================
# SLIDE 11: 라인하르트 (FLC 전체 탱 영웅 비교)
# ============================================================
heroesT = ['D.Va','시그마','라마트라','마우가','라인하르트']
hcol = lambda h: '#6b46c1' if h=='라인하르트' else '#b8b8c8'
fig = base_fig()
title_block(fig,'FLC 탱 영웅 비교 — 라인하르트', '전체 탱 플레이(Someone+HanBin) · 10분당 정규화 · 승률은 킬우위 프록시')
# LEFT: 라운드 승률 (headline)
axW = fig.add_axes([0.07,0.22,0.40,0.52])
wr=[TANK[h]['wr'] for h in heroesT]
bw=axW.bar(range(len(heroesT)),wr,color=[hcol(h) for h in heroesT])
axW.set_title('라운드 승률 (%)', fontsize=28, fontweight='bold', pad=10)
axW.set_ylim(0,100); axW.axhline(50,color='#aaa',ls='--',lw=1)
axW.set_xticks(range(len(heroesT))); axW.set_xticklabels(heroesT,fontsize=18)
axW.tick_params(labelsize=15); axW.grid(axis='y',alpha=0.3)
for b,h in zip(bw,heroesT):
    p=TANK[h]['wr']
    axW.text(b.get_x()+b.get_width()/2,p+1,f'{p:.0f}%',ha='center',va='bottom',fontsize=21,fontweight='bold',color=INK)
    axW.text(b.get_x()+b.get_width()/2,4,f'{TANK[h]["R"]}R',ha='center',va='bottom',fontsize=14,color='white')
# RIGHT: 2x2 small metrics
metrics = [('fb','처치/10',1),('de','데스/10',1),('hd','영웅딜/10(k)',1/1000.0),('db','막은피해/10(k)',1/1000.0)]
pos2=[[0.55,0.52,0.19,0.24],[0.78,0.52,0.19,0.24],[0.55,0.22,0.19,0.24],[0.78,0.22,0.19,0.24]]
for (mk,mlbl,sc),pos in zip(metrics,pos2):
    ax=fig.add_axes(pos)
    vals=[TANK[h][mk]*sc for h in heroesT]
    bars=ax.bar(range(len(heroesT)),vals,color=[hcol(h) for h in heroesT])
    ax.set_title(mlbl, fontsize=17, fontweight='bold')
    ax.set_xticks(range(len(heroesT))); ax.set_xticklabels(heroesT,fontsize=11,rotation=12)
    ax.tick_params(labelsize=11); ax.grid(axis='y',alpha=0.3)
    for b,v in zip(bars,vals): ax.text(b.get_x()+b.get_width()/2,v,f'{v:.1f}',ha='center',va='bottom',fontsize=12,fontweight='bold')
fig.text(0.5,0.135,'라인하르트: 처치 10.8·데스 4.7·막은피해 21k·승률 77% 모두 최상위 — 영웅딜만 낮음(근접 특성)',
         ha='center',fontsize=24,color=BLUE,fontweight='bold')
fig.text(0.5,0.085,'단, 라인하르트의 실효는 상대 라마트라(공격태세)·돌진류가 방벽을 무시하고 후방을 때리거나 강하게 압박하는 턴을',
         ha='center',fontsize=17,color='#444')
fig.text(0.5,0.05,'Someone이 얼마나 잘 흘리고(차단·정확한 망치) 받아치느냐가 관건 — 표본 작아 방향성 참고용',
         ha='center',fontsize=17,color='#444')
footnote(fig,'[주의] 표본: 라인하르트 13R·마우가 16R 등 작음. 자리야/해저드(1R)는 제외')
save(fig,'slide_11_rein.png')

# ============================================================
# SLIDE 12: 궁극기 사용 시 한타 승률
# ============================================================
fig = base_fig()
title_block(fig,'궁극기 사용 시 한타 승률', '한타 단위(compute_fights) · 무승부 제외')
ax = fig.add_axes([0.13,0.22,0.74,0.52])
labels=['궁 미사용\n한타','궁 사용\n한타','FLC 선궁\n(먼저 쓴) 한타']
data=[ULT_NO,ULT_USE,ULT_FIRST]
vals=[d[0]/d[1]*100 for d in data]
cols=[GRAY,BLUE,'#1b4f8a']
bars=ax.bar(range(3),vals,color=cols,width=0.55)
ax.set_ylim(0,80); ax.axhline(50,color='#aaa',ls='--',lw=1)
ax.set_xticks(range(3)); ax.set_xticklabels(labels,fontsize=24)
ax.set_ylabel('한타 승률 (%)', fontsize=22); ax.tick_params(labelsize=16)
ax.grid(axis='y',alpha=0.3)
for b,v,d in zip(bars,vals,data):
    ax.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=30,fontweight='bold',color=INK)
    ax.text(b.get_x()+b.get_width()/2,4,f'{d[0]}/{d[1]}',ha='center',va='bottom',fontsize=17,color='white')
insight(fig,'궁을 쓰면 +9%p, 먼저 쓰면 62% — 궁을 아끼지 말고 한타에 투자')
save(fig,'slide_12_ultimate.png')

# ============================================================
# SLIDE 13: 쟁탈/플래시포인트 첫 싸움 승률
# ============================================================
def wr3(rec): W,D,L=rec; return (W/(W+L)*100 if (W+L) else 0), W, L, D
cwr=FF_REC['control']; fwr=FF_REC['flash']; bwr=[cwr[i]+fwr[i] for i in range(3)]
fig=base_fig()
title_block(fig,'쟁탈·플래시포인트 — 첫 싸움 승률', '첫 싸움 = 각 라운드 첫 한타 · 무승부 제외 승률')
axA=fig.add_axes([0.07,0.20,0.40,0.55])
recs=[cwr,fwr,bwr]; vals=[wr3(r)[0] for r in recs]
ba=axA.bar(range(3),vals,color=['#2f9e44','#6b46c1','#1b4f8a'],width=0.6)
axA.axhline(50,color='#aaa',ls='--',lw=1); axA.set_ylim(0,80)
axA.set_xticks(range(3)); axA.set_xticklabels(['쟁탈','플래시포인트','합산'],fontsize=20)
axA.set_ylabel('첫 싸움 승률 (%)',fontsize=20); axA.tick_params(labelsize=15); axA.grid(axis='y',alpha=0.3)
for b,r in zip(ba,recs):
    p,W,L,D=wr3(r)
    axA.text(b.get_x()+b.get_width()/2,p+1,f'{p:.0f}%',ha='center',va='bottom',fontsize=26,fontweight='bold',color=INK)
    axA.text(b.get_x()+b.get_width()/2,3,f'{W}승{L}패',ha='center',va='bottom',fontsize=14,color='white')
axB=fig.add_axes([0.56,0.20,0.40,0.55])
wv=FF_FK['won'][0]/FF_FK['won'][1]*100; lvp=FF_FK['lost'][0]/FF_FK['lost'][1]*100
bb=axB.bar([0,1],[wv,lvp],color=[BLUE,RED],width=0.55)
axB.set_title('첫 싸움에서 우리가 첫 킬 따낸 비율',fontsize=21,fontweight='bold')
axB.set_ylim(0,100); axB.set_xticks([0,1]); axB.set_xticklabels(['이긴 첫 싸움','진 첫 싸움'],fontsize=19)
axB.tick_params(labelsize=15); axB.grid(axis='y',alpha=0.3)
for b,v in zip(bb,[wv,lvp]): axB.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=26,fontweight='bold',color=INK)
insight(fig,'첫 싸움도 첫 킬이 지배 — 따면 이기고(89%) 내주면 진다(13%) / 쟁탈 첫 점령은 52%로 반반')
footnote(fig,'쟁탈=일리오스·오아시스·남극반도 · 플포=수라바사·뉴정크시티 · Push맵 제외')
save(fig,'slide_13_firstfight.png')

# ============================================================
# SLIDE 14: 첫 싸움 — 이기는 방식
# ============================================================
fig=base_fig()
wfk=FF_FK['won'][0]/FF_FK['won'][1]*100
wult=FF['ult']['won'][0]/FF['ult']['won'][1]*100 if FF['ult']['won'][1] else 0
wr=FF['winrole']
title_block(fig,'첫 싸움 — 이기는 방식', f'승리 첫 싸움: 우리가 첫 킬 {wfk:.0f}% · 첫 궁 선점 {wult:.0f}% · 첫 처치 대상 딜{wr["딜"]}·힐{wr["힐"]}·탱{wr["탱"]}')
axL=fig.add_axes([0.10,0.16,0.36,0.57])
wi=FF['wininit'].most_common(7)[::-1]
n1=[k for k,_ in wi]; v1=[v for _,v in wi]
bl=axL.barh(range(len(n1)),v1,color=BLUE)
axL.set_yticks(range(len(n1))); axL.set_yticklabels(n1,fontsize=14)
axL.set_title('누가 첫 킬을 여는가 (개시자)',fontsize=20,fontweight='bold',color=BLUE)
axL.tick_params(labelsize=13); axL.grid(axis='x',alpha=0.3); axL.margins(x=0.15)
for b,v in zip(bl,v1): axL.text(v,b.get_y()+b.get_height()/2,f' {v}',va='center',fontsize=14,fontweight='bold')
axR=fig.add_axes([0.59,0.16,0.34,0.57])
wt=FF_WINTGT.most_common(7)[::-1]
n2=[h for h,_ in wt]; v2=[v for _,v in wt]
br=axR.barh(range(len(n2)),v2,color=['#2f9e44' if h=='키리코' else '#9aa0a8' for h in n2])
axR.set_yticks(range(len(n2))); axR.set_yticklabels(n2,fontsize=15)
axR.set_title('먼저 끊는 상대 영웅 (첫 처치 대상)',fontsize=20,fontweight='bold',color=BLUE)
axR.tick_params(labelsize=13); axR.grid(axis='x',alpha=0.3); axR.margins(x=0.15)
for b,v in zip(br,v2): axR.text(v,b.get_y()+b.get_height()/2,f' {v}',va='center',fontsize=15,fontweight='bold')
insight(fig,'HanBin 디바 다이브 + 캐서디 포커싱으로 상대 키리코(백라인)를 먼저 끊는다')
footnote(fig,'쟁탈+플래시포인트 첫 싸움 · 승리 시 FLC 개시자/첫 처치 대상 빈도')
save(fig,'slide_14_firstfight_win.png')

# ============================================================
# SLIDE 15: 첫 싸움 — 지는 방식
# ============================================================
fig=base_fig()
lopp=100-FF_FK['lost'][0]/FF_FK['lost'][1]*100
lult=FF['ult']['lost'][0]/FF['ult']['lost'][1]*100 if FF['ult']['lost'][1] else 0
lr=FF['loserole']
title_block(fig,'첫 싸움 — 지는 방식', f'패배 첫 싸움: 상대가 첫 킬 {lopp:.0f}% · 우리 첫 궁 선점 {lult:.0f}% · 먼저 잘리는 딜{lr["딜"]}·힐{lr["힐"]}·탱{lr["탱"]}')
axL=fig.add_axes([0.10,0.16,0.36,0.57])
lc=FF_LOSEVIC.most_common(7)[::-1]
n1=[h for h,_ in lc]; v1=[v for _,v in lc]
bl=axL.barh(range(len(n1)),v1,color=['#c0392b' if h in ('캐서디','키리코') else '#9aa0a8' for h in n1])
axL.set_yticks(range(len(n1))); axL.set_yticklabels(n1,fontsize=15)
axL.set_title('먼저 잘리는 우리 영웅',fontsize=20,fontweight='bold',color=RED)
axL.tick_params(labelsize=13); axL.grid(axis='x',alpha=0.3); axL.margins(x=0.15)
for b,v in zip(bl,v1): axL.text(v,b.get_y()+b.get_height()/2,f' {v}',va='center',fontsize=15,fontweight='bold')
axR=fig.add_axes([0.60,0.18,0.33,0.52])
roles=['딜','힐','탱']; rv=[lr[r] for r in roles]
brr=axR.bar(range(3),rv,color=['#c0392b','#e08a7a','#d8b0a8'])
axR.set_title('먼저 잘리는 역할',fontsize=20,fontweight='bold',color=RED)
axR.set_xticks(range(3)); axR.set_xticklabels(roles,fontsize=19); axR.tick_params(labelsize=14); axR.grid(axis='y',alpha=0.3)
for b,v in zip(brr,rv): axR.text(b.get_x()+b.get_width()/2,v,str(v),ha='center',va='bottom',fontsize=19,fontweight='bold')
insight(fig,'우리 딜러(캐서디)·키리코가 상대에게 먼저 잘린다 — 오프닝 포지션 노출이 패인')
footnote(fig,'쟁탈+플래시포인트 첫 싸움 · 패배 시 가장 먼저 죽은 FLC 영웅/역할')
save(fig,'slide_15_firstfight_lose.png')

# ============================================================
# SLIDE 16: 힐러(서포터) 조합별 승률 — FLC vs 전체팀
# ============================================================
fig=base_fig()
title_block(fig,'힐러(서포터) 조합별 승률 — FLC vs 전체팀', '라운드 승=킬 우위 프록시 · 조합=라운드 주력 힐러 2명 · 막대 위 (라운드 수)')
combos=[k for k,v in sorted(SUP_F.items(),key=lambda x:-x[1][1]) if v[1]>=5][:6]
labels=[' +\n'.join(cb) for cb in combos]
fwr=[SUP_F[cb][0]/SUP_F[cb][1]*100 for cb in combos]
lwr=[SUP_A[cb][0]/SUP_A[cb][1]*100 if SUP_A[cb][1] else 0 for cb in combos]
ax=fig.add_axes([0.08,0.26,0.86,0.48])
x=np.arange(len(combos)); w=0.38
b1=ax.bar(x-w/2,fwr,w,color=BLUE,label='FLC')
b2=ax.bar(x+w/2,lwr,w,color=GRAY,label='전체팀')
ax.axhline(50,color='#aaa',ls='--',lw=1); ax.set_ylim(0,100)
ax.set_xticks(x); ax.set_xticklabels(labels,fontsize=15); ax.set_ylabel('승률 (%)',fontsize=20)
ax.tick_params(labelsize=13); ax.legend(fontsize=20,loc='upper right'); ax.grid(axis='y',alpha=0.3)
for cb,b,v in zip(combos,b1,fwr):
    ax.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=16,fontweight='bold',color=BLUE)
    ax.text(b.get_x()+b.get_width()/2,4,f'({SUP_F[cb][1]})',ha='center',va='bottom',fontsize=12,color='white')
for cb,b,v in zip(combos,b2,lwr):
    ax.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=15,color='#555')
    ax.text(b.get_x()+b.get_width()/2,4,f'({SUP_A[cb][1]})',ha='center',va='bottom',fontsize=11,color='white')
insight(fig,'FLC 힐러 조합은 전체팀 평균을 상회 — 일리아리+주노·아나+제트팩 캣이 고승률(소표본)')
footnote(fig,'FLC 5라운드+ 조합만 표기 · 괄호=라운드 수 · 소표본 주의')
save(fig,'slide_16_healer_comp.png')

# ============================================================
# SLIDE 17: 탱 교체 효과 (딜/힐 코어 고정)
# ============================================================
cr, td = TANKSWAP
fig=base_fig()
title_block(fig,'탱 교체 효과 — 딜/힐 조합 고정, 탱만 변경', '고정 코어: '+' · '.join(cr)+'   (FLC · 라운드 승=킬 우위 프록시)')
tk_sorted=sorted(td.items(), key=lambda x:-x[1][0]/x[1][1])
names=[t for t,_ in tk_sorted]; vals=[v[0]/v[1]*100 for _,v in tk_sorted]; ns=[v[1] for _,v in tk_sorted]
bestv=max(vals); worstv=min(vals)
cols=[BLUE if v==bestv else (RED if v==worstv else GRAY) for v in vals]
ax=fig.add_axes([0.20,0.22,0.60,0.52])
bars=ax.bar(range(len(names)),vals,color=cols,width=0.5)
ax.axhline(50,color='#aaa',ls='--',lw=1.2); ax.set_ylim(0,80)
ax.set_xticks(range(len(names))); ax.set_xticklabels(names,fontsize=26); ax.set_ylabel('승률 (%)',fontsize=20)
ax.tick_params(labelsize=15); ax.grid(axis='y',alpha=0.3)
for b,v,n in zip(bars,vals,ns):
    ax.text(b.get_x()+b.get_width()/2,v+1,f'{v:.0f}%',ha='center',va='bottom',fontsize=32,fontweight='bold',color=INK)
    ax.text(b.get_x()+b.get_width()/2,3,f'{n}R',ha='center',va='bottom',fontsize=16,color='white')
gap=bestv-worstv
insight(fig,f'같은 딜/힐 조합에서 {names[0]}({bestv:.0f}%)가 {names[-1]}({worstv:.0f}%)보다 +{gap:.0f}%p — 이 조합엔 {names[0]} 우선(소표본 가설)')
footnote(fig,'FLC · 탱 외 4영웅 동일한 라운드만 · 탱별 4라운드+ · 소표본, 다음 스크림서 검증')
save(fig,'slide_17_tankswap.png')

# ============================================================
# SLIDE 18: 전체 5영웅 조합별 승률 (FLC vs 전체팀)
# ============================================================
def wcol(p): return '#2f9e44' if p>=55 else ('#c0392b' if p<45 else '#8a8f98')
def comp_panel(ax, d, title, minn, topn):
    heal=lambda k: tuple(h for h in k if h in SUP)
    oth=lambda k: [h for h in k if h not in SUP]
    items=[(k,v) for k,v in d.items() if v[1]>=minn]
    grp=defaultdict(int)
    for k,v in items: grp[heal(k)]+=v[1]
    # 힐러 조합 기준 묶기: 힐러조합 총 라운드 desc → 같은 힐러 인접 → 조합 라운드 desc
    items.sort(key=lambda kv:(-grp[heal(kv[0])], heal(kv[0]), -kv[1][1]))
    items=items[:topn][::-1]
    labels=[f"[{'·'.join(heal(k))}] {'·'.join(oth(k))}" for k,_ in items]
    vals=[v[0]/v[1]*100 for _,v in items]; ns=[v[1] for _,v in items]
    ax.barh(range(len(items)),vals,color=[wcol(p) for p in vals])
    ax.axvline(50,color='#aaa',ls='--',lw=1.2)
    ax.set_yticks(range(len(items))); ax.set_yticklabels(labels,fontsize=11)
    ax.set_xlim(0,112); ax.tick_params(labelsize=11); ax.grid(axis='x',alpha=0.3)
    ax.set_title(title,fontsize=21,fontweight='bold',color=INK)
    # 힐러 그룹 경계 옅은 구분선
    prev=None
    for i,(k,_) in enumerate(items):
        if prev is not None and heal(k)!=prev: ax.axhline(i-0.5,color='#d0d0d0',lw=1)
        prev=heal(k)
    for i,(v,n) in enumerate(zip(vals,ns)):
        ax.text(v+1.5,i,f'{v:.0f}% ({n})',va='center',fontsize=11,fontweight='bold')
fig=base_fig()
title_block(fig,'전체 5영웅 조합별 승률 — FLC vs 상대팀', '[힐러조합] 탱·딜·딜 · 힐러 조합끼리 묶음 · 라운드 승=킬 우위 프록시 · 초록 55%+ / 빨강 45%- · (라운드 수)')
axL=fig.add_axes([0.28,0.13,0.19,0.62])
comp_panel(axL, FULLCOMP_F, 'FLC 조합', 4, 8)
axR=fig.add_axes([0.77,0.13,0.19,0.62])
comp_panel(axR, FULLCOMP_O, '상대팀 조합 (FLC 제외)', 4, 8)
footnote(fig,'FLC / 상대팀(FLC 제외) 각 4R+ 조합만 · [ ]=힐러 2명 · 소표본 검증 필요')
save(fig,'slide_18_fullcomp.png')

# ============================================================
# SLIDE 19: 다음 스크림 체크포인트
# ============================================================
fig = base_fig()
title_block(fig,'다음 스크림 체크포인트')
checks = [
    '① 선킬 직후 "한 발 빠진다(reset)" 콜 — 추가 진입은 2킬 확보/궁 보유 시만',
    '② ZETA(다이브) 대응 — HanBin 디바 단독 진입 자제, 시그마로 첫 다이브 흡수',
    '③ MER1T 보호 지정 — 상대 트레이서/캐서디가 붙을 때 피킹백 책임 명확화',
    '④ 서폿 더블컷 방지 — Fielder·ChiYo 동시 사망 한타당 0~1회 목표',
    '⑤ [첫 싸움 공격] 상대 키리코(서폿) 먼저 끊는 진입 합 — D.Va 다이브+캐서디 포커싱',
    '⑥ [첫 싸움 수비] MER1T(캐서디)·Fielder(키리코) 오프닝 포지션 안전 — 먼저 안 잘리기',
    '⑦ 약점 맵 집중 — 쟁탈 첫 점령(52%) 보완, 뉴정크시티·도라도·눔바니 우선 배정',
]
y=0.76
for ch in checks:
    fig.text(0.08,y,ch, ha='left', fontsize=26, color=INK)
    y-=0.093
insight(fig,'첫 싸움도 한타도 결국 "첫 킬" — 상대 키리코 끊고, 우리 캐서디·키리코 지키면 이긴다')
save(fig,'slide_19_checkpoints.png')

c.close()
print('\nDONE ->', os.path.abspath(OUTDIR))
