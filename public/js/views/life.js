import { api } from '../api.js';
import { esc, localToday } from '../util.js';
const drafts = new Map();
export async function lifeView(el, app, kind) {
  const fitness=kind==='fitness',title=fitness?'健身记录':'正念';
  el.innerHTML=`<div class="page page--narrow life-page"><header class="pixel-heading"><img src="/village/buildings/${kind}.png" alt=""><div><span class="pixel-kicker">${fitness?'TRAINING LOG':'A MOMENT OF CLARITY'}</span><h1>${title}</h1></div>${fitness?'<button class="btn btn--primary" id="new-entry">记一次</button>':''}</header>
  <form id="life-form" class="pixel-panel entry-form" ${fitness?'hidden':''}>
    <input type="hidden" name="id"><label>${fitness?'运动项目':'留住触动你的一句话'}<${fitness?'input':'textarea'} name="content" maxlength="${fitness?80:2000}" ${fitness?'list="recent-activities" placeholder="例如：跑步"':'rows="3" placeholder="写下此刻的感悟…"'} required>${fitness?'':'</textarea>'}</label>
    ${fitness?`<datalist id="recent-activities"></datalist><div class="form-grid"><label>日期<input type="date" name="day" value="${localToday()}" required></label><label>时长 / 分钟<input type="number" name="duration" min="1" max="1440" step="1" placeholder="选填"></label><label>距离 / 公里<input type="number" name="distance" min="0.01" max="1000" step="0.01" placeholder="选填"></label><label>组数<input type="number" name="sets" min="1" max="1000" step="1" placeholder="选填"></label></div><label>感受<textarea name="note" rows="2" maxlength="2000" placeholder="选填"></textarea></label>`:'<details><summary>添加出处</summary><label>出处或作者<input name="source" maxlength="200" placeholder="选填"></label></details>'}
    <div class="form-actions"><button class="btn btn--primary" type="submit">${fitness?'保存记录':'记录'}</button><button class="btn" id="cancel-edit" type="button" hidden>取消</button><span class="inline-error" role="alert"></span></div>
  </form><div id="undo-list" aria-live="polite"></div><p id="life-error" class="inline-error" role="alert"></p><div id="life-list" class="${fitness?'fitness-timeline':'quote-list'}">加载中…</div><button class="btn load-more" id="load-more" hidden>加载更多</button></div>`;
  const root=el.firstElementChild,form=root.querySelector('form'),list=root.querySelector('#life-list'),error=root.querySelector('#life-error'),more=root.querySelector('#load-more');
  let items=[],offset=0,hasMore=false,busy=false;
  const field=name=>form.elements.namedItem(name);
  function remember(){drafts.set(kind,Object.fromEntries(new FormData(form)));}
  form.addEventListener('input',remember);
  const draft=drafts.get(kind);if(draft){for(const [key,value] of Object.entries(draft))if(field(key))field(key).value=value;form.hidden=false;if(field('id').value){form.querySelector('#cancel-edit').hidden=false;form.querySelector('[type=submit]').textContent='保存修改';}}
  function reset(){form.reset();field('id').value='';if(fitness)field('day').value=localToday();form.querySelector('#cancel-edit').hidden=true;form.hidden=fitness;drafts.delete(kind);form.querySelector('[role=alert]').textContent='';form.querySelector('[type=submit]').textContent=fitness?'保存记录':'记录';}
  function draw(){
    list.innerHTML=items.length?items.map((item,i)=>`${fitness && (i===0 || items[i-1].day!==item.day)?`<h2 class="timeline-day">${esc(item.day)}</h2>`:''}<article class="${fitness?'workout-entry':'quote-entry'}" data-id="${esc(item.id)}"><div class="entry-content">${fitness?`<h3>${esc(item.content)}</h3><div class="workout-metrics">${[item.duration?`${item.duration} 分钟`:'',item.distance?`${item.distance} 公里`:'',item.sets?`${item.sets} 组`:''].filter(Boolean).map(v=>`<span>${esc(v)}</span>`).join('')}</div>${item.note?`<p>${esc(item.note)}</p>`:''}`:`<blockquote>${esc(item.content)}</blockquote><div class="quote-meta"><time>${esc(item.day)}</time>${item.source?`<span>— ${esc(item.source)}</span>`:''}</div>`}</div><details class="entry-menu"><summary aria-label="记录操作">⋯</summary><div><button type="button" data-edit="${esc(item.id)}">编辑</button><button type="button" data-delete="${esc(item.id)}">删除</button></div></details></article>`).join(''):`<p class="pixel-empty">${fitness?'还没有健身记录':'还没有记录，写下第一句吧。'}</p>`;
    if(fitness)root.querySelector('datalist').innerHTML=[...new Set(items.map(i=>i.content))].slice(0,12).map(v=>`<option value="${esc(v)}">`).join('');
    more.hidden=!hasMore;
  }
  async function load(append=false){
    try {const data=await api.life.list(kind,append?offset:0);if(!root.isConnected)return;items=append?[...items,...data.items]:data.items;offset=items.length;hasMore=data.hasMore;draw();error.textContent='';}
    catch(err){error.textContent=err.message;if(!items.length)list.innerHTML='<button class="btn" id="retry-life">重新加载</button>';}
  }
  more.addEventListener('click',async()=>{more.disabled=true;await load(true);more.disabled=false;});
  root.addEventListener('click',async event=>{
    const edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
    if(event.target.closest('#retry-life')){await load();return;}
    if(edit){const item=items.find(i=>i.id===edit.dataset.edit);for(const name of ['id','content','source','day','duration','distance','sets','note'])if(field(name))field(name).value=item[name]??'';form.hidden=false;form.querySelector('[type=submit]').textContent='保存修改';form.querySelector('#cancel-edit').hidden=false;form.scrollIntoView({block:'nearest'});field('content').focus();remember();}
    if(del && !busy){
      busy=true;del.disabled=true;const id=del.dataset.delete;
      try {await api.life.remove(kind,id);app.invalidate();if(field('id').value===id)reset();await load();
        const undo=document.createElement('div');undo.className='undo-bar';undo.innerHTML='<span>已删除</span><button type="button" class="btn btn--sm">撤销</button>';root.querySelector('#undo-list').append(undo);
        undo.querySelector('button').addEventListener('click',async()=>{const btn=undo.querySelector('button');btn.disabled=true;try{await api.life.update(kind,id,{restore:true});undo.remove();app.invalidate();await load();}catch(err){error.textContent=err.message;btn.disabled=false;}});
      }catch(err){error.textContent=err.message;del.disabled=false;}finally{busy=false;}
    }
  });
  root.querySelector('#new-entry')?.addEventListener('click',()=>{form.hidden=false;form.querySelector('#cancel-edit').hidden=false;field('content').focus();});
  root.querySelector('#cancel-edit').addEventListener('click',reset);
  if(!fitness)field('content').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;const submit=form.querySelector('[type=submit]'),feedback=form.querySelector('[role=alert]');submit.disabled=true;feedback.textContent='';
    const data=Object.fromEntries(new FormData(form)),id=data.id;delete data.id;if(!fitness&&!id)data.day=localToday();
    try {if(id)await api.life.update(kind,id,data);else await api.life.create(kind,data);reset();app.invalidate();await load();}
    catch(err){feedback.textContent=err.message;}finally{busy=false;submit.disabled=false;}
  });
  await load();
}
