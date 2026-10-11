import type { Router } from '../router.ts';
import { badRequest, HttpError, ok } from '../lib.ts';
async function upstream(url: string) {
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(7000), cf:{cacheTtl:1800,cacheEverything:true}} as RequestInit);
    if(!response.ok)throw new Error('Weather unavailable');
    return await response.json() as any;
  } catch {throw new HttpError(503,'天气暂不可用','weather_unavailable');}
}
export function registerWeather(r: Router) {
  r.get('/api/weather/cities',async({url})=>{
    const q=(url.searchParams.get('q') || '').trim();if(q.length<2 || q.length>60)throw badRequest('请输入至少两个字的城市名');
    const data=await upstream(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=zh&format=json`);
    return ok({cities:(data.results || []).map((c:any)=>({name:c.name,region:[c.admin1,c.country].filter(Boolean).join(' · '),latitude:c.latitude,longitude:c.longitude}))});
  });
  r.get('/api/weather',async({url})=>{
    const lat=url.searchParams.get('latitude'),lon=url.searchParams.get('longitude');
    if(lat===null||lon===null||!lat.trim()||!lon.trim()||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)throw badRequest('城市坐标无效');
    const data=await upstream(`https://api.open-meteo.com/v1/forecast?latitude=${Number(lat)}&longitude=${Number(lon)}&current=temperature_2m,weather_code&timezone=auto`);
    if(!Number.isFinite(data.current?.temperature_2m)||!Number.isFinite(data.current?.weather_code))throw new HttpError(503,'天气暂不可用');
    return ok({temperature:Math.round(data.current.temperature_2m),code:data.current.weather_code,observedAt:data.current.time});
  });
}
