import { api } from '../api.js';
import { esc, localToday } from '../util.js';
import { applyPanels } from '../panels.js';
const categories = { chest:'胸', legs:'腿', shoulders:'肩', back:'背', cardio:'有氧' };
const drafts = new Map();
let activeDraft = '';
export async function fitnessView(el, app) {
  el.innerHTML=`<div class="page page--narrow life-page fitness-page"><header class="pixel-heading"><img src="/village/buildings/fitness.png" alt=""><div><span class="pixel-kicker">TRAINING LOG</span><h1>健身记录</h1></div></header>
    <div class="training-categories" role="group" aria-label="记录训练">${Object.entries(categories).map(([key,label])=>`<button class="btn training-category" type="button" data-category="${key}" aria-pressed="false">${label}</button>`).join('')}</div>
    <form id="life-form" class="pixel-panel entry-form fitness-form" hidden></form>
    <div id="undo-list" aria-live="polite"></div><p id="life-error" class="inline-error" role="alert"></p><div id="life-list" class="fitness-timeline">加载中…</div><button class="btn load-more" id="load-more" hidden>加载更多</button></div>`;
  const root=el.firstElementChild,form=root.querySelector('form'),list=root.querySelector('#life-list'),error=root.querySelector('#life-error'),more=root.querySelector('#load-more');
  let items=[],hasMore=false,busy=false,current='',repValues=[],weightValues=[];
  const field=name=>form.elements.namedItem(name);
  const number=(name,label,{min=0,max=1000,step='any',required=false,value=''}={})=>`<label>${label}<input type="number" name="${name}" min="${min}" max="${max}" step="${step}" value="${esc(value)}" ${required?'required':'placeholder="选填"'}></label>`;
  function snapshot() { return {...Object.fromEntries(new FormData(form)),reps:[...form.querySelectorAll('[data-rep]')].map(n=>n.value),weights:[...form.querySelectorAll('[data-weight]')].map(n=>n.value)}; }
  function remember() { if(!form.hidden){drafts.set(current,snapshot());activeDraft=current;} }
  function renderReps() {
    form.querySelectorAll('[data-rep]').forEach((n,i)=>repValues[i]=n.value);
    form.querySelectorAll('[data-weight]').forEach((n,i)=>weightValues[i]=n.value);
    const count=Number(field('sets')?.value),container=form.querySelector('#set-reps');
    if(!container)return;
    container.innerHTML=Number.isInteger(count)&&count>0&&count<=50?Array.from({length:count},(_,i)=>`<div class="training-set"><span class="training-set__number">第${i+1}组</span><label>重量 / kg<input data-weight type="number" name="weight-${i}" min="0" max="2000" step="any" required value="${esc(weightValues[i]??'')}" aria-label="第 ${i+1} 组重量（kg）" placeholder="kg"></label><label>次数 / 个<input data-rep type="number" name="rep-${i}" min="1" max="1000" step="1" required value="${esc(repValues[i]??'')}" aria-label="第 ${i+1} 组次数（个）" placeholder="个"></label></div>`).join(''):'';
  }
  function open(category,data={}) {
    current=category;activeDraft=category;const cardio=category==='cardio',legacy=!category;
    form.innerHTML=`<fieldset><legend>${esc(categories[category]||'编辑旧记录')}</legend><input type="hidden" name="id"><input type="hidden" name="category" value="${category}">
      <div class="form-grid"><label>${cardio?'有氧类型':'动作'}<input name="content" maxlength="80" required placeholder="${cardio?'例如：跑步':'例如：卧推'}"></label><label>日期<input type="date" name="day" required value="${localToday()}"></label>
      ${cardio||legacy?`${number('duration','时间 / min',{min:0.01,max:1440,required:cardio})}${number('distance','长度 / km',{min:0.01})}`:''}
      ${cardio?`${number('speed','速度 / m/s',{max:100})}${number('incline','坡度 / %',{max:100})}`:''}
      ${!cardio?`${number('sets','组数',{min:1,max:legacy?1000:50,step:1,required:!legacy,value:''})}`:''}</div>
      ${!cardio&&!legacy?'<div id="set-reps" class="set-reps" role="group" aria-label="每组重量和次数"></div>':''}
      <label>心得<textarea name="note" rows="2" maxlength="2000" placeholder="选填"></textarea></label>
      <div class="form-actions"><button class="btn btn--primary" type="submit">${data.id?'保存修改':'保存'}</button><button class="btn" type="button" id="cancel-edit">取消</button><span class="inline-error" role="alert"></span></div></fieldset>`;
    for(const [key,value] of Object.entries(data))if(field(key))field(key).value=value??'';
    repValues=[...(data.reps||[])];
    weightValues=[...(data.weights||Array.from({length:Number(data.sets)||0},()=>data.weight??''))];
    renderReps();form.hidden=false;
    root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));
  }
  function close() { form.hidden=true;drafts.delete(current);activeDraft='';root.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-pressed','false')); }
  function row(item) {
    const metrics=item.category==='cardio'
      ? [item.duration!=null?`${item.duration}min`:'',item.speed!=null?`${item.speed}m/s`:'',item.incline!=null?`${item.incline}% 坡度`:'',item.distance!=null?`${item.distance}km`:'']
      : item.category
        ? [`${item.sets}组`,...(item.reps||[]).map((rep,i)=>`${item.weights?.[i]??item.weight}kg × ${rep}个`)]
        : [item.duration?`${item.duration} 分钟`:'',item.distance?`${item.distance} 公里`:'',item.sets?`${item.sets} 组`:''];
    return `<article class="workout-row" data-id="${esc(item.id)}"><div class="entry-content"><div class="workout-line"><strong>${esc(categories[item.category]?categories[item.category]+'：':'')}${esc(item.content)}</strong>${metrics.filter(Boolean).map(m=>`<span>${esc(m)}</span>`).join('')}</div>${item.note?`<p class="workout-note">${esc(item.note)}</p>`:''}</div><details class="entry-menu"><summary aria-label="记录操作">⋯</summary><div><button type="button" data-edit="${esc(item.id)}">编辑</button><button type="button" data-delete="${esc(item.id)}">删除</button></div></details></article>`;
  }
  function draw() {
    const days=new Map();
    for(const item of items){if(!days.has(item.day))days.set(item.day,[]);days.get(item.day).push(item);}
    list.innerHTML=items.length?[...days].map(([day,entries])=>`<h2 class="timeline-day">${esc(day)}</h2><section class="workout-day" data-day="${esc(day)}" aria-label="${esc(day)} 健身记录">${entries.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).map(row).join('')}</section>`).join(''):'<p class="pixel-empty">还没有健身记录</p>';
    applyPanels(list,'.workout-day','fitness');more.hidden=!hasMore;
  }
  async function load(append=false) {
    try {const data=await api.life.list('fitness',append?items.length:0);if(!root.isConnected)return;items=append?[...items,...data.items]:data.items;hasMore=data.hasMore;draw();error.textContent='';}
    catch(err){error.textContent=err.message;if(!items.length)list.innerHTML='<button class="btn" id="retry-life">重新加载</button>';}
  }
  form.addEventListener('input',event=>{if(event.target.name==='sets')renderReps();remember();});
  root.addEventListener('click',async event=>{
    if(busy)return;
    const category=event.target.closest('[data-category]'),edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
    if(category){remember();open(category.dataset.category,drafts.get(category.dataset.category));(field('sets')||field('content')).focus();}
    if(event.target.closest('#cancel-edit'))close();
    if(event.target.closest('#retry-life'))await load();
    if(edit){remember();const item=items.find(i=>i.id===edit.dataset.edit);open(item.category||'',item);remember();form.scrollIntoView({block:'nearest'});field('content').focus();}
    if(del){
      busy=true;del.disabled=true;
      try {const id=del.dataset.delete;await api.life.remove('fitness',id);if(field('id')?.value===id)close();for(const [key,draft] of drafts)if(draft.id===id)drafts.delete(key);app.invalidate();await load();
        const undo=document.createElement('div');undo.className='undo-bar';undo.innerHTML='<span>已删除</span><button type="button" class="btn">撤销</button>';root.querySelector('#undo-list').append(undo);
        undo.querySelector('button').addEventListener('click',async()=>{const btn=undo.querySelector('button');btn.disabled=true;try{await api.life.update('fitness',id,{restore:true});undo.remove();app.invalidate();await load();}catch(err){error.textContent=err.message;btn.disabled=false;}});
      }catch(err){error.textContent=err.message;del.disabled=false;}finally{busy=false;}
    }
  });
  more.addEventListener('click',async()=>{more.disabled=true;await load(true);more.disabled=false;});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;
    const data=snapshot(),id=data.id;delete data.id;
    for(const key of Object.keys(data))if(key.startsWith('rep-')||key.startsWith('weight-'))delete data[key];
    data.reps=data.reps.map(Number);
    data.weights=data.weights.map(Number);
    busy=true;form.querySelector('fieldset').disabled=true;const feedback=form.querySelector('[role=alert]');feedback.textContent='';
    try {if(id)await api.life.update('fitness',id,data);else await api.life.create('fitness',data);close();app.invalidate();await load();}
    catch(err){feedback.textContent=err.message;}finally{busy=false;form.querySelector('fieldset').disabled=false;}
  });
  if(drafts.has(activeDraft))open(activeDraft,drafts.get(activeDraft));
  await load();
}
