import { initCosmos } from './cosmos.js';
import { initPet } from './pet.js';
import { readStored, writeStored } from './util.js';
let theme=readStored('theme-mode','dark');
function applyTheme() {
  const active=theme==='auto' ? (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light') : theme==='light'?'light':'dark';
  document.documentElement.dataset.theme=active;
  document.documentElement.style.colorScheme=active;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',active==='dark'?'#080d24':'#eaf0ff');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(theme==='auto')applyTheme();});
applyTheme();
document.querySelector('#blog-theme')?.addEventListener('click',()=>{theme=document.documentElement.dataset.theme==='light'?'dark':'light';writeStored('theme-mode',theme);applyTheme();});
const search=document.querySelector('#blog-search');
if(search) {
  const cards=[...document.querySelectorAll('.post-card')];
  search.addEventListener('input',()=>{
    const term=search.value.trim().toLocaleLowerCase();
    let count=0;
    for(const card of cards){card.hidden=!card.textContent.toLocaleLowerCase().includes(term);if(!card.hidden)count++;}
    document.querySelector('#search-status').textContent=term?`找到 ${count} 篇文章`:'';
  });
}
// Preserve older private hash bookmarks while giving readers real article URLs.
if (/^#\/(notes|todos|habits|files|settings)(\/|$)/.test(location.hash)) location.replace('/admin.html'+location.hash);
initCosmos(); initPet();
if ('serviceWorker' in navigator && !['localhost','127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('/sw.js').catch(()=>{});
