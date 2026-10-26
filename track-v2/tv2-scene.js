import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SEC} from './tv2.js';
function rng(s){return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function vnoise(seed){const r=rng(seed),G=[];for(let i=0;i<4096;i++)G.push(r());const h=(i,j)=>G[((i*73856093)^(j*19349663))&4095];
  return (x,y)=>{const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);return (h(i,j)*(1-sx)+h(i+1,j)*sx)*(1-sy)+(h(i,j+1)*(1-sx)+h(i+1,j+1)*sx)*sy}}
export async function run(T,TER,id,mode,host,W,H,info={}){
  const chase=mode==='chase';const N=T.N,HW=id==='sochi'?7.5:6.5,EX=chase?1.0:2.2;
  const xs=T.xy.map(p=>p[0]),ys=T.xy.map(p=>p[1]);const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const EXT=Math.max(...T.xy.map(p=>p[0]))-Math.min(...T.xy.map(p=>p[0]))+Math.max(...T.xy.map(p=>p[1]))-Math.min(...T.xy.map(p=>p[1]));const base=T.eMin-4;const Y=h=>(h-base)*EX;
  // DEM
  const n=TER.n;const hv=(i,j)=>TER.h[Math.max(0,Math.min(n-1,j))][Math.max(0,Math.min(n-1,i))];
  const cr=(p0,p1,p2,p3,t)=>p1+.5*t*(p2-p0+t*(2*p0-5*p1+4*p2-p3+t*(3*(p1-p2)+p3-p0)));
  const dem=(x,y)=>{const u=(x-TER.x0)/(TER.x1-TER.x0)*(n-1),v=(y-TER.y0)/(TER.y1-TER.y0)*(n-1);const i=Math.floor(u),j=Math.floor(v),fx=u-i,fy=v-j;
    const r=[-1,0,1,2].map(dj=>cr(hv(i-1,j+dj),hv(i,j+dj),hv(i+1,j+dj),hv(i+2,j+dj),fx));return cr(r[0],r[1],r[2],r[3],fy)};
  // offset DEM so it agrees with track on average
  let off=0;for(let i=0;i<N;i+=5)off+=T.ele[i]-dem(...T.xy[i]);off/=Math.ceil(N/5);
  const demA=(x,y)=>dem(x,y)+off;
  // samples
  const P=T.xy.map((p,i)=>new THREE.Vector3(p[0]-cx,Y(T.ele[i]),-(p[1]-cy)));
  const at=t=>{t=((t%N)+N)%N;const i=Math.floor(t),f=t-i,a=P[i],b=P[(i+1)%N];const p=a.clone().lerp(b,f);
    const q=P[(i+3)%N].clone().sub(P[(i-3+N)%N]);q.y=0;q.normalize();return {p,tg:q,rt:new THREE.Vector3(-q.z,0,q.x)}};
  // pit (3D)
  let PIT=null;if(T.pit){PIT=T.pit.map(([x,y])=>{let bj=0,bd=1e9;for(let j=0;j<N;j++){const d=(T.xy[j][0]-x)**2+(T.xy[j][1]-y)**2;if(d<bd){bd=d;bj=j}}return {v:new THREE.Vector3(x-cx,Y(T.ele[bj]),-(y-cy)),j:bj,d:Math.sqrt(bd)}})}
  // spatial hash
  const CS=24,hash=new Map();const put=(x,z,o)=>{const k=Math.floor(x/CS)+','+Math.floor(z/CS);(hash.get(k)||hash.set(k,[]).get(k)).push(o)};
  P.forEach((p,i)=>put(p.x,p.z,{x:p.x,z:p.z,y:p.y,w:HW}));
  if(PIT)for(let i=0;i<PIT.length-1;i++){const a=PIT[i].v,b=PIT[i+1].v,L=a.distanceTo(b);for(let s=0;s<=L;s+=4){const p=a.clone().lerp(b,s/L);put(p.x,p.z,{x:p.x,z:p.z,y:p.y,w:4})}}
  const near=(x,z,R=2)=>{let best=null,bd=1e9;const i0=Math.floor(x/CS),j0=Math.floor(z/CS);for(let i=-R;i<=R;i++)for(let j=-R;j<=R;j++){const L=hash.get((i0+i)+','+(j0+j));if(L)for(const o of L){const d=Math.hypot(o.x-x,o.z-z)-o.w;if(d<bd){bd=d;best=o}}}return [bd,best]};
  // renderer
  const R=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});R.setPixelRatio(Math.min(2,window.devicePixelRatio||1));R.setSize(W,H);
  R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=chase?1.55:1.6;R.outputColorSpace=THREE.SRGBColorSpace;R.shadowMap.enabled=true;R.shadowMap.type=THREE.PCFSoftShadowMap;
  const cv=R.domElement;cv.style.cssText=`position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
  const S=new THREE.Scene();const pm=new THREE.PMREMGenerator(R);const ENV=pm.fromScene(new RoomEnvironment(),.04).texture;
  {const c=document.createElement('canvas');c.width=4;c.height=256;const x=c.getContext('2d');const g=x.createLinearGradient(0,0,0,256);
   if(chase){g.addColorStop(0,'#060708');g.addColorStop(.3,'#141619');g.addColorStop(.47,'#3a3b3d');g.addColorStop(.5,'#45433f');g.addColorStop(1,'#1a1a1a')}else{g.addColorStop(0,'#000');g.addColorStop(1,'#0c0c0d')}
   x.fillStyle=g;x.fillRect(0,0,4,256);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;S.background=t}
  S.fog=chase?new THREE.Fog(0x202225,180,1100):new THREE.FogExp2(0x0b0b0c,0.00028);
  S.add(new THREE.HemisphereLight(0xd6d9df,0x16171a,chase?1.1:.62));
  const sun=new THREE.DirectionalLight(0xfff0dc,chase?2.4:4.2);S.add(sun);S.add(sun.target);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.4;
  // ---- terrain
  const ex=x=>x-cx,ez=y=>-(y-cy);const tx0=TER.x0+20,tx1=TER.x1-20,ty0=TER.y0+20,ty1=TER.y1-20;
  const cell=chase?5:7;const nx=Math.round((tx1-tx0)/cell),ny=Math.round((ty1-ty0)/cell);
  const pos=[],col=[],idx=[];const nz=vnoise(7),nz2=vnoise(11);const DIST=[];
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){const x=tx0+(tx1-tx0)*i/nx,y=ty0+(ty1-ty0)*j/ny,X=ex(x),Z=ez(y);
    let [d,o]=near(X,Z,3);let h=Y(demA(x,y));if(o){const fl=o.y-0.25;const t=Math.min(1,Math.max(0,(d-16)/55)),s=t*t*(3-2*t);h=fl*(1-s)+h*s}
    pos.push(X,h,Z);DIST.push(d);
    const v=nz(x/60,y/60)*.6+nz2(x/9,y/9)*.4;let c;
    if(d<11){const k=.05+.015*nz2(x/3,y/3);c=[k*1.02,k,k*.95]}       // runoff gravel/asphalt
    else if(d<14){c=[.03,.03,.03]}
    else{const k=(chase?.03:.05)+(chase?.026:.03)*v;c=chase?[k*.95,k*1.06,k*.9]:[k,k*1.01,k*.98]}
    col.push(...c)}
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;idx.push(a,c,b,b,c,d)}
  const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));tg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));tg.setIndex(idx);tg.computeVertexNormals();
  // fix winding (Z flipped) -> ensure normals up
  {const nm=tg.attributes.normal;let s=0;for(let i=0;i<nm.count;i+=50)s+=nm.getY(i);if(s<0){for(let k=0;k<idx.length;k+=3){const t=idx[k+1];idx[k+1]=idx[k+2];idx[k+2]=t}tg.setIndex(idx);tg.computeVertexNormals()}}
  const terr=new THREE.Mesh(tg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,envMapIntensity:.2}));terr.receiveShadow=true;S.add(terr);
  if(id==='sochi'){const w=new THREE.Mesh(new THREE.PlaneGeometry(9000,9000),new THREE.MeshStandardMaterial({color:0x0c1013,roughness:.12,metalness:.3,envMapIntensity:.6,envMap:ENV}));w.rotation.x=-Math.PI/2;w.position.y=Y(T.eMin-4);S.add(w)}
  // ---- ribbons
  const mk=(geo,mat,sh=true)=>{const m=new THREE.Mesh(geo,mat);m.receiveShadow=true;m.castShadow=sh;S.add(m);return m};
  function ribbon(t0,t1,dt,a,b,ya,yb,colFn,uv){const v=[],c=[],u=[],ix=[];let k=0,dist=0,prev=null;
    for(let t=t0;t<=t1+1e-6;t+=dt){const {p,rt}=at(t);if(prev)dist+=p.distanceTo(prev);prev=p;
      const A=p.clone().addScaledVector(rt,a),B=p.clone().addScaledVector(rt,b);A.y+=ya;B.y+=yb;v.push(A.x,A.y,A.z,B.x,B.y,B.z);u.push(0,dist/uv,1,dist/uv);
      const cc=colFn?colFn(t,k):[1,1,1];c.push(...cc,...cc);if(k){const q=2*k;ix.push(q-2,q-1,q,q-1,q+1,q)}k++}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(ix);g.computeVertexNormals();
    const nm=g.attributes.normal;if(nm.getY(0)<0&&Math.abs(ya-yb)<1){for(let q=0;q<ix.length;q+=3){const t=ix[q+1];ix[q+1]=ix[q+2];ix[q+2]=t}g.setIndex(ix);g.computeVertexNormals()}
    return g}
  // asphalt texture
  const asT=(()=>{const c=document.createElement('canvas');c.width=256;c.height=512;const x=c.getContext('2d');const im=x.createImageData(256,512);const r=rng(3);
    for(let j=0;j<512;j++)for(let i=0;i<256;i++){const u=i/256;let k=150+r()*42-21;const rl=Math.exp(-(((u-.5)/.16)**2));k-=rl*26;if(u<.03||u>.97)k-=12;const o=(j*256+i)*4;im.data[o]=im.data[o+1]=im.data[o+2]=k;im.data[o+3]=255}
    x.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t})();
  const asM=new THREE.MeshStandardMaterial({color:0x3a3a3c,map:asT,roughness:.82,metalness:0,envMapIntensity:.35});
  if(!chase)asM.color.set(0x55565a);mk(ribbon(0,N,chase?.5:1,-HW,HW,.06,.06,null,20),asM,false);
  const lineM=new THREE.MeshStandardMaterial({color:0xd9d7d1,roughness:.6,envMapIntensity:.3});
  for(const s of [-1,1])mk(ribbon(0,N,chase?.5:1,s*(HW-.55),s*(HW-.3),.075,.075,null,10),lineM,false);
  // kerbs
  const kM=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.55,envMapIntensity:.4});
  for(const c of T.corners){const sg=c.turn>0?-1:1;const st=(t,k)=>(Math.floor(k/2)%2?[.85,.84,.81]:[.13,.13,.135]);
    const ka=c.a-4,kb=c.b+3;mk(ribbon(ka,kb,.25,sg*(HW-.1),sg*(HW+1.4),.07,.16,st,5),kM,false);
    mk(ribbon(c.i,c.b+10,.25,-sg*(HW-.1),-sg*(HW+1.4),.07,.16,st,5),kM,false)}
  // barriers
  const brM=new THREE.MeshStandardMaterial({color:0x8a8c90,roughness:.35,metalness:.7,envMapIntensity:.8,envMap:ENV,side:THREE.DoubleSide});
  for(const s of [-1,1]){let seg=null;const flush=()=>{if(seg&&seg[1]-seg[0]>4){mk(ribbon(seg[0],seg[1],1,s*(HW+24),s*(HW+24),.1,0.95,null,10),brM)}seg=null};
    for(let t=0;t<N;t++){const {p,rt}=at(t);const q=p.clone().addScaledVector(rt,s*(HW+24));const [d]=near(q.x,q.z,2);const ok=d>14;if(ok){seg?seg[1]=t:seg=[t,t]}else flush()}flush()}
  // sector overlay (overview) & boundaries
  if(!chase){for(let k=0;k<3;k++){const a=T.sectors[k],b=k<2?T.sectors[k+1]:N;const ow=3*Math.max(1,EXT/1600);mk(ribbon(a,b,1,-ow,ow,.11,.11,null,10),new THREE.MeshStandardMaterial({color:SEC[k],emissive:SEC[k],emissiveIntensity:.55,roughness:.5}),false)}}
  for(let k=1;k<3;k++){const t=T.sectors[k];mk(ribbon(t,t+.25,.25,-HW,HW,.12,.12,null,1),new THREE.MeshStandardMaterial({color:SEC[k],emissive:SEC[k],emissiveIntensity:.25}),false)}
  // S/F checker + gantry
  {const ck=(t,k)=>[1,1,1];const g=new THREE.Group();const {p,tg:tt,rt}=at(0);
    const cM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.6});const c2=new THREE.MeshStandardMaterial({color:0x111111,roughness:.6});
    for(let r=0;r<3;r++)for(let q=0;q<12;q++){const m=new THREE.Mesh(new THREE.PlaneGeometry(HW*2/12,1.1),(q+r)%2?cM:c2);m.rotation.x=-Math.PI/2;const o=p.clone().addScaledVector(rt,-HW+HW*2/12*(q+.5)).addScaledVector(tt,(r-1)*1.1);o.y+=.1;m.position.copy(o);m.rotation.z=-Math.atan2(tt.x,-tt.z)+0;
      m.rotation.set(-Math.PI/2,0,Math.atan2(rt.x,rt.z)-Math.PI/2);m.position.copy(o);S.add(m)}
    const gm=new THREE.MeshStandardMaterial({color:0x2a2b2e,roughness:.4,metalness:.6});
    for(const s of [-1,1]){const pl=new THREE.Mesh(new THREE.BoxGeometry(.5,7.5,.5),gm);pl.position.copy(p).addScaledVector(rt,s*(HW+1.2));pl.position.y+=3.75;pl.castShadow=true;S.add(pl)}
    const bm=new THREE.Mesh(new THREE.BoxGeometry(HW*2+3,1.4,.6),gm);bm.position.copy(p);bm.position.y+=7.2;bm.lookAt(p.clone().add(tt).setY(bm.position.y));bm.castShadow=true;S.add(bm);
    const pan=new THREE.Mesh(new THREE.PlaneGeometry(HW*2-1,.9),new THREE.MeshBasicMaterial({color:0xf2efe9,map:(()=>{const c=document.createElement('canvas');c.width=512;c.height=40;const x=c.getContext('2d');x.fillStyle='#0b0b0b';x.fillRect(0,0,512,40);x.fillStyle='#f2efe9';x.font='600 26px "PL Sans"';x.textAlign='center';x.fillText('PITLANE · START / FINISH',256,29);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t})()}));
    pan.position.copy(bm.position).addScaledVector(tt,-.32);pan.lookAt(pan.position.clone().sub(tt));S.add(pan)}
  // pit lane, wall, building, grandstand
  if(PIT){const pv=PIT.map(o=>o.v);const curve=new THREE.CatmullRomCurve3(pv);const L=curve.getLength(),M=Math.round(L/2);const v=[],ix=[];const sp=curve.getSpacedPoints(M);
    const side=[];for(let i=0;i<=M;i++){const a=sp[Math.max(0,i-1)],b=sp[Math.min(M,i+1)];const t=b.clone().sub(a);t.y=0;t.normalize();side.push(new THREE.Vector3(-t.z,0,t.x))}
    const pr=(w0,w1,y0,y1,mat,cs=true)=>{const v=[],ix=[];for(let i=0;i<=M;i++){const p=sp[i];const A=p.clone().addScaledVector(side[i],w0),B=p.clone().addScaledVector(side[i],w1);A.y+=y0;B.y+=y1;v.push(A.x,A.y,A.z,B.x,B.y,B.z);if(i){const q=2*i;ix.push(q-2,q-1,q,q-1,q+1,q)}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();const m=mk(g,mat,cs);mat.side=THREE.DoubleSide;return m};
    pr(-4,4,.05,.05,new THREE.MeshStandardMaterial({color:0x333336,map:asT,roughness:.85}),false);
    // which side faces away from track
    const mid=Math.round(M/2);const [dd,o]=near(sp[mid].x,sp[mid].z);let awayS=1;{const tp=P[PIT[Math.round(PIT.length/2)].j];awayS=Math.sign(sp[mid].clone().sub(tp).dot(side[mid]))||1}
    for(let i=Math.round(M*.15);i<M*.85;i+=1){}
    // pit wall toward track
    pr(-awayS*4.6,-awayS*4.6,0,1.1,new THREE.MeshStandardMaterial({color:0xb9b7b2,roughness:.7}));
    // building
    const bL=Math.min(L*.3,150);const bc=sp[mid].clone().addScaledVector(side[mid],awayS*16);const tdir=sp[Math.min(M,mid+5)].clone().sub(sp[mid-5]).setY(0).normalize();
    const b=new THREE.Mesh(new THREE.BoxGeometry(bL,9,18),new THREE.MeshStandardMaterial({color:0x2c2d30,roughness:.5,metalness:.3}));b.position.copy(bc);b.position.y+=4.5;b.rotation.y=Math.atan2(-tdir.z,tdir.x);b.castShadow=b.receiveShadow=true;S.add(b);
    const gl=new THREE.Mesh(new THREE.BoxGeometry(bL-4,2.2,18.3),new THREE.MeshStandardMaterial({color:0x0e1012,roughness:.05,metalness:.9,envMapIntensity:1.2,envMap:ENV}));gl.position.copy(b.position);gl.position.y+=1.6;gl.rotation.copy(b.rotation);S.add(gl);
    const rf=new THREE.Mesh(new THREE.BoxGeometry(bL+6,.5,24),new THREE.MeshStandardMaterial({color:0x8d8e90,roughness:.4,metalness:.5}));rf.position.copy(b.position);rf.position.y+=4.8;rf.rotation.copy(b.rotation);rf.castShadow=true;S.add(rf);
    // grandstand across
    const {p:p0,rt:r0,tg:t0}=at(0);const gs=new THREE.Mesh(new THREE.BoxGeometry(110,1,1),new THREE.MeshStandardMaterial({color:0x3a3b3e,roughness:.6}));
    const sgn=-awayS*Math.sign(side[mid].dot(r0))||1;for(let k=0;k<6;k++){const m=new THREE.Mesh(new THREE.BoxGeometry(120,1.2,2.4),new THREE.MeshStandardMaterial({color:k%2?0x2e2f32:0x404145,roughness:.7}));m.position.copy(p0).addScaledVector(r0,sgn*(HW+12+k*2.4));m.position.y+=.6+k*1.2;m.rotation.y=Math.atan2(-t0.z,t0.x);m.castShadow=m.receiveShadow=true;S.add(m)}}
  // trees
  {const r=rng(99),M=[];const cnt=chase?12000:2600;const tG=chase?new THREE.ConeGeometry(1,1,9):new THREE.IcosahedronGeometry(.5,1);tG.translate(0,.5,0);
    const im=new THREE.InstancedMesh(tG,new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,envMapIntensity:.15,flatShading:true}),cnt);let k=0;const m4=new THREE.Matrix4(),q=new THREE.Quaternion(),c=new THREE.Color();
    for(let a=0;a<cnt*8&&k<cnt;a++){const x=tx0+(tx1-tx0)*r(),y=ty0+(ty1-ty0)*r();if(nz(x/140+5,y/140)<.5)continue;const X=ex(x),Z=ez(y);const [d]=near(X,Z,3);if(d<(chase?60:40))continue;
      const h=Y(demA(x,y))-.3;const s=chase?4+r()*7:6+r()*8,w=chase?s*(.22+r()*.08):s*(.9+r()*.4);m4.compose(new THREE.Vector3(X,h,Z),q,new THREE.Vector3(w,chase?s*1.6:s*.9,w));im.setMatrixAt(k,m4);const g=.022+r()*.02;im.setColorAt(k,chase?c.setRGB(g*.9,g*1.08,g*.92):c.setRGB(g,g*1.04,g));k++}
    im.count=k;im.castShadow=true;im.receiveShadow=true;S.add(im)}
  // ---- car
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const gl=await new GLTFLoader().loadAsync(new URL('../models/gt3rs.glb',import.meta.url).href);const src=gl.scene;
  {const bx=new THREE.Box3().setFromObject(src),sz=bx.getSize(new THREE.Vector3());const long=sz.x>sz.z?'x':'z';if(long==='x')src.rotation.y=Math.PI/2;src.updateMatrixWorld(true);
   const b2=new THREE.Box3().setFromObject(src),s2=b2.getSize(new THREE.Vector3());const k=4.57/s2.z;src.scale.multiplyScalar(k);src.updateMatrixWorld(true);const b3=new THREE.Box3().setFromObject(src),c3=b3.getCenter(new THREE.Vector3());src.position.sub(new THREE.Vector3(c3.x,b3.min.y,c3.z));
   const redM=new THREE.MeshStandardMaterial({color:0x300000,emissive:0xff1208,emissiveIntensity:2.6,toneMapped:false});
   src.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(src.matrixWorld).invert();
   src.traverse(o=>{if(o.isMesh){const ms0=Array.isArray(o.material)?o.material:[o.material];if(ms0.some(m=>/LightA/.test(m.name))){const bb=new THREE.Box3().setFromObject(o);bb.applyMatrix4(inv);const cz=(bb.min.z+bb.max.z)/2/ (src.scale.x);
       o.userData.cz=cz}}});
   const zs=[];src.traverse(o=>{if(o.userData.cz!==undefined)zs.push(o.userData.cz)});const zmin=Math.min(...zs),zmax=Math.max(...zs);
   src.traverse(o=>{if(o.userData.cz!==undefined&&o.userData.cz<zmin+(zmax-zmin)*.25)o.material=redM;if(o.isMesh&&!Array.isArray(o.material)&&/RED_GLASS/.test(o.material.name))o.material=redM});
   src.traverse(o=>{if(o.isMesh){o.castShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.envMap=ENV;m.envMapIntensity=1.1;const nm=(m.name||'');
     if(/Paint/.test(nm)){m.color.set(0x3a3c41);m.metalness=.6;m.roughness=.3}
     if(/Coloured|Calliper|InteriorB/.test(nm)){const hsl={};if(m.map&&/Coloured|Calliper/.test(nm))m.map=null;m.color.set(/Interior/.test(nm)?0x9a9a9a:0x2a2b2e)}
     if(/RED_GLASS/.test(nm)){m.color.set(0x400000);m.emissive=new THREE.Color(0xff1208);m.emissiveIntensity=2.4;m.opacity=.92;m.toneMapped=false}
     if(/ManufacturerPlate/.test(nm)){m.map=null;m.color.set(0x1a1a1a)}
     if(!/RED_GLASS/.test(nm)&&m!==redM){m.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\n{float l=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(vec3(l),diffuseColor.rgb,.08);}')};m.needsUpdate=true}})}})}
  const FLIP=0;
  function carModel(ghost){const w=new THREE.Group();const c=src.clone(true);if(FLIP)c.rotation.y+=Math.PI;
    if(ghost){const gm=new THREE.MeshBasicMaterial({color:0xf2efe9,transparent:true,opacity:.13,depthWrite:false});c.traverse(o=>{if(o.isMesh){o.material=gm;o.castShadow=false}})}
    else{const gl2=new THREE.PointLight(0xff2a20,2.5,7,2);gl2.position.set(0,.7,-2.9);w.add(gl2)}
    w.add(c);return w}
  // overlays
  const fin=()=>{const img=new Image();img.src=cv.toDataURL('image/jpeg',.9);img.style.cssText=`position:absolute;left:0;top:0;width:${W}px;height:${H}px`;img.alt='';host.appendChild(img);host.appendChild(ov);
    S.traverse(o=>{if(o.geometry)o.geometry.dispose();const m=o.material;(Array.isArray(m)?m:m?[m]:[]).forEach(x=>{for(const k in x)if(x[k]&&x[k].isTexture)x[k].dispose();x.dispose()})});pm.dispose();R.dispose();R.forceContextLoss()};
    const ov=document.createElement('div');ov.style.cssText=`position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none`;
  const proj=(v,cam)=>{const q=v.clone().project(cam);return [(q.x+1)/2*W,(1-q.y)/2*H,q.z]};
  if(!chase){
    // camera fit: long axis
    let sxx=0,szz=0,sxz=0;P.forEach(p=>{sxx+=p.x*p.x;szz+=p.z*p.z;sxz+=p.x*p.z});const ang=.5*Math.atan2(2*sxz,sxx-szz);const ax=new THREE.Vector3(Math.cos(ang),0,Math.sin(ang));
    const cam=new THREE.PerspectiveCamera(30,W/H,10,20000);const tgt=new THREE.Vector3(0,Y((T.eMin+T.eMax)/2),0);const el=THREE.MathUtils.degToRad(26);
    const az=ax.clone();if(az.dot(new THREE.Vector3(.3,0,1))<0)az.negate();let dist=2500;
    const box=[30,34,W-30,H-34];
    const bb=()=>{cam.updateMatrixWorld();let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<N;i+=4){const [x,y]=proj(P[i],cam);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}return [x0,y0,x1,y1]};
    const setD=d=>{cam.position.copy(tgt).addScaledVector(az,Math.cos(el)*d).add(new THREE.Vector3(0,Math.sin(el)*d,0));cam.lookAt(tgt)};
    let lo=200,hi=20000;for(let it=0;it<40;it++){const d=(lo+hi)/2;setD(d);const [x0,y0,x1,y1]=bb();const ok=(x1-x0)<=box[2]-box[0]&&(y1-y0)<=box[3]-box[1];if(ok)hi=d;else lo=d}
    dist=hi;setD(dist);S.fog.density=0.75/dist;console.log('dist',dist);{const [x0,y0,x1,y1]=bb();cam.setViewOffset(W,H,(x0+x1)/2-(box[0]+box[2])/2,(y0+y1)/2-(box[1]+box[3])/2,W,H);cam.updateMatrixWorld()}
    sun.position.copy(tgt).add(new THREE.Vector3(-1100,520,-700));sun.target.position.copy(tgt);const sc=sun.shadow.camera;const ext=Math.max(...xs)-Math.min(...xs)+Math.max(...ys)-Math.min(...ys);sc.left=-ext*.7;sc.right=ext*.7;sc.top=ext*.7;sc.bottom=-ext*.7;sc.near=10;sc.far=8000;sc.updateProjectionMatrix();
    const car=carModel(false);{const {p,tg}=at(T.sectors[1]*.55);car.position.copy(p).setY(p.y+.06);car.lookAt(p.clone().add(tg).setY(p.y+.06));car.scale.setScalar(1);S.add(car)}
    R.render(S,cam);
    // labels
    const B=T.corners.map(c=>{const {p,rt}=at(c.i);const sg=c.turn>0?1:-1;const q=p.clone().addScaledVector(rt,sg*(HW+28));const [x,y]=proj(q,cam);const [ax2,ay2]=proj(p,cam);return {n:c.n,x,y,px:x,py:y,ax:ax2,ay:ay2}});
    const tp=[];for(let i=0;i<N;i+=3)tp.push(proj(P[i],cam));const r9=10;
    for(let it=0;it<240;it++)for(const b of B){b.x+=(b.px-b.x)*.04;b.y+=(b.py-b.y)*.04;for(const o of B)if(o!==b){const dx=b.x-o.x,dy=b.y-o.y,d=Math.hypot(dx,dy)||.1;if(d<2*r9+3){const f=(2*r9+3-d)/2;b.x+=dx/d*f*.5;b.y+=dy/d*f*.5}}
      for(const p of tp){const dx=b.x-p[0],dy=b.y-p[1],d=Math.hypot(dx,dy)||.1;if(d<r9+5){const f=r9+5-d;b.x+=dx/d*f*.4;b.y+=dy/d*f*.4}}}
    let sv=`<svg width="${W}" height="${H}" style="position:absolute;left:0;top:0">`;for(const b of B)sv+=`<line x1="${b.ax}" y1="${b.ay}" x2="${b.x}" y2="${b.y}" stroke="rgba(242,239,233,.45)" stroke-width=".8"/><circle cx="${b.x}" cy="${b.y}" r="${r9}" fill="#f2efe9" stroke="#000" stroke-width="1.5"/><text x="${b.x}" y="${b.y+3.8}" text-anchor="middle" font-size="${b.n>9?10:11}" font-weight="600" font-family="PL Sans">${b.n}</text>`;
    const [sx,sy]=proj(at(0).p,cam);sv+=`<g transform="translate(${sx} ${sy})"><line x1="0" y1="0" x2="0" y2="-26" stroke="#f2efe9" stroke-width="1"/><rect x="-18" y="-42" width="36" height="16" rx="4" fill="#000" stroke="rgba(255,255,255,.3)"/><text y="-30.5" text-anchor="middle" font-size="10" font-weight="600" fill="#f2efe9" font-family="PL Sans" letter-spacing=".06em">S/F</text></g>`;
    if(PIT){const [px,py]=proj(PIT[Math.round(PIT.length*.5)].v,cam);sv+=`<g transform="translate(${px} ${py})"><text x="0" y="22" text-anchor="middle" font-size="9.5" font-weight="600" fill="#9a9a9a" font-family="PL Sans" letter-spacing=".1em">ПИТ</text></g>`}
    sv+='</svg>';
    ov.innerHTML=sv+`<div class="tv2-ex">высоты ×${EX.toFixed(1).replace('.',',')}</div>`;fin();
    return}
  // ---------- CHASE
  let ci=null;{const cs=T.corners.filter(c=>c.i>20);const c=cs.reduce((a,b)=>Math.abs(b.ang)>Math.abs(a.ang)&&b.n<=6?b:a,cs[0]);ci=c}
  const sg=ci.turn>0?1:-1; // outside = +rt*sg ... set racing line to outside before entry
  const tc=ci.a-Math.round(34/T.step);const lat=t=>sg*3.2*Math.min(1,Math.max(0,(ci.a-t)/12));
  const place=(o,t,l)=>{const {p,tg,rt}=at(t);const q=p.clone().addScaledVector(rt,l);q.y+=.06;o.position.copy(q);const f=at(t+1.5);const qf=f.p.clone().addScaledVector(f.rt,lat(t+1.5));qf.y=q.y;o.lookAt(qf);return {q,tg}};
  const car=carModel(false);S.add(car);const {q:cp,tg:ct}=place(car,tc,lat(tc));
  if(info.hasBest){const gh=carModel(true);S.add(gh);place(gh,tc+Math.round(16/T.step),lat(tc+Math.round(16/T.step))-sg*.6)}
  const cam=new THREE.PerspectiveCamera(52,W/H,.3,5000);{const tb=tc-Math.round(12.5/T.step);const {p,rt}=at(tb);const c0=p.clone().addScaledVector(rt,lat(tb));c0.y+=2.9;cam.position.copy(c0);
    const la=at(tc+Math.round(10/T.step));const L=la.p.clone().addScaledVector(la.rt,lat(tc+10/T.step));L.y+=.4;cam.lookAt(L)}
  cam.setViewOffset(W,H,0,-H*.12,W,H);
  sun.position.copy(cp).add(new THREE.Vector3(-160,120,-90));sun.target.position.copy(cp);{const s=sun.shadow.camera;s.left=-90;s.right=90;s.top=90;s.bottom=-90;s.near=1;s.far=600;s.updateProjectionMatrix()}
  R.render(S,cam);
  const nextC=ci,dn=Math.round((ci.a-tc)*T.step/10)*10;
  const mx=Math.min(...xs),Mx=Math.max(...xs),my=Math.min(...ys),My=Math.max(...ys),ms=Math.min(60/(Mx-mx),60/(My-my));const mp=(x,y)=>[34+(x-(mx+Mx)/2)*ms,34-(y-(my+My)/2)*ms];
  let md='';T.xy.forEach((p,i)=>{if(i%3)return;const [a,b]=mp(...p);md+=(md?'L':'M')+a.toFixed(1)+' '+b.toFixed(1)});const [cxm,cym]=mp(...T.xy[Math.round(tc)]);
  ov.innerHTML=`<div class="tv2-chud"><div class="tv2-g tv2-ch1"><span class="tv2-l">Впереди</span><b>Поворот ${info.turnLabel?info.turnLabel(nextC.n):nextC.n}</b><span class="tv2-num">${dn} м</span></div>
   <div class="tv2-g tv2-ch2"><svg width="68" height="68" viewBox="0 0 68 68"><path d="${md}Z" stroke="rgba(242,239,233,.5)" stroke-width="1.6" fill="none" stroke-linejoin="round"/><circle cx="${cxm}" cy="${cym}" r="3.6" fill="#f2efe9" stroke="#000" stroke-width="1.2"/></svg></div></div>
   <div class="tv2-ghost">${info.hasBest?'призрак · ваш лучший круг':'призрак лучшего круга появится после первого заезда'}</div>`;fin();
}
