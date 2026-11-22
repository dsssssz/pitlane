'use strict';
const TOPICS=[["kin","Кинематика"],["dyn","Динамика"],["cons","Законы сохранения"],["stat","Статика"],["hyd","Гидростатика"],["osc","Колебания и волны"],["mkt","МКТ"],["thd","Термодинамика"],["es","Электростатика"],["dc","Постоянный ток"],["mag","Магнитное поле"],["emi","Электромагнитная индукция"],["ac","Контур и переменный ток"],["opt","Геометрическая оптика"],["wopt","Волновая оптика"],["rel","Теория относительности"],["qu","Квантовая физика"],["nuc","Атом и ядро"]];
const TN=Object.fromEntries(TOPICS);
const FM=Object.fromEntries(F.map(f=>[f.id,f]));
const DAY=864e5,LESSON=5,TICKET=20,TICKET_MIN=20,TICKET_MAX_ERR=2;
const $=s=>document.querySelector(s);
const app=$('#app');
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const KC=new Map();
function tex(s,disp){const k=(disp?'D':'i')+s;if(KC.has(k))return KC.get(k);let h;try{h=katex.renderToString(s,{displayMode:!!disp,throwOnError:false,strict:'ignore'})}catch(e){h=esc(s)}KC.set(k,h);return h}
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const pick=a=>a[Math.random()*a.length|0];
const uniq=a=>[...new Set(a)];
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const plural=(n,a,b,c)=>{n=Math.abs(n)%100;const m=n%10;return n>10&&n<20?c:m>1&&m<5?b:m==1?a:c};

/* ---------- state ---------- */
const KEY='formulist.v1';
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}
S=Object.assign({c:{},days:{},goal:20,streak:0,best:0,last:'',tickets:[],vib:true,snd:true,intro:false},S||{});
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const card=id=>S.c[id]||(S.c[id]={e:2.5,i:0,d:0,r:0,l:0,s:0,ok:0,bad:0,mk:0,mks:0});
const seen=id=>S.c[id]&&S.c[id].s;
const mastered=id=>S.c[id]&&S.c[id].i>=7;
const due=()=>F.filter(f=>seen(f.id)&&S.c[f.id].d<=Date.now());
const mistakes=()=>F.filter(f=>S.c[f.id]&&S.c[f.id].mk);
function grade(id,q){ // SM-2, q: 1 wrong, 3 hard, 4 good, 5 easy
  const c=card(id);c.s=1;
  if(q<3){c.r=0;c.i=0;c.l++;c.bad++;c.mk=1;c.mks=0;c.d=Date.now()+10*60e3}
  else if(c.r>0&&c.d>Date.now()){c.ok++;if(c.mk&&++c.mks>=2){c.mk=0;c.mks=0}tick();save();return}
  else{c.r++;c.ok++;c.i=c.r==1?1:c.r==2?3:Math.round(c.i*c.e);c.d=Date.now()+c.i*DAY;
    if(c.mk&&++c.mks>=2){c.mk=0;c.mks=0}}
  c.e=Math.max(1.3,c.e+0.1-(5-q)*(0.08+(5-q)*0.02));
  tick();save();
}
function tick(){const t=today();S.days[t]=(S.days[t]||0)+1;
  if(S.days[t]===S.goal){const y=new Date(Date.now()-DAY);const ys=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');
    S.streak=(S.last===ys?S.streak:0)+1;S.last=t;S.best=Math.max(S.best,S.streak);setTimeout(()=>{toast('🔥 Цель дня выполнена! Серия: '+S.streak);confetti()},400)}}
function streakNow(){const t=today();const y=new Date(Date.now()-DAY);const ys=y.getFullYear()+'-'+String(y.getMonth()+1).padStart(2,'0')+'-'+String(y.getDate()).padStart(2,'0');return (S.last===t||S.last===ys)?S.streak:0}

/* ---------- feedback ---------- */
let AC;
function beep(ok){if(!S.snd)return;try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type='sine';const t=AC.currentTime;
  o.frequency.setValueAtTime(ok?660:220,t);if(ok)o.frequency.exponentialRampToValueAtTime(990,t+.09);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.12,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+(ok?.18:.25));o.connect(g).connect(AC.destination);o.start(t);o.stop(t+.3)}catch(e){}}
function buzz(p){if(S.vib&&navigator.vibrate)try{navigator.vibrate(p)}catch(e){}}
function fb(ok){beep(ok);buzz(ok?12:[30,40,30])}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2200)}
function confetti(){const c=document.createElement('canvas');c.className='confetti';c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;document.body.appendChild(c);const x=c.getContext('2d');x.scale(devicePixelRatio,devicePixelRatio);
  const P=[...Array(90)].map(()=>({x:innerWidth/2,y:innerHeight*.35,vx:(Math.random()-.5)*12,vy:-Math.random()*12-4,r:Math.random()*6+3,c:pick(['#ffb020','#f2efe9','#c9c6bf','#8d8b87']),a:Math.random()*6}));let f=0;
  (function step(){x.clearRect(0,0,innerWidth,innerHeight);P.forEach(p=>{p.vy+=.35;p.x+=p.vx;p.y+=p.vy;p.a+=.2;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r/2,-p.r/4,p.r,p.r/2);x.restore()});if(++f<110)requestAnimationFrame(step);else c.remove()})()}

/* ---------- question generators ---------- */
const OPS=new Set(['=','+','-','<','\\to']);
const REL=new Set(['=','<','\\to']);
const pool=t=>F.filter(f=>f.t===t);
function flipFrac(s){const m=s.match(/^\\frac\{([^{}]+)\}\{([^{}]+)\}$/);return m?`\\frac{${m[2]}}{${m[1]}}`:null}
function qChoice(f){const wrong=shuf(f.w).slice(0,2);const other=shuf(pool(f.t).filter(g=>g.id!==f.id&&g.p[0]===f.p[0])).map(g=>g.f)[0];if(other)wrong.push(other);
  if(wrong.length<3){const o=shuf(pool(f.t).filter(g=>g.id!==f.id))[0];if(o)wrong.push(o.f)}
  return {kind:'choice',tag:'Выбери формулу',title:esc(f.n),opts:shuf([{h:tex(f.f),ok:1},...uniq(wrong).filter(w=>w!==f.f).slice(0,3).map(w=>({h:tex(w)}))])}}
function qFill(f){const idx=f.p.map((p,i)=>i).filter(i=>!OPS.has(f.p[i]));const k=pick(idx);const ans=f.p[k];
  const shown=f.p.map((p,i)=>i===k?'\\boxed{\\,?\\,}':p).join(' ');
  let cands=[];const fl=flipFrac(ans);if(fl)cands.push(fl);
  F.forEach(g=>{if(g.t===f.t)g.p.forEach(p=>{if(!OPS.has(p))cands.push(p)})});
  cands=shuf(uniq(cands).filter(c=>c!==ans&&!f.p.includes(c)));if(fl)cands=[fl,...cands.filter(c=>c!==fl)];
  if(cands.length<3)F.forEach(g=>g.p.forEach(p=>{if(!OPS.has(p)&&p!==ans)cands.push(p)}));
  return {kind:'fill',tag:'Чего не хватает?',title:esc(f.n),box:tex(shown,1),opts:shuf([{h:tex(ans),ok:1},...uniq(cands).slice(0,3).map(c=>({h:tex(c)}))])}}
function qSym(f){const v=pick(f.v);const others=shuf(uniq([...f.v.filter(x=>x[1]!==v[1]).map(x=>x[1]),...shuf(pool(f.t)).flatMap(g=>g.v.map(x=>x[1]))]).filter(m=>m!==v[1]&&!m.startsWith(v[1])));
  return {kind:'sym',tag:'Что за буква?',title:'Что обозначает '+tex(v[0])+'?',box:tex(f.f,1),opts:shuf([{h:esc(v[1]),ok:1},...others.slice(0,3).map(m=>({h:esc(m)}))])}}
const UNITS=uniq(F.flatMap(f=>f.v.map(v=>v[2]))).filter(u=>u!=='—');
function qUnit(f){const vs=f.v.filter(v=>v[2]!=='—'&&v[2]!=='°');const v=pick(vs.length?vs:f.v);
  const others=shuf(UNITS.filter(u=>u!==v[2]));
  return {kind:'unit',tag:'Единицы СИ',title:'В чём измеряется '+tex(v[0])+' <span class="topic">'+esc(v[1])+'</span>',box:tex(f.f,1),opts:shuf([{h:esc(v[2]),ok:1},...others.slice(0,3).map(u=>({h:esc(u)}))])}}
function fmt(n){if(!isFinite(n))return '0';const a=Math.abs(n);let s=a>=100?String(+n.toFixed(0)):a>=1?String(+n.toFixed(2)):String(+n.toPrecision(3));return s.replace('.',',')}
function qProb(f){const [text,ans]=f.q;const m=ans.match(/^(-?[\d,]+)\s*(.*)$/);const val=parseFloat(m[1].replace(',','.'));const unit=m[2];
  const ks=shuf([2,0.5,10,0.1,4,0.25,1.5]);const set=new Set([fmt(val)]);const wr=[];for(const k of ks){const s=fmt(val*k);if(!set.has(s)){set.add(s);wr.push(s)}if(wr.length==3)break}
  return {kind:'prob',tag:'Задача',title:'',prob:esc(text),opts:shuf([{h:esc(fmt(val)+' '+unit),ok:1},...wr.map(w=>({h:esc(w+' '+unit)}))])}}
function qAsm(f){const relI=f.p.findIndex(p=>REL.has(p));const slots=f.p.map((p,i)=>i===relI?null:p);
  const need=slots.filter(x=>x!==null&&!OPS.has(x));
  let distr=[];need.forEach(p=>{const fl=flipFrac(p);if(fl&&!need.includes(fl))distr.push(fl)});
  const near=shuf(pool(f.t).filter(g=>g.id!==f.id)).flatMap(g=>g.p).filter(p=>!OPS.has(p)&&!need.includes(p));
  distr=uniq([...distr,...near]).slice(0,need.length>2?2:3);
  const ops=f.p.filter((p,i)=>i!==relI&&OPS.has(p));
  return {kind:'asm',tag:'Собери формулу',title:esc(f.n),f,relI,tiles:shuf([...f.p.filter((p,i)=>i!==relI),...distr])}}
function qRecall(f){return {kind:'recall',tag:'Вспомни',title:esc(f.n),f}}
function makeQ(f,mode){let kinds=['choice','fill','asm','sym','unit'];if(f.q)kinds.push('prob','prob');
  if(mode==='learn')kinds=['asm','fill','choice'];if(mode==='review')kinds.push('recall','asm');
  const k=pick(kinds);const g={choice:qChoice,fill:qFill,asm:qAsm,sym:qSym,unit:qUnit,prob:qProb,recall:qRecall}[k];const q=g(f);q.f=f;return q}
const sides=(arr)=>{const out=[];let cur=[];arr.forEach(p=>{if(REL.has(p)){out.push(cur);out.push(p);cur=[]}else cur.push(p)});out.push(cur);return out};
const terms=t=>{const r=[];let c=[];t.forEach(p=>{if(p==='+'){r.push(c.join(' '));c=[]}else c.push(p)});r.push(c.join(' '));return r.sort().join('|')};
function asmOk(f,got){const a=sides(f.p),b=sides(got);if(a.length!==b.length)return false;return a.every((s,i)=>typeof s==='string'?s===b[i]:terms(s)===terms(b[i]))}

/* ---------- session runner ---------- */
let SES=null,timerH=null;
function startSession(o){SES=Object.assign({i:0,err:0,res:[],t0:Date.now()},o);document.body.classList.add('quiz');if(o.timed){SES.end=Date.now()+TICKET_MIN*60e3;clearInterval(timerH);timerH=setInterval(()=>{const el=$('#timer');if(!SES||!SES.end){clearInterval(timerH);return}const left=SES.end-Date.now();if(left<=0){clearInterval(timerH);finish(true);return}if(el){el.textContent=mmss(left);el.classList.toggle('low',left<60e3)}},500)}
  location.hash='#/q';renderStep()}
const mmss=ms=>{const s=Math.max(0,Math.ceil(ms/1e3));return (s/60|0)+':'+String(s%60).padStart(2,'0')};
function exitSession(){if(SES&&SES.i>0&&!confirm('Выйти? Прогресс по отвеченным вопросам сохранится.'))return;clearInterval(timerH);SES=null;document.body.classList.remove('quiz');location.hash='#/'}
function head(){const tot=SES.steps.length;return `<div class="qtop"><button class="qx" id="qx">✕</button><div class="qprog"><i style="width:${SES.i/tot*100}%"></i></div>${SES.timed?`<span class="timer" id="timer">${mmss(SES.end-Date.now())}</span>`:''}<span class="qcount">${SES.i+1}/${tot}</span></div>`}
function renderStep(){if(!SES)return;if(SES.i>=SES.steps.length)return finish();setHeader(SES.label,true);const st=SES.steps[SES.i];
  if(st.study)return renderStudy(st.f);
  const q=st.q||(st.q=makeQ(st.f,SES.mode));SES.qStart=Date.now();
  let h=head()+`<div class="qtag">${q.tag}</div>`;
  if(q.kind==='prob')h+=`<div class="prob">${q.prob}</div><div class="qtitle" style="margin-top:12px;font-size:15px;color:var(--mu)">Подсказка: ${esc(q.f.n)}</div>`;
  else h+=`<div class="qtitle">${q.title}<span class="topic">${esc(TN[q.f.t])}</span></div>`;
  if(q.box)h+=`<div class="fbox">${q.box}</div>`;
  if(q.opts){h+=`<div class="opts">${q.opts.map((o,i)=>`<button class="opt" data-i="${i}"><span class="l">${'АБВГ'[i]}</span><span>${o.h}</span></button>`).join('')}</div><div id="fb"></div>`;app.innerHTML=h;
    app.querySelectorAll('.opt').forEach(b=>b.onclick=()=>answerMC(q,+b.dataset.i))}
  else if(q.kind==='asm')renderAsm(q,h);
  else if(q.kind==='recall')renderRecall(q,h);
  $('#qx').onclick=exitSession;scrollTo(0,0)}
function speedGrade(){return Date.now()-SES.qStart<7000?5:4}
function record(f,ok,q){SES.res.push({id:f.id,ok,kind:q?q.kind:'recall'});if(!ok)SES.err++;
  if(!SES.noGrade)grade(f.id,ok===true?speedGrade():typeof ok==='number'?ok:1)}
function answerMC(q,i){if(q.done)return;q.done=1;const ok=!!q.opts[i].ok;const bs=app.querySelectorAll('.opt');
  bs.forEach((b,j)=>{b.disabled=true;if(q.opts[j].ok)b.classList.add('ok');else if(j===i)b.classList.add('bad');else b.classList.add('dim')});
  bs[i].classList.add(ok?'pop':'shake');fb(ok);record(q.f,ok,q);showFeed(q.f,ok)}
function showFeed(f,ok){const el=$('#fb');const st=SES.timed;
  el.innerHTML=`<div class="feed ${ok?'ok':'bad'}"><b>${ok?pick(['Верно!','Точно!','В точку!','Отлично!']):'Неверно'}</b>${ok?'':`<div class="fx">${tex(f.f,1)}</div><small>💡 ${esc(f.h)}</small>`}</div><div style="height:90px"></div>`;
  const s=document.createElement('div');s.className='sticky';s.innerHTML=`<div class="in"><button class="btn pri press" id="next">${SES.i+1>=SES.steps.length?'Завершить':'Дальше'}</button></div>`;app.appendChild(s);
  $('#next').onclick=next;if(ok&&st)setTimeout(()=>{if($('#next'))next()},650);
  if(SES.timed&&SES.err>TICKET_MAX_ERR&&SES.kind==='ticket'){/* continue, result at end */}}
function next(){SES.i++;renderStep()}
function renderAsm(q,h){const f=q.f;const slotsIdx=f.p.map((p,i)=>i).filter(i=>i!==q.relI);let fill=[];
  const draw=()=>{let sl='';let k=0;f.p.forEach((p,i)=>{if(i===q.relI){sl+=`<span class="rel">${tex(p)}</span>`;return}const t=fill[k];sl+=`<span class="slot ${t!=null?'f':''} ${k===fill.length?'cur':''}" data-k="${k}">${t!=null?tex(q.tiles[t]):''}</span>`;k++});
    app.querySelector('.slots').innerHTML=sl;app.querySelectorAll('.tl').forEach(b=>b.classList.toggle('used',fill.includes(+b.dataset.i)));
    app.querySelectorAll('.slot.f').forEach(s=>s.onclick=()=>{if(q.done)return;fill.splice(+s.dataset.k);draw()});
    $('#chk').disabled=fill.length!==slotsIdx.length;$('#chk').style.opacity=fill.length===slotsIdx.length?1:.4};
  app.innerHTML=h+`<div class="slots"></div><div class="tiles">${q.tiles.map((t,i)=>`<button class="tl" data-i="${i}">${tex(t)}</button>`).join('')}</div><p class="sub-t" style="text-align:center;margin-top:12px;font-size:13px">Нажимай на кусочки по порядку. Тапни по заполненной ячейке, чтобы откатить.</p><div id="fb"></div><div style="height:90px"></div><div class="sticky" id="asmBar"><div class="in"><button class="btn" id="clr">Сброс</button><button class="btn pri press" id="chk">Проверить</button></div></div>`;
  app.querySelectorAll('.tl').forEach(b=>b.onclick=()=>{if(q.done||fill.length>=slotsIdx.length)return;fill.push(+b.dataset.i);buzz(6);draw()});
  $('#clr').onclick=()=>{if(!q.done){fill=[];draw()}};
  $('#chk').onclick=()=>{if(q.done||fill.length!==slotsIdx.length)return;q.done=1;const got=[];let k=0;f.p.forEach((p,i)=>{got.push(i===q.relI?p:q.tiles[fill[k++]])});
    const ok=asmOk(f,got);fb(ok);app.querySelector('.slots').classList.add(ok?'pop':'shake');app.querySelectorAll('.slot').forEach(s=>s.style.borderColor=ok?'var(--ok)':'var(--bad)');
    $('#asmBar').remove();record(f,ok,q);showFeed(f,ok)};draw()}
function renderRecall(q,h){const f=q.f;app.innerHTML=h+`<div class="fbox" id="rb" style="color:var(--mu);font-size:15px;flex-direction:column;gap:6px"><div style="font-size:34px">🤔</div>Вспомни формулу целиком.<br>Проговори её вслух — так запоминается лучше.</div><div id="rx"></div><div style="height:110px"></div><div class="sticky"><div class="in" id="rbar"><button class="btn pri press" id="show">Показать ответ</button></div></div>`;
  $('#show').onclick=()=>{$('#rb').outerHTML=`<div class="fbox pop">${tex(f.f,1)}</div>`;$('#rx').innerHTML=`<div class="note hook"><div class="h">Как запомнить</div>${esc(f.h)}</div>`;
    $('#rbar').innerHTML=`<div class="grade" style="width:100%"><button class="g1" data-q="1">Не вспомнил<small>&lt;10 мин</small></button><button data-q="3">С трудом<small>скоро</small></button><button data-q="4">Вспомнил<small>${(card(f.id).r+1)<2?'1 д':'позже'}</small></button><button class="g4" data-q="5">Легко<small>надолго</small></button></div>`;
    app.querySelectorAll('.grade button').forEach(b=>b.onclick=()=>{const g=+b.dataset.q;fb(g>=3);SES.res.push({id:f.id,ok:g>=3,kind:'recall'});if(g<3)SES.err++;grade(f.id,g);next()})}}
function renderStudy(f){app.innerHTML=head()+`<div class="qtag">Новая формула</div>`+cardHTML(f,true)+`<div style="height:90px"></div><div class="sticky"><div class="in"><button class="btn pri press" id="got">Понял, дальше</button></div></div>`;
  $('#qx').onclick=exitSession;$('#got').onclick=()=>{card(f.id);save();next()};scrollTo(0,0)}
function finish(timeout){clearInterval(timerH);const s=SES;SES=null;document.body.classList.remove('quiz');if(!s)return;
  const qs=s.res.length,ok=s.res.filter(r=>r.ok).length;const wrong=uniq(s.res.filter(r=>!r.ok).map(r=>r.id));
  let em='🎯',title='Готово',sub='';
  if(s.kind==='ticket'){const pass=!timeout&&s.err<=TICKET_MAX_ERR&&qs===s.steps.length;em=pass?'🏁':'⛔';title=pass?'Билет сдан':'Билет не сдан';
    sub=timeout?'Время вышло.':`Ошибок: ${s.err} из ${TICKET_MAX_ERR} допустимых · ${mmss(Date.now()-s.t0)}`;
    S.tickets.unshift({d:Date.now(),err:s.err,ok:pass,n:qs,t:Date.now()-s.t0});S.tickets=S.tickets.slice(0,50);save();if(pass)confetti()}
  else if(s.kind==='lesson'){em='📗';title='Урок пройден';sub=`Новые формулы теперь в повторениях. Следующее — завтра.`;confetti()}
  else{sub=`Верно ${ok} из ${qs}`;if(qs&&ok===qs){em='🔥';confetti()}}
  setHeader('Результат',true);
  app.innerHTML=`<div class="res"><div class="em">${em}</div><h1>${title}</h1><p class="sub-t">${sub}</p>
   <div class="stat3"><div class="card"><b>${ok}</b><small>верно</small></div><div class="card"><b style="color:${s.err?'var(--bad)':'inherit'}">${qs-ok}</b><small>ошибок</small></div><div class="card"><b>${qs?Math.round(ok/qs*100):0}%</b><small>точность</small></div></div></div>
   ${wrong.length?`<h2>Разбор ошибок</h2>`+wrong.map(id=>refItem(FM[id])).join(''):''}
   <div style="margin-top:16px">${wrong.length?`<button class="btn acb press" id="rw">Исправить ошибки сейчас</button>`:''}<button class="btn pri press" id="again">${s.kind==='ticket'?'Новый билет':s.kind==='lesson'?'Следующий урок':'Ещё раз'}</button><button class="btn" id="home">На главную</button></div>`;
  bindRef();$('#home').onclick=()=>location.hash='#/';
  $('#again').onclick=()=>s.kind==='ticket'?startTicket():s.kind==='lesson'?startLesson(s.topic):s.kind==='marathon'?startMarathon():s.kind==='mistakes'?startMistakes():startReview();
  if($('#rw'))$('#rw').onclick=()=>startSession({kind:'fix',label:'Работа над ошибками',mode:'review',steps:shuf(wrong.flatMap(id=>[{f:FM[id]},{f:FM[id]}]))})}

/* ---------- modes ---------- */
function nextTopic(){return TOPICS.find(([t])=>pool(t).some(f=>!seen(f.id)))}
function startLesson(t){t=t||(nextTopic()||TOPICS[0])[0];let fs=pool(t).filter(f=>!seen(f.id)).slice(0,LESSON);
  if(!fs.length){toast('Тема выучена — повторяем');return startReview(t)}
  const steps=[];fs.forEach((f,i)=>{steps.push({study:1,f});if(i>0)steps.push({f:fs[i-1]})});steps.push({f:fs[fs.length-1]});
  shuf(fs).forEach(f=>steps.push({f}));steps.push(...shuf(fs).map(f=>({f,q:qAsm(f)})));
  steps.forEach(s=>{if(s.q)s.q.f=s.f});
  startSession({kind:'lesson',topic:t,label:TN[t],mode:'learn',steps})}
function startReview(t){let fs=due().filter(f=>!t||f.t===t);
  if(fs.length<5)fs=fs.concat(shuf(F.filter(f=>seen(f.id)&&(!t||f.t===t)&&!fs.includes(f))).sort((a,b)=>S.c[a.id].d-S.c[b.id].d).slice(0,10-fs.length));
  if(!fs.length){toast('Сначала пройди урок');return startLesson(t)}
  fs=fs.sort((a,b)=>S.c[a.id].d-S.c[b.id].d).slice(0,20);
  // interleaving: разные темы вперемешку, но одна и та же формула не подряд
  startSession({kind:'review',label:'Повторение',mode:'review',steps:shuf(fs).map(f=>({f}))})}
function startTicket(){const base=F.filter(f=>seen(f.id));const src=base.length>=TICKET?base:F;
  // билет как в ПДД: по одному-два вопроса из разных тем
  const byT=TOPICS.map(([t])=>shuf(src.filter(f=>f.t===t))).filter(a=>a.length);const out=[];let r=0;while(out.length<TICKET){const a=byT[r%byT.length];const f=a[(r/byT.length)|0];if(f&&!out.includes(f))out.push(f);r++;if(r>2000)break}
  startSession({kind:'ticket',label:'Билет',mode:'exam',timed:true,steps:shuf(out).map(f=>{const q=makeQ(f,'exam');return {f,q:q.kind==='recall'?qChoice(f):q}})})}
function startMarathon(){startSession({kind:'marathon',label:'Марафон',mode:'exam',steps:shuf(F).map(f=>({f}))})}
function startMistakes(){const m=mistakes();if(!m.length){toast('Ошибок нет — так держать');return}startSession({kind:'mistakes',label:'Работа над ошибками',mode:'review',steps:shuf(m).map(f=>({f}))})}
function startTopicTest(t){startSession({kind:'test',label:TN[t],mode:'exam',steps:shuf(pool(t)).slice(0,12).map(f=>({f}))})}

/* ---------- views ---------- */
function setHeader(t,sub){$('#title').innerHTML=sub?esc(t):'<span class="logo">ƒ</span>Формулист';document.querySelector('.top').classList.toggle('sub',!!sub);const s=streakNow();$('#streak').innerHTML=`<b>🔥</b>${s}`}
function ring(v,max){const p=Math.min(1,v/max),R=30,C=2*Math.PI*R;return `<svg class="ring" width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="${R}" fill="none" stroke="#202023" stroke-width="7"/><circle cx="38" cy="38" r="${R}" fill="none" stroke="${p>=1?'#ffb020':'#c9c6bf'}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-p)}" transform="rotate(-90 38 38)" style="transition:stroke-dashoffset .8s"/><text x="38" y="43" text-anchor="middle" fill="#f2efe9" font-size="15" font-weight="800">${Math.min(v,999)}</text></svg>`}
function vHome(){setHeader();const d=due().length,m=mistakes().length,sn=F.filter(f=>seen(f.id)).length,ms=F.filter(f=>mastered(f.id)).length,td=S.days[today()]||0;const nt=nextTopic();
  const main=d?`<button class="cta ac press" id="go"><div>Повторить ${d} ${plural(d,'формулу','формулы','формул')}<br><span>интервальное повторение</span></div>→</button>`
   :nt?`<button class="cta press" id="go"><div>${sn?'Следующий урок':'Начать первый урок'}<br><span>${esc(nt[1])} · 5 формул · 3 мин</span></div>→</button>`
   :`<button class="cta press" id="go"><div>Сдать билет<br><span>всё выучено</span></div>→</button>`;
  app.innerHTML=`<div class="hero">${ring(td,S.goal)}<div class="k">СЕГОДНЯ · ЦЕЛЬ ${S.goal}</div><div class="big">${sn}<small> / ${F.length} формул</small></div><div class="k">${ms} выучено надолго · серия ${streakNow()} ${plural(streakNow(),'день','дня','дней')}</div>${main}</div>
  <h2>Тренировка</h2><div class="grid">
   <a class="tile press" href="#/tickets"><span class="ic">▣</span><div><b>Билеты</b><small>20 вопросов · 20 мин</small></div></a>
   <button class="tile press" id="mar" style="text-align:left"><span class="ic">∞</span><div><b>Марафон</b><small>все ${F.length} подряд</small></div></button>
   <button class="tile press" id="mis" style="text-align:left"><span class="ic">✎</span><div><b>Ошибки <span class="n">${m||''}</span></b><small>${m?'работа над ошибками':'пока пусто'}</small></div></button>
   <a class="tile press" href="#/ref"><span class="ic">⌕</span><div><b>Шпаргалка</b><small>поиск по формулам</small></div></a></div>
  <h2>Темы</h2>${TOPICS.slice(0,4).map(topicRow).join('')}<a class="btn" href="#/topics">Все ${TOPICS.length} тем</a>
  <h2>Как работает методика</h2><div class="card method"><ol style="margin:0;padding-left:20px">
   <li><b>Короткий урок</b> — 5 формул: смысл, буквы, крючок для памяти, ловушка.</li>
   <li><b>Активное вспоминание</b> — собираешь формулу из кусочков, вставляешь пропуск, ловишь подмену.</li>
   <li><b>Интервалы</b> — формула вернётся через 1, 3, 7, 16… дней, ровно когда начнёшь забывать.</li>
   <li><b>Вперемешку</b> — темы чередуются, как на ЕГЭ.</li>
   <li><b>Ошибки</b> копятся отдельно и уходят только после двух верных ответов подряд.</li></ol></div>
  <a class="btn" href="#/settings" style="margin-top:12px">⚙ Настройки</a>`;
  $('#go').onclick=()=>d?startReview():nt?startLesson():startTicket();$('#mar').onclick=startMarathon;$('#mis').onclick=startMistakes}
function topicStats(t){const p=pool(t);return {n:p.length,s:p.filter(f=>seen(f.id)).length,m:p.filter(f=>mastered(f.id)).length}}
function topicRow([t,n],i){const s=topicStats(t);return `<a class="row press" href="#/topic/${t}"><span class="num">${TOPICS.findIndex(x=>x[0]===t)+1}</span><div class="grow"><b>${esc(n)}</b><small>${s.n} ${plural(s.n,'формула','формулы','формул')} · изучено ${s.s}</small><div class="bar"><i class="m" style="width:${s.m/s.n*100}%"></i><i style="width:${(s.s-s.m)/s.n*100}%"></i></div></div><span class="chev">›</span></a>`}
function vTopics(){setHeader();app.innerHTML=`<h1>Темы</h1><p class="sub-t">Школьная физика и ЕГЭ — ${F.length} формул. Оранжевое — выучено надолго, светлое — в процессе.</p>`+TOPICS.map(topicRow).join('')}
function vTopic(t){setHeader(TN[t],true);const p=pool(t),s=topicStats(t);
  app.innerHTML=`<h1>${esc(TN[t])}</h1><p class="sub-t">${s.s} из ${s.n} изучено · ${s.m} надолго</p>
   <button class="btn pri press" id="l">${s.s<s.n?'Урок: следующие '+Math.min(LESSON,s.n-s.s)+' формул':'Все формулы изучены'}</button>
   ${s.s?'<button class="btn press" id="r">Повторить тему</button>':''}<button class="btn press" id="tt">Тест по теме</button>
   <h2>Формулы</h2>${p.map(refItem).join('')}`;
  $('#l').onclick=()=>startLesson(t);if($('#r'))$('#r').onclick=()=>startReview(t);$('#tt').onclick=()=>startTopicTest(t);bindRef()}
function refItem(f){return `<a class="ritem press" href="#/f/${f.id}"><span class="dot ${mastered(f.id)?'m':seen(f.id)?'s':''}"></span><div class="grow"><b>${esc(f.n)}</b><div class="fx">${tex(f.f)}</div></div><span class="chev" style="color:#555">›</span></a>`}
function bindRef(){}
function cardHTML(f,study){return `<div class="fc"><div class="qtitle">${esc(f.n)}<span class="topic">${esc(TN[f.t])}</span></div><div class="fbox">${tex(f.f,1)}</div>
 <div class="vars">${f.v.map(v=>`<div class="var"><span class="s">${tex(v[0])}</span><span class="d">${esc(v[1])}</span><span class="u">${esc(v[2])}</span></div>`).join('')}</div>
 <div class="note"><div class="h">Смысл</div>${esc(f.m)}</div><div class="note hook"><div class="h">Как запомнить</div>${esc(f.h)}</div><div class="note trap"><div class="h">Ловушка</div>${esc(f.x)}</div></div>`}
function related(f){const syms=new Set(f.v.map(v=>v[0]));return F.filter(g=>g.id!==f.id&&g.t===f.t&&g.v.some(v=>syms.has(v[0]))).slice(0,4)}
function vFormula(id){const f=FM[id];if(!f)return vHome();setHeader(TN[f.t],true);const c=S.c[id];
  const st=!c||!c.s?'Ещё не изучена':mastered(id)?`Выучена · повтор через ${Math.max(0,Math.ceil((c.d-Date.now())/DAY))} дн.`:c.d<=Date.now()?'Пора повторить':`Повтор через ${Math.max(1,Math.ceil((c.d-Date.now())/DAY))} дн.`;
  const rel=related(f);app.innerHTML=cardHTML(f)+`<p class="sub-t" style="margin-top:12px">${st}${c&&c.s?` · верно ${c.ok}, ошибок ${c.bad}`:''}</p>
   <button class="btn pri press" id="tr">Потренировать эту формулу</button>
   ${rel.length?`<h2>Связанные формулы</h2>`+rel.map(refItem).join(''):''}`;
  $('#tr').onclick=()=>startSession({kind:'one',label:f.n,mode:'review',steps:[{f,q:qAsm(f)},{f,q:qFill(f)},{f,q:qChoice(f)},{f,q:f.q?qProb(f):qSym(f)}].map(s=>(s.q.f=f,s))})}
function vRef(){setHeader();const qv=sessionStorage.getItem('fq')||'';
  app.innerHTML=`<h1>Справочник</h1><p class="sub-t">Шпаргалка по всем формулам. Ищи по названию, букве или величине.</p><div class="search"><input id="q" type="search" placeholder="Например: сила, ёмкость, λ, Ом" value="${esc(qv)}" autocomplete="off"></div><div id="list"></div>`;
  const draw=()=>{const s=$('#q').value.trim().toLowerCase();sessionStorage.setItem('fq',s);
    const words=s.split(/\s+/).filter(Boolean);const m=F.filter(f=>{const hay=(f.n+' '+TN[f.t]+' '+f.v.map(v=>v[1]+' '+v[2]+' '+v[0]).join(' ')+' '+f.f).toLowerCase().replace(/\\/g,'');return words.every(w=>hay.includes(w.replace(/λ/,'lambda').replace(/ω/,'omega').replace(/ρ/,'rho').replace(/ν/,'nu').replace(/η/,'eta').replace(/φ/,'varphi').replace(/μ/,'mu').replace(/ε/,'varepsilon').replace(/σ/,'sigma'))||hay.includes(w))});
    $('#list').innerHTML=m.length?TOPICS.map(([t,n])=>{const g=m.filter(f=>f.t===t);return g.length?`<h2>${esc(n)}</h2>`+g.map(refItem).join(''):''}).join(''):'<div class="empty">Ничего не нашлось</div>'};
  $('#q').oninput=draw;draw()}
function vTickets(){setHeader();const h=S.tickets;const passed=h.filter(t=>t.ok).length;
  app.innerHTML=`<h1>Билеты</h1><p class="sub-t">Как экзамен в ГИБДД: ${TICKET} вопросов из всех тем, ${TICKET_MIN} минут, можно ошибиться максимум ${TICKET_MAX_ERR} раза. Правильный ответ показывается сразу.</p>
  <button class="btn acb press" id="t">Взять случайный билет</button><button class="btn press" id="m">Марафон — все ${F.length} формул</button><button class="btn press" id="e">Работа над ошибками (${mistakes().length})</button>
  <h2>История · сдано ${passed} из ${h.length}</h2>${h.length?h.slice(0,15).map(t=>`<div class="row"><span class="num" style="color:${t.ok?'var(--ok)':'var(--bad)'}">${t.ok?'✓':'✕'}</span><div class="grow"><b>${t.ok?'Сдан':'Не сдан'} · ${t.err} ${plural(t.err,'ошибка','ошибки','ошибок')}</b><small>${new Date(t.d).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})} · ${mmss(t.t)}</small></div></div>`).join(''):'<div class="empty">Ещё не было билетов</div>'}`;
  $('#t').onclick=startTicket;$('#m').onclick=startMarathon;$('#e').onclick=startMistakes}
function vStats(){setHeader();const sn=F.filter(f=>seen(f.id)).length,ms=F.filter(f=>mastered(f.id)).length;let ok=0,bad=0;Object.values(S.c).forEach(c=>{ok+=c.ok;bad+=c.bad});
  const days=[...Array(14)].map((_,i)=>{const d=new Date(Date.now()-(13-i)*DAY);const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');return S.days[k]||0});const mx=Math.max(S.goal,...days);
  const wk=[...Array(7)].map((_,i)=>F.filter(f=>seen(f.id)&&S.c[f.id].d<Date.now()+(i+1)*DAY&&S.c[f.id].d>=Date.now()+i*DAY-(i?0:1e13)).length);
  app.innerHTML=`<h1>Прогресс</h1><div class="stat3"><div class="card"><b>${sn}</b><small>изучено из ${F.length}</small></div><div class="card"><b style="color:var(--ac)">${ms}</b><small>выучено надолго</small></div><div class="card"><b>${ok+bad?Math.round(ok/(ok+bad)*100):0}%</b><small>точность</small></div></div>
  <div class="stat3" style="margin-top:8px"><div class="card"><b>🔥${streakNow()}</b><small>серия дней</small></div><div class="card"><b>${S.best}</b><small>рекорд серии</small></div><div class="card"><b>${S.tickets.filter(t=>t.ok).length}</b><small>билетов сдано</small></div></div>
  <h2>Активность за 14 дней</h2><div class="card"><div class="days">${days.map((v,i)=>`<i class="${i==13?'t':v>=S.goal?'g':''}" style="height:${Math.max(4,v/mx*100)}%"></i>`).join('')}</div><small style="color:var(--mu)">ответов в день · цель ${S.goal}</small></div>
  <h2>Повторения на неделю</h2><div class="card"><div class="days">${wk.map((v,i)=>`<i class="${i?'g':'t'}" style="height:${Math.max(4,v/Math.max(1,...wk)*100)}%"></i>`).join('')}</div><small style="color:var(--mu)">ближайшие 24 ч: ${wk[0]} · всего за неделю: ${wk.reduce((a,b)=>a+b,0)}</small></div>
  <h2>По темам</h2>${TOPICS.map(topicRow).join('')}`}
function vSettings(){setHeader('Настройки',true);
  app.innerHTML=`<h2 style="margin-top:6px">Цель на день</h2><div class="chips">${[10,20,40,60].map(g=>`<button class="chip ${S.goal==g?'on':''}" data-g="${g}">${g} ответов</button>`).join('')}</div>
  <h2>Отклик</h2><div class="switch" data-k="vib"><span>Вибрация (Android)</span><span class="tg ${S.vib?'on':''}"></span></div><div class="switch" data-k="snd"><span>Звук ответа</span><span class="tg ${S.snd?'on':''}"></span></div>
  <h2>Данные</h2><p class="sub-t">Прогресс хранится только на этом устройстве, без аккаунта. Приложение работает офлайн — добавь его на экран «Домой».</p>
  <button class="btn" id="exp">Скопировать резервную копию</button><button class="btn" id="imp">Восстановить из копии</button><button class="btn" id="rst" style="color:var(--bad)">Сбросить весь прогресс</button>
  <p class="sub-t" style="margin-top:20px;font-size:13px">Формулист · ${F.length} формул · школьная программа и ЕГЭ</p>`;
  app.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{S.goal=+b.dataset.g;save();vSettings()});
  app.querySelectorAll('.switch').forEach(b=>b.onclick=()=>{S[b.dataset.k]=!S[b.dataset.k];save();vSettings();if(b.dataset.k==='vib')buzz(15)});
  $('#exp').onclick=async()=>{try{await navigator.clipboard.writeText(btoa(unescape(encodeURIComponent(JSON.stringify(S)))));toast('Скопировано')}catch(e){prompt('Скопируй код:',btoa(unescape(encodeURIComponent(JSON.stringify(S)))))}};
  $('#imp').onclick=()=>{const v=prompt('Вставь код резервной копии');if(!v)return;try{const o=JSON.parse(decodeURIComponent(escape(atob(v.trim()))));if(!o||typeof o.c!=='object')throw 0;S=Object.assign(S,o);save();toast('Прогресс восстановлен')}catch(e){toast('Код не подошёл')}};
  $('#rst').onclick=()=>{if(confirm('Точно сбросить весь прогресс?')){localStorage.removeItem(KEY);location.reload()}}}

/* ---------- router ---------- */
function route(){const h=location.hash.slice(1)||'/';const [_,a,b]=h.split('/');
  if(a!=='q'&&SES){clearInterval(timerH);SES=null;document.body.classList.remove('quiz')}
  document.querySelectorAll('.tabs a').forEach(x=>x.classList.toggle('on',x.dataset.t===({'':'home',topics:'topics',topic:'topics',tickets:'tickets',ref:'ref',f:'ref',stats:'stats'}[a||''])));
  app.style.animation='none';app.offsetHeight;app.style.animation='';
  if(a==='q'){if(!SES)location.hash='#/';return}
  ({topics:vTopics,topic:()=>vTopic(TN[b]?b:'kin'),tickets:vTickets,ref:vRef,f:()=>vFormula(b),stats:vStats,settings:vSettings}[a]||vHome)();if(a!=='ref')scrollTo(0,0)}
$('#back').onclick=()=>{if(SES)return exitSession();history.length>1?history.back():location.hash='#/'};
addEventListener('hashchange',route);route();
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
