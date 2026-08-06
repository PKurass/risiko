/* =====================================================================
   RISIKO — KARTE AUS DEINER SVG   [SICHERHEITSKOPIE – funktionierender Stand]
   Gehört zu: risiko_STABIL-v1.html
   Liest die 42 Territorien aus der hochgeladenen SVG. Jede Gruppe/jedes
   Pfad-Element trägt den deutschen Namen; daraus werden die Umrisse
   abgetastet, vereinfacht und dauerhaft gespeichert.
   ===================================================================== */
const SvgMap=(function(){
const VERSION="SVG-Karte v1";
const CACHE="risiko.svgmap.v1";
const TERR=RiskEngine.TERR;

/* SVG-Name (Gruppen-/Pfad-id) → Spiel-Id */
const NAME2ID={
 "Alaska":"alaska","Nordwest-Territorium":"nwterr","Groenland":"greenland","Alberta":"alberta",
 "Ontario":"ontario","Quebeck":"quebec","Weststaaten":"westus","Oststaaten":"eastus",
 "Mittelamerika":"centralam","Venezuela":"venezuela","Peru":"peru","Brasilien":"brazil",
 "Argentinien":"argentina","Island":"iceland","Großbritannien":"greatbritain",
 "Skandinavien":"scandinavia","Mitteleuropa":"northerneu","Westeuropa":"westerneu",
 "Suedeuropa":"southerneu","Ukraine":"ukraine","Nordwestafrika":"northafrica","Aegypten":"egypt",
 "Ostafrika":"eastafrica","Kongo":"congo","Suedafrika":"southafrica","Madagaskar":"madagascar",
 "Ural":"ural","Sibirien":"siberia","Jakutien":"yakutsk","Kamtschatka":"kamchatka",
 "Irkutsk":"irkutsk","Mongolei":"mongolia","Japan":"japan","Afghanistan":"afghanistan",
 "China":"china","Mittlerer_Osten":"middleeast","Indien":"india","Siam":"siam",
 "Indonesien":"indonesia","Neuguinea":"newguinea","Westaustralien":"westaustralia",
 "Ostaustralien":"eastaustralia"};

let W=1200,H=900,polys={},center={},color={},ready=false;

function perp(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
  if(L<1e-9)return Math.hypot(p[0]-a[0],p[1]-a[1]);
  return Math.abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0])/L;}
function rdp(pts,eps){if(pts.length<3)return pts;
  let im=0,dm=0;const a=pts[0],b=pts[pts.length-1];
  for(let i=1;i<pts.length-1;i++){const d=perp(pts[i],a,b);if(d>dm){dm=d;im=i;}}
  if(dm>eps)return rdp(pts.slice(0,im+1),eps).slice(0,-1).concat(rdp(pts.slice(im),eps));
  return[a,b];}
function area(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)
  s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return Math.abs(s/2);}

function parseColor(str){
  const m=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(str||"");
  return m?[+m[1],+m[2],+m[3]]:[140,150,160];}

function importSvg(text){
  const doc=new DOMParser().parseFromString(text,"image/svg+xml");
  if(doc.querySelector("parsererror"))throw new Error("SVG konnte nicht gelesen werden");
  const svg=document.importNode(doc.documentElement,true);
  let vbW=1000,vbH=800;
  const vb=(svg.getAttribute("viewBox")||"").split(/[\s,]+/).map(Number);
  if(vb.length===4){vbW=vb[2];vbH=vb[3];}
  const sc=1200/vbW;W=1200;H=Math.round(vbH*sc);
  const holder=document.createElement("div");
  holder.style.cssText="position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden";
  holder.appendChild(svg);document.body.appendChild(holder);
  polys={};center={};color={};
  try{
    for(const name in NAME2ID){
      const id=NAME2ID[name];
      const el=svg.querySelector('[id="'+cssEscape(name)+'"]');
      if(!el){console.warn("SVG: '"+name+"' nicht gefunden");continue;}
      const paths=(el.tagName.toLowerCase()==="path")?[el]:[...el.querySelectorAll("path")];
      const loops=[];let colFound=null;
      paths.forEach(pth=>{
        if(!colFound)colFound=parseColor(getComputedStyle(pth).fill);
        let L=0;try{L=pth.getTotalLength();}catch(e){return;}
        if(L<8)return;
        const step=Math.max(1.6,L/500),pts=[];
        for(let d=0;d<L;d+=step){const p=pth.getPointAtLength(d);pts.push([p.x*sc,p.y*sc]);}
        let s=rdp(pts,1.3);
        if(s.length>=4&&area(s)>10)loops.push(s.map(q=>[Math.round(q[0]*10)/10,Math.round(q[1]*10)/10]));
      });
      if(!loops.length)continue;
      loops.sort((a,b)=>area(b)-area(a));
      polys[id]=loops;
      color[id]=colFound||[140,150,160];
      const big=loops[0];
      let cx=0,cy=0;big.forEach(p=>{cx+=p[0];cy+=p[1];});
      center[id]={x:cx/big.length,y:cy/big.length};
    }
  }finally{document.body.removeChild(holder);}
  const found=Object.keys(polys).length;
  if(found<20)throw new Error("Nur "+found+" von 42 Territorien erkannt – stimmen die Namen in der SVG?");
  ready=true;
  try{localStorage.setItem(CACHE,JSON.stringify({V:VERSION,W,H,polys,center,color}));}catch(e){}
  return found;
}
function cssEscape(s){return (window.CSS&&CSS.escape)?CSS.escape(s):s.replace(/([^a-zA-Z0-9_-])/g,"\\$1");}

function useData(o){W=o.W;H=o.H;polys=o.polys;center=o.center;color=o.color;ready=true;}
function load(){
  return new Promise(res=>{
    if(window.RISIKO_MAP&&window.RISIKO_MAP.polys){useData(window.RISIKO_MAP);return res(true);}
    try{
      const raw=localStorage.getItem(CACHE);
      if(!raw)return res(false);
      const o=JSON.parse(raw);
      if(!o||!o.polys||o.V!==VERSION)return res(false);
      useData(o);res(true);
    }catch(e){res(false);}
  });
}
function clearCache(){try{localStorage.removeItem(CACHE);}catch(e){}ready=false;}
function serialize(){return JSON.stringify({V:VERSION,W,H,polys,center,color});}

return{VERSION,load,importSvg,clearCache,serialize,
  get W(){return W;},get H(){return H;},
  get polys(){return polys;},get center(){return center;},
  get color(){return color;},get ready(){return ready;},
  missing(){return Object.values(NAME2ID).filter(id=>!polys[id]).map(id=>TERR[id].n);}};
})();
