import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ serviceWorkers: 'block' });
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/maid/manifest.json',async route=>{await gate;await route.continue();});
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8788', { waitUntil:'domcontentloaded' });
  const status=page.locator('.space-pet__status'),pet=page.locator('#space-pet');
  await status.waitFor();
  assert.match(await status.textContent(),/加载中/);
  assert.equal(await page.locator('.space-pet__image').isVisible(),false);
  console.log('✓ Slow load shows text instead of an empty or broken image');
  release();await page.locator('#space-pet[data-state="ready"]').waitFor();
  assert.equal(await status.isVisible(),false);
  assert.equal(await page.locator('.space-pet__image').isVisible(),true);
  assert.equal(await pet.getAttribute('aria-busy'),'false');
  console.log('✓ Loading text disappears when the decoded character is ready');
  for (let i=0;i<2;i++) {
    const styles=await page.locator('#blog-theme').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return [s.borderTopWidth,s.backgroundColor,s.boxShadow];}));
    assert.equal(styles.length,2);
    for(const style of styles) assert.deepEqual(style,['0px','rgba(0, 0, 0, 0)','none']);
    assert.equal(await page.locator('.space-pet__image').evaluate(el=>getComputedStyle(el).filter),'none');
    await page.locator('#blog-theme').click();
  }
  console.log('✓ Both themes have transparent controls and a shadow-free character');
  await page.unroute('**/maid/manifest.json');
  await page.route('**/maid/manifest.json',route=>route.abort());
  await page.reload(); await page.locator('#space-pet[data-state="error"]').waitFor();
  assert.match(await status.textContent(),/加载失败/);
  assert.equal(await page.locator('.space-pet__retry').isVisible(),true);
  await page.unroute('**/maid/manifest.json');await page.locator('.space-pet__retry').click();
  await page.locator('#space-pet[data-state="ready"]').waitFor();
  assert.equal(await status.isVisible(),false);
  console.log('✓ Initial failure offers retry and recovers');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
