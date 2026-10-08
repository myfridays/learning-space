import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
let passed=0;
function check(name,value){assert.ok(value,name);passed++;console.log(`✓ ${name}`);}
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8787');
 const pet=page.locator('#space-pet'),character=page.locator('.space-pet__character'),image=page.locator('.space-pet__image'),toggle=page.locator('.space-pet-toggle');
 await page.locator('#space-pet[data-state="ready"]').waitFor();
 check('Starts with waving animation',await pet.getAttribute('data-pose')==='wave' && (await image.getAttribute('src')).includes('/animated/'));
 const counts=await page.evaluate(async()=>{
  const frames=[];
  for(const name of ['wave','jump','blink']){
   const data=await (await fetch(`/pet/companion/animated/${name}.webp`)).arrayBuffer();
   const decoder=new ImageDecoder({data,type:'image/webp'});await decoder.tracks.ready;
   frames.push(decoder.tracks.selectedTrack.frameCount);decoder.close();
  }
  return frames;
 });
 check('All assets contain real animation frames',JSON.stringify(counts)==='[8,6,5]');
 const rect=await pet.boundingBox();
 for(const pose of ['jump','blink','wave']){await character.click();check(`One click advances to ${pose}`,await pet.getAttribute('data-pose')===pose);}
 await page.waitForTimeout(5400);check('No automatic pose switching',await pet.getAttribute('data-pose')==='wave');
 await character.focus();await page.keyboard.press('Enter');check('Enter advances once',await pet.getAttribute('data-pose')==='jump');
 await page.keyboard.press('Space');check('Space advances once',await pet.getAttribute('data-pose')==='blink');
 await page.keyboard.press('ArrowLeft');await page.mouse.move(20,20);check('Position stays fixed',JSON.stringify(await pet.boundingBox())===JSON.stringify(rect));
 await toggle.click();check('Whale hides without advancing',!(await pet.isVisible()) && await pet.getAttribute('data-pose')==='blink' && (await image.getAttribute('src')).includes('/still/'));
 await toggle.click();check('Restore resumes same animation',await pet.isVisible() && await pet.getAttribute('data-pose')==='blink' && (await image.getAttribute('src')).includes('/animated/'));
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);
 check('Reduced motion uses static frame',(await image.getAttribute('src')).includes('/still/'));
 await character.click();check('Reduced motion still supports click cycling',await pet.getAttribute('data-pose')==='wave' && (await image.getAttribute('src')).includes('/still/'));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
 check('Animation resumes after preference change',(await image.getAttribute('src')).includes('/animated/'));
 await page.setViewportSize({width:390,height:844});const mobile=await pet.boundingBox(),dock=await page.locator('.space-pet-dock').boundingBox();
 check('Mobile placement unchanged',mobile.width===108 && mobile.height===118 && mobile.y+mobile.height<=dock.y && dock.y+dock.height<=764);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:mobile.x+50,y:mobile.y+50}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 check('Touch advances once',await pet.getAttribute('data-pose')==='jump');
 check('No mode or copyright controls',await page.locator('.space-pet__mode,.space-pet__credit').count()===0);
 await page.screenshot({path:'/tmp/animated-pet-mobile.png'});
 check('No script errors',errors.length===0);
 console.log(`${passed} browser checks passed.`);
} finally {await browser.close();}
