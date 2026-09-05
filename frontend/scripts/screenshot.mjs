// screenshot.mjs — Playwright 기반 실측 스크린샷(STEP 3-0.2).
// 백엔드(:8000)+vite(:5173) 기동 상태에서 SPA 뷰를 순회하며
// frontend/dumps/screens/{step}_{name}.png 로 저장한다. (브라우저 도구 save_to_disk 미사용)
// 부가: [banpick] image fallback 콘솔 경고 수집(밴픽 1순위 후보 검증), 화면별 깨진 img 수 카운트.
// 사용: node frontend/scripts/screenshot.mjs [step]   (기본 step=step3)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'dumps', 'screens');
fs.mkdirSync(OUT, { recursive: true });
const STEP = process.argv[2] || 'step3';
const BASE = 'http://127.0.0.1:5173';

const brokenImgCount = async (page) =>
  page.evaluate(() => Array.from(document.images).filter((im) => im.currentSrc && im.complete && im.naturalWidth === 0).length);

const results = [];
const banpickWarns = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (msg) => { const t = msg.text(); if (t.includes('[banpick] image fallback')) banpickWarns.push(t); });

async function shot(name) {
  await page.waitForTimeout(900);
  const broken = await brokenImgCount(page);
  const file = path.join(OUT, `${STEP}_${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  results.push({ name, file: path.relative(path.resolve(__dirname, '..', '..'), file), brokenImgs: broken });
  console.log(`  saved ${STEP}_${name}.png  brokenImgs=${broken}`);
}
async function nav(menu, item) {
  await page.getByRole('button', { name: menu, exact: true }).click();
  await page.waitForTimeout(300);
  await page.getByText(item, { exact: true }).first().click();
  await page.waitForTimeout(600);
}

try {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);

  // 1) 궁극기 통계 (초상화)
  try { await nav('통계', '궁극기 통계'); await shot('ultimate'); } catch (e) { console.log('  ultimate FAIL', e.message); }

  // 2) 전체 통계 > 영웅별
  try { await nav('통계', '전체 통계'); await page.getByText('영웅별 통계', { exact: true }).first().click(); await shot('overall_heroes'); } catch (e) { console.log('  overall FAIL', e.message); }

  // 3) 킬데스 통계 (퍼킬 = FirstKill 기본)
  try { await nav('통계', '킬데스 통계'); await shot('killdeath_firstkill'); } catch (e) { console.log('  killdeath FAIL', e.message); }

  // 4) 개인 통계
  try { await nav('통계', '개인 통계'); await shot('personal'); } catch (e) { console.log('  personal FAIL', e.message); }

  // 5) 선수 비교
  try { await nav('통계', '선수 비교'); await shot('compare'); } catch (e) { console.log('  compare FAIL', e.message); }

  // 6) 매치 상세 (스크림 세션 → 리스트 → 첫 세션 → 첫 매치 #n · map)
  try {
    await page.getByRole('button', { name: '스크림 세션', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByText('리스트', { exact: true }).first().click();
    await page.waitForTimeout(700);
    await page.getByText(/전투 횟수/).first().click();   // 첫 세션 카드(onClick 버블링)
    await page.waitForTimeout(900);
    await page.getByText(/^#\d+ ·/).first().click();      // 첫 매치 카드
    await page.waitForTimeout(1100);
    await shot('match_detail');
  } catch (e) { console.log('  match FAIL', e.message); }

  // 7) 밴픽 영웅 그리드 (시작하기 → 맵 선택 → 맵 확정 → 영웅 밴 그리드)
  try {
    await page.getByRole('button', { name: '밴픽', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '시작하기', exact: true }).click().catch(() => {});
    await page.waitForTimeout(800);
    // 첫 맵 클릭
    await page.locator('img[alt]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '맵 확정', exact: true }).click().catch(() => {});
    await page.waitForTimeout(900);
    await shot('banpick_heroes');
  } catch (e) { console.log('  banpick FAIL', e.message); }
} finally {
  await browser.close();
}

fs.writeFileSync(path.join(OUT, `${STEP}_result.json`), JSON.stringify({ results, banpickWarns }, null, 2) + '\n');
console.log(`\nscreens: ${results.length}, total brokenImgs=${results.reduce((a, r) => a + r.brokenImgs, 0)}, banpickFallbackWarns=${banpickWarns.length}`);
if (banpickWarns.length) for (const w of banpickWarns) console.log('  WARN ' + w);
