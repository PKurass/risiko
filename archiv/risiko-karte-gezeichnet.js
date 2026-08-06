/* =====================================================================
   RISIKO — SELBSTGEZEICHNETE WELTKARTE  (Modul WorldMap)
   Wird vom Spiel NICHT geladen. Bis zur SVG-Karte steckte dieser Block
   unbenutzt in risiko.html; hier liegt er als eigenstaendige Kartenquelle.
   Verwendet von werkzeug/karte-backen.mjs (Schalter --gezeichnet), um
   ohne Risk.svg und ohne Internet eine risiko-daten.js zu erzeugen.
   Setzt voraus, dass RiskEngine bereits geladen ist (nutzt RiskEngine.TERR).
   Gegenueber der Fassung aus risiko.html nur eine Aenderung: das
   Rueckgabe-Objekt reicht zusaetzlich polys nach aussen, damit die
   Umrisse gebacken werden koennen.
   ===================================================================== */
/* ===================== TEIL 2 — WELTKARTE (vollständig im Code) =====================
   Ich zeichne die Landmassen als Umrisse. Jedes Land bekommt einen Ankerpunkt.
   Das Programm rastert die Landmassen und gibt jedes Rasterfeld dem nächsten
   Anker – so entstehen lückenlos aneinandergrenzende Länder. Aus dem Raster
   werden die Grenzlinien verfolgt, vereinfacht und weich gerundet.               */
const WorldMap=(function(){
const W=1000,H=800,CELL=2.5,GW=Math.round(W/CELL),GH=Math.round(H/CELL);

/* Umrisse der Landmassen */
const LAND=[
 {n:"Nordamerika",p:[[70,150],[95,105],[160,95],[232,100],[300,116],[360,140],[396,190],[370,250],
   [330,292],[300,332],[256,360],[216,396],[186,422],[150,432],[130,406],[120,370],[96,330],[80,286],[60,220],[64,176]],
  t:["alaska","nwterr","alberta","ontario","quebec","westus","eastus","centralam"]},
 {n:"Grönland",p:[[400,55],[470,50],[496,90],[480,142],[440,152],[404,110]],t:["greenland"]},
 {n:"Südamerika",p:[[160,455],[216,440],[266,456],[300,500],[302,562],[276,622],[240,662],[216,722],
   [196,762],[176,730],[166,660],[150,600],[145,530]],t:["venezuela","peru","brazil","argentina"]},
 {n:"Island",p:[[420,160],[450,160],[458,180],[440,196],[418,186]],t:["iceland"]},
 {n:"Großbritannien",p:[[392,296],[416,292],[430,320],[414,350],[392,344]],t:["greatbritain"]},
 {n:"Eurasien",p:[[440,310],[452,252],[478,208],[508,172],[548,186],[566,224],[610,205],[668,178],
   [730,148],[800,120],[866,104],[918,124],[948,166],[936,214],[952,254],[922,292],[872,306],
   [846,342],[826,388],[796,428],[806,470],[772,492],[742,458],[712,486],[686,470],[664,432],
   [632,462],[598,478],[566,446],[544,404],[516,424],[486,404],[462,392],[444,352]],
  t:["scandinavia","northerneu","westerneu","southerneu","ukraine","ural","siberia","yakutsk",
     "irkutsk","kamchatka","mongolia","afghanistan","china","middleeast","india","siam"]},
 {n:"Afrika",p:[[400,470],[452,452],[500,448],[548,452],[566,470],[586,510],[596,560],[588,610],
   [560,660],[534,702],[506,690],[492,650],[470,610],[444,570],[414,530]],
  t:["northafrica","egypt","eastafrica","congo","southafrica"]},
 {n:"Madagaskar",p:[[604,610],[624,606],[632,640],[620,672],[602,650]],t:["madagascar"]},
 {n:"Japan",p:[[900,318],[922,308],[934,336],[918,364],[900,346]],t:["japan"]},
 {n:"Indonesien",p:[[800,506],[850,498],[882,514],[866,538],[816,536]],t:["indonesia"]},
 {n:"Neuguinea",p:[[896,518],[946,512],[958,542],[916,554]],t:["newguinea"]},
 {n:"Australien",p:[[810,600],[870,588],[930,596],[952,634],[936,678],[884,692],[836,676],[806,640]],
  t:["westaustralia","eastaustralia"]}
];
/* Ankerpunkte – bestimmen, wo ein Land innerhalb seiner Landmasse liegt */
const SEED={
 alaska:[104,140],nwterr:[196,146],alberta:[158,212],ontario:[254,236],quebec:[344,214],
 westus:[140,286],eastus:[236,318],centralam:[140,382],greenland:[440,92],
 venezuela:[200,466],peru:[184,600],brazil:[258,552],argentina:[192,690],
 iceland:[437,177],greatbritain:[410,320],scandinavia:[506,214],northerneu:[520,318],
 westerneu:[470,362],southerneu:[520,392],ukraine:[586,254],
 northafrica:[440,516],egypt:[528,478],eastafrica:[560,536],congo:[506,582],southafrica:[532,652],
 madagascar:[616,638],
 ural:[664,222],siberia:[748,178],yakutsk:[854,138],kamchatka:[906,236],irkutsk:[806,224],
 mongolia:[792,318],japan:[915,338],afghanistan:[648,338],china:[752,376],middleeast:[600,442],
 india:[692,448],siam:[772,462],
 indonesia:[840,518],newguinea:[924,532],westaustralia:[848,628],eastaustralia:[916,638]};
/* Grundfarben je Kontinent (aus der Vorlage) */
const CCOL={Nordamerika:"#f0a93c",Suedamerika:"#d8493f",Europa:"#3f7fd6",
  Afrika:"#a9743f",Asien:"#5aa845",Australien:"#d33f97"};

const TERR=RiskEngine.TERR,IDS=Object.keys(TERR);
let cellT=new Int16Array(GW*GH).fill(-1);
let polys={},center={},color={},touch=new Set(),paths=null;

function inPoly(x,y,p){let c=false;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const xi=p[i][0],yi=p[i][1],xj=p[j][0],yj=p[j][1];
    if(((yi>y)!==(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))c=!c;}
  return c;}
function bbox(p){let a=1e9,b=1e9,c=-1e9,d=-1e9;
  p.forEach(q=>{a=Math.min(a,q[0]);b=Math.min(b,q[1]);c=Math.max(c,q[0]);d=Math.max(d,q[1]);});
  return[a,b,c,d];}
function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
  if(L<1e-9)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  return Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L;}
function rdp(pts,eps){if(pts.length<3)return pts;
  let im=0,dm=0;const a=pts[0],b=pts[pts.length-1];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dm){dm=d;im=i;}}
  if(dm>eps)return rdp(pts.slice(0,im+1),eps).slice(0,-1).concat(rdp(pts.slice(im),eps));
  return[a,b];}
function chaikin(p,it){for(let k=0;k<it;k++){const q=[];
  for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];
    q.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25]);
    q.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);}
  p=q;}return p;}

function build(){
  const idx={};IDS.forEach((id,i)=>idx[id]=i);
  // 1. Rastern: welches Land liegt in welchem Feld?
  LAND.forEach(L=>{
    const bb=bbox(L.p);
    const seeds=L.t.map(id=>({id,x:SEED[id][0],y:SEED[id][1]}));
    const i0=Math.max(0,Math.floor(bb[0]/CELL)),i1=Math.min(GW-1,Math.ceil(bb[2]/CELL));
    const j0=Math.max(0,Math.floor(bb[1]/CELL)),j1=Math.min(GH-1,Math.ceil(bb[3]/CELL));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const x=(i+0.5)*CELL,y=(j+0.5)*CELL;
      if(!inPoly(x,y,L.p))continue;
      let best=null,bd=1e12;
      seeds.forEach(s=>{const dx=x-s.x,dy=y-s.y,d=dx*dx+dy*dy;if(d<bd){bd=d;best=s;}});
      cellT[j*GW+i]=idx[best.id];
    }
  });
  // 2. Grenzlinien verfolgen
  const em=IDS.map(()=>new Map());
  const key=(x,y)=>x+","+y;
  const mark=(a,b)=>{if(a>=0&&b>=0&&a!==b)touch.add(Math.min(a,b)+"-"+Math.max(a,b));};
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){
    const t=cellT[j*GW+i];if(t<0)continue;
    const up=j>0?cellT[(j-1)*GW+i]:-1,dn=j<GH-1?cellT[(j+1)*GW+i]:-1;
    const lf=i>0?cellT[j*GW+i-1]:-1,rt=i<GW-1?cellT[j*GW+i+1]:-1;
    const m=em[t];
    const add=(x1,y1,x2,y2)=>{const k=key(x1,y1);let a=m.get(k);if(!a){a=[];m.set(k,a);}a.push([x2,y2]);};
    if(up!==t){add(i,j,i+1,j);mark(t,up);}
    if(rt!==t){add(i+1,j,i+1,j+1);mark(t,rt);}
    if(dn!==t){add(i+1,j+1,i,j+1);mark(t,dn);}
    if(lf!==t){add(i,j+1,i,j);mark(t,lf);}
  }
  IDS.forEach((id,t)=>{
    const m=em[t];if(!m.size)return;
    const loops=[];let guard=0;
    while(m.size&&guard++<2000){
      const start=m.keys().next().value;let cur=start;const loop=[];let st=0;
      while(st++<60000){
        const arr=m.get(cur);if(!arr||!arr.length){m.delete(cur);break;}
        const n=arr.pop();if(!arr.length)m.delete(cur);
        loop.push(cur.split(",").map(Number));
        cur=key(n[0],n[1]);if(cur===start)break;}
      if(loop.length>16)loops.push(loop);
    }
    const out=[];
    loops.forEach(l=>{let s=rdp(l,0.9);if(s.length<4)return;
      s=chaikin(s,2);out.push(s.map(q=>[q[0]*CELL,q[1]*CELL]));});
    out.sort((a,b)=>b.length-a.length);
    if(out.length)polys[id]=out.slice(0,4);
  });
  // 3. Mittelpunkte und Farben
  const acc={};
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const t=cellT[j*GW+i];if(t<0)continue;
    const id=IDS[t];(acc[id]=acc[id]||{x:0,y:0,n:0});
    acc[id].x+=(i+0.5)*CELL;acc[id].y+=(j+0.5)*CELL;acc[id].n++;}
  IDS.forEach((id,k)=>{
    if(acc[id])center[id]={x:acc[id].x/acc[id].n,y:acc[id].y/acc[id].n};
    else center[id]={x:SEED[id][0],y:SEED[id][1]};
    const base=CCOL[TERR[id].c]||"#8a8";
    const n=parseInt(base.slice(1),16);
    const f=0.86+((k*37)%5)*0.07;      // leichte Schattierung je Land
    const r=Math.min(255,Math.round(((n>>16)&255)*f));
    const g=Math.min(255,Math.round(((n>>8)&255)*f));
    const b=Math.min(255,Math.round((n&255)*f));
    color[id]=[r,g,b];
  });
  // 4. Zeichenpfade
  paths={all:new Path2D(),per:{}};
  for(const id in polys){
    const p=new Path2D();
    polys[id].forEach(loop=>{
      p.moveTo(loop[0][0],loop[0][1]);
      for(let i=1;i<loop.length;i++)p.lineTo(loop[i][0],loop[i][1]);
      p.closePath();
      paths.all.moveTo(loop[0][0],loop[0][1]);
      for(let i=1;i<loop.length;i++)paths.all.lineTo(loop[i][0],loop[i][1]);
      paths.all.closePath();});
    paths.per[id]=p;
  }
}
function at(x,y){
  const i=Math.floor(x/CELL),j=Math.floor(y/CELL);
  if(i<0||j<0||i>=GW||j>=GH)return null;
  const t=cellT[j*GW+i];return t<0?null:IDS[t];}
function seaLinks(){
  const idx={};IDS.forEach((id,i)=>idx[id]=i);
  const out=[];
  for(const a in RiskEngine.ADJ)RiskEngine.ADJ[a].forEach(b=>{
    if(a>=b)return;
    const t1=idx[a],t2=idx[b];
    if(touch.has(Math.min(t1,t2)+"-"+Math.max(t1,t2)))return;
    out.push([center[a],center[b]]);});
  return out;}
build();
return{W,H,at,seaLinks,get paths(){return paths;},get center(){return center;},
  get color(){return color;},get polys(){return polys;},LAND};
})();
