/* v190: Трек — список 16 трасс и карточка трассы: 2D-карта (геометрия OSM, высоты Copernicus DEM), повороты по официальным схемам, зоны торможения и траектория (расчёт), конфигурации, рекорды, «как попасть», проигрыш круга. Грузится лениво. */
import {TURNS,INFO} from './tv2-data.js?v=190';
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
  const TU=TURNS[id];T.rev=!!TU?.rev;T.sf=TU?.sf||0;if(TU?.rev)T.cw=!T.cw;
  const N=T.N,xy=T.xy,D=T.rev?-1:1,hd=i=>{const a=xy[((i-3)%N+N)%N],b=xy[((i+3)%N+N)%N];return Math.atan2(b[1]-a[1],b[0]-a[0])};
  const curv=[];for(let i=0;i<N;i++){let d=hd(i+2)-hd(i-2);d=Math.atan2(Math.sin(d),Math.cos(d));curv.push(d/(4*T.step))}
  const K=curv.map((_,i)=>{let s=0;for(let k=-3;k<=3;k++)s+=curv[(i+k+N)%N];return Math.abs(s/7)});
  if(TU){T.corners=TU.t.map((i,k)=>{let d=hd(i+8)-hd(i-8);d=Math.atan2(Math.sin(d),Math.cos(d));return {n:k+1,i,turn:d>0?1:-1}})}
  // модель скорости: боковое 1,2g, разгон 4 м/с², торможение 9 м/с² — только для зон торможения и проигрыша
  const vm=K.map(k=>Math.min(60,Math.sqrt(11.8/Math.max(k,1e-5))));const v=vm.slice();
  for(let r=0;r<3;r++){for(let j=1;j<=N;j++){const i=(D>0?j:N-j)%N,p=(i-D+N)%N;v[i]=Math.min(v[i],Math.sqrt(v[p]**2+2*4*T.step))}
    for(let j=N;j>=1;j--){const i=(D>0?j:N-j)%N,nx=(i+D+N)%N;v[i]=Math.min(v[i],Math.sqrt(v[nx]**2+2*9*T.step))}}
  T.v=v;const br=v.map((x,i)=>v[(i+D+N)%N]<x-.05);T.brake=new Array(N).fill(false);
  for(let j=0;j<N;j++){const i=(D>0?j:N-j)%N;if(br[i]&&!br[(i-D+N)%N]){const run=[];let q=i;while(br[q]&&run.length<N){run.push(q);q=(q+D+N)%N}
    if(run.length>=4&&v[run[0]]-v[q]>=6)for(const r of run)T.brake[r]=true}}
  // траектория: сглаживание внутри коридора ±5 м
  const nr=i=>{const a=xy[(i-1+N)%N],b=xy[(i+1)%N];const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l,dx/l]};
  let o=new Array(N).fill(0);const NR=xy.map((_,i)=>nr(i));
  for(let it=0;it<600;it++){const q=o.slice();for(let i=0;i<N;i++){const a=(i-4+N)%N,b=(i+4)%N;
      const mx=(xy[a][0]+NR[a][0]*o[a]+xy[b][0]+NR[b][0]*o[b])/2,my=(xy[a][1]+NR[a][1]*o[a]+xy[b][1]+NR[b][1]*o[b])/2;
      q[i]=Math.max(-5,Math.min(5,(mx-xy[i][0])*NR[i][0]+(my-xy[i][1])*NR[i][1]))}o=q}
  T.line=o;
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
  const D=T.rev?-1:1,SF=T.sf||0,ix=k=>((SF+D*k)%N+N)%N;
  // зоны торможения (расчёт) и траектория (приблизительно)
  if(o.extras!==false){let d='';const bp=i=>{const c=T.corners.reduce((m,c)=>{const dd=Math.min(Math.abs(c.i-i),N-Math.abs(c.i-i));return dd<m[0]?[dd,c]:m},[1e9,null])[1];const sg=c?-(c.turn>0?1:-1):1;const [nx,ny]=nrm(i);return [pts[i][0]+nx*sg*6.2,pts[i][1]+ny*sg*6.2]};
    for(let i=0;i<N;i++){if(T.brake[i]&&!T.brake[(i-1+N)%N]){let j=i;let p=bp(i);d+='M'+p[0].toFixed(1)+' '+p[1].toFixed(1);while(T.brake[(j+1)%N]&&j<i+N){j++;p=bp(j%N);d+='L'+p[0].toFixed(1)+' '+p[1].toFixed(1)}}}
    g+=`<path d="${d}" stroke="#e5533d" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    const lp=T.xy.map((p,i)=>{const a=T.xy[(i-1+N)%N],b=T.xy[(i+1)%N],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1,k=T.line[i]/5*2.4/s;return P(p[0]-dy/l*k,p[1]+dx/l*k)});
    g+=`<path d="${lp.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join('')}Z" stroke="#f2efe9" stroke-width=".9" stroke-dasharray="2.2 2" fill="none" opacity=".85"/>`}
  {const i0=ix(Math.round(N*.035));const sg=-1;let d='';const n1=Math.round(N*.05);let e=0;for(let k=0;k<=n1;k++){const i=ix(Math.round(N*.035)+k);const [mx,my]=nrm(i);d+=(k?'L':'M')+(pts[i][0]+mx*sg*9).toFixed(1)+' '+(pts[i][1]+my*sg*9).toFixed(1);e=i}
   let [ex,ey,tx,ty]=nrm(e);tx*=D;ty*=D;const hx=pts[e][0]+ex*sg*9,hy=pts[e][1]+ey*sg*9;g+=`<path d="${d}" stroke="#9a9a9a" stroke-width="1.2" fill="none"/><path d="M${hx+tx*4} ${hy+ty*4}L${hx-tx*1+ex*3} ${hy-ty*1+ey*3}L${hx-tx*1-ex*3} ${hy-ty*1-ey*3}Z" fill="#9a9a9a"/>`}
  // S/F checker
  {const p=pts[SF],[nx,ny,tx,ty]=nrm(SF);let c='';for(let r=0;r<2;r++)for(let q=-3;q<3;q++){const u=q*2.2+1.1,v=(r-.5)*2.2;const X=p[0]+nx*u+tx*v,Y=p[1]+ny*u+ty*v;c+=`<rect x="${(X-1.1).toFixed(2)}" y="${(Y-1.1).toFixed(2)}" width="2.2" height="2.2" fill="${(q+r)&1?'#f2efe9':'#111'}" transform="rotate(${Math.atan2(ty,tx)*57.3} ${X.toFixed(2)} ${Y.toFixed(2)})"/>`}
    g+=c;const lx=p[0]-nx*16,ly=p[1]-ny*16;T._sfl=[lx,ly];g+=`<text x="${lx}" y="${ly+3}" fill="#f2efe9" font-size="8.5" font-weight="600" text-anchor="middle" letter-spacing=".06em" font-family="PL Sans">S/F</text>`}
  T._pts=pts;
  if(T.pit){const q=P(...T.pit[Math.floor(T.pit.length*.5)]),c=P(...T.xy[0]);const dx=q[0]-c[0],dy=q[1]-c[1],l=Math.hypot(dx,dy)||1;}
  // badges with relaxation
  const R=o.r??8.5;const B=T.corners.map(c=>{const p=pts[c.i],[nx,ny]=nrm(c.i);const sg=c.turn>0?1:-1;const x=p[0]+nx*sg*(R+7),y=p[1]+ny*sg*(R+7);return {n:c.n,ax:p[0],ay:p[1],x,y,px:x,py:y}});
  for(let it=0;it<220;it++){for(const b of B){b.x+=(b.px-b.x)*.04;b.y+=(b.py-b.y)*.04;for(const q of B)if(q!==b){const dx=b.x-q.x,dy=b.y-q.y,d=Math.hypot(dx,dy)||.1;if(d<2*R+3){const f=(2*R+3-d)/2;b.x+=dx/d*f*.5;b.y+=dy/d*f*.5}}
      for(let i=0;i<N;i+=2){const p=pts[i],dx=b.x-p[0],dy=b.y-p[1],d=Math.hypot(dx,dy)||.1;if(d<R+5){const f=R+5-d;b.x+=dx/d*f*.4;b.y+=dy/d*f*.4}}
      if(T._sfl){const dx=b.x-T._sfl[0],dy=b.y-T._sfl[1],d=Math.hypot(dx,dy)||.1;if(d<R+12){const f=R+12-d;b.x+=dx/d*f*.5;b.y+=dy/d*f*.5}}
      b.x=Math.max(R+2,Math.min(W-R-2,b.x));b.y=Math.max(R+2,Math.min(H-R-2,b.y))}}
  for(const b of B){g+=`<line x1="${b.ax}" y1="${b.ay}" x2="${b.x}" y2="${b.y}" stroke="rgba(242,239,233,.35)" stroke-width=".8"/><circle cx="${b.x}" cy="${b.y}" r="${R}" fill="#f2efe9" stroke="#000" stroke-width="1.5"/><text x="${b.x}" y="${b.y+3.6}" text-anchor="middle" font-size="${b.n>9?9:10}" font-weight="600" fill="#000" font-family="PL Sans">${b.n}</text>`}
  g+='<g class="tv2-dot" style="display:none"><circle r="7" fill="rgba(229,83,61,.25)"/><circle r="4" fill="#f2efe9" stroke="#000" stroke-width="1.4"/></g>';
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
  let lx=-99;for(const c of [...T.corners].sort((a,b)=>a.i-b.i)){const show=X(c.i)-lx>=13;if(show)lx=X(c.i);g+=`<line x1="${X(c.i)}" x2="${X(c.i)}" y1="${H-pb}" y2="${H-pb+3}" stroke="#7a7a7a"/><text x="${X(c.i)}" y="${H-6}" text-anchor="middle" font-size="8.5" fill="#9a9a9a" font-family="PL Num">${show?c.n:''}</text>`}
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
  SHEET.querySelector('.tv2-back').onclick=()=>{if(RAF){cancelAnimationFrame(RAF);RAF=0}SHEET.classList.remove('on');document.documentElement.classList.remove('tv2-open')};
  const T=await loadTrack(id);const f=facts(id,t,T);const body=SHEET.querySelector('.tv2-body');
  const W=Math.min(body.clientWidth-32,560)||340;
  const mb=B.myBest(id);const laps=B.laps(id);const th=B.theo(laps);const bl=laps.length?laps.reduce((a,l)=>l.ms<a.ms?l:a):null;const sp=bl?B.full(bl):null;
  const tl=n=>n; // номера по геометрии
  body.innerHTML=`<div class="tv2-eb">${esc(WHERE[id]||'')}</div><h2 class="tv2-h1">${esc(t.name)}</h2>
   <div class="tv2-tags">${[T.cw?'По часовой':'Против часовой','Геометрия OSM'].filter(Boolean).map(x=>`<span>${x}</span>`).join('')}</div>
   <div class="tv2-stage"><div class="tv2-pane" data-p="map">${mapSvg(T,T.ter,W,Math.round(W*.97))}
     <div class="tv2-leg">${SEC.map((c,k)=>`<span><i style="background:${c}"></i>S${k+1}</span>`).join('')}${T.pit?'<span><i class="p"></i>Пит</span>':''}<span><i class="b"></i>Торможение</span><span><i class="r"></i>Траектория</span></div>
     <div class="tv2-note">Зоны торможения и траектория — приблизительный расчёт по геометрии трассы, рекомендация, а не замер. Номера поворотов — по официальной схеме.</div>
     ${bl?`<div class="tv2-play"><button type="button" class="tv2-pb" aria-label="Проиграть круг"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button><div class="tv2-pi"><b>Ваш лучший круг · ${B.fmt(bl.ms)}</b><span class="tv2-ps">нажмите, чтобы проиграть (×4)</span></div><div class="tv2-pv"><b>—</b><small>км/ч</small></div></div>`:''}</div></div>
   <div class="tv2-facts">${[['Длина',km(f.L),'км'],['Повороты',f.turns,''],['Перепад',Math.round(T.eMax-T.eMin),'м'],['Макс. уклон',Math.round(T.grade*100),'%'],['Направление',T.cw?'↻':'↺',''],['Высшая точка',Math.round(T.eMax),'м']].map(([l,v,u])=>`<div><span>${l}</span><b>${v}<small>${u}</small></b></div>`).join('')}</div>
   ${INFO[id]?.conf?.length?`<div class="tv2-lbl tv2-lr"><span>Конфигурации</span><small>на карте — отмечена</small></div><div class="tv2-card tv2-conf">${INFO[id].conf.map(c=>`<div class="${c[3]?'on':''}"><span>${esc(c[0])}${c[3]?' <i>на карте</i>':''}</span><b>${c[1]}<small> км</small></b><b>${c[2]}<small> пов.</small></b></div>`).join('')}</div>`:''}
   <div class="tv2-lbl">Рекорд трассы</div><div class="tv2-card tv2-rec"><span class="tv2-av">—</span><span class="tv2-rn"><b>загрузка…</b><small></small></span><b class="tv2-rt">—</b></div>
   <div class="tv2-lbl">Ваш лучший круг</div><div class="tv2-card tv2-best">${mb?`<div class="tv2-bt"><b>${B.fmt(mb)}</b><span class="tv2-dl"></span></div>
     <div class="tv2-bs">${laps.length} ${laps.length===1?'круг':'кругов'}${th.sum?` · теор. <b>${B.fmt(th.sum)}</b>`:''}</div>
     ${sp?`<div class="tv2-sx">${sp.map((s,k)=>`<div style="border-color:${SEC[k]}"><span>S${k+1} · ${km(T.secLen[k])} км</span><b>${(s/1000).toFixed(2).replace('.',',')}</b>${th.best[k]!=null?`<small>${s-th.best[k]<=0?'лучший':'+'+((s-th.best[k])/1000).toFixed(2).replace('.',',')}</small>`:''}</div>`).join('')}</div>`:''}`
     :'<div class="tv2-empty">Ещё нет кругов на этой трассе. Проедьте круг — здесь появятся время, сектора и разница с рекордом.</div>'}</div>
   <div class="tv2-lbl tv2-lr"><span>Профиль высот</span><small>м · номера поворотов</small></div><div class="tv2-card tv2-ele">${eleSvg(T,W-12,128)}</div>
   ${goHtml(id)}
   <button type="button" class="tv2-cta">Выбрать для сессии</button>
   <div class="tv2-src">Геометрия: OpenStreetMap · высоты: Copernicus DEM 90 м · номера поворотов — по официальным схемам, сектора — по геометрии${OFFICIAL[id]?.km?' · длина — официальная':''}</div>`;
  body.querySelector('.tv2-cta').onclick=()=>{B.pick(id);SHEET.classList.remove('on');document.documentElement.classList.remove('tv2-open')};
  void B.record(id).then(r=>{const e=body.querySelector('.tv2-rec');if(!e)return;
    if(!r){const R=INFO[id]?.rec||[];if(!R.length){e.querySelector('.tv2-rn b').textContent='Официальный рекорд не найден';e.querySelector('.tv2-rn small').textContent='первый зачётный круг в Pitlane станет рекордом';return}
      e.outerHTML=R.map(x=>`<div class="tv2-card tv2-rec"><span class="tv2-av">${esc(x[1][0])}</span><span class="tv2-rn"><b>${esc(x[1])}</b><small>${esc([x[2],x[3],x[4]].filter(Boolean).join(' · '))}</small><a href="${x[5]}" target="_blank" rel="noopener">официальный рекорд · источник</a></span><b class="tv2-rt">${x[0].replace('.',',')}</b></div>`).join('');return}
    e.querySelector('.tv2-av').textContent=(String(r.name).replace(/^@/,'')[0]||'·').toUpperCase();e.querySelector('.tv2-rn b').textContent=r.name;
    e.querySelector('.tv2-rn small').textContent=[r.car,r.at?new Date(r.at).toLocaleDateString('ru-RU'):''].filter(Boolean).join(' · ');e.querySelector('.tv2-rt').textContent=B.fmt(r.ms);
    const dl=body.querySelector('.tv2-dl');if(dl&&mb){const d=mb-r.ms;dl.textContent=d<=0?'это рекорд':'+'+(d/1000).toFixed(2).replace('.',',')+' к рекорду'}});
  const pb=body.querySelector('.tv2-pb');if(pb)pb.onclick=()=>play(T,bl,sp,body,pb);
}

function goHtml(id){const g=INFO[id]?.go||{};const L=(u,t)=>`<a href="${u}" target="_blank" rel="noopener">${esc(t||u.replace(/^https?:\/\//,'').replace(/\/$/,''))}</a>`;const ask=g.site?`уточняйте на сайте · ${L(g.site)}`:'уточняйте у трассы';
  const rows=[['Трек-дни и цена',g.price?`${esc(g.price)} · ${L(g.priceSrc,'источник')}`:ask],['Ограничения по шуму',ask],['Адрес',g.addr?esc(g.addr):ask],['Телефон',g.phone?`<a href="tel:${g.phone.replace(/[^+\d]/g,'')}">${esc(g.phone)}</a>`:ask],['Сайт',g.site?L(g.site):'—']];
  return `<div class="tv2-lbl">Как попасть</div><div class="tv2-card tv2-go">${rows.map(([k,v])=>`<div><span>${k}</span><p>${v}</p></div>`).join('')}</div>`}
let RAF=0;
function play(T,bl,sp,body,btn){const dot=body.querySelector('.tv2-dot'),pv=body.querySelector('.tv2-pv b'),ps=body.querySelector('.tv2-ps');if(!dot||!T._pts)return;
  if(RAF){cancelAnimationFrame(RAF);RAF=0;btn.classList.remove('on');return}
  const N=T.N,D=T.rev?-1:1,SF=T.sf||0,ord=[...Array(N)].map((_,k)=>((SF+D*k)%N+N)%N);
  // время на точку ∝ шаг/скорость модели; нормируем к времени сектора (если сектора есть и направление совпадает), иначе к времени круга
  const dt=ord.map(i=>T.step/Math.max(T.v[i],5));const tim=new Array(N);const secs=sp&&!T.rev&&!SF?sp:null;
  if(secs){for(let k=0;k<3;k++){const a=T.sectors[k],b=k<2?T.sectors[k+1]:N;let s=0;for(let j=a;j<b;j++)s+=dt[j];for(let j=a;j<b;j++)tim[j]=dt[j]/s*secs[k]}}
  else{const s=dt.reduce((a,b)=>a+b,0);for(let j=0;j<N;j++)tim[j]=dt[j]/s*bl.ms}
  const cum=[0];for(let j=0;j<N;j++)cum.push(cum[j]+tim[j]);const tot=cum[N];
  const secAvg=k=>{const a=T.sectors[k],b=k<2?T.sectors[k+1]:N;return (b-a)*T.step/((cum[b]-cum[a])/1000)*3.6};
  dot.style.display='';btn.classList.add('on');const t0=performance.now();
  const step=now=>{const t=((now-t0)*4)%tot;let lo=0,hi=N;while(hi-lo>1){const m=(lo+hi)>>1;if(cum[m]<=t)lo=m;else hi=m}
    const f=(t-cum[lo])/(tim[lo]||1),a=T._pts[ord[lo]],b=T._pts[ord[(lo+1)%N]];dot.setAttribute('transform',`translate(${(a[0]+(b[0]-a[0])*f).toFixed(1)} ${(a[1]+(b[1]-a[1])*f).toFixed(1)})`);
    if(secs){const k=T.secOf(lo);pv.textContent=Math.round(secAvg(k));ps.textContent=`S${k+1} · средняя по сектору · ${(t/1000).toFixed(1).replace('.',',')} с`}
    else{pv.textContent=Math.round(N*T.step/(bl.ms/1000)*3.6);ps.textContent=`средняя по кругу · ${(t/1000).toFixed(1).replace('.',',')} с`}
    RAF=requestAnimationFrame(step)};RAF=requestAnimationFrame(step)}
