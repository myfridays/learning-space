import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
let passed = 0;
function check(name, value) { assert.ok(value, name); passed++; console.log(`✓ ${name}`); }
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.BASE_URL || 'http://127.0.0.1:8787';
  await page.goto(url);
  const pet = page.locator('#space-pet'), character = page.locator('.space-pet__character'), image = page.locator('.space-pet__image'), toggle = page.locator('.space-pet-toggle');
  const waitState = async (pose, playback) => page.waitForFunction(({ pose, playback }) => {
    const el = document.querySelector('#space-pet');
    return el.dataset.pose === pose && el.dataset.playback === playback && el.dataset.state === 'ready';
  }, { pose, playback });
  await waitState('idle', 'static');
  check('Starts with uploaded idle still', (await image.getAttribute('src')).endsWith('/idle/static.webp'));
  const rect = await pet.boundingBox();
  await waitState('idle', 'playing');
  await waitState('idle', 'static');
  check('Idle blink plays once and returns to still', (await image.getAttribute('src')).endsWith('/idle/static.webp'));
  for (const pose of ['jump', 'cute', 'wave', 'jump']) {
    await character.click(); await waitState(pose, 'playing');
    await page.waitForFunction(() => document.querySelector('.space-pet__image').src.includes('/frames/'));
    await waitState(pose, 'static');
    check(`${pose} plays once and settles on matching still`, (await image.getAttribute('src')).endsWith(`/${pose}/static.webp`));
  }
  await character.evaluate(button => { button.click(); button.click(); button.click(); button.click(); });
  await waitState('cute', 'static');
  await page.waitForTimeout(1300);
  check('Rapid clicks cancel old playback and preserve last pose', await pet.getAttribute('data-pose') === 'cute' && (await image.getAttribute('src')).endsWith('/cute/static.webp'));
  await character.focus(); await page.keyboard.press('Enter'); await waitState('wave', 'playing');
  check('Enter advances once', await pet.getAttribute('data-pose') === 'wave');
  await page.keyboard.press('Space'); await waitState('jump', 'playing');
  check('Space advances once', await pet.getAttribute('data-pose') === 'jump');
  await page.keyboard.press('ArrowLeft'); await page.mouse.move(20, 20);
  check('Position stays fixed', JSON.stringify(await pet.boundingBox()) === JSON.stringify(rect));
  await toggle.click(); await waitState('jump', 'static');
  check('Hide cancels playback', !(await pet.isVisible()) && (await image.getAttribute('src')).endsWith('/jump/static.webp'));
  await toggle.click(); await waitState('jump', 'static');
  check('Restore preserves static pose', await pet.isVisible());
  await character.click(); await waitState('cute', 'playing');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await waitState('cute', 'static');
  await character.click(); await waitState('wave', 'static');
  check('Reduced motion cancels animation and supports pose changes', (await image.getAttribute('src')).endsWith('/wave/static.webp'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await pet.boundingBox(), dock = await page.locator('.space-pet-dock').boundingBox();
  check('Mobile fits above dock', mobile.width === 108 && mobile.height === 118 && mobile.y + mobile.height <= dock.y && dock.y + dock.height <= 764);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mobile.x + 50, y: mobile.y + 50 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitState('jump', 'playing'); await waitState('jump', 'static');
  check('Touch advances once', await pet.getAttribute('data-pose') === 'jump');
  await page.screenshot({ path: '/tmp/maid-pet-mobile.png' });
  await toggle.click(); await page.reload(); await waitState('idle', 'static');
  check('Hidden preference survives reload', !(await pet.isVisible()));
  await toggle.click();
  // Fail a non-preloaded pose, then verify retry and stale async-load cancellation.
  await page.route('**/maid/cute/frames/*.png', route => route.abort());
  await character.click(); await character.click();
  await page.locator('#space-pet[data-state="error"]').waitFor();
  check('Failed animation retains still and offers retry', await page.locator('.space-pet__retry').isVisible() && (await image.getAttribute('src')).endsWith('/cute/static.webp'));
  await page.unroute('**/maid/cute/frames/*.png');
  await page.locator('.space-pet__retry').click(); await waitState('cute', 'playing'); await waitState('cute', 'static');
  check('Retry recovers playback', await page.locator('.space-pet__retry').isHidden());
  check('No script errors', errors.length === 0);
  console.log(`${passed} browser checks passed.`);
} finally { await browser.close(); }
