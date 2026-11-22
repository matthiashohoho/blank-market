
/* ================= ENGINE (pure, deterministic) ================= */
function rngFrom(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const pick=(r,a)=>a[Math.floor(r()*a.length)];
const shuffle=(r,arr)=>{const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const round2=v=>Math.round(v*100)/100;

const POOL=[
 {t:'NIMB',n:'Nimbus Air'},{t:'PKLE',n:'Pickle & Co'},{t:'IRON',n:'Ironbark Mining'},{t:'LUMN',n:'Lumen Labs'},
 {t:'SALT',n:'Saltwater Foods'},{t:'QUIL',n:'Quill Media'},{t:'BRGT',n:'Brightmoor Energy'},{t:'OTTR',n:'Ottervale Bank'},
 {t:'TNGO',n:'Tango Robotics'},{t:'COPR',n:'Copperline Rail'},{t:'FERN',n:'Fernhill Pharma'},{t:'GLOW',n:'Glowworm Games'},
 {t:'MOSS',n:'Mossgate Realty'},{t:'ZEPH',n:'Zephyr Motors'},{t:'KILN',n:'Kiln Ceramics'},{t:'HARB',n:'Harbor Freight Lines'}];
const COLORS=['#2f6fdf','#d9480f','#2b9a66','#9c36b5','#b8860b','#0c8599','#c2255c'];
const COND_TYPES=['volGte','buyersGte','sideCmp','volVs','secret','holdersGte','parity','mult','tMoved','priceVs','totalVol','quiet','whale','rank'];

function nice(x){x=Math.max(5,x);const st=x<50?5:x<200?10:x<1000?50:100;return Math.max(5,Math.round(x/st)*st);}
/* Volume targets scale with how many shares players can actually afford, so every rule is reachable. */
function niceVol(r,c,mult){const afford=c.cash/c.start;const crowd=1+(c.nP-1)*0.5;const cap=Math.max(5,Math.floor(afford*c.nP*0.8/5)*5);return Math.min(cap,nice(afford*pick(r,mult)*crowd));}
function someK(r,nP){return nP<=2?(r()<.5?1:2):2+Math.floor(r()*(nP-1));}
function genCond(type,r,c){
  switch(type){
    case 'volGte':{const side=r()<.6?'buy':'sell';return{type,side,n:niceVol(r,c,side==='buy'?[0.3,0.5,0.7,1,1.4]:[0.2,0.35,0.5,0.8])};}
    case 'buyersGte':return{type,side:r()<.6?'buy':'sell',k:someK(r,c.nP)};
    case 'sideCmp':{const a=r()<.5?'sell':'buy';return{type,a,b:a==='buy'?'sell':'buy'};}
    case 'volVs':return{type,t:pick(r,c.others),dir:r()<.5?'higher':'lower'};
    case 'secret':return{type,t:r()<.35?c.self:pick(r,c.others)};
    case 'holdersGte':return{type,k:someK(r,c.nP)};
    case 'parity':return{type,even:r()<.5};
    case 'mult':return{type,m:pick(r,[3,4,5])};
    case 'tMoved':return{type,t:pick(r,c.others),dir:r()<.5?'up':'down'};
    case 'priceVs':return{type,dir:r()<.5?'above':'below',p:Math.round(c.start*pick(r,[0.8,0.9,1.1,1.25,1.5])/5)*5};
    case 'totalVol':return{type,n:niceVol(r,c,[0.8,1.2,1.8,2.5])};
    case 'quiet':return{type};
    case 'whale':return{type,pct:pick(r,[60,70,80])};
    case 'rank':return{type,dir:r()<.5?'most':'least'};
  }
}
const BIG=[4,6,7,9,12,14,17,20,23,28,33,40],SMALL=[2,3,4,6,8,11,13];
function sizeEff(r,c,sign,mags){
  const m=pick(r,mags);
  if(r()<.22)return{kind:'abs',v:sign*Math.max(1,Math.round(c.start*m/100))};
  return{kind:'pct',v:sign*m};
}
function effSize(e,c){return e.kind==='pct'?Math.abs(e.v):e.kind==='abs'?Math.abs(e.v)/c.start*100:0;}
function genEffects(r,c){
  let th;const x=r();
  if(x<.12)th={kind:'copy',t:pick(r,c.others)};
  else if(x<.2)th={kind:'mirror',t:pick(r,c.others)};
  else th=sizeEff(r,c,r()<.55?1:-1,BIG);
  let el;
  for(let tries=0;tries<10;tries++){
    const y=r();
    if(th.kind==='copy'||th.kind==='mirror')el=sizeEff(r,c,r()<.5?1:-1,SMALL);
    else if(y<.22)el={kind:'flat'};
    else if(y>.85)el=sizeEff(r,c,Math.sign(th.v),SMALL);
    else el=sizeEff(r,c,-Math.sign(th.v),SMALL);
    if(el.kind==='flat'||Math.abs(effSize(el,c)-effSize(th,c))>=4)break;
  }
  return[th,el];
}
function ruleTokens(rule,nameOf){
  const T=x=>({x}),B=x=>({x:String(x),b:1});const c=rule.cond;let a;
  const poss=id=>{const n=nameOf(id);return n.endsWith('s')?"'":"'s";};
  switch(c.type){
    case 'volGte':a=[T('If at least '),B(c.n+' shares'),T(' of this stock are '),B(c.side==='buy'?'bought':'sold'),T(' in a round')];break;
    case 'buyersGte':a=[T('If '),B(c.k+' or more'),T(' players '),B(c.side),T(' this stock in a round')];break;
    case 'sideCmp':a=[T("If this stock's "),B(c.a),T(' volume is higher than its '),B(c.b),T(' volume')];break;
    case 'volVs':a=[T("If this stock's trading volume is "),B(c.dir),T(' than '),B(nameOf(c.t)+poss(c.t))];break;
    case 'secret':a=[T('If a secret is used on '),B(c.t===rule.self?'this stock':nameOf(c.t))];break;
    case 'holdersGte':a=[T('If '),B(c.k+' or more'),T(' players hold this stock after trading')];break;
    case 'parity':a=[T('If the round number is '),B(c.even?'even':'odd')];break;
    case 'mult':a=[T('If the round number is a multiple of '),B(c.m)];break;
    case 'tMoved':a=[T('If '),B(nameOf(c.t)),T(' '),B(c.dir==='up'?'rose':'fell'),T(' in the previous round')];break;
    case 'priceVs':a=[T("If this stock's price is "),B(c.dir),T(' '),B('$'+c.p),T(' when the round starts')];break;
    case 'totalVol':a=[T('If at least '),B(c.n+' shares'),T(' are traded across '),B('the whole market'),T(' in a round')];break;
    case 'quiet':a=[T('If '),B('nobody trades'),T(' this stock in a round')];break;
    case 'whale':a=[T('If one player owns more than '),B(c.pct+'%'),T(' of all player-held shares of this stock')];break;
    case 'rank':a=[T('If this stock is the '),B(c.dir),T(' expensive stock when the round starts')];break;
  }
  const eff=e=>{
    if(e.kind==='pct')return[B(e.v>0?'rises':'falls'),T(' '),B(Math.abs(e.v)+'%')];
    if(e.kind==='abs')return[B(e.v>0?'rises':'falls'),T(' by '),B('$'+Math.abs(e.v))];
    if(e.kind==='flat')return[B('stays the same')];
    if(e.kind==='copy')return[B('copies'),T(' '),B(nameOf(e.t)+poss(e.t)),T(" move from the previous round")];
    return[B('does the opposite of'),T(' '),B(nameOf(e.t)+poss(e.t)),T(" move from the previous round")];
  };
  return[...a,T(', the price '),...eff(rule.then),T('. Otherwise it '),...eff(rule.else),T('.')];
}
function nameOfFor(game){return id=>{const s=game.stocks.find(x=>x.id===id);return s?s.name:id;};}

function newGame(settings,players,seed){
  const r=rngFrom(seed);
  const picks=shuffle(r,POOL).slice(0,settings.stocks);
  const colors=shuffle(r,COLORS);
  const stocks=picks.map((p,i)=>{const price=5*Math.round((40+r()*120)/5);return{id:p.t,name:p.n,color:colors[i],price,start:price,history:[price]};});
  const types=shuffle(r,COND_TYPES);
  const nameOf=id=>stocks.find(x=>x.id===id).name;
  let total=0;
  stocks.forEach((st,i)=>{
    const c={self:st.id,others:stocks.filter(x=>x!==st).map(x=>x.id),nP:players.length,start:st.price,cash:settings.startCash};
    const cond=genCond(types[i%types.length],r,c);
    const[th,el]=genEffects(r,c);
    st.rule={self:st.id,cond,then:th,else:el};
    const toks=ruleTokens(st.rule,nameOf);
    const bIdx=toks.map((t,i)=>t.b?i:-1).filter(i=>i>=0);
    const split=toks.findIndex(t=>t.x===', the price ');
    const cB=bIdx.filter(i=>i<split),eB=bIdx.filter(i=>i>split);
    const chosen=new Set();
    if(cB.length)chosen.add(pick(r,cB));
    if(eB.length)chosen.add(pick(r,eB));
    const want=Math.min(bIdx.length,3+(r()<.35?1:0));
    for(const i of shuffle(r,bIdx)){if(chosen.size>=want)break;chosen.add(i);}
    st.blanks=[...chosen].sort((a,b)=>a-b);st.revealed=[];total+=st.blanks.length;
  });
  return{v:1,seed,settings,round:1,over:false,stocks,log:[],
    revealTarget:Math.round(total*0.5),
    players:players.map(p=>({id:p.id,name:p.name,cash:settings.startCash,holdings:{},secretsLeft:settings.secrets,hint:null,hintRound:null,secretsUsed:[]}))};
}

function evalCond(c,sid,X){
  switch(c.type){
    case 'volGte':return(c.side==='buy'?X.buy[sid]:X.sell[sid])>=c.n;
    case 'buyersGte':return(c.side==='buy'?X.buyers[sid]:X.sellers[sid])>=c.k;
    case 'sideCmp':return X[c.a][sid]>X[c.b][sid];
    case 'volVs':{const a=X.buy[sid]+X.sell[sid],b=X.buy[c.t]+X.sell[c.t];return c.dir==='higher'?a>b:a<b;}
    case 'secret':return X.secrets.has(c.t);
    case 'holdersGte':return X.holders[sid]>=c.k;
    case 'parity':return(X.round%2===0)===c.even;
    case 'mult':return X.round%c.m===0;
    case 'tMoved':{const ch=X.prev[c.t];return ch!=null&&(c.dir==='up'?ch>0:ch<0);}
    case 'priceVs':return c.dir==='above'?X.price[sid]>c.p:X.price[sid]<c.p;
    case 'totalVol':return X.total>=c.n;
    case 'quiet':return X.buy[sid]+X.sell[sid]===0;
    case 'whale':return X.whale[sid]*100>c.pct;
    case 'rank':{const ps=Object.values(X.price);return c.dir==='most'?X.price[sid]===Math.max(...ps):X.price[sid]===Math.min(...ps);}
  }
  return false;
}
function applyEffect(e,p,X){
  let ch=0;
  if(e.kind==='pct')ch=e.v/100;
  else if(e.kind==='abs')ch=e.v/p;
  else if(e.kind==='copy')ch=X.prev[e.t]??0;
  else if(e.kind==='mirror')ch=-(X.prev[e.t]??0);
  ch=Math.max(-.5,Math.min(.5,ch));
  return Math.max(1,round2(p*(1+ch)));
}

/* orders: {playerId:{trades:[{sid,side:'buy'|'sell',qty}], secret:sid|null}} */
function toList(tr){
  if(Array.isArray(tr))return tr.slice(0,500);
  const out=[];if(!tr)return out; /* older {sid:{buy,sell,times}} form */
  for(const[sid,t]of Object.entries(tr)){const n=Math.max(1,Math.min(1000,Math.floor(+t.times||1)));
    for(let k=0;k<n;k++){if(+t.sell)out.push({sid,side:'sell',qty:+t.sell});if(+t.buy)out.push({sid,side:'buy',qty:+t.buy});}}
  return out;
}
function resolveRound(S,orders){
  const s=JSON.parse(JSON.stringify(S));const r=s.round;const rng=rngFrom((s.seed^(r*2654435761))>>>0);
  const ids=s.stocks.map(x=>x.id);const z=()=>Object.fromEntries(ids.map(i=>[i,0]));
  const secrets=new Set();
  for(const p of s.players){
    const o=orders[p.id]||{};
    if(o.secret&&ids.includes(o.secret)&&p.secretsLeft>0){p.secretsLeft--;p.secretsUsed.push({round:r,sid:o.secret});secrets.add(o.secret);}
  }
  const price={};s.stocks.forEach(st=>price[st.id]=st.price);
  const buy=z(),sell=z(),buyers=z(),sellers=z();
  /* Each player's trades run in the order they were tapped, all at the round's fixed price. */
  const bSet={},sSet={};ids.forEach(i=>{bSet[i]=new Set();sSet[i]=new Set();});
  for(const p of shuffle(rng,s.players)){
    const list=toList((orders[p.id]||{}).trades);
    for(const t of list){const sid=t.sid;if(!ids.includes(sid))continue;const q=Math.max(0,Math.floor(+t.qty||0));if(!q)continue;
      if(t.side==='sell'){const n=Math.min(q,p.holdings[sid]||0);if(n<=0)continue;
        p.holdings[sid]-=n;p.cash=round2(p.cash+n*price[sid]);sell[sid]+=n;sSet[sid].add(p.id);}
      else{const n=Math.min(q,Math.floor(Math.max(0,p.cash)/price[sid]));if(n<=0)continue;
        p.holdings[sid]=(p.holdings[sid]||0)+n;p.cash=round2(p.cash-n*price[sid]);buy[sid]+=n;bSet[sid].add(p.id);}
    }
  }
  ids.forEach(i=>{buyers[i]=bSet[i].size;sellers[i]=sSet[i].size;});
  const holders=z(),whale=z(),prev={};let total=0;
  for(const sid of ids){
    let sum=0,mx=0;for(const p of s.players){const h=p.holdings[sid]||0;if(h>0)holders[sid]++;sum+=h;mx=Math.max(mx,h);}
    whale[sid]=sum>0?mx/sum:0;total+=buy[sid]+sell[sid];
  }
  for(const st of s.stocks){const h=st.history;prev[st.id]=h.length>=2?h[h.length-1]/h[h.length-2]-1:null;}
  const X={buy,sell,buyers,sellers,holders,whale,secrets,round:r,prev,price,total};
  const rep={round:r,secrets:[...secrets],st:{},revealed:[]};
  const next={};
  for(const st of s.stocks){
    const hit=evalCond(st.rule.cond,st.id,X);
    next[st.id]=applyEffect(hit?st.rule.then:st.rule.else,st.price,X);
    rep.st[st.id]={buy:buy[st.id],sell:sell[st.id],buyers:buyers[st.id],sellers:sellers[st.id],before:st.price,after:next[st.id],hit,
      hold:Object.fromEntries(s.players.map(p=>[p.id,p.holdings[st.id]||0]))};
  }
  for(const st of s.stocks){st.price=next[st.id];st.history.push(st.price);}
  if(r<=s.settings.rounds-2){
    const span=Math.max(1,s.settings.rounds-2),T=s.revealTarget;let q=Math.floor(T*r/span)-Math.floor(T*(r-1)/span);const hid=st=>st.blanks.length-st.revealed.length;
    while(q-->0){
      const c=s.stocks.filter(st=>hid(st)>0);if(!c.length)break;
      const mx=Math.max(...c.map(hid));const st=pick(rng,c.filter(x=>hid(x)===mx));
      const i=pick(rng,st.blanks.filter(i=>!st.revealed.includes(i)));
      st.revealed.push(i);rep.revealed.push({sid:st.id,i});
    }
  }
  /* Midpoint reveal: when the middle round closes, every stock shows one more word. */
  if(r===Math.floor(s.settings.rounds/2)){
    rep.midpoint=true;
    for(const st of s.stocks){const hidden=st.blanks.filter(i=>!st.revealed.includes(i));if(!hidden.length)continue;
      const i=pick(rng,hidden);st.revealed.push(i);rep.revealed.push({sid:st.id,i});}
  }
  s.log.push(rep);s.round++;
  if(s.round>s.settings.rounds)s.over=true;
  return s;
}

function netWorth(g,p){return round2(p.cash+g.stocks.reduce((a,st)=>a+(p.holdings[st.id]||0)*st.price,0));}
function hiddenIdx(g,sid,i){return !g.over&&i>0&&!!(g.log[i-1]&&g.log[i-1].secrets.includes(sid));}

/* What everyone (TV + all phones) may see. Hidden words are never sent. */
function publicView(g){
  const nameOf=nameOfFor(g);const last=g.log[g.log.length-1]||null;
  const stocks=g.stocks.map(st=>{
    const toks=ruleTokens(st.rule,nameOf);
    const newly=last?last.revealed.filter(x=>x.sid===st.id).map(x=>x.i):[];
    return{id:st.id,name:st.name,color:st.color,start:st.start,
      history:st.history.map((v,i)=>hiddenIdx(g,st.id,i)?null:v),
      rule:toks.map((t,i)=>{const isB=st.blanks.includes(i);
        if(isB&&!st.revealed.includes(i))return g.over?{x:t.x,k:'end'}:{k:'blank',n:t.x.trim().split(/\s+/).length};
        return isB?{x:t.x,k:newly.includes(i)?'new':'rev'}:{x:t.x};})};
  });
  let report=null;
  if(last){report={round:last.round,secrets:last.secrets,revealed:last.revealed.map(x=>x.sid),midpoint:!!last.midpoint,st:{}};
    for(const st of g.stocks){const r=last.st[st.id];
      report.st[st.id]=(last.secrets.includes(st.id)&&!g.over)?{hidden:true}:{buy:r.buy,sell:r.sell,buyers:r.buyers,sellers:r.sellers,before:r.before,after:r.after,hold:r.hold};}}
  const out={round:g.round,rounds:g.settings.rounds,over:g.over,settings:g.settings,stocks,report,
    players:g.players.map(p=>({id:p.id,name:p.name}))};
  if(g.over){
    out.standings=g.players.map(p=>({id:p.id,name:p.name,nw:netWorth(g,p),cash:p.cash,secretsUsed:p.secretsUsed,hint:p.hint,hintRound:p.hintRound}))
      .sort((a,b)=>b.nw-a.nw);
    out.fullHistory=Object.fromEntries(g.stocks.map(s=>[s.id,s.history]));
  }
  return out;
}
/* Private extras for one player. */
function privateView(g,pid){
  const p=g.players.find(x=>x.id===pid);if(!p)return null;
  let hintRule=null;
  if(p.hint){const st=g.stocks.find(s=>s.id===p.hint);hintRule={sid:st.id,rule:ruleTokens(st.rule,nameOfFor(g)).map((t,i)=>({x:t.x,k:st.blanks.includes(i)?(st.revealed.includes(i)?'rev':'hint'):undefined}))};}
  return{id:p.id,name:p.name,cash:p.cash,holdings:p.holdings,secretsLeft:p.secretsLeft,hint:p.hint,hintRule};
}
module.exports={newGame,resolveRound,publicView,privateView,netWorth,round2};
