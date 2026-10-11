import { api } from '../api.js';
import { localToday, readStored, writeStored } from '../util.js';
const buildings=[['mindfulness','正念','留住一句话'],['fitness','健身','记录每次坚持'],['square','首页','我的生活村庄'],['todos','待办','把今天理清'],['settings','设置','按自己的节奏']];
export function weatherLabel(code){return code===0?'晴':code<=3?'多云':code<=48?'雾':code<=67?'雨':code<=77?'雪':code<=82?'阵雨':code<=86?'阵雪':'雷雨';}
export function storedCity(){try{return JSON.parse(readStored('weather-city','null'));}catch{return null;}}
export async function villageView(el,app){
 el.innerHTML=`<div class="page village-page"><section class="village-welcome"><div><span class="pixel-kicker">YOUR LITTLE CORNER</span><h1>欢迎回到村庄</h1></div><div class="village-clock"><time id="village-time"></time><span id="village-date"></span></div><a id="village-weather" href="#/settings">选择天气城市</a></section><section class="village-map" aria-label="村庄功能地图"><div class="village-road road-east" aria-hidden="true"></div><div class="village-road road-north" aria-hidden="true"></div>${buildings.map(([id,label,caption])=>`<a class="village-building building-${id}" href="${id==='square'?'#/':`#/${id}`}" aria-label="${label}"><img src="/village/buildings/${id}.png" width="128" height="128" alt=""><span class="building-label">${label}</span><small>${caption}</small></a>`).join('')}<img class="village-tree tree-left" src="/village/decorations/tree.png" alt=""><img class="village-tree tree-right" src="/village/decorations/tree.png" alt=""><img class="village-flowers" src="/village/decorations/flowers.png" alt=""></section><section class="village-summary"><a href="#/todos" class="pixel-panel"><span class="pixel-kicker">TODAY</span><strong id="village-todo-count">今天的待办</strong><span>去看看 →</span></a><a href="#/mindfulness" class="pixel-panel"><span class="pixel-kicker">A LITTLE THOUGHT</span><blockquote id="village-quote">留住今天的一点感悟。</blockquote></a></section></div>`;
 const root=el.firstElementChild;
 function clock(){if(document.hidden)return;const now=new Date();root.querySelector('#village-time').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});root.querySelector('#village-date').textContent=now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});}
 clock();const timer=setInterval(clock,30000);app.setLeaveGuard(()=>clearInterval(timer));
 const city=storedCity(),weather=root.querySelector('#village-weather');
 async function showWeather(){if(!city)return;weather.textContent=`${city.name} · 天气加载中`;const key=`${city.latitude},${city.longitude}`;let cached;
  try{cached=JSON.parse(readStored('weather-cache','null'));}catch{}
  try{const data=cached?.key===key&&Date.now()-cached.at<1800000?cached.data:await api.weather.current(city);writeStored('weather-cache',JSON.stringify({key,at:Date.now(),data}));if(root.isConnected)weather.textContent=`${city.name} · ${weatherLabel(data.code)} ${data.temperature}°C`;}
  catch{if(root.isConnected)weather.textContent=`${city.name} · 天气暂不可用`;}
 }
 showWeather();
 const results=await Promise.allSettled([api.todos.list(),api.life.list('mindfulness',0,1)]);
 if(!root.isConnected)return;
 if(results[0].status==='fulfilled'){const count=results[0].value.todos.filter(t=>!t.done&&t.dueDate===localToday()).length;root.querySelector('#village-todo-count').textContent=count?`今天还有 ${count} 件事`:'今天，轻装上阵';}
 if(results[1].status==='fulfilled'&&results[1].value.items[0])root.querySelector('#village-quote').textContent=results[1].value.items[0].content;
}
