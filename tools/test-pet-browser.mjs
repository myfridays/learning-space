import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log(`✓ ${name}`);}
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('pet-dafeiyu-mode','follow');localStorage.setItem('pet-position','{"x":10,"y":10}');});
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8787');
 const pet=page.locator('#space-pet'),toggle=page.locator('.space-pet-toggle');
 await page.locator('#space-pet[data-state="ready"]').waitFor();
 const rect=await pet.boundingBox();
 check('Larger desktop character',rect.width===124 && rect.height===136);
 check('Fixed bottom-right placement ignores old saved positions',rect.x===1144 && rect.y===692);
 check('No mode or copyright controls',await page.locator('.space-pet__mode,.space-pet__credit,.space-pet__actions').count()===0);
 await page.mouse.move(rect.x+50,rect.y+50);await page.mouse.down();await page.mouse.move(300,200,{steps:5});await page.mouse.up();await page.keyboard.press('ArrowLeft');await page.waitForTimeout(300);
 check('No drag, follow or keyboard movement',JSON.stringify(await pet.boundingBox())===JSON.stringify(rect));
 check('Character does not block page input',await pet.evaluate(el=>getComputedStyle(el).pointerEvents)==='none');
 await toggle.click();check('Whale hides character',!(await pet.isVisible()) && await toggle.isVisible());
 await page.reload();check('Hidden state persists',!(await pet.isVisible()));await toggle.click();check('Same button restores',await pet.isVisible());
 await page.setViewportSize({width:390,height:844});const mobile=await pet.boundingBox(),dock=await page.locator('.space-pet-dock').boundingBox();
 check('Mobile size increased',mobile.width===108 && mobile.height===118);
 check('Character above button and mobile navigation',mobile.y+mobile.height<=dock.y && dock.y+dock.height<=764);
 const image = page.locator('.space-pet__image');
 const first = await image.getAttribute('src');
 await page.waitForFunction(src => document.querySelector('.space-pet__image').getAttribute('src') !== src, first, {timeout:7000});
 check('New poses rotate in place', JSON.stringify(await pet.boundingBox())===JSON.stringify(mobile));
 check('New material replaces old sprite', (await image.getAttribute('src')).startsWith('/pet/companion/'));
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 const still=await image.getAttribute('src');await page.waitForTimeout(5200);
 check('Reduced motion freezes pose',await image.getAttribute('src')===still);
 await page.screenshot({path:'/tmp/companion-mobile.png'});
 check('No script errors',errors.length===0);
 console.log(`${passed} browser checks passed.`);
} finally {await browser.close();}
