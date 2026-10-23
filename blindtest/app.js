"use strict";
/* Blind Test des 29 — version autonome.
   L'organisateur se connecte à Spotify (OAuth PKCE, sans serveur) et sa page sert d'arbitre :
   les joueurs s'y connectent en pair-à-pair (WebRTC via PeerJS) avec le code du salon.
   ?demo : sans Spotify (morceaux factices) · ?local : transport BroadcastChannel entre onglets, pour tester. */

/* ---------- utilitaires ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LS={
  get(k,d=null){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}},
  del(k){try{localStorage.removeItem(k);}catch(e){}}
};
const Q=new URLSearchParams(location.search);
const DEMO=Q.has("demo"), LOCAL=Q.has("local");
const BASE=location.origin+location.pathname;
const TRIES=3, REVEAL_MS=9000, ONLINE_MS=15000;
const ALPHA="ABCDEFGHJKLMNPQRSTUVWXYZ";
function randStr(n,chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"){
  return Array.from(crypto.getRandomValues(new Uint8Array(n)),x=>chars[x%chars.length]).join("");
}
const clip=s=>String(s||"").trim().replace(/\s+/g," ").slice(0,20);
const plural=(n,w)=>n+" "+w+(n>1?"s":"");
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
let wake=null;
async function keepAwake(){try{if(!wake||wake.released)wake=await navigator.wakeLock.request("screen");}catch(e){wake=null;}}
async function copy(text,btn){
  try{await navigator.clipboard.writeText(text);const o=btn.textContent;btn.textContent="Copié";setTimeout(()=>btn.textContent=o,1500);}catch(e){prompt("Copie ce texte :",text);}
}

/* ---------- correspondance tolérante ---------- */
function norm(s,isTitle){
  s=String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  if(isTitle) s=s.replace(/\s[-–—]\s.*$/,"");
  s=s.replace(/\(.*?\)|\[.*?\]/g," ").replace(/\b(feat|ft|featuring)\b\.?.*$/,"");
  s=s.replace(/&|\+|\band\b|\bet\b/g," ").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
  return s.replace(/^(the|le|la|les|l) /,"");
}
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=Array.from({length:n+1},(_,i)=>i);for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[n];}
function near(g,t){
  if(!g||!t)return false; if(g===t)return true;
  const G=g.replace(/ /g,""),T=t.replace(/ /g,""); if(G===T)return true;
  const L=Math.max(G.length,T.length), tol=L<=4?0:L<=8?1:Math.floor(L*.25);
  if(lev(G,T)<=tol)return true;
  return T.length>=10&&G.length>=Math.max(5,Math.ceil(T.length*.6))&&T.includes(G);
}
const matchTitle=(g,t)=>near(norm(g,true),norm(t,true));
const matchArtist=(g,list)=>{const n=norm(g);return !!n&&(list.some(a=>near(n,norm(a)))||near(n,norm(list.join(" "))));};

/* ---------- Spotify : connexion PKCE et appels Web API ---------- */
const SP={
  scopes:"user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative streaming user-read-email user-read-private",
  tok:LS.get("bt29-token"),
  clientId(){return String(window.BT29_CLIENT_ID||LS.get("bt29-client","")||"").trim();},
  connected(){return !!(this.tok&&this.tok.refresh);},
  async login(){
    const v=randStr(64), st=randStr(16);
    LS.set("bt29-pkce",{v,st});
    const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
    const ch=btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    location.assign("https://accounts.spotify.com/authorize?"+new URLSearchParams({client_id:this.clientId(),response_type:"code",redirect_uri:BASE,code_challenge_method:"S256",code_challenge:ch,scope:this.scopes,state:st}));
  },
  async callback(){
    const code=Q.get("code"), st=Q.get("state"), e=Q.get("error");
    history.replaceState(null,"",BASE+"?host");
    const saved=LS.get("bt29-pkce");LS.del("bt29-pkce");
    if(e)throw new Error(e==="access_denied"?"Connexion Spotify annulée.":"Spotify a refusé la connexion ("+e+").");
    if(!saved||saved.st!==st)throw new Error("La connexion Spotify a expiré, recommence.");
    await this.tokenReq({grant_type:"authorization_code",code,redirect_uri:BASE,code_verifier:saved.v});
  },
  async tokenReq(params){
    const r=await fetch("https://accounts.spotify.com/api/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:this.clientId(),...params})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===400&&params.grant_type==="refresh_token")this.logout();
      throw new Error(j.error_description||j.error||"Spotify a refusé la connexion.");
    }
    this.tok={access:j.access_token,refresh:j.refresh_token||(this.tok&&this.tok.refresh),exp:Date.now()+(j.expires_in||3600)*1000};
    LS.set("bt29-token",this.tok);
  },
  logout(){this.tok=null;LS.del("bt29-token");},
  async access(force){
    if(!this.tok)return null;
    if(force||Date.now()>this.tok.exp-60000){
      if(!this._r)this._r=this.tokenReq({grant_type:"refresh_token",refresh_token:this.tok.refresh}).finally(()=>{this._r=null;});
      await this._r;
    }
    return this.tok&&this.tok.access;
  },
  async api(path,opt={}){
    for(let i=0;i<4;i++){
      const t=await this.access(i>0&&opt._401);
      if(!t){const e=new Error("auth");e.status=401;throw e;}
      const r=await fetch("https://api.spotify.com/v1"+path,{method:opt.method||"GET",headers:{Authorization:"Bearer "+t,...(opt.body?{"Content-Type":"application/json"}:{})},body:opt.body?JSON.stringify(opt.body):undefined});
      if(r.status===401&&!opt._401){opt._401=true;continue;}
      if(r.status===429||r.status===502||r.status===503){await sleep((Number(r.headers.get("Retry-After"))||2)*1000);continue;}
      const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null;}catch(e){}
      if(!r.ok){const e=new Error((j&&j.error&&j.error.message)||("Erreur Spotify "+r.status));e.status=r.status;e.reason=j&&j.error&&j.error.reason;throw e;}
      return j;
    }
    throw new Error("Spotify ne répond pas, réessaie dans un instant.");
  }
};
function friendly(e){
  if(!e)return "Erreur inconnue.";
  if(e.reason==="NO_ACTIVE_DEVICE"||(e.status===404&&/device/i.test(e.message)))return "Aucun appareil Spotify actif : ouvre Spotify sur l'appareil choisi (ou choisis « Ce navigateur »), puis réessaie.";
  if(e.reason==="PREMIUM_REQUIRED")return "Spotify demande un compte Premium pour que le jeu lance les morceaux.";
  if(e.status===401)return "Ta connexion Spotify a expiré : déconnecte-toi puis reconnecte-toi.";
  if(e.status===403)return "Spotify refuse cette action ("+e.message+"). Vérifie que ce compte est bien celui de l'appli Spotify, ou ajouté dans ses « Users ».";
  if(e instanceof TypeError)return "Impossible de joindre Spotify : vérifie la connexion internet.";
  return e.message||String(e);
}
function mapTrack(x){
  if(!x||(x.type&&x.type!=="track")||x.is_local||!x.uri||!x.name)return null;
  const imgs=(x.album&&x.album.images)||[];
  return {id:x.id||x.uri,uri:x.uri,title:x.name,artists:(x.artists||[]).map(a=>a&&a.name).filter(Boolean),image:(imgs[1]||imgs[0]||{}).url||"",duration:x.duration_ms||0,playable:x.is_playable!==false};
}
const nextPath=u=>u?u.replace("https://api.spotify.com/v1",""):null;
function playlistIdFrom(s){const m=String(s||"").match(/playlist[/:]([A-Za-z0-9]{10,})/);return m?m[1]:null;}

/* ---------- réseau : PeerJS, ou BroadcastChannel en test local ---------- */
const PEER_CFG={debug:1,config:{iceServers:[{urls:["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]}};
const peerId=code=>"bt29-salon-"+code.toLowerCase();
const hasPeer=()=>typeof window.Peer==="function";

function hostNet(code,h){
  if(LOCAL){
    const bc=new BroadcastChannel("bt29-"+code);
    bc.onmessage=e=>{const m=e.data;if(m&&m.to==="host")h.message(m.from,m.data);};
    setTimeout(()=>h.ready(),0);
    return {send(id,d){bc.postMessage({to:id,data:d});},close(){bc.close();}};
  }
  const conns=new Map();let peer=null,dead=false,retry=null;
  function start(){
    if(dead)return;
    peer=new window.Peer(peerId(code),PEER_CFG);
    peer.on("open",()=>h.ready());
    peer.on("connection",c=>{
      const id=c.peer+"/"+c.connectionId;
      c.on("open",()=>conns.set(id,c));
      c.on("data",d=>h.message(id,d));
      const bye=()=>{if(conns.delete(id))h.closed(id);};
      c.on("close",bye);c.on("error",bye);
    });
    peer.on("disconnected",()=>{if(!dead&&!peer.destroyed)setTimeout(()=>{try{peer.reconnect();}catch(e){}},1500);});
    peer.on("error",e=>{
      if(e.type==="unavailable-id"){peer.destroy();h.error("busy");clearTimeout(retry);retry=setTimeout(start,3000);return;}
      if(["network","server-error","socket-error","socket-closed","browser-incompatible"].includes(e.type))h.error(e.type==="browser-incompatible"?"browser":"network");
      console.warn("peer",e.type,e);
    });
  }
  start();
  return {
    send(id,d){const c=conns.get(id);if(c&&c.open){try{c.send(d);}catch(e){}}},
    close(){dead=true;clearTimeout(retry);try{peer.destroy();}catch(e){}}
  };
}

function joinNet(code,h){
  if(LOCAL){
    const me=randStr(8), bc=new BroadcastChannel("bt29-"+code);
    bc.onmessage=e=>{const m=e.data;if(m&&m.to===me)h.message(m.data);};
    setTimeout(()=>h.open(),0);
    return {send(d){bc.postMessage({to:"host",from:me,data:d});},close(){bc.close();},restart(){}};
  }
  let peer=null,conn=null,dead=false,t=null,att=0;
  function cleanup(){clearTimeout(t);try{conn&&conn.close();}catch(e){}try{peer&&peer.destroy();}catch(e){}conn=null;peer=null;}
  function start(){
    if(dead)return;
    const a=++att;
    const fail=why=>{if(a!==att||dead)return;att++;cleanup();h.down(why);t=setTimeout(start,why==="notfound"?4000:2000);};
    peer=new window.Peer(PEER_CFG);
    const guard=setTimeout(()=>fail("timeout"),15000);
    peer.on("open",()=>{
      conn=peer.connect(peerId(code),{reliable:true,serialization:"json"});
      conn.on("open",()=>{if(a!==att)return;clearTimeout(guard);h.open();});
      conn.on("data",d=>{if(a===att)h.message(d);});
      conn.on("close",()=>{clearTimeout(guard);fail("closed");});
      conn.on("error",()=>{clearTimeout(guard);fail("error");});
    });
    peer.on("error",e=>{clearTimeout(guard);fail(e.type==="peer-unavailable"?"notfound":"network");});
  }
  start();
  return {
    send(d){if(conn&&conn.open){try{conn.send(d);}catch(e){}}},
    close(){dead=true;cleanup();},
    restart(){if(!dead){att++;cleanup();start();}}
  };
}

/* ---------- affichage commun ---------- */
const SECTIONS=["home","pJoin","pConn","pWait","pPlay","hSetup","hLogin","hConfig","hStage","reveal","ended","hInvite","board"];
function showOnly(ids){SECTIONS.forEach(id=>{$(id).hidden=!ids.includes(id);});}
function setChip(text,kind){const c=$("chip");c.textContent=text;c.className="chip"+(kind?" "+kind:"");}
function setRound(S){
  $("round").innerHTML=(S&&(S.status==="playing"||S.status==="reveal")&&S.round)
    ?String(S.round).padStart(2,"0")+(S.maxRounds?" <small>/ "+S.maxRounds+"</small>":""):"";
}
function sortPlayers(players){
  return Object.entries(players||{}).map(([uid,p])=>({uid,...p})).sort((a,b)=>b.score-a.score||a.pseudo.localeCompare(b.pseudo));
}
function renderBoard(S,meId,canKick){
  const list=sortPlayers(S.players);
  $("board").hidden=!list.length;
  const top=list.length?list[0].score:0, cur=S.status==="playing"||S.status==="reveal";
  $("boardTitle").textContent=S.status==="lobby"?plural(list.length,"joueur")+" dans la salle":"Classement";
  $("rank").innerHTML=list.map((p,i)=>{
    const r=cur&&p.r&&p.r.round===S.round?p.r:null;
    return '<li class="'+(p.uid===meId?"me ":"")+(p.score===top&&top>0?"lead ":"")+(p.online?"":"off")+'">'
      +'<span class="pos">'+(i+1)+'</span>'
      +'<span class="pname">'+esc(p.pseudo)+(p.uid===meId?"<em>toi</em>":"")+(p.online?"":"<small>hors ligne</small>")+'</span>'
      +'<span class="marks"'+(cur?"":" hidden")+'><span class="mk'+(r&&r.a?" on":"")+'">A</span><span class="mk'+(r&&r.t?" on":"")+'">T</span></span>'
      +(canKick&&!p.online?'<button class="kick" data-kick="'+esc(p.uid)+'" aria-label="Retirer '+esc(p.pseudo)+'">Retirer</button>':'<span class="pts">'+p.score+'</span>')
      +'</li>';
  }).join("");
}
let lastRevealKey=null;
function renderReveal(S,big){
  const rv=S.reveal, show=!!rv&&(S.status==="reveal"||S.status==="ended"||S.mode==="follow");
  $("reveal").hidden=!show;
  if(!show)return;
  $("reveal").classList.toggle("tv",!!big);
  $("rvLabel").textContent="Manche "+rv.round+" : c'était";
  $("rvTitle").textContent=rv.title;
  $("rvArtist").textContent=rv.artist;
  const img=$("rvImg");
  img.onerror=()=>{img.hidden=true;};
  if(rv.image){if(img.getAttribute("src")!==rv.image)img.src=rv.image;img.hidden=false;}else{img.hidden=true;img.removeAttribute("src");}
  const names=(rv.found||[]).map(f=>{const p=S.players[f.pid];return (p?p.pseudo:"Joueur")+" ("+(f.a&&f.t?"les deux":f.a?"artiste":"titre")+(f.b?", bonus":"")+")";});
  $("rvFound").textContent=names.length?"Trouvé par "+names.join(", ")+".":"Personne n'a trouvé.";
  const key=S.gameNo+"-"+rv.round;
  if(lastRevealKey!==key){lastRevealKey=key;const el=$("reveal");el.classList.remove("pop");void el.offsetWidth;el.classList.add("pop");}
}
function renderWinner(S){
  const list=sortPlayers(S.players), top=list.length?list[0].score:0, win=list.filter(p=>p.score===top&&top>0);
  $("winLabel").textContent=win.length>1?"Égalité entre":win.length?"Victoire de":"Aucun point marqué";
  $("winName").textContent=win.map(p=>p.pseudo).join(" & ");
  $("winPts").textContent=win.length?plural(top,"point"):"";
  renderPodium(list);
}
let podiumHtml=null;
function renderPodium(list){
  // trois premières places ; les ex aequo partagent la même marche
  const groups=[];
  for(const p of list){
    if(p.score<=0)break;
    const g=groups[groups.length-1];
    if(g&&g.score===p.score)g.names.push(p.pseudo);
    else if(groups.length<3)groups.push({score:p.score,names:[p.pseudo]});
    else break;
  }
  const step=(g,k)=>g?'<div class="step p'+k+'"><span class="who">'+esc(g.names.join(" & "))+'</span><span class="sc">'+plural(g.score,"pt")+'</span><div class="blk">'+k+'</div></div>':'<div class="step"></div>';
  const html=groups.length?step(groups[1],2)+step(groups[0],1)+step(groups[2],3):"";
  // on ne réécrit le podium que s'il change, pour ne pas relancer l'animation à chaque mise à jour
  if(html!==podiumHtml){podiumHtml=html;$("podium").innerHTML=html;}
  $("podium").hidden=!groups.length;
}
function setTimer(wrap,bar,rem,total){
  $(wrap).hidden=rem==null;
  if(rem==null)return;
  $(bar).style.width=Math.max(0,Math.min(100,rem/Math.max(1,total)*100))+"%";
  $(wrap).classList.toggle("low",rem<5000);
}

/* =====================================================================
   ORGANISATEUR : arbitre, chef d'orchestre Spotify et écran télé
   ===================================================================== */
let role=null;
let G=null, hnet=null, netState="starting", hostMsg="", loginErr="", account=null;
const cmap=new Map(); const seen={}; const timers={};
let spot={st:"idle",txt:""}, playlists=[], plLoading=false, devices=[], pollT=null, busy=false, lastOnline="";
let sdkPlayer=null, sdkDevice=null, sdkStarting=null, sdkErr="", devLoaded=false;

const DEMO_TRACKS=[
  ["Alors on danse","Stromae"],["Bohemian Rhapsody","Queen"],["Get Lucky","Daft Punk","Pharrell Williams"],
  ["Rolling in the Deep","Adele"],["Je veux","Zaz"],["Billie Jean","Michael Jackson"],
  ["Dernière danse","Indila"],["Mr. Brightside","The Killers"]
].map(([title,...artists],i)=>({id:"demo"+i,uri:"",title,artists,image:"",duration:200000,playable:true}));

function defaultSettings(){return {mode:"playlist",playlist:"",playlistName:"",playlistUrl:"",device:null,rounds:20,duration:30,randomStart:true,autoNext:true};}
function freshGame(code,prev){
  const players={};
  if(prev)for(const [id,p] of Object.entries(prev.players))if(isOnline(id))players[id]={pseudo:p.pseudo,score:0,r:null,seq:0};
  return {v:1,demo:DEMO,code,gameNo:prev?prev.gameNo+1:1,status:"lobby",round:0,maxRounds:0,players,bonus:null,reveal:null,
    settings:prev?prev.settings:{...defaultSettings(),...LS.get("bt29-settings",{})},queue:[],track:null,skipId:null,roundEnds:null,nextAt:null};
}
const isOnline=pid=>Date.now()-(seen[pid]||0)<ONLINE_MS;
function pub(){
  const now=Date.now();
  return {code:G.code,gameNo:G.gameNo,status:G.status,round:G.round,maxRounds:G.maxRounds,mode:G.settings.mode,duration:G.settings.duration,
    remaining:G.status==="playing"&&G.roundEnds?Math.max(0,G.roundEnds-now):null,
    next:G.status==="reveal"&&G.nextAt?Math.max(0,G.nextAt-now):null,
    players:Object.fromEntries(Object.entries(G.players).map(([id,p])=>[id,{pseudo:p.pseudo,score:p.score,online:isOnline(id),r:p.r}])),
    bonus:G.bonus,reveal:G.reveal};
}
let bq=false;
function changed(){
  G.saved=Date.now();LS.set("bt29-game",G);
  renderHost();
  if(!bq){bq=true;queueMicrotask(()=>{bq=false;broadcast();});}
}
function broadcast(){if(!hnet)return;const s=pub();for(const id of cmap.keys())hnet.send(id,{t:"state",s});}
function checkOnline(){
  const sig=Object.keys(G.players).filter(isOnline).join(",");
  if(sig!==lastOnline){lastOnline=sig;changed();}
}

async function hostInit(){
  role="host";document.body.classList.add("is-host");
  if(Q.get("code")||Q.get("error")){try{await SP.callback();}catch(e){loginErr=e.message;}}
  else if(!Q.has("host")&&!DEMO)history.replaceState(null,"",BASE+"?host"+(LOCAL?"&local":""));
  if(!DEMO&&(!SP.clientId()||!SP.connected())){renderHost();return;}
  openRoom();
}
function openRoom(){
  const saved=LS.get("bt29-game");
  const resume=saved&&saved.v===1&&saved.demo===DEMO&&Date.now()-(saved.saved||0)<6*3600e3;
  G=resume?saved:freshGame(randStr(4,ALPHA),null);
  if(!LOCAL&&!hasPeer()){hostMsg="Le module réseau n'a pas pu se charger : recharge la page.";renderHost();return;}
  hnet=hostNet(G.code,{
    ready(){netState="ok";renderHost();},
    message:onHostMsg,
    closed(id){cmap.delete(id);},
    error(w){netState=w;renderHost();}
  });
  addEventListener("pagehide",()=>{try{hnet.close();}catch(e){}});
  setInterval(checkOnline,3000);
  if(G.status==="playing")armRound();
  if(G.status==="reveal"&&G.nextAt){G.nextAt=null;}
  fillConfig();changed();
  if(!DEMO){
    loadAccount();refreshPlaylists();
    refreshDevices().then(()=>{if(G.settings.device==="sdk"&&G.settings.mode==="playlist")startSDK().catch(()=>{});});
  }
  if(G.settings.mode==="follow")schedulePoll(0);
}

/* ----- messages des joueurs ----- */
function onHostMsg(id,m){
  if(!m||typeof m!=="object")return;
  if(m.t==="hello"){
    const pid=String(m.pid||"").slice(0,40);if(!pid)return;
    cmap.set(id,pid);seen[pid]=Date.now();
    addPlayer(pid,m.pseudo);
    lastOnline=Object.keys(G.players).filter(isOnline).join(",");
    changed();hnet.send(id,{t:"state",s:pub()});
    return;
  }
  const pid=cmap.get(id);
  if(!pid){hnet.send(id,{t:"who"});return;}
  const was=isOnline(pid);seen[pid]=Date.now();
  if(m.t==="ping"){hnet.send(id,{t:"pong"});if(!was)checkOnline();return;}
  if(m.t==="guess")judge(pid,m);
}
function addPlayer(pid,name){
  const base=clip(name)||"Joueur";
  const taken=new Set(Object.entries(G.players).filter(([k])=>k!==pid).map(([,p])=>p.pseudo.toLowerCase()));
  let n=base,i=2;while(taken.has(n.toLowerCase()))n=base.slice(0,17)+" "+(i++);
  if(!G.players[pid])G.players[pid]={pseudo:n,score:0,r:null,seq:0};
  else G.players[pid].pseudo=n;
}
function judge(pid,g){
  const p=G.players[pid];
  if(!p||G.status!=="playing"||!G.track||g.game!==G.gameNo||g.round!==G.round)return;
  const seq=Number(g.seq)||0;if(seq<=(p.seq||0))return;p.seq=seq;
  const r=p.r&&p.r.round===G.round?p.r:{round:G.round,a:false,t:false,b:false,tries:0};
  if(r.tries>=TRIES||(r.a&&r.t)){p.r=r;changed();return;}
  const artist=String(g.artist||"").slice(0,120), title=String(g.title||"").slice(0,160);
  if(!artist&&!title)return;
  r.tries++;
  if(!r.a&&artist&&matchArtist(artist,G.track.artists)){r.a=true;p.score++;}
  if(!r.t&&title&&matchTitle(title,G.track.title)){r.t=true;p.score++;}
  if(r.a&&r.t&&!(G.bonus&&G.bonus.round===G.round)){G.bonus={round:G.round,pid};r.b=true;p.score++;}
  p.r=r;changed();checkAllDone();
}
function checkAllDone(){
  const ids=Object.keys(G.players).filter(isOnline);if(!ids.length)return;
  const done=ids.every(id=>{const r=G.players[id].r;return r&&r.round===G.round&&((r.a&&r.t)||r.tries>=TRIES);});
  if(done){clearTimeout(timers.round);timers.round=setTimeout(doReveal,1500);}
}
function makeReveal(){
  const found=[];
  for(const [pid,p] of Object.entries(G.players)){const r=p.r;if(r&&r.round===G.round&&(r.a||r.t))found.push({pid,a:!!r.a,t:!!r.t,b:!!r.b});}
  return {round:G.round,title:G.track.title,artist:G.track.artists.join(", "),image:G.track.image||"",found};
}

/* ----- déroulé de la partie ----- */
function armRound(){
  clearTimeout(timers.round);
  if(G.status!=="playing"||!G.roundEnds)return;
  timers.round=setTimeout(doReveal,Math.max(0,G.roundEnds-Date.now()));
}
async function startGame(){
  const s=G.settings;
  if(s.mode==="playlist"&&!s.playlist&&!DEMO){hostMsg="Choisis une playlist.";renderHost();return;}
  busy=true;hostMsg="Préparation de la partie…";renderHost();
  try{
    G.bonus=null;G.reveal=null;G.round=0;G.track=null;G.nextAt=null;
    for(const p of Object.values(G.players)){p.score=0;p.r=null;}
    if(s.mode==="playlist"){
      if(!DEMO&&s.device==="sdk")await startSDK();
      const tracks=DEMO?DEMO_TRACKS.slice():await loadPlaylist(s.playlist);
      if(!tracks.length)throw new Error("Aucun morceau jouable dans cette playlist.");
      G.queue=shuffle(tracks);
      G.maxRounds=s.rounds?Math.min(s.rounds,tracks.length):tracks.length;
      if(s.rounds)G.queue=G.queue.slice(0,s.rounds+25);
      G.status="playing";busy=false;
      await nextRound();
      if(G.round===0){G.status="lobby";changed();}
    }else{
      G.maxRounds=s.rounds;G.status="playing";
      const np=await currentlyPlaying().catch(()=>null);
      G.skipId=np?np.id:"none";
      hostMsg="";changed();
      SP.api("/me/player/next",{method:"POST"}).catch(()=>{});
      schedulePoll(1200);
    }
  }catch(e){hostMsg=friendly(e);G.status="lobby";changed();}
  finally{busy=false;renderHost();}
}
async function nextRound(){
  if(busy||G.status==="ended")return;
  clearTimeout(timers.round);clearTimeout(timers.next);G.nextAt=null;
  if(G.maxRounds&&G.round>=G.maxRounds){await endGame();return;}
  busy=true;renderHost();
  let skips=0;
  try{
    while(G.queue.length){
      const t=G.queue.shift();
      try{await playTrack(t);}
      catch(e){
        if(e.status===403&&!["PREMIUM_REQUIRED","DEVICE_NOT_CONTROLLABLE","REMOTE_CONTROL_DISALLOW"].includes(e.reason)&&++skips<5)continue;
        G.queue.unshift(t);throw e;
      }
      G.track=t;G.round++;G.status="playing";G.roundEnds=Date.now()+G.settings.duration*1000;
      hostMsg="";spot={st:"on",txt:"lecture en cours"};
      busy=false;armRound();changed();return;
    }
    busy=false;hostMsg="Plus de morceaux disponibles dans la playlist.";await endGame();
  }catch(e){hostMsg=friendly(e);spot={st:"err",txt:"lecture impossible"};changed();}
  finally{busy=false;renderHost();}
}
async function playTrack(t){
  if(DEMO)return;
  const s=G.settings, win=s.duration*1000;
  let pos=0;
  if(s.randomStart&&t.duration>win+45000){
    const lo=Math.min(30000,t.duration*.15), hi=t.duration-win-15000;
    pos=Math.floor(lo+Math.random()*Math.max(0,hi-lo));
  }
  let dev=s.device;
  if(dev==="sdk")dev=sdkDevice||await startSDK();
  await SP.api("/me/player/play"+(dev?"?device_id="+encodeURIComponent(dev):""),{method:"PUT",body:{uris:[t.uri],position_ms:pos}});
}
function doReveal(){
  if(G.status!=="playing"||!G.track)return;
  clearTimeout(timers.round);
  G.reveal=makeReveal();G.status="reveal";G.roundEnds=null;
  if(G.settings.mode==="playlist"&&G.settings.autoNext){
    G.nextAt=Date.now()+REVEAL_MS;
    timers.next=setTimeout(()=>{if(G.status==="reveal")nextRound();},REVEAL_MS);
  }
  changed();
}
async function endGame(){
  clearTimeout(timers.round);clearTimeout(timers.next);clearTimeout(pollT);
  if(G.status==="playing"&&G.track)G.reveal=makeReveal();
  G.status="ended";G.roundEnds=null;G.nextAt=null;G.track=null;G.queue=[];
  changed();
  if(G.settings.mode==="playlist"&&!DEMO){
    const dev=G.settings.device==="sdk"?sdkDevice:G.settings.device;
    SP.api("/me/player/pause"+(dev?"?device_id="+encodeURIComponent(dev):""),{method:"PUT"}).catch(()=>{});
  }
}
async function skipFollow(){
  try{await SP.api("/me/player/next",{method:"POST"});hostMsg="";schedulePoll(800);}
  catch(e){hostMsg="Passe au morceau suivant directement dans Spotify. ("+friendly(e)+")";}
  renderHost();
}

/* ----- mode « je gère la musique » : on suit ce qui joue ----- */
async function currentlyPlaying(){
  const j=await SP.api("/me/player/currently-playing?market=from_token");
  if(!j||!j.item||(j.currently_playing_type&&j.currently_playing_type!=="track"))return null;
  const t=mapTrack(j.item);if(t)t.playing=!!j.is_playing;
  return t;
}
function schedulePoll(ms){
  clearTimeout(pollT);
  if(!G||DEMO||G.settings.mode!=="follow"||G.status==="ended")return;
  pollT=setTimeout(poll,ms);
}
async function poll(){
  try{
    const np=await currentlyPlaying();
    spot=np?{st:np.playing?"on":"warn",txt:np.playing?"lecture détectée":"en pause"}:{st:"warn",txt:"aucune lecture, lance la musique dans Spotify"};
    if(np&&(G.status==="playing"||G.status==="reveal")&&np.id!==(G.track?G.track.id:G.skipId))onNewTrack(np);
  }catch(e){spot={st:"err",txt:friendly(e)};}
  renderHost();
  schedulePoll(G.status==="lobby"?8000:3000);
}
function onNewTrack(t){
  if(G.status==="playing"&&G.track)G.reveal=makeReveal();
  if(G.maxRounds&&G.round>=G.maxRounds){endGame();return;}
  G.track=t;G.skipId=null;G.round++;G.status="playing";
  G.roundEnds=G.settings.duration?Date.now()+G.settings.duration*1000:null;
  hostMsg="";armRound();changed();
}

/* ----- données Spotify pour les réglages ----- */
let accountP=null;
function loadAccount(){
  accountP=SP.api("/me").then(a=>{account=a||{};},e=>{account={error:friendly(e)};}).then(()=>{fillPlaylists();renderHost();});
  return accountP;
}
async function refreshPlaylists(){
  plLoading=true;fillPlaylists();
  try{
    const out=[];let url="/me/playlists?limit=50";
    while(url&&out.length<400){
      const j=await SP.api(url);
      for(const p of (j&&j.items)||[])if(p&&p.id){
        const total=(p.items&&p.items.total)!=null?p.items.total:(p.tracks&&p.tracks.total)!=null?p.tracks.total:null;
        out.push({id:p.id,name:p.name||"Sans titre",total,owner:p.owner&&p.owner.id,collab:!!p.collaborative});
      }
      url=nextPath(j&&j.next);
    }
    if(accountP)await accountP;
    playlists=out;
  }catch(e){hostMsg=friendly(e);}
  plLoading=false;fillPlaylists();renderHost();
}
async function loadPlaylist(id){
  const seenIds=new Set(), out=[];
  let url="/playlists/"+encodeURIComponent(id)+"/items?limit=50&market=from_token";
  try{
    while(url&&out.length<2000){
      const j=await SP.api(url);
      for(const it of (j&&j.items)||[]){
        const t=mapTrack(it&&(it.item||it.track));
        if(t&&t.playable&&!seenIds.has(t.id)){seenIds.add(t.id);out.push(t);}
      }
      url=nextPath(j&&j.next);
    }
  }catch(e){
    if(e.status===403||e.status===404)throw new Error("Spotify refuse de lire cette playlist. Pour une appli Spotify personnelle, seules tes propres playlists (ou collaboratives) sont lisibles : copie les morceaux dans une playlist à toi, ou choisis « Je gère la musique dans Spotify ».");
    throw e;
  }
  return out;
}
async function refreshDevices(){
  try{const j=await SP.api("/me/player/devices");devices=((j&&j.devices)||[]).filter(d=>d&&d.id&&!d.is_restricted&&d.id!==sdkDevice);}
  catch(e){devices=[];}
  devLoaded=true;fillDevices();
}
function loadSDKScript(){
  return new Promise((res,rej)=>{
    if(window.Spotify&&window.Spotify.Player)return res();
    window.onSpotifyWebPlaybackSDKReady=()=>res();
    const s=document.createElement("script");s.src="https://sdk.scdn.co/spotify-player.js";
    s.onerror=()=>rej(new Error("Le lecteur Spotify du navigateur n'a pas pu se charger."));
    document.head.appendChild(s);
  });
}
function startSDK(){
  if(sdkDevice)return Promise.resolve(sdkDevice);
  if(sdkStarting)return sdkStarting;
  sdkStarting=(async()=>{
    await loadSDKScript();
    const p=sdkPlayer||new window.Spotify.Player({name:"Blind Test des 29",getOAuthToken:cb=>{SP.access().then(cb,()=>cb(""));},volume:0.8});
    sdkPlayer=p;
    const id=await new Promise((res,rej)=>{
      const to=setTimeout(()=>rej(new Error("Le lecteur du navigateur ne démarre pas. Choisis un autre appareil.")),15000);
      p.addListener("ready",({device_id})=>{clearTimeout(to);sdkDevice=device_id;sdkErr="";res(device_id);fillDevices();});
      p.addListener("not_ready",()=>{sdkDevice=null;});
      p.addListener("initialization_error",({message})=>{clearTimeout(to);rej(new Error("Ce navigateur ne peut pas lire Spotify ("+message+"). Choisis un autre appareil."));});
      p.addListener("authentication_error",()=>{clearTimeout(to);rej(new Error("Spotify refuse la lecture dans le navigateur : déconnecte-toi puis reconnecte-toi."));});
      p.addListener("account_error",()=>{clearTimeout(to);rej(new Error("La lecture dans le navigateur demande Spotify Premium."));});
      p.addListener("autoplay_failed",()=>{hostMsg="Le navigateur a bloqué le son : clique sur « Morceau suivant ».";renderHost();});
      p.connect().then(ok=>{if(!ok){clearTimeout(to);rej(new Error("Connexion du lecteur Spotify impossible."));}});
    });
    return id;
  })().catch(e=>{sdkErr=e.message;fillDevices();throw e;}).finally(()=>{sdkStarting=null;});
  return sdkStarting;
}

/* ----- réglages ----- */
function saveSettings(){hostMsg="";LS.set("bt29-settings",{...G.settings,playlistUrl:""});changed();}
function fillConfig(){
  const s=G.settings;
  document.querySelectorAll('input[name=mode]').forEach(r=>{r.checked=r.value===s.mode;r.disabled=DEMO&&r.value==="follow";});
  $("roundsSel").value=String(s.rounds);
  $("randChk").checked=!!s.randomStart;$("autoChk").checked=!!s.autoNext;
  $("plUrl").value=s.playlistUrl||"";
  fillPlaylists();fillDevices();cfgVisibility();
}
function cfgVisibility(){
  const f=G.settings.mode==="follow";
  ["cfgPlaylist","cfgDevice","cfgRandom","cfgAuto"].forEach(id=>$(id).hidden=f);
  const opts=[[20,"20 secondes"],[30,"30 secondes"],[45,"45 secondes"],[60,"1 minute"]];
  if(f)opts.push([0,"Jusqu'au morceau suivant"]);
  $("durSel").innerHTML=opts.map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join("");
  if(!opts.some(o=>o[0]===G.settings.duration))G.settings.duration=30;
  $("durSel").value=String(G.settings.duration);
}
function fillPlaylists(){
  if(!G)return;
  const sel=$("plSel"), s=G.settings;
  if(DEMO){sel.innerHTML='<option value="demo">Démo · 8 tubes, sans musique</option>';s.playlist="demo";s.playlistName="Démo";sel.disabled=true;return;}
  if(!playlists.length){sel.innerHTML='<option value="">'+(plLoading?"Chargement…":"Aucune playlist trouvée")+'</option>';return;}
  const opt=p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+(p.total!=null?" · "+p.total+" titres":"")+'</option>';
  const isMine=p=>p.collab||!account||!account.id||p.owner===account.id;
  const mine=playlists.filter(isMine), other=playlists.filter(p=>!isMine(p));
  sel.innerHTML=(mine.length?'<optgroup label="Mes playlists">'+mine.map(opt).join("")+'</optgroup>':"")
    +(other.length?'<optgroup label="Suivies (Spotify peut refuser de les lire)">'+other.map(opt).join("")+'</optgroup>':"");
  if(!s.playlistUrl){
    if(!playlists.some(p=>p.id===s.playlist)){const f=mine[0]||playlists[0];s.playlist=f.id;s.playlistName=f.name;}
    sel.value=s.playlist;
  }
}
const DEVTYPE={computer:"ordinateur",smartphone:"téléphone",speaker:"enceinte",tv:"télé",castvideo:"Chromecast",castaudio:"Chromecast",automobile:"voiture",tablet:"tablette",gameconsole:"console",avr:"ampli"};
function fillDevices(){
  if(!G)return;
  const sel=$("devSel"), s=G.settings;
  if(DEMO){sel.innerHTML='<option value="">Pas de musique en mode démo</option>';sel.disabled=true;$("devHelp").textContent="";return;}
  const opts=[["sdk","Ce navigateur"+(sdkDevice?" (prêt)":"")]];
  for(const d of devices)opts.push([d.id,d.name+" · "+(DEVTYPE[String(d.type).toLowerCase()]||d.type)+(d.is_active?" · actif":"")]);
  opts.push(["","L'appareil Spotify actif"]);
  sel.innerHTML=opts.map(([v,l])=>'<option value="'+esc(v)+'">'+esc(l)+'</option>').join("");
  if(s.device==null&&!devLoaded){sel.value="";return;}
  if(s.device==null||!opts.some(o=>o[0]===s.device)){const a=devices.find(d=>d.is_active);s.device=a?a.id:"sdk";}
  sel.value=s.device;
  $("devHelp").textContent=s.device==="sdk"
    ?(sdkErr||"Le son sort de cet appareil : branche-le à la télé ou à une enceinte. Pas disponible sur téléphone.")
    :"Spotify doit être ouvert sur cet appareil. S'il n'apparaît pas, lance un morceau dessus puis actualise.";
  $("devHelp").className=s.device==="sdk"&&sdkErr?"bad":"muted";
}
function bindHost(){
  $("copyRedir").onclick=e=>copy(BASE,e.currentTarget);
  $("saveCid").onclick=()=>{
    const v=$("cid").value.trim();
    if(!/^[0-9a-f]{32}$/i.test(v)){$("cidMsg").textContent="Le Client ID fait 32 caractères (chiffres et lettres a à f).";return;}
    LS.set("bt29-client",v);$("cidMsg").textContent="";
    if(SP.connected()&&!G)openRoom();else renderHost();
  };
  $("loginBtn").onclick=()=>{$("loginBtn").disabled=true;SP.login().catch(e=>{loginErr=e.message;$("loginBtn").disabled=false;renderHost();});};
  $("resetCid").onclick=()=>{LS.del("bt29-client");SP.logout();$("cid").value="";renderHost();};
  $("logout").onclick=()=>{SP.logout();location.href=BASE+"?host";};
  document.querySelectorAll('input[name=mode]').forEach(r=>r.onchange=()=>{G.settings.mode=r.value;cfgVisibility();saveSettings();schedulePoll(0);});
  $("plSel").onchange=()=>{const p=playlists.find(x=>x.id===$("plSel").value);if(p){G.settings.playlist=p.id;G.settings.playlistName=p.name;G.settings.playlistUrl="";$("plUrl").value="";saveSettings();}};
  $("plUrl").oninput=()=>{
    const v=$("plUrl").value.trim(), id=playlistIdFrom(v);
    G.settings.playlistUrl=v;
    if(id){G.settings.playlist=id;G.settings.playlistName="Lien collé";}
    else if(!v){const p=playlists.find(x=>x.id===$("plSel").value);if(p){G.settings.playlist=p.id;G.settings.playlistName=p.name;}}
    $("cfgMsg").textContent=v&&!id?"Ce lien ne ressemble pas à une playlist Spotify.":"";
    saveSettings();
  };
  $("plRefresh").onclick=()=>refreshPlaylists();
  $("devRefresh").onclick=()=>refreshDevices();
  $("devSel").onchange=()=>{G.settings.device=$("devSel").value;saveSettings();fillDevices();if(G.settings.device==="sdk")startSDK().catch(()=>{});};
  $("roundsSel").onchange=()=>{G.settings.rounds=Number($("roundsSel").value);saveSettings();};
  $("durSel").onchange=()=>{G.settings.duration=Number($("durSel").value);saveSettings();};
  $("randChk").onchange=()=>{G.settings.randomStart=$("randChk").checked;saveSettings();};
  $("autoChk").onchange=()=>{G.settings.autoNext=$("autoChk").checked;saveSettings();};
  const unlock=()=>{keepAwake();if(sdkPlayer){try{sdkPlayer.activateElement();}catch(e){}}};
  $("startBtn").onclick=()=>{unlock();startGame();};
  $("revealBtn").onclick=()=>doReveal();
  $("nextBtn").onclick=()=>{unlock();if(G.status==="ended")return;
    if(G.settings.mode==="follow")skipFollow();
    else if(G.status==="reveal"||G.status==="playing"){if(G.maxRounds&&G.round>=G.maxRounds&&G.status==="reveal")endGame();else nextRound();}};
  $("endBtn").onclick=()=>{
    const b=$("endBtn");
    if(!b.dataset.armed){b.dataset.armed="1";b.textContent="Confirmer la fin";setTimeout(()=>{delete b.dataset.armed;b.textContent="Terminer";},4000);return;}
    delete b.dataset.armed;b.textContent="Terminer";endGame();
  };
  $("replayBtn").onclick=()=>{G=freshGame(G.code,G);hostMsg="";fillConfig();changed();schedulePoll(0);};
  $("copyLink").onclick=e=>copy(joinLink(),e.currentTarget);
  $("rank").addEventListener("click",e=>{
    const b=e.target.closest("[data-kick]");if(!b||!G||G.status!=="lobby")return;
    delete G.players[b.dataset.kick];changed();
  });
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&G){keepAwake();schedulePoll(0);}});
}
const joinLink=()=>BASE+"?room="+G.code+(LOCAL?"&local":"");
let qrFor=null;
function renderQR(){
  const url=joinLink();if(qrFor===url)return;qrFor=url;
  if(typeof window.qrcode!=="function"){$("qr").innerHTML="";return;}
  const q=window.qrcode(0,"M");q.addData(url);q.make();
  $("qr").innerHTML=q.createSvgTag({cellSize:4,margin:2,scalable:true});
}

/* ----- écran de l'organisateur ----- */
function renderHost(){
  if(role!=="host")return;
  if(!DEMO&&!SP.clientId()){
    showOnly(["hSetup"]);setChip("Réglages");$("redir").textContent=BASE;setRound(null);return;
  }
  if(!DEMO&&!SP.connected()){
    showOnly(["hLogin"]);setChip("Régie");$("loginMsg").textContent=loginErr;$("loginBtn").disabled=false;
    $("resetCid").hidden=!!window.BT29_CLIENT_ID;setRound(null);return;
  }
  if(!G){showOnly([]);return;}
  const S=pub(), st=G.status;
  const vis=["hInvite"];
  if(st==="lobby")vis.push("hConfig");
  if(st==="playing"||st==="reveal")vis.push("hStage");
  if(st==="ended")vis.push("ended");
  vis.push("reveal","board");
  showOnly(vis);
  setRound(S);
  const net=netState==="busy"?"Récupération du salon "+G.code+"… (quelques secondes)":netState==="network"?"Connexion au réseau de jeu perdue, nouvel essai…":netState==="browser"?"Ce navigateur ne gère pas le jeu en réseau : utilise Chrome, Edge, Firefox ou Safari récent.":"";
  if(st==="lobby")setChip(netState==="ok"?"Salon ouvert":"Ouverture…");
  else if(st==="ended")setChip("Partie terminée","end");
  else setChip("En jeu","live");

  // invitation
  $("roomCode").textContent=G.code;$("joinUrl").textContent=joinLink().replace(/^https?:\/\//,"");
  $("hInvite").classList.toggle("mini",st!=="lobby");
  renderQR();

  // réglages
  if(st==="lobby"){
    const a=account;
    $("acctDot").className="dot "+(DEMO?"warn":a&&a.id?"on":a&&a.error?"err":"");
    $("acctText").textContent=DEMO?"Mode démo : pas de Spotify, pas de musique":a&&a.id?"Spotify : "+(a.display_name||a.id)+(a.product&&a.product!=="premium"?" · compte gratuit, Premium nécessaire pour lancer les morceaux":""):a&&a.error?a.error:"Spotify : connexion…";
    $("logout").hidden=DEMO;
    $("startBtn").disabled=busy||netState!=="ok";
    $("startBtn").textContent=busy?"Préparation…":"Lancer la partie";
    const n=Object.keys(G.players).length;
    $("cfgMsg").textContent=net||hostMsg||(n?"":"En attente des joueurs : ils scannent le QR code ou tapent le code sur leur téléphone.");
    $("cfgMsg").className="feedback"+(net||hostMsg?" bad":" muted");
  }

  // plateau
  if(st==="playing"||st==="reveal"){
    const follow=G.settings.mode==="follow", last=G.maxRounds&&G.round>=G.maxRounds;
    $("tvRound").textContent=G.round?"Manche "+G.round+(G.maxRounds?" sur "+G.maxRounds:""):"Avant la manche 1";
    const ps=Object.values(G.players).filter(p=>p.r&&p.r.round===G.round);
    const nA=ps.filter(p=>p.r.a).length, nT=ps.filter(p=>p.r.t).length;
    if(st==="playing"&&!G.round){
      $("tvTitle").textContent="Lance la musique !";
      $("tvSub").textContent="La manche 1 démarre dès que le morceau change dans Spotify.";
    }else if(st==="playing"){
      $("tvTitle").textContent="À vos téléphones !";
      $("tvSub").textContent=nA+nT?plural(nA,"joueur")+" "+(nA>1?"ont":"a")+" l'artiste, "+nT+" le titre.":"Artiste et titre, trois essais chacun.";
    }else{
      $("tvTitle").textContent=last?"Dernière réponse !":"La réponse";
      $("tvSub").textContent=follow?"Change de morceau dans Spotify (ou bouton ci-dessous) pour la manche suivante.":"";
    }
    $("tvDemo").hidden=!(DEMO&&G.track&&st==="playing");
    if(DEMO&&G.track)$("tvDemo").textContent="Mode démo, sans musique : fredonne « "+G.track.title+" » de "+G.track.artists.join(", ")+".";
    $("revealBtn").hidden=st!=="playing"||!G.track;
    $("nextBtn").hidden=st==="playing"&&!follow;
    $("nextBtn").textContent=st==="reveal"&&last&&!follow?"Voir le podium":"Morceau suivant";
    $("nextBtn").disabled=busy;
    $("sDot").className="dot "+(DEMO?"warn":spot.st==="on"?"on":spot.st==="warn"?"warn":spot.st==="err"?"err":"");
    $("sText").textContent=DEMO?"Mode démo":"Spotify : "+(spot.txt||"prêt");
    $("tvMsg").textContent=net||hostMsg;
  }

  // fin
  $("endCtrl").hidden=st!=="ended";
  if(st==="ended")renderWinner(S);
  renderReveal(S,true);
  renderBoard(S,null,st==="lobby");
}

/* =====================================================================
   JOUEUR
   ===================================================================== */
const PID=(()=>{
  // un identifiant par appareil (par onglet en test local) pour retrouver son score après une coupure
  const st=LOCAL?sessionStorage:localStorage;let id=null;
  try{id=st.getItem("bt29-pid");}catch(e){}
  if(!id){id=randStr(16);try{st.setItem("bt29-pid",id);}catch(e){}}
  return id;
})();
const P={code:"",net:null,S:null,state:"off",err:"",last:0,pending:null,pendT:null,deadline:null,nextAt:null,roundKey:null};

function playerInit(code){
  role="player";
  $("jCode").value=(code||"").toUpperCase();
  $("jName").value=LS.get("bt29-pseudo","");
  if(code&&LS.get("bt29-pseudo",""))connectPlayer(code.toUpperCase());
  else renderPlayer();
  setInterval(()=>{
    if(!P.net)return;
    if(P.state==="on"){
      P.net.send({t:"ping"});
      if(Date.now()-P.last>13000&&!LOCAL){P.state="connecting";P.err="Connexion perdue, on réessaie…";P.net.restart();renderPlayer();}
    }
  },4000);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState!=="visible"||!P.net)return;
    if(P.S&&P.S.status==="playing")keepAwake();
    if(P.state!=="on"||Date.now()-P.last>8000){P.net.send({t:"ping"});setTimeout(()=>{if(Date.now()-P.last>6000&&!LOCAL)P.net.restart();},2500);}
  });
}
function connectPlayer(code){
  if(P.net)P.net.close();
  P.code=code;P.S=null;P.err="";P.state="connecting";
  history.replaceState(null,"",BASE+"?room="+code+(LOCAL?"&local":""));
  if(!LOCAL&&!hasPeer()){P.err="Le module réseau n'a pas pu se charger : recharge la page.";renderPlayer();return;}
  P.net=joinNet(code,{
    open(){P.state="on";P.err="";P.last=Date.now();hello();renderPlayer();},
    message(m){
      P.last=Date.now();
      if(!m)return;
      if(m.t==="who")hello();
      if(m.t==="state")applyState(m.s);
    },
    down(w){
      P.state="connecting";
      P.err=w==="notfound"?"Salon "+code+" introuvable pour l'instant. Vérifie le code, ou attends que l'organisateur ouvre la partie.":"Connexion perdue, on réessaie…";
      renderPlayer();
    }
  });
  renderPlayer();
}
function hello(){P.net.send({t:"hello",pid:PID,pseudo:LS.get("bt29-pseudo","")});}
function applyState(s){
  if(!s||typeof s!=="object")return;
  const now=Date.now();
  P.S=s;
  P.deadline=s.remaining!=null?now+s.remaining:null;
  P.nextAt=s.next!=null?now+s.next:null;
  if(!s.players[PID]){hello();}
  const r=myR();
  if(P.pending&&(s.round!==P.pending.round||s.status!=="playing"||(r&&r.tries>P.pending.tries))){P.pending=null;clearTimeout(P.pendT);}
  if(s.status==="playing")keepAwake();
  renderPlayer();
}
function myR(){const S=P.S, p=S&&S.players[PID];return p&&p.r&&p.r.round===S.round?p.r:null;}

function bindPlayer(){
  $("joinForm").onsubmit=e=>{
    e.preventDefault();
    const code=$("jCode").value.trim().toUpperCase().replace(/[^A-Z]/g,""), name=clip($("jName").value);
    if(code.length!==4){$("jMsg").textContent="Le code du salon fait 4 lettres.";return;}
    if(!name){$("jMsg").textContent="Choisis un pseudo.";return;}
    $("jMsg").textContent="";LS.set("bt29-pseudo",name);
    keepAwake();connectPlayer(code);
  };
  $("jCode").oninput=()=>{const el=$("jCode");el.value=el.value.toUpperCase().replace(/[^A-Z]/g,"");};
  $("pLeave").onclick=()=>{if(P.net)P.net.close();P.net=null;P.S=null;P.state="off";history.replaceState(null,"",BASE+(LOCAL?"?local":""));$("jCode").value=P.code;renderPlayer();};
  $("gArtist").addEventListener("keydown",e=>{if(e.key==="Enter"&&!$("gTitle").disabled&&!$("gTitle").value.trim()){e.preventDefault();$("gTitle").focus();}});
  $("gForm").onsubmit=e=>{
    e.preventDefault();
    const S=P.S;if(!S||S.status!=="playing"||!S.round||P.pending||P.state!=="on")return;
    const r=myR();
    const artist=r&&r.a?"":$("gArtist").value.trim(), title=r&&r.t?"":$("gTitle").value.trim();
    if(!artist&&!title){$("gFb").textContent="Tape au moins l'artiste ou le titre.";$("gFb").className="feedback bad";return;}
    P.pending={round:S.round,tries:r?r.tries:0};
    P.net.send({t:"guess",game:S.gameNo,round:S.round,artist,title,seq:Date.now()});
    clearTimeout(P.pendT);P.pendT=setTimeout(()=>{P.pending=null;renderPlayer();},6000);
    renderPlayer();
  };
}

function renderPlayer(){
  if(role!=="player")return;
  if(!P.net){showOnly(["pJoin"]);setChip("Bienvenue");setRound(null);return;}
  const S=P.S;
  if(!S||P.state!=="on"){
    showOnly(["pConn"]);setChip(P.state==="on"?"Connexion":"Reconnexion");setRound(null);
    $("pConnTitle").textContent=S?"Reconnexion…":"Connexion au salon "+P.code+"…";
    $("pConnText").textContent=P.err;
    return;
  }
  const st=S.status, vis=[];
  if(st==="lobby"||(st==="playing"&&!S.round))vis.push("pWait");
  if(st==="playing"&&S.round)vis.push("pPlay");
  if(st==="ended")vis.push("ended");
  vis.push("reveal","board");
  showOnly(vis);
  setRound(S);
  setChip(st==="lobby"?"Salle d'attente":st==="ended"?"Partie terminée":st==="reveal"?"Réponse":"En jeu",st==="ended"?"end":st==="lobby"?"":"live");
  if(st==="lobby"||(st==="playing"&&!S.round)){
    const n=Object.keys(S.players).length;
    $("pWaitTitle").textContent=st==="lobby"?"Tu es dans la salle !":"Place à la musique";
    $("pWaitText").textContent=st==="lobby"?plural(n,"joueur")+" dans la salle. L'organisateur lance la partie dès que tout le monde est là.":"La première manche démarre avec le prochain morceau.";
  }
  if(st==="playing"&&S.round)renderForm(S);
  if(st==="ended")renderWinner(S);
  renderReveal(S,false);
  $("rvNext").textContent="";
  renderBoard(S,PID,false);
}
function renderForm(S){
  const key=S.gameNo+"-"+S.round;
  if(P.roundKey!==key){P.roundKey=key;$("gArtist").value="";$("gTitle").value="";$("gFb").textContent="";}
  const r=myR(), tries=r?r.tries:0, done=r&&r.a&&r.t, out=tries>=TRIES&&!done;
  $("gArtist").disabled=!!(r&&r.a)||out;$("gTitle").disabled=!!(r&&r.t)||out;
  $("gArtist").classList.toggle("out",out&&!(r&&r.a));$("gTitle").classList.toggle("out",out&&!(r&&r.t));
  $("lA").textContent=r&&r.a?"Trouvé":"";$("lA").className=r&&r.a?"ok":"";
  $("lT").textContent=r&&r.t?"Trouvé":"";$("lT").className=r&&r.t?"ok":"";
  $("gSend").disabled=!!P.pending||done||out;
  const fb=$("gFb");
  if(P.pending){fb.textContent="Vérification…";fb.className="feedback";}
  else if(done){fb.textContent=r.b?"Les deux, et le premier ! Bonus pour toi.":"Les deux trouvés. Bien joué.";fb.className="feedback ok";}
  else if(out){fb.textContent="Plus d'essais pour ce morceau. Rendez-vous au suivant.";fb.className="feedback bad";}
  else if(tries){const left=TRIES-tries;fb.textContent=(r.a?"Artiste trouvé ! ":r.t?"Titre trouvé ! ":"Raté. ")+plural(left,"essai")+" restant"+(left>1?"s":"")+".";fb.className="feedback "+(r.a||r.t?"ok":"bad");}
  else if(fb.textContent==="Vérification…")fb.textContent="";
}

/* ---------- chrono, rafraîchi en continu ---------- */
setInterval(()=>{
  const now=Date.now();
  if(role==="host"&&G){
    const rem=G.status==="playing"&&G.roundEnds?Math.max(0,G.roundEnds-now):null;
    setTimer("tvTimer","tvTimerBar",rem,G.settings.duration*1000);
    $("tvClock").textContent=rem==null?"":String(Math.ceil(rem/1000));
    $("rvNext").textContent=G.status==="reveal"&&G.nextAt?(G.maxRounds&&G.round>=G.maxRounds?"Podium":"Morceau suivant")+" dans "+Math.max(0,Math.ceil((G.nextAt-now)/1000))+" s":"";
  }
  if(role==="player"&&P.S){
    const S=P.S, rem=S.status==="playing"&&P.deadline?Math.max(0,P.deadline-now):null;
    setTimer("pTimer","pTimerBar",rem,(S.duration||30)*1000);
    if(S.status==="reveal"&&P.nextAt)$("rvNext").textContent="Morceau suivant dans "+Math.max(0,Math.ceil((P.nextAt-now)/1000))+" s";
  }
},250);

/* ---------- démarrage ---------- */
function boot(){
  bindHost();bindPlayer();
  $("goJoin").onclick=()=>{history.replaceState(null,"",BASE+"?room="+(LOCAL?"&local":""));playerInit("");};
  $("goHost").onclick=()=>{history.replaceState(null,"",BASE+"?host"+(LOCAL?"&local":""));hostInit();};
  if(Q.has("host")||Q.has("code")||Q.has("error")||DEMO)hostInit();
  else if(Q.has("room"))playerInit(Q.get("room").toUpperCase().replace(/[^A-Z]/g,"").slice(0,4));
  else{showOnly(["home"]);}
}
boot();
