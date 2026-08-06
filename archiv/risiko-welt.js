/* =====================================================================
   RISIKO — WELTKARTE AUS ECHTEN GEODATEN
   1. Lädt einmalig eine grobe Weltkarte (Maßstab 1:110 Mio).
   2. Fasst Staaten zu den 42 Gebieten zusammen, große Länder werden
      an Längen-/Breitengraden zerschnitten – wie beim Brettspiel.
   3. Jedes Gebiet wird zu EINER Fläche verschmolzen: die Grenzen der
      einzelnen Staaten darin verschwinden. Jeder Bildpunkt gehört genau
      einem Gebiet, dadurch gibt es keine Überlappungen.
   4. Aus den verschmolzenen Flächen wird die Außenkante verfolgt,
      vereinfacht und weich gerundet.
   ===================================================================== */
const WorldMapGeo=(function(){
const W=1200,H=760;
const SRC="https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const CCOL={Nordamerika:"#f0a93c",Suedamerika:"#d8493f",Europa:"#3f7fd6",
  Afrika:"#a9743f",Asien:"#5aa845",Australien:"#d33f97"};

const DEF={
 alaska:{c:["United States of America"],box:[-180,-129,50,73]},
 /* Kanada wird lückenlos zerlegt: oben Nordwest-Territorium,
    darunter drei Längenstreifen. Die Kästen stoßen exakt aneinander,
    ohne sich zu überlappen – sonst bleiben Splitter stehen. */
 nwterr:{c:["Canada"],box:[-141,-52,60,84]},
 alberta:{c:["Canada"],box:[-141,-100,41,60]},
 ontario:{c:["Canada"],box:[-100,-80,41,60]},
 quebec:{c:["Canada"],box:[-80,-52,41,60]},
 westus:{c:["United States of America"],box:[-127,-100,24,50]},
 eastus:{c:["United States of America"],box:[-100,-66,24,50]},
 centralam:{c:["Mexico","Guatemala","Belize","Honduras","El Salvador","Nicaragua","Costa Rica",
   "Panama","Cuba","Haiti","Dominican Rep.","Jamaica","Puerto Rico","Bahamas","Trinidad and Tobago"]},
 greenland:{c:["Greenland"]},
 venezuela:{c:["Venezuela","Colombia","Ecuador","Guyana","Suriname"]},
 peru:{c:["Peru","Bolivia","Chile"]},
 brazil:{c:["Brazil"]},
 argentina:{c:["Argentina","Uruguay","Paraguay","Falkland Is."]},
 iceland:{c:["Iceland"]},
 greatbritain:{c:["United Kingdom","Ireland"]},
 scandinavia:{c:["Norway","Sweden","Finland","Denmark"]},
 northerneu:{c:["Germany","Poland","Czechia","Czech Rep.","Slovakia","Austria","Hungary",
   "Switzerland","Netherlands","Belgium","Luxembourg","Lithuania","Latvia","Estonia","Belarus"]},
 westerneu:{c:["France","Spain","Portugal","Andorra"]},
 southerneu:{c:["Italy","Greece","Romania","Bulgaria","Serbia","Croatia","Bosnia and Herz.",
   "Albania","Slovenia","North Macedonia","Macedonia","Montenegro","Kosovo","Cyprus","N. Cyprus"]},
 ukraine:{c:["Ukraine","Moldova","Russia"],box:[19,55,40,72]},
 northafrica:{c:["Morocco","W. Sahara","Algeria","Tunisia","Libya","Mauritania","Mali","Niger",
   "Chad","Nigeria","Senegal","Gambia","Guinea","Guinea-Bissau","Sierra Leone","Liberia",
   "Côte d'Ivoire","Ghana","Togo","Benin","Burkina Faso","Cameroon"]},
 egypt:{c:["Egypt"]},
 eastafrica:{c:["Sudan","S. Sudan","Ethiopia","Eritrea","Djibouti","Somalia","Somaliland",
   "Kenya","Uganda","Tanzania","Rwanda","Burundi"]},
 congo:{c:["Dem. Rep. Congo","Congo","Gabon","Eq. Guinea","Central African Rep."]},
 southafrica:{c:["South Africa","Namibia","Botswana","Zimbabwe","Zambia","Mozambique","Angola",
   "Malawi","Lesotho","eSwatini","Swaziland"]},
 madagascar:{c:["Madagascar"]},
 /* Russland ebenso: Längenstreifen, oben/unten sauber getrennt.
    Reihenfolge zählt – wer zuerst drankommt, behält den Punkt. */
 ural:{c:["Russia"],box:[55,82,44,78]},
 siberia:{c:["Russia"],box:[82,108,44,78]},
 yakutsk:{c:["Russia"],box:[108,150,60,78]},
 kamchatka:{c:["Russia"],box:[128,200,44,78]},
 irkutsk:{c:["Russia"],box:[108,128,44,60]},
 mongolia:{c:["Mongolia"]},
 japan:{c:["Japan"]},
 afghanistan:{c:["Afghanistan","Kazakhstan","Uzbekistan","Turkmenistan","Tajikistan","Kyrgyzstan"]},
 china:{c:["China","North Korea","South Korea","Taiwan"]},
 middleeast:{c:["Turkey","Syria","Lebanon","Israel","Palestine","Jordan","Iraq","Iran",
   "Saudi Arabia","Yemen","Oman","United Arab Emirates","Qatar","Kuwait","Bahrain",
   "Georgia","Armenia","Azerbaijan"]},
 india:{c:["India","Pakistan","Bangladesh","Nepal","Bhutan","Sri Lanka"]},
 siam:{c:["Myanmar","Thailand","Laos","Cambodia","Vietnam","Malaysia","Brunei"]},
 indonesia:{c:["Indonesia","Philippines","Timor-Leste"]},
 newguinea:{c:["Papua New Guinea","Solomon Is."]},
 westaustralia:{c:["Australia"],box:[110,135,-45,-9]},
 eastaustralia:{c:["Australia","New Zealand"],box:[135,180,-48,-9]}
};
const LABEL={
 alaska:[-152,64],nwterr:[-108,66],greenland:[-42,72],alberta:[-116,54],ontario:[-90,52],
 quebec:[-70,50],westus:[-112,39],eastus:[-85,37],centralam:[-101,21],
 venezuela:[-70,4],peru:[-70,-14],brazil:[-50,-10],argentina:[-65,-35],
 iceland:[-19,65],greatbritain:[-3,54],scandinavia:[16,63],northerneu:[14,51],
 westerneu:[0,45],southerneu:[17,42],ukraine:[36,52],
 northafrica:[5,19],egypt:[30,26],eastafrica:[38,4],congo:[20,-3],southafrica:[25,-24],
 madagascar:[47,-20],ural:[68,58],siberia:[95,62],yakutsk:[128,67],irkutsk:[116,53],
 kamchatka:[165,62],mongolia:[104,46],japan:[139,37],afghanistan:[64,42],china:[104,33],
 middleeast:[45,29],india:[79,22],siam:[102,15],indonesia:[118,-2],newguinea:[145,-6],
 westaustralia:[122,-25],eastaustralia:[147,-27]};
const SEA=[["alaska","kamchatka"],["greenland","iceland"],["iceland","greatbritain"],
 ["iceland","scandinavia"],["greatbritain","scandinavia"],["greatbritain","northerneu"],
 ["greatbritain","westerneu"],["westerneu","northafrica"],["southerneu","northafrica"],
 ["southerneu","egypt"],["brazil","northafrica"],["eastafrica","middleeast"],
 ["madagascar","eastafrica"],["madagascar","southafrica"],["siam","indonesia"],
 ["indonesia","newguinea"],["indonesia","westaustralia"],["newguinea","eastaustralia"],
 ["japan","kamchatka"],["japan","mongolia"],["greenland","quebec"],["centralam","venezuela"]];

const VERSION="Karte v5";
const TERR=RiskEngine.TERR,IDS=Object.keys(TERR);
let polys={},center={},color={},paths=null,ready=false;
let RW=0,RH=0,SC=1,claimed=null;
let fitS=1,fitOX=0,fitOY=0;      // rückt die Karte passgenau ins Bild

function merc(lat){const l=Math.max(-58,Math.min(84,lat));
  return Math.log(Math.tan(Math.PI/4+l*Math.PI/360));}
const MT=merc(84),MB=merc(-58);
function proj(lon,lat){return[(lon+180)/360*W,H*(MT-merc(lat))/(MT-MB)];}
function fit(p){return[p[0]*fitS+fitOX,p[1]*fitS+fitOY];}
function unfitX(x){return(x-fitOX)/fitS;}
function unfitY(y){return(y-fitOY)/fitS;}

function lerpX(a,b,x){const t=(x-a[0])/(b[0]-a[0]);return[x,a[1]+(b[1]-a[1])*t];}
function lerpY(a,b,y){const t=(y-a[1])/(b[1]-a[1]);return[a[0]+(b[0]-a[0])*t,y];}
function clip(ring,box){
  if(!box)return ring;
  const tests=[{i:p=>p[0]>=box[0],c:(a,b)=>lerpX(a,b,box[0])},
               {i:p=>p[0]<=box[1],c:(a,b)=>lerpX(a,b,box[1])},
               {i:p=>p[1]>=box[2],c:(a,b)=>lerpY(a,b,box[2])},
               {i:p=>p[1]<=box[3],c:(a,b)=>lerpY(a,b,box[3])}];
  let out=ring;
  for(const t of tests){
    const s=out;out=[];
    for(let k=0;k<s.length;k++){
      const a=s[k],b=s[(k+1)%s.length],ia=t.i(a),ib=t.i(b);
      if(ia)out.push(a);
      if(ia!==ib)out.push(t.c(a,b));}
    if(!out.length)return[];}
  return out;}
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
    q.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25]);
    q.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}
  p=q;}return p;}
function area(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)
  s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return Math.abs(s/2);}

/* Staaten eines Gebiets in EINE Fläche verschmelzen.
   Wichtig: Es wird NICHT die Geometrie beschnitten (das zerreißt zerklüftete
   Länder wie Kanada und Russland und verbindet Bruchstücke mit geraden
   Linien), sondern erst das fertige Raster. Jeder Bildpunkt wird anhand
   seiner echten Länge/Breite geprüft – dadurch bleiben alle Küsten heil. */
function invLat(mapY){
  const m=MT-mapY/H*(MT-MB);
  return(Math.atan(Math.exp(m))-Math.PI/4)*360/Math.PI;
}
function rasterize(raw){
  RW=920;RH=Math.round(RW*H/W);SC=RW/W;
  const cnv=document.createElement("canvas");cnv.width=RW;cnv.height=RH;
  const c=cnv.getContext("2d",{willReadFrequently:true});
  claimed=new Int16Array(RW*RH).fill(-1);
  // Länge/Breite je Spalte bzw. Zeile einmal vorberechnen
  const lonOf=new Float32Array(RW),latOf=new Float32Array(RH);
  for(let i=0;i<RW;i++)lonOf[i]=unfitX((i+0.5)/SC)/W*360-180;
  for(let j=0;j<RH;j++)latOf[j]=invLat(unfitY((j+0.5)/SC));
  IDS.forEach((id,t)=>{
    const rings=raw[id];if(!rings||!rings.length)return;
    const box=(DEF[id]||{}).box;
    c.clearRect(0,0,RW,RH);
    c.beginPath();
    rings.forEach(r=>{c.moveTo(r[0][0]*SC,r[0][1]*SC);
      for(let i=1;i<r.length;i++)c.lineTo(r[i][0]*SC,r[i][1]*SC);
      c.closePath();});
    c.fillStyle="#fff";c.fill();
    c.strokeStyle="#fff";c.lineWidth=1.2;c.lineJoin="round";c.stroke();
    const d=c.getImageData(0,0,RW,RH).data;
    for(let j=0;j<RH;j++){
      const lat=latOf[j];
      if(box&&(lat<box[2]||lat>box[3]))continue;
      for(let i=0;i<RW;i++){
        const p=j*RW+i;
        if(d[p*4+3]<=8||claimed[p]>=0)continue;   // erster Anspruch gewinnt
        if(box){
          const lo=lonOf[i];
          const inA=lo>=box[0]&&lo<=box[1];
          const inB=(lo+360)>=box[0]&&(lo+360)<=box[1];  // jenseits der Datumsgrenze
          if(!inA&&!inB)continue;
        }
        claimed[p]=t;
      }
    }
  });
}
/* Außenkante jedes Gebiets aus dem Raster verfolgen */
function trace(){
  const em=IDS.map(()=>new Map());
  const key=(x,y)=>x+","+y;
  for(let j=0;j<RH;j++)for(let i=0;i<RW;i++){
    const t=claimed[j*RW+i];if(t<0)continue;
    const up=j>0?claimed[(j-1)*RW+i]:-1,dn=j<RH-1?claimed[(j+1)*RW+i]:-1;
    const lf=i>0?claimed[j*RW+i-1]:-1,rt=i<RW-1?claimed[j*RW+i+1]:-1;
    const m=em[t];
    const add=(x1,y1,x2,y2)=>{const k=key(x1,y1);let a=m.get(k);if(!a){a=[];m.set(k,a);}a.push([x2,y2]);};
    if(up!==t)add(i,j,i+1,j);
    if(rt!==t)add(i+1,j,i+1,j+1);
    if(dn!==t)add(i+1,j+1,i,j+1);
    if(lf!==t)add(i,j+1,i,j);
  }
  IDS.forEach((id,t)=>{
    const m=em[t];if(!m.size)return;
    const loops=[];let g=0;
    while(m.size&&g++<4000){
      const st0=m.keys().next().value;let cur=st0;const loop=[];let st=0;
      while(st++<80000){
        const arr=m.get(cur);if(!arr||!arr.length){m.delete(cur);break;}
        const n=arr.pop();if(!arr.length)m.delete(cur);
        loop.push(cur.split(",").map(Number));
        cur=key(n[0],n[1]);if(cur===st0)break;}
      if(loop.length>14)loops.push(loop);}
    const out=[];
    // Wenig vereinfachen und nur einmal runden: sonst rundet jeder Nachbar
    // dieselbe Grenze anders ab und die Kanten passen nicht mehr aufeinander.
    loops.forEach(l=>{let s=rdp(l,0.55);if(s.length<4)return;
      s=chaikin(s,1);
      const r=s.map(q=>[q[0]/SC,q[1]/SC]);
      // Splitter aussortieren: zu klein, oder nur ein dünner Strich
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      r.forEach(p=>{x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);
        x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);});
      if(x1-x0<3||y1-y0<3)return;
      if(area(r)<20)return;
      out.push(r);});
    out.sort((a,b)=>area(b)-area(a));
    if(out.length)polys[id]=out.slice(0,30);
  });
}
function build(features){
  const byName={};
  features.forEach(f=>{const n=f.properties&&f.properties.name;if(!n)return;
    (byName[n]=byName[n]||[]).push(f);});
  const raw={};
  IDS.forEach(id=>{
    const def=DEF[id];if(!def)return;
    const rings=[];
    def.c.forEach(name=>{(byName[name]||[]).forEach(f=>{
      const g=f.geometry;if(!g)return;
      const list=(g.type==="Polygon")?[g.coordinates]:(g.type==="MultiPolygon")?g.coordinates:[];
      list.forEach(poly=>{
        // Ganzes Land übernehmen – der Zuschnitt passiert später im Raster
        let outer=poly[0].map(p=>[p[0],p[1]]);
        if(name==="Russia"&&outer.some(p=>p[0]<-100))
          outer=outer.map(p=>p[0]<0?[p[0]+360,p[1]]:p);
        if(outer.length>=3)rings.push(outer.map(p=>proj(p[0],p[1])));
      });});});
    if(rings.length)raw[id]=rings;
    const base=CCOL[TERR[id].c]||"#888";
    const n=parseInt(base.slice(1),16);
    const f=0.88+((IDS.indexOf(id)*37)%5)*0.06;
    color[id]=[Math.min(255,Math.round(((n>>16)&255)*f)),
               Math.min(255,Math.round(((n>>8)&255)*f)),
               Math.min(255,Math.round((n&255)*f))];
  });
  /* Karte passgenau ins Bild rücken, damit oben und unten nichts abgeschnitten wird */
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const id in raw)raw[id].forEach(r=>r.forEach(p=>{
    if(p[0]<-40||p[0]>W+40)return;          // über die Datumsgrenze geklappte Teile ignorieren
    if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}));
  const mar=12;
  fitS=Math.min((W-2*mar)/(x1-x0),(H-2*mar)/(y1-y0));
  fitOX=mar+((W-2*mar)-(x1-x0)*fitS)/2-x0*fitS;
  fitOY=mar+((H-2*mar)-(y1-y0)*fitS)/2-y0*fitS;
  for(const id in raw)raw[id]=raw[id].map(r=>r.map(fit));
  IDS.forEach(id=>{const L=LABEL[id];if(!L)return;
    const p=fit(proj(L[0],L[1]));center[id]={x:p[0],y:p[1]};});
  rasterize(raw);
  trace();
  paths={all:new Path2D(),per:{}};
  for(const id in polys){
    const p=new Path2D();
    polys[id].forEach(r=>{
      p.moveTo(r[0][0],r[0][1]);
      for(let i=1;i<r.length;i++)p.lineTo(r[i][0],r[i][1]);
      p.closePath();
      paths.all.moveTo(r[0][0],r[0][1]);
      for(let i=1;i<r.length;i++)paths.all.lineTo(r[i][0],r[i][1]);
      paths.all.closePath();});
    paths.per[id]=p;}
  ready=true;
}
function at(x,y){
  if(!claimed)return null;
  const i=Math.floor(x*SC),j=Math.floor(y*SC);
  if(i<0||j<0||i>=RW||j>=RH)return null;
  const t=claimed[j*RW+i];return t<0?null:IDS[t];}
function seaLinks(){
  return SEA.filter(p=>center[p[0]]&&center[p[1]]).map(p=>[center[p[0]],center[p[1]]]);}

/* TopoJSON ohne Zusatzbibliothek auspacken */
function topoToFeatures(topo,objName){
  const o=topo.objects[objName],tr=topo.transform;
  const dec=p=>tr?[p[0]*tr.scale[0]+tr.translate[0],p[1]*tr.scale[1]+tr.translate[1]]:p;
  const arcs=topo.arcs.map(a=>{let x=0,y=0;
    return a.map(d=>{x+=d[0];y+=d[1];return dec([x,y]);});});
  const arcOf=i=>i<0?arcs[~i].slice().reverse():arcs[i];
  const ringOf=ix=>{const out=[];ix.forEach((ai,k)=>{
    const a=arcOf(ai);out.push(...(k?a.slice(1):a));});return out;};
  return(o.geometries||[]).map(g=>({properties:g.properties||{},
    geometry:g.type==="Polygon"?{type:"Polygon",coordinates:g.arcs.map(ringOf)}:
             g.type==="MultiPolygon"?{type:"MultiPolygon",
               coordinates:g.arcs.map(pl=>pl.map(ringOf))}:null}));
}
function load(){
  if(ready)return Promise.resolve();
  return fetch(SRC).then(r=>{if(!r.ok)throw new Error("HTTP "+r.status);return r.json();})
    .then(topo=>{const k=topo.objects.countries?"countries":Object.keys(topo.objects)[0];
      build(topoToFeatures(topo,k));});
}
return{W,H,VERSION,load,at,seaLinks,DEF,LABEL,
  get paths(){return paths;},get center(){return center;},
  get color(){return color;},get ready(){return ready;},
  get polys(){return polys;}};   // Rohumrisse je Gebiet für die 3D-Extrusion
})();
