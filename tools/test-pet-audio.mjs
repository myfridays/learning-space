import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
let count = 0;
function check(label, ok) { assert.ok(ok, label); console.log(`✓ ${label}`); count++; }
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.petAudioCalls = []; window.petAudioPlayers = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.petAudioCalls.push(this.src);
      if (!window.petAudioPlayers.includes(this)) window.petAudioPlayers.push(this);
      return play.call(this);
    };
  });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8787');
  const character = page.locator('.space-pet__character'), mute = page.locator('.space-pet-sound'), toggle = page.locator('.space-pet-toggle');
  await page.locator('#space-pet[data-state="ready"]').waitFor();
  await page.waitForFunction(() => document.querySelector('#space-pet').dataset.playback === 'playing');
  check('Automatic idle blink is silent', await page.evaluate(() => petAudioCalls.length === 0));
  for (const pose of ['jump', 'cute', 'wave']) {
    await character.click();
    await page.waitForFunction(pose => petAudioPlayers.some(audio => audio.src.endsWith(`/${pose}.mp3`) && !audio.paused && audio.currentTime > 0), pose);
    check(`${pose} audio decodes and plays`, await page.evaluate(pose => petAudioCalls.at(-1).endsWith(`/${pose}.mp3`), pose));
  }
  await character.evaluate(button => { button.click(); button.click(); button.click(); });
  check('Rapid clicks leave only the latest audio active', await page.evaluate(() => petAudioPlayers.filter(audio => !audio.paused).length === 1 && !petAudioPlayers.find(audio => audio.src.endsWith('/wave.mp3')).paused));
  await mute.click();
  check('Mute immediately stops playback', await page.evaluate(() => petAudioPlayers.every(audio => audio.paused)));
  const before = await page.evaluate(() => petAudioCalls.length);
  await character.click();
  check('Muted click changes pose without sound', await page.locator('#space-pet').getAttribute('data-pose') === 'jump' && await page.evaluate(() => petAudioCalls.length) === before);
  await page.reload(); await page.locator('#space-pet[data-state="ready"]').waitFor();
  check('Mute persists across reload', await mute.getAttribute('aria-pressed') === 'true');
  await mute.click();
  check('Unmuting does not auto-play', await page.evaluate(() => petAudioCalls.length === 0));
  await character.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(() => petAudioPlayers.some(audio => !audio.paused && audio.currentTime > 0));
  check('Keyboard activation plays sound', await page.evaluate(() => petAudioCalls.at(-1).endsWith('/jump.mp3')));
  await toggle.click();
  check('Hiding stops sound', await page.evaluate(() => petAudioPlayers.every(audio => audio.paused)));
  await toggle.click(); await character.click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  check('Backgrounding stops sound', await page.evaluate(() => petAudioPlayers.every(audio => audio.paused)));
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
  await character.click(); await page.waitForTimeout(100);
  check('Rejected audio does not block pose change or raise errors', await page.locator('#space-pet').getAttribute('data-pose') === 'wave' && errors.length === 0);
  console.log(`${count} audio checks passed.`);
} finally { await browser.close(); }
