/* =====================================================================
   RISIKO — REGELKERN  (TEIL 1)

   Die gesamte Spiellogik. Kennt kein HTML, kein Three.js und keine Karte:
   nur Zustand rein, Zustand raus. Jede Aenderung laeuft ueber genau einen
   Weg – apply(state, action) klont den Zustand und gibt einen neuen
   zurueck, der Eingabezustand bleibt unberuehrt.

   Warum eine eigene Datei? Drei Gruende:
     1. Der Kern laesst sich ohne Browser pruefen – siehe
        werkzeug/regeln-testen.mjs, Aufruf: npm test.
     2. Fuer den spaeteren Online-Betrieb muss derselbe Code auch auf dem
        Server laufen, um Aktionen zu validieren. Aus einer HTML-Datei
        heraus ginge das nur mit Textschnippeln.
     3. werkzeug/karte-backen.mjs braucht RiskEngine.TERR und laedt jetzt
        schlicht diese Datei, statt sie aus risiko.html zu schneiden.

   Bewusst gewoehnliches Browser-JavaScript ohne Modul-Syntax: risiko.html
   bindet die Datei per <script src> ein, ohne Build-Schritt. Wer sie in
   Node braucht, laedt sie ueber werkzeug/regeln-laden.mjs.

   Aufbau: Weltdaten (TERR, ADJ, CONTINENTS) – Zufall – Hilfsfunktionen –
   validate() – apply(). Die Hausregeln stecken in apply() und haengen an
   den Schaltern in state.opts; Details in DOKUMENTATION.md Abschnitt 4.4.
   ===================================================================== */
const RiskEngine=(function(){
const CONTINENTS={Nordamerika:{bonus:5},Suedamerika:{bonus:2},Europa:{bonus:5},
  Afrika:{bonus:3},Asien:{bonus:7},Australien:{bonus:2}};
const TERR={
 alaska:{n:"Alaska",c:"Nordamerika"},nwterr:{n:"Nordwest-Terr.",c:"Nordamerika"},
 greenland:{n:"Grönland",c:"Nordamerika"},alberta:{n:"Alberta",c:"Nordamerika"},
 ontario:{n:"Ontario",c:"Nordamerika"},quebec:{n:"Québec",c:"Nordamerika"},
 westus:{n:"Weststaaten",c:"Nordamerika"},eastus:{n:"Oststaaten",c:"Nordamerika"},
 centralam:{n:"Mittelamerika",c:"Nordamerika"},
 venezuela:{n:"Venezuela",c:"Suedamerika"},peru:{n:"Peru",c:"Suedamerika"},
 brazil:{n:"Brasilien",c:"Suedamerika"},argentina:{n:"Argentinien",c:"Suedamerika"},
 iceland:{n:"Island",c:"Europa"},greatbritain:{n:"Großbritannien",c:"Europa"},
 scandinavia:{n:"Skandinavien",c:"Europa"},northerneu:{n:"Mitteleuropa",c:"Europa"},
 westerneu:{n:"Westeuropa",c:"Europa"},southerneu:{n:"Südeuropa",c:"Europa"},
 ukraine:{n:"Ukraine",c:"Europa"},
 northafrica:{n:"Nordafrika",c:"Afrika"},egypt:{n:"Ägypten",c:"Afrika"},
 eastafrica:{n:"Ostafrika",c:"Afrika"},congo:{n:"Kongo",c:"Afrika"},
 southafrica:{n:"Südafrika",c:"Afrika"},madagascar:{n:"Madagaskar",c:"Afrika"},
 ural:{n:"Ural",c:"Asien"},siberia:{n:"Sibirien",c:"Asien"},yakutsk:{n:"Jakutien",c:"Asien"},
 kamchatka:{n:"Kamtschatka",c:"Asien"},irkutsk:{n:"Irkutsk",c:"Asien"},mongolia:{n:"Mongolei",c:"Asien"},
 japan:{n:"Japan",c:"Asien"},afghanistan:{n:"Afghanistan",c:"Asien"},china:{n:"China",c:"Asien"},
 middleeast:{n:"Mittlerer Osten",c:"Asien"},india:{n:"Indien",c:"Asien"},siam:{n:"Siam",c:"Asien"},
 indonesia:{n:"Indonesien",c:"Australien"},newguinea:{n:"Neuguinea",c:"Australien"},
 westaustralia:{n:"West-Australien",c:"Australien"},eastaustralia:{n:"Ost-Australien",c:"Australien"}};
const ADJ={
 alaska:["nwterr","alberta","kamchatka"],nwterr:["alaska","alberta","ontario","greenland"],
 greenland:["nwterr","ontario","quebec","iceland"],alberta:["alaska","nwterr","ontario","westus"],
 ontario:["nwterr","alberta","greenland","quebec","westus","eastus"],quebec:["greenland","ontario","eastus"],
 westus:["alberta","ontario","eastus","centralam"],eastus:["ontario","quebec","westus","centralam"],
 centralam:["westus","eastus","venezuela"],
 venezuela:["centralam","peru","brazil"],peru:["venezuela","brazil","argentina"],
 brazil:["venezuela","peru","argentina","northafrica"],argentina:["peru","brazil"],
 iceland:["greenland","greatbritain","scandinavia"],greatbritain:["iceland","scandinavia","northerneu","westerneu"],
 scandinavia:["iceland","greatbritain","northerneu","ukraine"],
 northerneu:["greatbritain","scandinavia","ukraine","southerneu","westerneu"],
 westerneu:["greatbritain","northerneu","southerneu","northafrica"],
 southerneu:["northerneu","westerneu","ukraine","middleeast","egypt","northafrica"],
 ukraine:["scandinavia","northerneu","southerneu","ural","afghanistan","middleeast"],
 northafrica:["brazil","westerneu","southerneu","egypt","eastafrica","congo"],
 egypt:["southerneu","northafrica","eastafrica","middleeast"],
 eastafrica:["egypt","northafrica","congo","southafrica","madagascar","middleeast"],
 congo:["northafrica","eastafrica","southafrica"],southafrica:["congo","eastafrica","madagascar"],
 madagascar:["eastafrica","southafrica"],
 ural:["ukraine","siberia","china","afghanistan"],siberia:["ural","yakutsk","irkutsk","mongolia","china"],
 yakutsk:["siberia","irkutsk","kamchatka"],kamchatka:["yakutsk","irkutsk","mongolia","japan","alaska"],
 irkutsk:["siberia","yakutsk","kamchatka","mongolia"],mongolia:["siberia","irkutsk","kamchatka","japan","china"],
 japan:["kamchatka","mongolia"],afghanistan:["ukraine","ural","china","india","middleeast"],
 china:["ural","siberia","mongolia","afghanistan","india","siam"],
 middleeast:["ukraine","southerneu","egypt","eastafrica","afghanistan","india"],
 india:["afghanistan","china","middleeast","siam"],siam:["china","india","indonesia"],
 indonesia:["siam","newguinea","westaustralia"],newguinea:["indonesia","westaustralia","eastaustralia"],
 westaustralia:["indonesia","newguinea","eastaustralia"],eastaustralia:["newguinea","westaustralia"]};
const SYMS=["inf","kav","art"],START={2:40,3:35,4:30,5:25,6:20},NONE=-1;
function rnd(s){s.rng=(s.rng+0x6D2B79F5)|0;let t=s.rng;t=Math.imul(t^(t>>>15),t|1);
  t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
function rint(s,n){return Math.floor(rnd(s)*n);}
function shuffle(s,a){for(let i=a.length-1;i>0;i--){const j=rint(s,i+1);const t=a[i];a[i]=a[j];a[j]=t;}return a;}
function roll(s,n){const a=[];for(let i=0;i<n;i++)a.push(1+rint(s,6));return a.sort((x,y)=>y-x);}
function clone(s){return JSON.parse(JSON.stringify(s));}
function say(s,t,c,d){s.log.push({t:t,c:c||"l-sys",d:d||null});}
function terrOf(s,pi){return Object.keys(TERR).filter(id=>s.owner[id]===pi);}
function freeTerr(s){return Object.keys(TERR).filter(id=>s.owner[id]===NONE);}
function contBonus(s,pi){let b=0;for(const c in CONTINENTS){
  const m=Object.keys(TERR).filter(id=>TERR[id].c===c);
  if(m.length&&m.every(id=>s.owner[id]===pi))b+=CONTINENTS[c].bonus;}return b;}
function incomeOf(s,pi){return Math.max(3,Math.floor(terrOf(s,pi).length/3))+contBonus(s,pi);}
function tradeValue(c){const V=[4,6,8,10,12,15];return c<6?V[c]:15+(c-5)*5;}
function isValidSet(cs){if(!cs||cs.length!==3||cs.some(c=>!c))return false;
  if(cs.some(c=>c.sym==="wild"))return true;
  const u=new Set(cs.map(c=>c.sym));return u.size===1||u.size===3;}
function mustTrade(s){return s.opts.cards&&s.phase==="reinforce"&&s.hands[s.cur].length>=5;}
/* Wuerfelgrenzen. Ohne die Hausregel wird immer die Hoechstzahl geworfen –
   das ist genau das klassische Verhalten. */
function attackMaxOf(s,f){return Math.max(1,Math.min(3,s.armies[f]-1));}
function defendMaxOf(s,t){return Math.max(1,Math.min(2,s.armies[t]));}
function fortifyCapOf(s,f){return s.fortCap[f]===undefined?Math.max(0,s.armies[f]-1):s.fortCap[f];}
function fortifyMaxOf(s,f){return Math.max(0,Math.min(fortifyCapOf(s,f),s.armies[f]-1));}
function inSetup(s){return s.phase==="claim"||s.phase==="deploy";}
function buildDeck(s){const d=[];Object.keys(TERR).forEach((id,i)=>d.push({sym:SYMS[i%3]}));
  d.push({sym:"wild"});d.push({sym:"wild"});return shuffle(s,d);}
function createGame(players,opts,seed){
  const s={players:players.map(p=>({name:p.name,color:p.color,alive:true})),owner:{},armies:{},
    opts:{cap3:!!opts.cap3,chain:!!opts.chain,cards:!!opts.cards,draft:!!opts.draft,
      dice:!!opts.dice},
    cur:0,phase:"claim",reinf:0,toPlace:[],hands:players.map(()=>[]),deck:[],discard:[],
    tradeCount:0,conquered:false,pending:null,fortCap:{},winner:null,rng:(seed>>>0)||1,log:[]};
  Object.keys(TERR).forEach(id=>{s.owner[id]=NONE;s.armies[id]=0;});
  const per=START[players.length]||30;s.toPlace=players.map(()=>per);s.deck=buildDeck(s);
  say(s,"Spiel gestartet · "+players.length+" Spieler · je "+per+" Truppen.");
  if(s.opts.draft){say(s,"Aufstellung: wählt reihum ein freies Land.");return s;}
  return autoSetup(s);}
function autoSetup(s){
  while(freeTerr(s).length>0){const f=freeTerr(s);const id=f[rint(s,f.length)];
    s.owner[id]=s.cur;s.armies[id]=1;s.toPlace[s.cur]--;s.cur=(s.cur+1)%s.players.length;}
  let g=0;while(s.toPlace.some(n=>n>0)&&g++<5000){
    if(s.toPlace[s.cur]>0){const m=terrOf(s,s.cur);s.armies[m[rint(s,m.length)]]++;s.toPlace[s.cur]--;}
    s.cur=(s.cur+1)%s.players.length;}
  say(s,"Aufstellung abgeschlossen.");s.cur=0;beginTurn(s);return s;}
function nextDeployer(s){for(let i=1;i<=s.players.length;i++){const c=(s.cur+i)%s.players.length;
  if(s.toPlace[c]>0){s.cur=c;return true;}}return false;}
function beginTurn(s){let g=0;while(!s.players[s.cur].alive&&g++<12)s.cur=(s.cur+1)%s.players.length;
  s.phase="reinforce";s.reinf=incomeOf(s,s.cur);s.conquered=false;s.pending=null;s.fortCap={};
  say(s,s.players[s.cur].name+" am Zug · +"+s.reinf+" Truppen.");}
function drawCard(s,pi){if(s.deck.length===0){s.deck=shuffle(s,s.discard);s.discard=[];}
  if(s.deck.length===0)return;s.hands[pi].push(s.deck.pop());}
function checkWin(s){const o=new Set(Object.keys(TERR).map(id=>s.owner[id]));
  if(o.size===1){s.winner=[...o][0];say(s,s.players[s.winner].name+" gewinnt!","l-conq");}}
/* Wertet einen begonnenen Angriff aus: der Verteidiger wirft nD Wuerfel,
   danach werden die sortierten Wuerfe paarweise verglichen. Bei Gleichstand
   gewinnt der Verteidiger. Erwartet s.pending vom Typ "defend". */
function resolveCombat(s,nD){
  const p=s.pending,aD=p.aDice,dD=roll(s,nD);
  let aL=0,dL=0;
  for(let i=0;i<Math.min(aD.length,dD.length);i++){if(aD[i]>dD[i])dL++;else aL++;}
  s.armies[p.from]-=aL;s.armies[p.to]-=dL;
  s.pending=null;
  say(s,s.players[s.cur].name+" greift "+TERR[p.to].n+" an · A −"+aL+", V −"+dL,"l-att",{a:aD,d:dD});
  if(s.armies[p.to]<=0){const loser=s.owner[p.to];s.owner[p.to]=s.cur;s.conquered=true;
    const mx=s.opts.cap3?Math.min(3,s.armies[p.from]-1):(s.armies[p.from]-1);
    s.pending={type:"occupy",from:p.from,to:p.to,max:Math.max(1,mx)};
    if(terrOf(s,loser).length===0&&s.players[loser].alive){s.players[loser].alive=false;
      const tk=s.hands[loser].length;
      if(tk>0){s.hands[s.cur]=s.hands[s.cur].concat(s.hands[loser]);s.hands[loser]=[];
        say(s,s.players[s.cur].name+" übernimmt "+tk+" Karte"+(tk===1?"":"n")+".","l-card");}
      say(s,s.players[loser].name+" ist ausgeschieden.");}}
  return s;}
function validate(s,a){
  if(!s)return{ok:false,error:"Kein Spiel"};
  if(s.winner!==null)return{ok:false,error:"Spiel ist beendet"};
  if(s.pending){
    if(s.pending.type==="defend"&&a.type!=="DEFEND")
      return{ok:false,error:"Der Verteidiger muss erst seine Würfel wählen"};
    if(s.pending.type==="occupy"&&a.type!=="OCCUPY")
      return{ok:false,error:"Erst Truppen ins eroberte Land setzen"};}
  if(inSetup(s)&&!["CLAIM","DEPLOY","AUTO_SETUP"].includes(a.type))return{ok:false,error:"Die Aufstellung läuft noch"};
  if(!inSetup(s)&&["CLAIM","DEPLOY","AUTO_SETUP"].includes(a.type))return{ok:false,error:"Aufstellung ist abgeschlossen"};
  switch(a.type){
   case "CLAIM":
    if(s.owner[a.terr]===undefined)return{ok:false,error:"Unbekanntes Land"};
    if(s.owner[a.terr]!==NONE)return{ok:false,error:"Dieses Land ist schon vergeben"};
    return{ok:true};
   case "DEPLOY":
    if(s.phase!=="deploy")return{ok:false,error:"Erst alle Länder verteilen"};
    if(s.owner[a.terr]!==s.cur)return{ok:false,error:"Nicht dein Land"};
    if(s.toPlace[s.cur]<=0)return{ok:false,error:"Keine Starttruppen übrig"};
    return{ok:true};
   case "AUTO_SETUP":return{ok:true};
   case "PLACE":
    if(s.phase!=="reinforce")return{ok:false,error:"Nur in der Verstärkungsphase"};
    if(s.owner[a.terr]!==s.cur)return{ok:false,error:"Nicht dein Land"};
    if(s.reinf<=0)return{ok:false,error:"Keine Truppen übrig"};
    return{ok:true};
   case "TRADE":{
    if(!s.opts.cards)return{ok:false,error:"Karten deaktiviert"};
    if(s.phase!=="reinforce")return{ok:false,error:"Tauschen nur in Phase 1"};
    const ix=a.cards||[];
    if(ix.length!==3)return{ok:false,error:"Genau 3 Karten wählen"};
    if(new Set(ix).size!==3)return{ok:false,error:"Karte doppelt gewählt"};
    const h=s.hands[s.cur];
    if(ix.some(i=>i<0||i>=h.length))return{ok:false,error:"Karte existiert nicht"};
    if(!isValidSet(ix.map(i=>h[i])))return{ok:false,error:"Ungültige Kombination"};
    return{ok:true};}
   case "ATTACK":{
    if(s.phase!=="attack")return{ok:false,error:"Nur in der Angriffsphase"};
    if(s.owner[a.from]!==s.cur)return{ok:false,error:"Startland gehört dir nicht"};
    if(s.owner[a.to]===s.cur)return{ok:false,error:"Eigenes Land angreifen geht nicht"};
    if(!ADJ[a.from]||!ADJ[a.from].includes(a.to))return{ok:false,error:"Länder grenzen nicht aneinander"};
    if(s.armies[a.from]<2)return{ok:false,error:"Mindestens 2 Truppen nötig"};
    if(s.opts.dice&&a.dice!==undefined){const mx=attackMaxOf(s,a.from);
      if(!Number.isInteger(a.dice)||a.dice<1||a.dice>mx)
        return{ok:false,error:"Würfelzahl muss 1–"+mx+" sein"};}
    return{ok:true};}
   case "DEFEND":
    if(!s.pending||s.pending.type!=="defend")return{ok:false,error:"Gerade wird nicht verteidigt"};
    if(!Number.isInteger(a.dice)||a.dice<1||a.dice>s.pending.max)
      return{ok:false,error:"Würfelzahl muss 1–"+s.pending.max+" sein"};
    return{ok:true};
   case "OCCUPY":
    if(!s.pending||s.pending.type!=="occupy")return{ok:false,error:"Nichts zu besetzen"};
    if(!Number.isInteger(a.count)||a.count<1||a.count>s.pending.max)
      return{ok:false,error:"Anzahl muss 1–"+s.pending.max+" sein"};
    return{ok:true};
   case "FORTIFY":{
    if(s.phase!=="fortify")return{ok:false,error:"Nur in der Verschiebephase"};
    if(s.owner[a.from]!==s.cur||s.owner[a.to]!==s.cur)return{ok:false,error:"Beide Länder müssen dir gehören"};
    if(!ADJ[a.from]||!ADJ[a.from].includes(a.to))return{ok:false,error:"Länder grenzen nicht aneinander"};
    if(s.armies[a.from]<2)return{ok:false,error:"Mindestens 1 Truppe muss bleiben"};
    const mx=fortifyMaxOf(s,a.from);
    if(mx<=0)return{ok:false,error:"Dieses Land kann diesen Zug nichts mehr abgeben"};
    if(a.count!==undefined&&(!Number.isInteger(a.count)||a.count<1||a.count>mx))
      return{ok:false,error:"Anzahl muss 1–"+mx+" sein"};
    return{ok:true};}
   case "END_PHASE":
    if(s.phase==="reinforce"&&s.reinf>0)return{ok:false,error:"Erst alle Truppen setzen"};
    if(mustTrade(s))return{ok:false,error:"Bei 5+ Karten musst du erst tauschen"};
    return{ok:true};
   default:return{ok:false,error:"Unbekannte Aktion"};}}
function apply(state,a){
  const v=validate(state,a);
  if(!v.ok)return{ok:false,error:v.error,state:state};
  const s=clone(state);
  switch(a.type){
   case "CLAIM":{s.owner[a.terr]=s.cur;s.armies[a.terr]=1;s.toPlace[s.cur]--;
     if(freeTerr(s).length===0){say(s,"Alle Länder vergeben. Jetzt Starttruppen setzen.");
       s.phase="deploy";s.cur=0;if(s.toPlace[0]<=0&&!nextDeployer(s)){s.cur=0;beginTurn(s);}}
     else s.cur=(s.cur+1)%s.players.length;break;}
   case "DEPLOY":{s.armies[a.terr]++;s.toPlace[s.cur]--;
     if(!s.toPlace.some(n=>n>0)){say(s,"Aufstellung abgeschlossen.");s.cur=0;beginTurn(s);}
     else nextDeployer(s);break;}
   case "AUTO_SETUP":return{ok:true,state:autoSetup(s)};
   case "PLACE":s.armies[a.terr]++;s.reinf--;break;
   case "TRADE":{const h=s.hands[s.cur];
     [...a.cards].sort((x,y)=>y-x).forEach(i=>{s.discard.push(h[i]);h.splice(i,1);});
     const val=tradeValue(s.tradeCount);s.tradeCount++;s.reinf+=val;
     say(s,"Karten getauscht → +"+val+" Truppen.","l-card");break;}
   case "ATTACK":{
     /* Der Angreifer wuerfelt zuerst und legt offen. Erst danach entscheidet
        der Verteidiger, mit wie vielen Wuerfeln er kontert – deshalb ist der
        Angriff in zwei Aktionen geteilt. Hat der Verteidiger keine Wahl
        (nur eine Truppe, oder Hausregel aus), wird sofort ausgewertet. */
     const nA=s.opts.dice&&a.dice!==undefined?a.dice:attackMaxOf(s,a.from);
     const aD=roll(s,nA),maxD=defendMaxOf(s,a.to);
     s.pending={type:"defend",from:a.from,to:a.to,aDice:aD,max:maxD};
     if(!s.opts.dice||maxD<2)return{ok:true,state:resolveCombat(s,maxD)};
     say(s,s.players[s.cur].name+" greift "+TERR[a.to].n+" an mit "+nA+
       (nA===1?" Würfel":" Würfeln")+" · "+s.players[s.owner[a.to]].name+" wählt die Abwehr.",
       "l-att",{a:aD,d:[]});
     break;}
   case "DEFEND":return{ok:true,state:resolveCombat(s,a.dice)};
   case "OCCUPY":{const p=s.pending;s.armies[p.from]-=a.count;s.armies[p.to]=a.count;s.pending=null;
     say(s,a.count+" Truppen nach "+TERR[p.to].n+" vorgeschoben.","l-conq");checkWin(s);break;}
   case "FORTIFY":{const cap=fortifyCapOf(s,a.from);
     const mv=(a.count===undefined)?fortifyMaxOf(s,a.from):a.count;
     s.armies[a.from]-=mv;s.armies[a.to]+=mv;s.fortCap[a.from]=cap-mv;
     say(s,mv+" Truppen von "+TERR[a.from].n+" nach "+TERR[a.to].n+" (Rest: "+s.fortCap[a.from]+").");break;}
   case "END_PHASE":{
     if(s.phase==="reinforce")s.phase="attack";
     else if(s.phase==="attack"){s.phase="fortify";s.fortCap={};
       Object.keys(TERR).forEach(id=>{if(s.owner[id]===s.cur)s.fortCap[id]=Math.max(0,s.armies[id]-1);});}
     else{if(s.opts.cards&&s.conquered){drawCard(s,s.cur);say(s,s.players[s.cur].name+" zieht eine Karte.","l-card");}
       s.cur=(s.cur+1)%s.players.length;beginTurn(s);}
     break;}}
  return{ok:true,state:s};}
return{CONTINENTS,TERR,ADJ,NONE,createGame,apply,validate,terrOf,freeTerr,incomeOf,
  tradeValue,isValidSet,mustTrade,fortifyCapOf,fortifyMaxOf,inSetup,
  attackMaxOf,defendMaxOf};
})();
