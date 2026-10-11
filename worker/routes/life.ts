import type { Router } from '../router.ts';
import { badRequest, dateOnly, int, json, newId, notFound, nowIso, ok, readJson, str } from '../lib.ts';
function kindOf(value: string) {
  if (!['mindfulness','fitness'].includes(value)) throw notFound();
  return value;
}
function dto(row: any) {
  return { id: row.id, kind: row.kind, content: row.content, day: row.day, ...JSON.parse(row.details), createdAt: row.created_at, updatedAt: row.updated_at };
}
function clean(kind: string, body: Record<string,unknown>) {
  const content=str(body.content,'content',{required:true,max:kind==='mindfulness'?2000:80}).trim();
  const day=dateOnly(body.day,'day');if(!day)throw badRequest('请选择日期');
  const details: Record<string,unknown>={};
  if(kind==='mindfulness')details.source=str(body.source,'source',{max:200}).trim();
  else {
    details.note=str(body.note,'note',{max:2000}).trim();
    const category=body.category == null ? '' : str(body.category,'category',{max:20});
    if(category && !['chest','legs','shoulders','back','cardio'].includes(category))throw badRequest('训练类型无效');
    details.category=category;
    for(const [name,max] of [['weight',2000],['speed',100],['incline',100]] as const) {
      const value=body[name];
      if(value===null || value===undefined || value===''){details[name]=null;continue;}
      if(!['string','number'].includes(typeof value)||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)throw badRequest(`${name} 数值无效`);
      details[name]=Number(value);
    }

    for(const name of ['duration','distance','sets']) {
      const value=body[name];
      if(value===null || value===undefined || value===''){details[name]=null;continue;}
      const n=Number(value),max=name==='duration'?1440:name==='distance'?1000:1000;
      if(!Number.isFinite(n)||n<=0||n>max||(name==='sets'&&!Number.isInteger(n)))throw badRequest(`${name} 数值无效`);
      details[name]=n;
    }
  }
  if(kind==='fitness') {
    const strength=details.category && details.category!=='cardio';
    if(strength) {
      if(details.weight===null||!details.sets||Number(details.sets)>50)throw badRequest('请填写重量和组数（1–50）');
      if(!Array.isArray(body.reps)||body.reps.length!==details.sets||body.reps.some(n=>typeof n!=='number'||!Number.isInteger(n)||n<1||n>1000))throw badRequest('请为每组填写有效次数');
      details.reps=body.reps;
      details.duration=null;details.distance=null;details.speed=null;details.incline=null;
    } else if(details.category==='cardio') {
      if(!details.duration)throw badRequest('请填写有氧时间');
      details.weight=null;details.sets=null;details.reps=[];
    }
  }
  return {content,day,details:JSON.stringify(details)};
}
export function registerLife(r: Router) {
  r.get('/api/life/:kind',async({env,params,url})=>{
    const kind=kindOf(params.kind),limit=int(url.searchParams.get('limit'),'limit',{min:1,max:100,def:30}),offset=int(url.searchParams.get('offset'),'offset',{min:0,max:100000,def:0});
    const rows=await env.DB.prepare('SELECT * FROM life_entries WHERE kind=? AND deleted_at IS NULL ORDER BY day DESC, created_at DESC, id DESC LIMIT ? OFFSET ?').bind(kind,limit+1,offset).all();
    return ok({items:rows.results.slice(0,limit).map(dto),hasMore:rows.results.length>limit});
  });
  r.post('/api/life/:kind',async({env,params,request})=>{
    const kind=kindOf(params.kind),value=clean(kind,await readJson(request)),id=newId('life_'),now=nowIso();
    await env.DB.prepare('INSERT INTO life_entries (id,kind,content,day,details,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').bind(id,kind,value.content,value.day,value.details,now,now).run();
    return json({item:dto(await env.DB.prepare('SELECT * FROM life_entries WHERE id=?').bind(id).first())},{status:201});
  });
  r.patch('/api/life/:kind/:id',async({env,params,request})=>{
    const kind=kindOf(params.kind),row:any=await env.DB.prepare('SELECT * FROM life_entries WHERE id=? AND kind=?').bind(params.id,kind).first();if(!row)throw notFound();
    const body=await readJson(request);
    if(body.restore===true){await env.DB.prepare('UPDATE life_entries SET deleted_at=NULL, updated_at=? WHERE id=?').bind(nowIso(),params.id).run();}
    else {
      if(row.deleted_at)throw notFound();
      const value=clean(kind,{...dto(row),...body});
      await env.DB.prepare('UPDATE life_entries SET content=?,day=?,details=?,updated_at=? WHERE id=?').bind(value.content,value.day,value.details,nowIso(),params.id).run();
    }
    return ok({item:dto(await env.DB.prepare('SELECT * FROM life_entries WHERE id=?').bind(params.id).first())});
  });
  r.delete('/api/life/:kind/:id',async({env,params})=>{
    const kind=kindOf(params.kind);
    const row=await env.DB.prepare('SELECT id FROM life_entries WHERE id=? AND kind=? AND deleted_at IS NULL').bind(params.id,kind).first();if(!row)throw notFound();
    await env.DB.prepare('UPDATE life_entries SET deleted_at=? WHERE id=?').bind(nowIso(),params.id).run();
    return ok({deleted:params.id});
  });
}
