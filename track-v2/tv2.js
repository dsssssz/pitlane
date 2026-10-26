/* v189: Трек — список 16 трасс, карточка трассы, 3D-обзор и вид «сзади» (геометрия OSM, высоты Copernicus DEM). Грузится лениво. */
export const SEC=['#cfccc5','#8ea3b5','#b9a27a'];
const BASE=new URL('../geo/tv2/',import.meta.url).href;
const ORDER=['sochi','moscow','igora','kazan','smolensk','nring','adm','grozny','redring','spb','tlt','lipetsk','auto-msk','neva','ufa','don'];
const WHERE={sochi:'Сириус · Краснодарский край',moscow:'Волоколамск · Подмосковье',igora:'Приозерский р-н · Ленобласть',kazan:'Высокая Гора · Татарстан',smolensk:'Смоленская область',nring:'Богородск · Нижегородская обл.',adm:'Мячково · Подмосковье',grozny:'Грозный · Чечня',redring:'Емельяново · Красноярский край',spb:'Шушары · Санкт-Петербург',tlt:'Тольятти',lipetsk:'Липецк','auto-msk':'Москва',neva:'—',ufa:'Уфа',don:'Ростов-на-Дону'};
const OFFICIAL={redring:{km:2.16,turns:13},kazan:{turns:12}};
const km=m=>(m/1000).toFixed(2).replace('.',',');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let IDX=null;const CACHE={};
async function idx(){if(!IDX)IDX=await (await fetch(BASE+'index.json')).json();return IDX}
async function loadTrack(id){if(CACHE[id])return CACHE[id];
  const T=await (await fetch(BASE+id+'.json')).json();T.N=T.xy.length;
  const W=9,E=T.ele.map((_,i)=>{let s=0;for(let k=-W;k<=W;k++)s+=T.ele[(i+k+T.N)%T.N];return s/(2*W+1)});T.ele=E;T.eMin=Math.min(...E);T.eMax=Math.max(...E);
  T.secOf=i=>i<T.sectors[1]?0:i<T.sectors[2]?1:2;T.secLen=[T.sectors[1],T.sectors[2]-T.sectors[1],T.N-T.sectors[2]].map(n=>n*T.step);
  const h=Math.round(40/T.step);let g=0;for(let i=0;i<T.N;i++){const a=E[(i-h+T.N)%T.N],b=E[(i+h)%T.N];g=Math.max(g,Math.abs(b-a)/(2*h*T.step))}T.grade=g;
  const R=T.ter,f=R.h;R.h=[];for(let j=0;j<R.n;j++)R.h.push(f.slice(j*R.n,(j+1)*R.n));
  return CACHE[id]=T}
// ---------- 2D map ----------
function contours(TER,P,step){
  const n=TER.n,H=TER.h,out=[];const up=3,m=(n-1)*up+1;
  const g=(i,j)=>{const x=i/up,y=j/up,i0=Math.min(n-2,Math.floor(x)),j0=Math.min(n-2,Math.floor(y)),fx=x-i0,fy=y-j0;
    const a=H[j0][i0],b=H[j0][i0+1],c=H[j0+1][i0],d=H[j0+1][i0+1];return (a*(1-fx)+b*fx)*(1-fy)+(c*(1-fx)+d*fx)*fy};
  const G=[];for(let j=0;j<m;j++){G.push([]);for(let i=0;i<m;i++)G[j].push(g(i,j))}
  const X=i=>TER.x0+(TER.x1-TER.x0)*i/(m-1),Y=j=>TER.y0+(TER.y1-TER.y0)*j/(m-1);
  const lo=Math.ceil(Math.min(...G.flat())/step)*step,hi=Math.max(...G.flat());
  for(let lv=lo;lv<hi;lv+=step){let d='';
    for(let j=0;j<m-1;j++)for(let i=0;i<m-1;i++){const v=[G[j][i],G[j][i+1],G[j+1][i+1],G[j+1][i]],c=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]];const pts=[];
      for(let e=0;e<4;e++){const a=v[e],b=v[(e+1)%4];if((a<lv)!==(b<lv)){const t=(lv-a)/(b-a),p=c[e],q=c[(e+1)%4];pts.push(P(X(p[0]+(q[0]-p[0])*t),Y(p[1]+(q[1]-p[1])*t)))}}
      if(pts.length>=2)d+=`M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}L${pts[1][0].toFixed(1)} ${pts[1][1].toFixed(1)}`;
      if(pts.length===4)d+=`M${pts[2][0].toFixed(1)} ${pts[2][1].toFixed(1)}L${pts[3][0].toFixed(1)} ${pts[3][1].toFixed(1)}`}
    out.push(`<path d="${d}" stroke="rgba(255,255,255,${Math.round(lv/step)%4===0?.12:.06})" stroke-width="0.7" fill="none"/>`)}
  return out.join('')}
export function mapSvg(T,TER,W,H,o={}){
  const xs=T.xy.map(p=>p[0]),ys=T.xy.map(p=>p[1]);let x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const pad=o.pad??34,s=Math.min((W-2*pad)/(x1-x0),(H-2*pad)/(y1-y0)),cx=(x0+x1)/2,cy=(y0+y1)/2;
  const P=(x,y)=>[W/2+(x-cx)*s,H/2-(y-cy)*s];const pts=T.xy.map(p=>P(...p));const N=T.N;
  const path=(a,b)=>{let d='';for(let i=a;i<=b;i++){const p=pts[i%N];d+=(i===a?'M':'L')+p[0].toFixed(1)+' '+p[1].toFixed(1)}return d};
  const nrm=i=>{i=(i+N)%N;const a=pts[(i-2+N)%N],b=pts[(i+2)%N];const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l,dx/l,dx/l,dy/l]};
  let g=`<rect width="${W}" height="${H}" fill="#070707"/>`;
  if(TER)g+=contours(TER,P,T.eMax-T.eMin>60?5:2.5);
  // pit
  if(T.pit){const d=T.pit.map((p,i)=>{let q=P(...p);let bj=0,bd=1e9;for(let j=0;j<N;j++){const e=(pts[j][0]-q[0])**2+(pts[j][1]-q[1])**2;if(e<bd){bd=e;bj=j}}
      const r=pts[bj],dd=Math.sqrt(bd);if(dd<7.5){const [nx,ny]=nrm(bj);const sg=dd>.3?Math.sign((q[0]-r[0])*nx+(q[1]-r[1])*ny)||1:(T.pitSide||1);q=[r[0]+nx*sg*7.5,r[1]+ny*sg*7.5]}
      return (i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)}).join('');
    g+=`<path d="${d}" stroke="#000" stroke-width="5" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#8a8a8a" stroke-width="1.6" stroke-dasharray="3 3" fill="none"/>`}
  g+=`<path d="${path(0,N)}Z" stroke="#000" stroke-width="9" fill="none" stroke-linejoin="round"/><path d="${path(0,N)}Z" stroke="#2c2c2c" stroke-width="6.5" fill="none" stroke-linejoin="round"/>`;
  const sb=[...T.sectors,N];for(let k=0;k<3;k++)g+=`<path d="${path(sb[k],sb[k+1])}" stroke="${SEC[k]}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="butt"/>`;
  // sector ticks
  for(let k=1;k<3;k++){const i=T.sectors[k],p=pts[i],[nx,ny]=nrm(i);g+=`<line x1="${p[0]-nx*7}" y1="${p[1]-ny*7}" x2="${p[0]+nx*7}" y2="${p[1]+ny*7}" stroke="${SEC[k]}" stroke-width="1.6"/>`}
  {const i0=Math.round(N*.035),i1=Math.round(N*.085);const [nx,ny]=nrm(i0);const sg=-1;let d='';for(let i=i0;i<=i1;i++){const [mx,my]=nrm(i);d+=(i===i0?'M':'L')+(pts[i][0]+mx*sg*9).toFixed(1)+' '+(pts[i][1]+my*sg*9).toFixed(1)}
   const e=pts[i1],[ex,ey,tx,ty]=nrm(i1),hx=e[0]+ex*sg*9,hy=e[1]+ey*sg*9;g+=`<path d="${d}" stroke="#9a9a9a" stroke-width="1.2" fill="none"/><path d="M${hx+tx*4} ${hy+ty*4}L${hx-tx*1+ex*3} ${hy-ty*1+ey*3}L${hx-tx*1-ex*3} ${hy-ty*1-ey*3}Z" fill="#9a9a9a"/>`}
  // S/F checker
  {const p=pts[0],[nx,ny,tx,ty]=nrm(0);let c='';for(let r=0;r<2;r++)for(let q=-3;q<3;q++){const u=q*2.2+1.1,v=(r-.5)*2.2;const X=p[0]+nx*u+tx*v,Y=p[1]+ny*u+ty*v;c+=`<rect x="${(X-1.1).toFixed(2)}" y="${(Y-1.1).toFixed(2)}" width="2.2" height="2.2" fill="${(q+r)&1?'#f2efe9':'#111'}" transform="rotate(${Math.atan2(ty,tx)*57.3} ${X.toFixed(2)} ${Y.toFixed(2)})"/>`}
    g+=c;const lx=p[0]-nx*16,ly=p[1]-ny*16;g+=`<text x="${lx}" y="${ly+3}" fill="#f2efe9" font-size="8.5" font-weight="600" text-anchor="middle" letter-spacing=".06em" font-family="PL Sans">S/F</text>`}
  if(T.pit){const q=P(...T.pit[Math.floor(T.pit.length*.5)]),c=P(...T.xy[0]);const dx=q[0]-c[0],dy=q[1]-c[1],l=Math.hypot(dx,dy)||1;}
  // badges with relaxation
  const R=o.r??8.5;const B=T.corners.map(c=>{const p=pts[c.i],[nx,ny]=nrm(c.i);const sg=c.turn>0?1:-1;const x=p[0]+nx*sg*(R+7),y=p[1]+ny*sg*(R+7);return {n:c.n,ax:p[0],ay:p[1],x,y,px:x,py:y}});
  for(let it=0;it<220;it++){for(const b of B){b.x+=(b.px-b.x)*.04;b.y+=(b.py-b.y)*.04;for(const q of B)if(q!==b){const dx=b.x-q.x,dy=b.y-q.y,d=Math.hypot(dx,dy)||.1;if(d<2*R+3){const f=(2*R+3-d)/2;b.x+=dx/d*f*.5;b.y+=dy/d*f*.5}}
      for(let i=0;i<N;i+=2){const p=pts[i],dx=b.x-p[0],dy=b.y-p[1],d=Math.hypot(dx,dy)||.1;if(d<R+5){const f=R+5-d;b.x+=dx/d*f*.4;b.y+=dy/d*f*.4}}
      b.x=Math.max(R+2,Math.min(W-R-2,b.x));b.y=Math.max(R+2,Math.min(H-R-2,b.y))}}
  for(const b of B){g+=`<line x1="${b.ax}" y1="${b.ay}" x2="${b.x}" y2="${b.y}" stroke="rgba(242,239,233,.35)" stroke-width=".8"/><circle cx="${b.x}" cy="${b.y}" r="${R}" fill="#f2efe9" stroke="#000" stroke-width="1.5"/><text x="${b.x}" y="${b.y+3.6}" text-anchor="middle" font-size="${b.n>9?9:10}" font-weight="600" fill="#000" font-family="PL Sans">${b.n}</text>`}
  if(o.chrome!==false){
    // north + scale
    g+=`<g transform="translate(${W-20} 22)"><circle r="11" fill="rgba(0,0,0,.6)" stroke="rgba(255,255,255,.16)"/><path d="M0 -6L3.5 4L0 2L-3.5 4Z" fill="#f2efe9"/><text y="-14" text-anchor="middle" font-size="0" fill="#000">N</text></g>`;
    const sm=[100,200,250,500].find(v=>v*s>50)||500,L=sm*s;g+=`<g transform="translate(${W-14-L} ${H-14})" font-family="PL Num" font-size="9" fill="#9a9a9a"><path d="M0 -4V0H${L}V-4" stroke="#9a9a9a" fill="none" stroke-width="1"/><text x="${L/2}" y="-6" text-anchor="middle">${sm} м</text></g>`}
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${g}</svg>`}
// ---------- elevation chart ----------
export function eleSvg(T,W,H){
  const N=T.N,pl=28,pr=8,pt=10,pb=22,e0=Math.floor(T.eMin-2),e1=Math.ceil(T.eMax+2);
  const X=i=>pl+(W-pl-pr)*i/N,Y=e=>pt+(H-pt-pb)*(1-(e-e0)/(e1-e0));
  let g='';const sb=[...T.sectors,N];
  for(let k=0;k<3;k++){let d=`M${X(sb[k])} ${Y(e0)}`;for(let i=sb[k];i<=sb[k+1];i++)d+=`L${X(i).toFixed(1)} ${Y(T.ele[i%N]).toFixed(1)}`;d+=`L${X(sb[k+1])} ${Y(e0)}Z`;
    g+=`<path d="${d}" fill="${SEC[k]}" fill-opacity=".14"/>`}
  for(let k=0;k<3;k++){let d='';for(let i=sb[k];i<=sb[k+1];i++)d+=(i===sb[k]?'M':'L')+X(i).toFixed(1)+' '+Y(T.ele[i%N]).toFixed(1);g+=`<path d="${d}" stroke="${SEC[k]}" stroke-width="1.6" fill="none"/>`}
  for(const e of [e0,Math.round((e0+e1)/2),e1])g+=`<line x1="${pl}" x2="${W-pr}" y1="${Y(e)}" y2="${Y(e)}" stroke="rgba(255,255,255,.06)"/><text x="${pl-5}" y="${Y(e)+3}" text-anchor="end" font-size="9" fill="#7a7a7a" font-family="PL Num">${e}</text>`;
  for(const c of T.corners)g+=`<line x1="${X(c.i)}" x2="${X(c.i)}" y1="${H-pb}" y2="${H-pb+3}" stroke="#7a7a7a"/><text x="${X(c.i)}" y="${H-6}" text-anchor="middle" font-size="8.5" fill="#9a9a9a" font-family="PL Num">${c.n}</text>`;
  for(let k=1;k<3;k++)g+=`<line x1="${X(T.sectors[k])}" x2="${X(T.sectors[k])}" y1="${pt}" y2="${H-pb}" stroke="rgba(255,255,255,.18)" stroke-dasharray="2 3"/>`;
  return `<svg width="${W}" height="${H}">${g}</svg>`}

function facts(id,t,T){const o=OFFICIAL[id]||{};const L=o.km?o.km*1000:T?T.L:(+t.km||0)*1000;const turns=o.turns||+t.turns||(T?T.corners.length:0);return {L,turns}}
export async function mountList(host,B){
  const I=await idx();const tr=Object.fromEntries(B.tracks.map(t=>[t.id,t]));
  const row=id=>{const t=tr[id]||{id,name:id};const s=I[id];const f=facts(id,t,s?{L:s.L,corners:[]}:null);const mb=B.myBest(id);
    return `<button type="button" class="tv2-row${s?'':' off'}" data-tv2="${id}">
     <span class="tv2-sil">${s?`<svg viewBox="-60 -60 120 120"><path d="${s.d}"/></svg>`:'<svg viewBox="-60 -60 120 120"><rect x="-34" y="-26" width="68" height="52" rx="22" class="tv2-dash"/></svg>'}</span>
     <span class="tv2-tx"><b>${esc(t.name)}</b><span>${esc(WHERE[id]||'')}</span>${s?(mb?`<span class="tv2-mine">ваш лучший <i>${B.fmt(mb)}</i></span>`:''):'<span class="tv2-unc">контур не подтверждён</span>'}</span>
     <span class="tv2-kv">${s?`<b>${km(f.L)}<small> км</small></b><span>${f.turns} пов.</span>`:'<b class="m">—</b>'}</span></button>`};
  host.innerHTML=`<div class="tv2-cap">${ORDER.length} трасс · Россия</div>
   <div class="tv2-box"><div class="tv2-h">Подтверждённые · OSM</div>${ORDER.filter(i=>I[i]).map(row).join('')}</div>
   <div class="tv2-box"><div class="tv2-h">Без геометрии</div>${ORDER.filter(i=>!I[i]).map(row).join('')}</div>`;
  host.onclick=e=>{const b=e.target.closest('[data-tv2]');if(!b)return;const id=b.dataset.tv2;B.pick(id);if(I[id])openCard(id,B)}}
let SHEET=null;
async function openCard(id,B){
  const t=B.tracks.find(x=>x.id===id)||{name:id};
  if(!SHEET){SHEET=document.createElement('div');SHEET.className='tv2-sheet';SHEET.setAttribute('role','dialog');document.body.appendChild(SHEET)}
  SHEET.innerHTML=`<div class="tv2-top"><button type="button" class="tv2-back" aria-label="Назад"><svg viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></svg></button><span>Трасса</span></div><div class="tv2-body"><div class="tv2-load">загрузка…</div></div>`;
  SHEET.classList.add('on');document.documentElement.classList.add('tv2-open');
  SHEET.querySelector('.tv2-back').onclick=()=>{SHEET.classList.remove('on');document.documentElement.classList.remove('tv2-open')};
  const T=await loadTrack(id);const f=facts(id,t,T);const body=SHEET.querySelector('.tv2-body');
  const W=Math.min(body.clientWidth-32,560)||340;
  const mb=B.myBest(id);const laps=B.laps(id);const th=B.theo(laps);const bl=laps.length?laps.reduce((a,l)=>l.ms<a.ms?l:a):null;const sp=bl?B.full(bl):null;
  const tl=n=>n; // номера по геометрии
  body.innerHTML=`<div class="tv2-eb">${esc(WHERE[id]||'')}</div><h2 class="tv2-h1">${esc(t.name)}</h2>
   <div class="tv2-tags">${[t.cult?'Культовая':'',T.cw?'По часовой':'Против часовой','Геометрия OSM'].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}</div>
   <div class="tv2-seg" role="tablist"><button type="button" class="on" data-m="map">Карта</button><button type="button" data-m="3d">3D</button><button type="button" data-m="chase">Сзади</button></div>
   <div class="tv2-stage"><div class="tv2-pane" data-p="map">${mapSvg(T,T.ter,W,Math.round(W*.97))}
     <div class="tv2-leg">${SEC.map((c,k)=>`<span><i style="background:${c}"></i>S${k+1}</span>`).join('')}${T.pit?'<span><i class="p"></i>Пит</span>':''}</div></div></div>
   <div class="tv2-facts">${[['Длина',km(f.L),'км'],['Повороты',f.turns,''],['Перепад',Math.round(T.eMax-T.eMin),'м'],['Макс. уклон',Math.round(T.grade*100),'%'],['Направление',T.cw?'↻':'↺',''],['Высшая точка',Math.round(T.eMax),'м']].map(([l,v,u])=>`<div><span>${l}</span><b>${v}<small>${u}</small></b></div>`).join('')}</div>
   <div class="tv2-lbl">Рекорд трассы</div><div class="tv2-card tv2-rec"><span class="tv2-av">—</span><span class="tv2-rn"><b>загрузка…</b><small></small></span><b class="tv2-rt">—</b></div>
   <div class="tv2-lbl">Ваш лучший круг</div><div class="tv2-card tv2-best">${mb?`<div class="tv2-bt"><b>${B.fmt(mb)}</b><span class="tv2-dl"></span></div>
     <div class="tv2-bs">${laps.length} ${laps.length===1?'круг':'кругов'}${th.sum?` · теор. <b>${B.fmt(th.sum)}</b>`:''}</div>
     ${sp?`<div class="tv2-sx">${sp.map((s,k)=>`<div style="border-color:${SEC[k]}"><span>S${k+1} · ${km(T.secLen[k])} км</span><b>${(s/1000).toFixed(2).replace('.',',')}</b>${th.best[k]!=null?`<small>${s-th.best[k]<=0?'лучший':'+'+((s-th.best[k])/1000).toFixed(2).replace('.',',')}</small>`:''}</div>`).join('')}</div>`:''}`
     :'<div class="tv2-empty">Ещё нет кругов на этой трассе. Проедьте круг — здесь появятся время, сектора и разница с рекордом.</div>'}</div>
   <div class="tv2-lbl tv2-lr"><span>Профиль высот</span><small>м · номера поворотов</small></div><div class="tv2-card tv2-ele">${eleSvg(T,W-12,128)}</div>
   <button type="button" class="tv2-cta">Выбрать для сессии</button>
   <div class="tv2-src">Геометрия: OpenStreetMap · высоты: Copernicus DEM 90 м · номера поворотов и сектора — по геометрии${OFFICIAL[id]?.km?' · длина — официальная':''}</div>`;
  body.querySelector('.tv2-cta').onclick=()=>{B.pick(id);SHEET.classList.remove('on');document.documentElement.classList.remove('tv2-open')};
  void B.record(id).then(r=>{const e=body.querySelector('.tv2-rec');if(!e)return;
    if(!r){e.querySelector('.tv2-rn b').textContent='Рекорда пока нет';e.querySelector('.tv2-rn small').textContent='первый зачётный круг станет рекордом';return}
    e.querySelector('.tv2-av').textContent=(String(r.name).replace(/^@/,'')[0]||'·').toUpperCase();e.querySelector('.tv2-rn b').textContent=r.name;
    e.querySelector('.tv2-rn small').textContent=[r.car,r.at?new Date(r.at).toLocaleDateString('ru-RU'):''].filter(Boolean).join(' · ');e.querySelector('.tv2-rt').textContent=B.fmt(r.ms);
    const dl=body.querySelector('.tv2-dl');if(dl&&mb){const d=mb-r.ms;dl.textContent=d<=0?'это рекорд':'+'+(d/1000).toFixed(2).replace('.',',')+' к рекорду'}});
  const stage=body.querySelector('.tv2-stage');const seg=body.querySelector('.tv2-seg');
  seg.onclick=async e=>{const b=e.target.closest('[data-m]');if(!b)return;const m=b.dataset.m;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
    stage.querySelectorAll('.tv2-pane').forEach(p=>p.hidden=p.dataset.p!==m);let p=stage.querySelector(`[data-p="${m}"]`);if(p)return;
    p=document.createElement('div');p.className='tv2-pane tv2-3d';p.dataset.p=m;const H=m==='3d'?Math.round(W*1.05):Math.round(W*1.15);p.style.height=H+'px';p.innerHTML='<div class="tv2-load">строим сцену…</div>';stage.appendChild(p);
    try{const mod=await import('./tv2-scene.js');p.innerHTML='';await mod.run(T,T.ter,id,m==='3d'?'3d':'chase',p,W,H,{hasBest:!!mb});p.dataset.done='1'}catch(err){p.innerHTML='<div class="tv2-load">3D недоступно на этом устройстве</div>';console.warn(err)}};
}
