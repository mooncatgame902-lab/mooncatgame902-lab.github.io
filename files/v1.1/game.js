/* =====================================================================
 *  game.js — 遊戲引擎
 *  畫面流程 / 地圖生成 / 速度條戰鬥 / 傷害計算 / 渲染
 *  ===================================================================== */
const D = window.GAMEDATA;
const $ = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>[...r.querySelectorAll(s)];
const rnd = (n)=> (Math.random()*n)|0;
const pick = (arr)=> arr[rnd(arr.length)];
const clamp = (v,a,b)=> Math.max(a,Math.min(b,v));

/* ====================== 全域狀態 ====================== */
const G = {
  screen:'title',
  cls:null,            // 選擇的職業 key
  slot:0,
  run:null,            // 本次冒險資料
  meta:{ soul:0 },     // 周回（靈魂能量）
  player:null,
  // 戰鬥用
  enemies:[], hand:[], drawPile:[], discardPile:[], exhaustPile:[],
  energy:0, turn:0, selectedCard:null, pendingDiscard:0, combatActive:false,
  inCombatReward:null,
};

/* ====================== 存檔 ====================== */
function saveGame(){
  try{
    const data = { meta:G.meta, run:G.run, player:serializePlayer(), cls:G.cls };
    localStorage.setItem('roguelike_slot_'+G.slot, JSON.stringify(data));
  }catch(e){ /* file:// 下 localStorage 可能受限，遊戲仍可在記憶體中進行 */ }
}
function loadSlot(slot){
  try{ const raw=localStorage.getItem('roguelike_slot_'+slot); return raw?JSON.parse(raw):null; }catch(e){ return null; }
}
function serializePlayer(){
  const p=G.player; if(!p) return null;
  return { hp:p.hp,maxHp:p.maxHp,baseStr:p.baseStr,baseAgi:p.baseAgi,baseInt:p.baseInt,baseWill:p.baseWill,baseCon:p.baseCon,
    food:p.food,water:p.water,level:p.level,exp:p.exp,gold:p.gold,deck:p.deck,relics:p.relics,equipment:p.equipment,handLimit:p.handLimit };
}

/* ====================== 畫面路由 ====================== */
function show(id){
  G.screen=id;
  $$('.screen').forEach(s=>s.classList.remove('active'));
  const el=$('#'+id); if(el) el.classList.add('active');
}
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),1600);
}

/* ====================== 角色建立 ====================== */
function createPlayer(clsKey){
  const c=D.CLASSES[clsKey];
  return {
    cls:clsKey, level:1, exp:0, expNeed:50, gold:50,
    maxHp:c.maxHp, hp:c.maxHp,
    baseStr:c.baseStr, baseAgi:c.baseAgi, baseInt:c.baseInt, baseWill:c.baseWill, baseCon:c.baseCon,
    food:100, water:100,
    deck:[...c.deck], relics:[], equipment:{...c.startEquip},
    handLimit:10,
    // 戰鬥暫存
    block:0, statuses:{}, combatFlags:{}, speedPos:0, mana:50, maxMana:50,
  };
}
// 有效屬性（含狀態）
function eff(p,key){
  const s=p.statuses||{};
  switch(key){
    case 'str': return p.baseStr + (s.力量||0) + (s.激怒||0);
    case 'agi': return Math.max(0, p.baseAgi + (s.敏捷||0) - (s.泥濘||0));
    case 'int': return p.baseInt + (s.智力||0);
    case 'will':return p.baseWill + (s.意志||0);
    case 'con': return p.baseCon + (s.體質||0);
  }
}
function startArmor(p){
  let a=0; ['head','body','feet'].forEach(slot=>{ const e=p.equipment[slot]; if(e&&D.EQUIPMENT[e]) a+=D.EQUIPMENT[e].armor||0; });
  return a;
}
function weaponBonus(p){ const w=p.equipment.weapon; return (w&&D.EQUIPMENT[w])?(D.EQUIPMENT[w].dmgBonus||0):0; }
function relicWeight(p){ return p.relics.reduce((s,r)=>s+(D.RELICS[r]?.weight||0),0); }
function carryMax(p){ return eff(p,'str')*5 + 10; } // 力量 → 負重上限

/* 屬性快捷（給卡牌 play 使用） */
function bindPlayerStats(){
  const p=G.player;
  Object.defineProperties(p,{
    str:{get:()=>eff(p,'str'),configurable:true},
    agi:{get:()=>eff(p,'agi'),configurable:true},
    int:{get:()=>eff(p,'int'),configurable:true},
    will:{get:()=>eff(p,'will'),configurable:true},
    con:{get:()=>eff(p,'con'),configurable:true},
  });
}

/* ====================== 初始化 / 標題 ====================== */
function initTitle(){
  show('title-screen');
}
function startGame(){ show('charselect'); renderCharSelect(); }

function renderCharSelect(){
  const wrap=$('#char-grid'); wrap.innerHTML='';
  Object.keys(D.CLASSES).forEach(key=>{
    const c=D.CLASSES[key];
    const el=document.createElement('div');
    el.className='pick-card frame col gap';
    el.innerHTML=`<div class="class-emblem">⚔</div><h2>${c.name}</h2><p class="dim" style="font-size:14px">${c.desc}</p>
      <small class="note">HP ${c.maxHp}｜力${c.baseStr} 敏${c.baseAgi} 智${c.baseInt} 意${c.baseWill} 體${c.baseCon}</small>`;
    el.onclick=()=>{ $$('.pick-card').forEach(x=>x.classList.remove('sel')); el.classList.add('sel'); G.cls=key; $('#char-confirm').disabled=false; };
    wrap.appendChild(el);
  });
  $('#char-confirm').disabled=true;
}

function renderSaveSlots(){
  const wrap=$('#slot-list'); wrap.innerHTML='';
  for(let i=0;i<3;i++){
    const data=loadSlot(i);
    const el=document.createElement('div');
    el.className='save-slot frame';
    if(data){
      el.innerHTML=`<div><b>存檔 ${i+1}</b><br><small class="note">${D.CLASSES[data.cls]?.name||'?'}｜Lv.${data.player?.level||1}｜靈魂 ${data.meta?.soul||0}</small></div><div>繼續 ▶</div>`;
    }else{
      el.innerHTML=`<div><b>存檔 ${i+1}</b><br><small class="note">空白存檔</small></div><div>新遊戲 ＋</div>`;
    }
    el.onclick=()=>{ G.slot=i; if(data){ continueFromSave(data); } else { beginNewRun(); } };
    wrap.appendChild(el);
  }
}
function continueFromSave(data){
  G.meta=data.meta||{soul:0}; G.cls=data.cls; G.run=data.run;
  G.player=createPlayer(G.cls);
  Object.assign(G.player, data.player);
  bindPlayerStats();
  if(G.run && G.run.map){ enterMap(); } else { enterCity(true); }
}

/* ====================== 初始劇情 → 城市 ====================== */
const INTRO = [
  '你在無盡的黑暗中睜開雙眼。記憶如沙漏般流逝，只剩下一個名字——以及一柄熟悉的劍。',
  '遠方傳來鐘聲。你循著微光前行，腳下的石階通往一座倖存的城鎮。',
  '城門前，一位老者遞給你一塊溫熱的石頭：「拿著吧，輪迴石。只要它還在，死亡便不是終點。」',
  '你握緊輪迴石，踏入了這座名為「終點」的城市。',
];
function beginNewRun(){
  G.meta = G.meta || {soul:0};
  G.player = createPlayer(G.cls);
  bindPlayerStats();
  G.run = { difficulty:'普通', floor:1, kills:{normal:0,elite:0,boss:0}, gold:0, nodesPassed:0, map:null };
  // 跑劇情
  showIntro(0);
}
function showIntro(i){
  if(i>=INTRO.length){ enterCity(true); return; }
  show('story'); 
  $('#story-text').textContent=INTRO[i];
  $('#story-next').onclick=()=>showIntro(i+1);
}

/* ====================== 城市 ====================== */
function enterCity(firstTime){
  saveGame();
  show('city');
  $('#city-soul').textContent=G.meta.soul;
  $('#city-gold').textContent=G.player.gold;
  $('#city-hp').textContent=`${G.player.hp}/${G.player.maxHp}`;
  if(firstTime){
    openModal(`<h2>冒險者公會</h2>
      <p style="line-height:1.8">歡迎來到終點之城。公會大廳裡掛滿了挑戰者的名冊。</p>
      <p style="line-height:1.8">在這裡，你可以領取「冒險者的證明」，正式取得進入地下城的資格。城裡還有<b>流浪商人</b>與<b>流浪鍛造師</b>能協助你整備裝備。</p>
      <p style="line-height:1.8"><span class="ic-soul"></span> <b>輪迴石</b>會在你倒下時回收靈魂能量，讓你變得更強——死亡只是新一輪的開始。</p>
      <div class="center" style="margin-top:16px"><button class="btn primary" onclick="closeModal()">取得冒險者的證明</button></div>`);
  }
}
function cityHeal(){
  if(G.player.gold<20){ toast('金幣不足（需20）'); return; }
  G.player.gold-=20; G.player.hp=Math.min(G.player.maxHp,G.player.hp+30);
  G.player.food=Math.min(100,G.player.food+30); G.player.water=Math.min(100,G.player.water+30);
  enterCity(false); toast('在旅店休息，恢復了狀態');
}
function citySmith(){
  // 城裡鍛造：花金幣強化一張牌
  openCardPicker('選擇要強化的卡牌（花費 50 金幣）', G.player.deck, (idx)=>{
    if(G.player.gold<50){ toast('金幣不足（需50）'); return; }
    const name=G.player.deck[idx];
    if(name.endsWith('＋')){ toast('此牌已強化'); return; }
    G.player.gold-=50; G.player.deck[idx]=name+'＋';
    closeModal(); enterCity(false); toast(`已強化：${name}`);
  });
}
function startDungeon(){
  // 選難度 / 命運
  openModal(`<h2>準備進入地下城</h2>
    <p>選擇難度，命運將決定你這趟旅程的際遇。</p>
    <div class="center gap" style="margin:18px 0;flex-wrap:wrap">
      <button class="btn" onclick="confirmDungeon('普通')">普通<br><small class="note">標準敵人</small></button>
      <button class="btn danger" onclick="confirmDungeon('困難')">困難<br><small class="note">敵人+30%生命，獎勵更佳</small></button>
    </div>`);
}
function confirmDungeon(diff){
  G.run.difficulty=diff;
  G.run.floor = G.run.floor||1;
  closeModal();
  generateMap();
  enterMap();
  if(!localStorage.getItem('tut_done')){ /* 教學在第一場戰鬥觸發 */ }
}

/* ====================== 地圖生成 ======================
 * 20 層（每層 1~4 節點）的有向圖，玩家逐層前進。
 * 規則：第1層=小怪、第11層=寶箱、第19層=營火、第20層=BOSS。
 */
const NODE_TYPES = {
  小怪:{ic:'☠',label:'小怪',color:'#3a342c'},
  菁英:{ic:'✠',label:'菁英',color:'#6d4f86'},
  事件:{ic:'!?',label:'隨機事件',color:'#36586e'},
  營火:{ic:'♨',label:'營火',color:'#b5651d'},
  商人:{ic:'$',label:'流浪商人',color:'#4d6b3e'},
  鍛造:{ic:'⚒',label:'流浪鍛造師',color:'#555'},
  寶箱:{ic:'▣',label:'寶箱',color:'#9a7b34'},
  BOSS:{ic:'☠',label:'BOSS',color:'#7c2d2d'},
};
function generateMap(){
  const LAYERS=20;
  const layers=[];
  for(let i=0;i<LAYERS;i++){
    let type, count;
    if(i===0){ type='小怪'; count=1; }
    else if(i===10){ type='寶箱'; count=1; }
    else if(i===18){ type='營火'; count=1; }
    else if(i===19){ type='BOSS'; count=1; }
    else { count = 2 + rnd(3); type=null; } // 2~4 分岔
    const nodes=[];
    for(let j=0;j<count;j++){
      let t=type;
      if(!t){
        const roll=Math.random();
        if(i>=14 && roll<0.18) t='菁英';
        else if(roll<0.40) t='小怪';
        else if(roll<0.58) t='事件';
        else if(roll<0.72) t='營火';
        else if(roll<0.85) t='商人';
        else if(roll<0.94) t='鍛造';
        else t='寶箱';
      }
      nodes.push({ layer:i, idx:j, type:t, next:[], visited:false });
    }
    layers.push(nodes);
  }
  // 連邊（每個節點連到下一層 1~2 個）
  for(let i=0;i<LAYERS-1;i++){
    layers[i].forEach(n=>{
      const nextLayer=layers[i+1];
      const k=Math.min(nextLayer.length, 1+rnd(2));
      const order=[...nextLayer.keys()].sort(()=>Math.random()-0.5).slice(0,k);
      n.next = order.sort((a,b)=>a-b);
    });
    // 確保下一層每個節點至少有一條入邊
    layers[i+1].forEach((nn,j)=>{
      if(!layers[i].some(n=>n.next.includes(j))){ pick(layers[i]).next.push(j); }
    });
  }
  G.run.map={ layers, curLayer:-1, curIdx:-1, selNext:null };
}

/* ====================== 地圖畫面 ====================== */
function enterMap(){
  saveGame();
  show('map-screen');
  renderMapTop();
  renderMapLegend();
  drawMap();
  $('#map-confirm').disabled=true;
  $('#map-info').innerHTML='<p class="dim center" style="height:100%">點選一個可前往的節點</p>';
  $('#map-selnext').textContent='';
}
function renderMapTop(){
  const p=G.player;
  $('#map-top').innerHTML=`
    <span class="pill">⚔ ${D.CLASSES[p.cls].name} Lv.${p.level}</span>
    <span class="pill ic-heart"></span><span>${p.hp}/${p.maxHp}</span>
    <span class="pill ic-coin"></span><span>${p.gold}</span>
    <span class="pill ic-soul"></span><span>${G.run? '靈魂 '+G.meta.soul : ''}</span>
    <span class="pill">第 ${G.run.floor} 層</span>
    <span class="pill">難度：${G.run.difficulty}</span>
    <span style="flex:1"></span>
    <span class="pill">飽食 ${p.food}｜口渴 ${p.water}</span>
    <button class="btn" style="padding:4px 12px" onclick="openBackpack()">背包</button>
    <button class="btn" style="padding:4px 12px" onclick="openMenu()">≡</button>`;
}
function renderMapLegend(){
  const items=[
    ['☠','小怪','普通等級敵人出沒，進入戰鬥事件。'],
    ['✠','菁英','菁英等級敵人，必定掉落1個飾品，可能掉落素材。'],
    ['!?','隨機事件','根據選擇，可能獲得獎勵或進入戰鬥。'],
    ['♨','營火','可進行1次性休息，恢復飽食度或生命。'],
    ['$','流浪商人','交易、購買卡牌/藥水/裝備/飾品，或強化卡牌。'],
    ['⚒','流浪鍛造師','強化裝備、強能卡牌、購買裝備、刪除卡牌。'],
    ['☠','BOSS','頭目等級敵人，獎勵豐厚，必掉稀有裝備與傳說飾品。'],
    ['▣','寶箱','掉落隨機飾品和金錢。'],
  ];
  $('#map-legend').innerHTML='<h3 style="letter-spacing:3px;margin-bottom:12px">事件節點說明</h3>'+
    items.map(([ic,t,d])=>`<div class="legend-item"><div class="ic">${ic}</div><div><b>${t}</b><br><span class="dim">${d}</span></div></div>`).join('');
}
function drawMap(){
  const m=G.run.map; const layers=m.layers;
  const colW=150, rowH=88, pad=40;
  const maxCols=Math.max(...layers.map(l=>l.length));
  const W = maxCols*colW + pad*2;
  const H = layers.length*rowH + pad*2;
  let svg=`<svg id="map-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  const pos=(l,j,len)=>({ x: pad + (W-pad*2)*(len===1?0.5:(j/(len-1))) - (len===1?0:0) , y: pad + l*rowH });
  // 邊
  layers.forEach((nodes,i)=>{
    if(i===layers.length-1) return;
    nodes.forEach((n,j)=>{
      const a=pos(i,j,nodes.length);
      n.next.forEach(nj=>{
        const b=pos(i+1,nj,layers[i+1].length);
        const reachable = (i===m.curLayer && j===m.curIdx);
        svg+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${reachable?'#7c2d2d':'#3a342c'}" stroke-width="${reachable?2.5:1.2}" stroke-dasharray="${reachable?'0':'5 4'}" opacity="${reachable?0.9:0.4}"/>`;
      });
    });
  });
  // 節點
  layers.forEach((nodes,i)=>{
    nodes.forEach((n,j)=>{
      const p=pos(i,j,nodes.length);
      const ty=NODE_TYPES[n.type];
      const isCur = (i===m.curLayer && j===m.curIdx);
      const isReachable = isReachableNode(i,j);
      const isSel = m.selNext && m.selNext.layer===i && m.selNext.idx===j;
      const fill = n.visited? '#cfc6b2' : 'var(--paper)';
      const stroke = isCur? '#7c2d2d' : (isSel? '#7c2d2d' : '#3a342c');
      const op = (isReachable||isCur||n.visited||i<=m.curLayer)?1:0.55;
      svg+=`<g class="node-g" data-l="${i}" data-j="${j}" opacity="${op}" style="cursor:${isReachable?'pointer':'default'}">
        <circle class="node-circle" cx="${p.x}" cy="${p.y}" r="${isCur?22:18}" fill="${fill}" stroke="${stroke}" stroke-width="${isCur||isSel?3:1.8}"/>
        <text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="15" fill="${ty.color}">${ty.ic}</text>
        ${isReachable?`<circle cx="${p.x}" cy="${p.y}" r="26" fill="none" stroke="#7c2d2d" stroke-width="1" opacity="0.5"><animate attributeName="r" values="24;28;24" dur="1.4s" repeatCount="indefinite"/></circle>`:''}
      </g>`;
    });
  });
  svg+=`</svg>`;
  $('#map-canvas').innerHTML=svg;
  $$('#map-svg .node-g').forEach(g=>{
    g.onclick=()=>{ const l=+g.dataset.l, j=+g.dataset.j; onMapNodeClick(l,j); };
  });
}
function isReachableNode(l,j){
  const m=G.run.map;
  if(m.curLayer===-1) return l===0;              // 起點層全部可選
  if(l!==m.curLayer+1) return false;
  const cur=m.layers[m.curLayer][m.curIdx];
  return cur.next.includes(j);
}
function onMapNodeClick(l,j){
  if(!isReachableNode(l,j)) return;
  const m=G.run.map; m.selNext={layer:l,idx:j};
  const n=m.layers[l][j]; const ty=NODE_TYPES[n.type];
  drawMap();
  $('#map-confirm').disabled=false;
  // 右側資訊
  $('#map-info').innerHTML=renderNodeInfo(n);
  // 已選路線預覽
  const passed = m.layers.filter((_,i)=>i<=m.curLayer && m.curLayer>=0).map(l2=>l2.find(x=>x.visited)).filter(Boolean);
  const strip = passed.map(x=>`<span title="${NODE_TYPES[x.type].label}">${NODE_TYPES[x.type].ic}</span>`).join(' → ');
  $('#map-selnext').innerHTML = (strip?strip+' → ':'') + `<b style="color:var(--accent)">${ty.ic} ${ty.label}</b>`;
}
function renderNodeInfo(n){
  const ty=NODE_TYPES[n.type];
  let info=`<h3 style="letter-spacing:3px">${ty.ic} ${ty.label}</h3><div class="hairline" style="margin:10px 0"></div>`;
  if(n.type==='小怪'||n.type==='菁英'||n.type==='BOSS'){
    info+=`<p class="dim">${n.type==='BOSS'?'頭目等級敵人，獎勵豐厚。':(n.type==='菁英'?'菁英等級敵人，必掉飾品。':'普通等級敵人。')}</p>
      <h4 style="margin-top:14px">可能獲得</h4>
      <div class="row gap" style="margin-top:6px"><span class="status-chip"><span class="ic-coin"></span> 金幣</span><span class="status-chip"><span class="ic-soul"></span> 靈魂</span><span class="status-chip">1張卡牌</span></div>`;
  }else if(n.type==='寶箱'){ info+='<p class="dim">掉落隨機飾品和金錢。</p>'; }
  else if(n.type==='營火'){ info+='<p class="dim">可恢復生命或飽食度，或強化一張卡牌。</p>'; }
  else if(n.type==='商人'){ info+='<p class="dim">用金幣購買卡牌、藥水、裝備、飾品。</p>'; }
  else if(n.type==='鍛造'){ info+='<p class="dim">強化裝備或卡牌、刪除牌組卡牌。</p>'; }
  else if(n.type==='事件'){ info+='<p class="dim">未知的際遇正等著你。</p>'; }
  return info;
}
function confirmMove(){
  const m=G.run.map; if(!m.selNext) return;
  const {layer,idx}=m.selNext;
  m.curLayer=layer; m.curIdx=idx; m.selNext=null;
  const n=m.layers[layer][idx]; n.visited=true;
  G.run.nodesPassed++;
  resolveNode(n);
}

/* ====================== 節點結算 ====================== */
function resolveNode(n){
  switch(n.type){
    case '小怪': startCombat(scaleEncounter(pick(D.ENCOUNTERS.normal)),'normal'); break;
    case '菁英': startCombat(scaleEncounter(pick(D.ENCOUNTERS.elite)),'elite'); break;
    case 'BOSS': startCombat(scaleEncounter(pick(D.ENCOUNTERS.boss)),'boss'); break;
    case '寶箱': openTreasure(); break;
    case '營火': openCampfire(); break;
    case '商人': openShop(); break;
    case '鍛造': openSmith(); break;
    case '事件': openEvent(); break;
  }
}
function scaleEncounter(keys){
  return keys.map(k=>{
    const base=D.ENEMIES[k]; const e=JSON.parse(JSON.stringify({name:base.name,hp:base.hp,agi:base.agi,tier:base.tier,pattern:base.pattern,inherent:base.inherent}));
    e.key=k;
    if(G.run.difficulty==='困難') e.hp=Math.round(e.hp*1.3);
    e.hp=Math.round(e.hp*(1+(G.run.floor-1)*0.15)); // 隨層數成長
    return e;
  });
}

/* ====================== 戰鬥系統 ====================== */
function startCombat(enemyDefs, tier){
  const p=G.player;
  G.combatActive=true; G.turn=0; G.selectedCard=null; G.pendingDiscard=0;
  // 重置玩家戰鬥狀態
  p.block=0; p.statuses={}; p.combatFlags={}; p.speedPos=0; p.mana=p.maxMana;
  // 建立敵人實例
  G.enemies = enemyDefs.map((d,i)=>{
    const def=D.ENEMIES[d.key];
    const e={ key:d.key, name:d.name, hp:d.hp, maxHp:d.hp, block:0, agi:def.agi, statuses:{},
      actions:def.actions, pattern:def.pattern, actIdx: def.pattern==='random'?rnd(def.actions.length):0,
      def, intentLabel:'', speedPos:0, slot:i, _firstHit:true };
    Object.defineProperties(e,{
      str:{get:()=>(e.statuses.力量||0)+(e.statuses.激怒||0)},
      agiEff:{get:()=>Math.max(1, e.agi + (e.statuses.敏捷||0) - (e.statuses.泥濘||0))},
    });
    return e;
  });
  // 牌堆
  G.drawPile = shuffle(p.deck.map(c=>({name:stripPlus(c), up:c.endsWith('＋')})));
  G.hand=[]; G.discardPile=[]; G.exhaustPile=[];
  // onSpawn 固有效果
  G.enemies.forEach(e=>{ if(e.def.onSpawn) e.def.onSpawn(e,GAPI); });
  // 飾品：戰鬥開始
  p.relics.forEach(r=>{ const def=D.RELICS[r]; if(def?.onCombatStart) def.onCombatStart(GAPI); });
  if(p.combatFlags.firstAtkBonus===undefined && p.relics.includes('破舊的鍋鏟')) p.combatFlags.firstAtkBonus=5;
  // 速度條初始位置
  G.enemies.forEach(e=>e.speedPos=0);
  G.combatTier=tier;
  show('combat');
  G.log('—— 戰鬥開始 ——');
  if(tier==='normal' && !window._tutShown){ window._tutShown=true; showTutorial(); }
  // 開始 ATB
  setTimeout(()=>combatTick(), 350);
}
function shuffle(a){ a=[...a]; for(let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function stripPlus(n){ return n.endsWith('＋')?n.slice(0,-1):n; }
function cardData(name){ return D.CARDS[stripPlus(name)]; }

/* —— ATB：誰先抵達速度條右端 —— */
function combatTick(){
  if(!G.combatActive) return;
  if(checkCombatEnd()) return;
  const actors=[G.player,...G.enemies.filter(e=>e.hp>0)];
  // 計算抵達 100 所需時間
  let best=null,bestT=Infinity;
  actors.forEach(a=>{
    const speed = a===G.player? Math.max(1,eff(a,'agi')) : a.agiEff;
    const t=(100-a.speedPos)/speed;
    if(t<bestT-1e-9){ bestT=t; best=a; }
  });
  actors.forEach(a=>{ const speed=a===G.player?Math.max(1,eff(a,'agi')):a.agiEff; a.speedPos+=speed*bestT; });
  best.speedPos=0;
  renderCombat();
  if(best===G.player) beginPlayerTurn();
  else enemyTurn(best);
}

function beginPlayerTurn(){
  const p=G.player; G.turn++;
  // 持續護甲 → 先加裝甲，否則裝甲歸0（裝甲整備等可改寫，這裡簡化）
  const keep=p.statuses.持續護甲||0;
  p.block = keep;
  // 能量
  p.energyMax=3; G.energy=p.energyMax;
  if(p.food>=70) G.energy+=1; if(p.food<30) G.energy-=1;
  if(p.water<30) G.energy-=1;
  G.energy=Math.max(0,G.energy);
  // 抽牌
  let drawN=5; if(p.water>=70) drawN+=1; drawN-=(p.statuses.恐懼||0);
  drawN=Math.max(1,drawN);
  G.draw(drawN);
  // 心眼回合開始
  // 回合開始 buff/debuff 不在此 tick（DOT 在回合結束）
  renderCombat(); renderHand();
  G.log(`你的回合（能量 ${G.energy}）`);
}
function endPlayerTurn(){
  if(G.pendingDiscard>0){ toast(`還需捨棄 ${G.pendingDiscard} 張手牌`); return; }
  const p=G.player;
  // 棄掉所有手牌
  G.hand.forEach(c=>{ if(c.retain){ /* 保留 */ } else G.discardPile.push(c); });
  G.hand = G.hand.filter(c=>c.retain);
  G.hand.forEach(c=>c.retain=false);
  G.selectedCard=null;
  // 玩家回合結束 → 結算 DOT 與 decay
  endOfTurnStatus(p, true);
  if(p.hp<=0){ return playerDead(); }
  p.speedPos=0;
  renderCombat();
  setTimeout(()=>combatTick(), 250);
}

function enemyTurn(e){
  if(e.hp<=0){ e.speedPos=0; return setTimeout(combatTick,80); }
  if(e.def.onTurnStart) e.def.onTurnStart(e,GAPI);
  e.block=0; // 敵人回合開始裝甲歸零（持續護甲補回）
  if(e.statuses.持續護甲) e.block+=e.statuses.持續護甲;
  if(e._nextStr){ G.applyStatus(e,'力量',e._nextStr); e._nextStr=0; }
  const act=e.actions[e.actIdx % e.actions.length];
  G.log(`${e.name}：${act.label}`);
  act.do(e,GAPI);
  // 推進行動模式
  e.actIdx=(e.actIdx+1)%e.actions.length;
  endOfTurnStatus(e,false);
  e.speedPos=0;
  if(G.player.hp<=0){ renderCombat(); return playerDead(); }
  renderCombat();
  setTimeout(combatTick, 500);
}
function previewIntent(e){
  const act=e.actions[e.actIdx % e.actions.length];
  return act.label;
}

/* —— 回合結束狀態結算（DOT + 衰減） —— */
function endOfTurnStatus(unit, isPlayer){
  const s=unit.statuses;
  // 流血
  if(s.流血>0){ const dmg=s.流血; applyTrueDamage(unit,dmg); s.流血=Math.max(0,s.流血-1); floatNum(unit,-dmg,'dmg'); }
  // 中毒
  if(s.中毒>0){ let dmg=s.中毒; if(!isPlayer && unit.def?.inherent?.includes('中毒傷害降低')) dmg=Math.round(dmg*0.5); applyTrueDamage(unit,dmg); s.中毒=Math.max(0,s.中毒-1); }
  // 燃燒
  if(s.燃燒>0){ let dmg=s.燃燒; if(!isPlayer && unit.def?.inherent?.includes('燃燒傷害降低')) dmg=Math.round(dmg*0.5); applyTrueDamage(unit,dmg); s.燃燒=Math.floor(s.燃燒/2); }
  // 衰減型 debuff/buff
  ['虛弱','易損','裂甲','恐懼','泥濘','嘲諷','狩獵標記','生存本能'].forEach(k=>{ if(s[k]>0) s[k]-=1; if(s[k]<=0) delete s[k]; });
  // 清除「本回合限定」力量
  if(isPlayer && unit._tempStr){ unit.statuses.力量=Math.max(0,(unit.statuses.力量||0)-unit._tempStr); unit._tempStr=0; }
  // 幽魂的每回合首擊重置
  if(!isPlayer && unit.def?.inherent?.includes('第一個非魔法')) unit._firstHit=true;
  if(unit.def?.onHpChange) unit.def.onHpChange(unit,GAPI);
}

/* —— 傷害：玩家攻擊敵人 —— */
function dealDamageToEnemy(e, raw, opts={}){
  if(e.hp<=0) return 0;
  const p=G.player;
  let dmg=raw;
  // 攻擊牌加武器基礎傷害 + 首擊飾品
  if(opts.isCard && opts.cardType && opts.cardType.includes('攻擊')){
    dmg += weaponBonus(p);
    if(p.combatFlags.firstAtkBonus){ dmg+=p.combatFlags.firstAtkBonus; p.combatFlags.firstAtkBonus=0; }
  }
  // 心眼：下一次攻擊 +層數
  if(opts.isCard && (p.statuses.心眼||0)>0){ dmg+=p.statuses.心眼; }
  // 攻擊者虛弱
  if((p.statuses.虛弱||0)>0) dmg=Math.round(dmg*0.75);
  // 目標易損 / 狩獵標記
  if((e.statuses.易損||0)>0) dmg=Math.round(dmg*1.5);
  if((e.statuses.狩獵標記||0)>0) dmg=Math.round(dmg*1.4);
  dmg=Math.max(0,Math.round(dmg));
  // 幽魂首擊減傷（非魔法）
  if(e.def?.inherent?.includes('第一個非魔法') && e._firstHit && !(opts.cardType||'').includes('魔法')){ dmg=Math.round(dmg*0.1); e._firstHit=false; }
  // 扣裝甲
  const pierce = (p.statuses.穿甲||0)>0 || opts.ignoreArmor;
  if(!pierce && e.block>0){
    let toBlock=dmg;
    if((e.statuses.裂甲||0)>0) toBlock=Math.round(dmg*1.25);
    toBlock += (p.statuses.破甲||0);
    if(toBlock>=e.block){ const leftover=Math.max(0, dmg - e.block); e.block=0; applyTrueDamage(e,leftover); }
    else { e.block-=toBlock; }
  }else{
    if(pierce && (p.statuses.穿甲||0)>0) p.statuses.穿甲--;
    applyTrueDamage(e,dmg);
  }
  // 刁鑽：附加流血
  if(p.combatFlags.bleedOnHit) G.applyStatus(e,'流血',p.combatFlags.bleedOnHit);
  floatNum(e,-dmg,'dmg');
  return dmg;
}

/* —— 傷害：敵人攻擊玩家 —— */
function enemyDamageToPlayer(e, raw){
  const p=G.player;
  let dmg=raw + (e.statuses.力量||0)+(e.statuses.激怒||0);
  if((e.statuses.虛弱||0)>0) dmg=Math.round(dmg*0.75);
  if((e.statuses.生存本能||0)>0){} // 自身減傷不影響輸出
  if((p.statuses.易損||0)>0) dmg=Math.round(dmg*1.5);
  dmg=Math.max(0,Math.round(dmg));
  // 扣玩家裝甲
  let hpDmg=dmg;
  if(p.block>0){
    let toBlock=dmg; if((p.statuses.裂甲||0)>0) toBlock=Math.round(dmg*1.25);
    if(toBlock>=p.block){ hpDmg=Math.max(0,dmg-p.block); p.block=0; }
    else { p.block-=toBlock; hpDmg=0; }
  }
  // 體質最終減傷（僅作用於生命值傷害）
  if(hpDmg>0){ hpDmg=Math.max(0, hpDmg - eff(p,'con')); }
  // 防守反擊：受擊使對方流血
  if(p.combatFlags.thorns && raw>0) G.applyStatus(e,'流血',p.combatFlags.thorns);
  if(hpDmg>0){
    p.hp-=hpDmg;
    floatNum(p,-hpDmg,'dmg');
    // 月貓抱枕：免疫一次致死
    if(p.hp<=0 && p.combatFlags.deathSave){ p.hp=1; p.combatFlags.deathSave=false; G.log('月貓的抱枕生效，免疫了致命傷害！'); }
  } else { floatNum(p,0,'block'); }
  // 吸血蝙蝠等回血固有
  return dmg;
}

function applyTrueDamage(unit,dmg){
  if(dmg<=0) return;
  unit.hp-=dmg;
  if(unit!==G.player){
    if(unit.def?.inherent?.includes('造成傷害會使自己回復')||unit.def?.inherent?.includes('回復2點生命')){}
    if(unit.def?.onHpChange) unit.def.onHpChange(unit,GAPI);
    if(unit.hp<=0){ unit.hp=0; onEnemyDeath(unit); }
  }else{
    if(unit.hp<=0 && unit.combatFlags?.deathSave){ unit.hp=1; unit.combatFlags.deathSave=false; G.log('月貓的抱枕生效！'); }
  }
}
function onEnemyDeath(e){
  if(e._dead) return; e._dead=true;
  G.log(`${e.name} 被擊敗了。`);
  if(e.def.onDeath) e.def.onDeath(e,GAPI);
}

/* —— 套用狀態（含意志抵抗） —— */
function applyStatus(unit, name, amt, turnTemp){
  if(amt<=0) return;
  // 玩家受到 debuff 時，意志提供抵抗
  if(unit===G.player && D.STATUS[name]?.kind==='debuff'){
    const resist=eff(G.player,'will');
    if(Math.random()*100 < resist){ G.log(`意志抵抗了 ${name}！`); return; }
  }
  unit.statuses[name]=(unit.statuses[name]||0)+amt;
  if(turnTemp && unit===G.player){ unit._tempStr=(unit._tempStr||0)+amt; }
}

/* —— 玩家直接失血（卡牌自傷，不經裝甲） —— */
function loseHpDirect(n){ const p=G.player; p.hp=Math.max(p.combatFlags.deathSave?1:0, p.hp-n); }

/* ====================== 出牌 ====================== */
function selectCard(i){
  if(G.pendingDiscard>0){ // 捨棄模式
    const c=G.hand.splice(i,1)[0]; G.discardPile.push(c); G.pendingDiscard--;
    renderHand(); if(G.pendingDiscard===0) toast('捨棄完成');
    return;
  }
  const c=G.hand[i]; const cd=cardData(c.name);
  if(cd.cost>G.energy){ toast('能量不足'); return; }
  if(cd.target==='enemy'){
    G.selectedCard={i,c,cd};
    renderHand(); enableEnemyTargeting();
  }else{
    playCard(i, null);
  }
}
function enableEnemyTargeting(){
  $$('.enemy').forEach(el=>{ el.classList.add('targetable'); });
  toast('選擇攻擊目標');
}
function clickEnemy(slot){
  if(!G.selectedCard) return;
  const e=G.enemies[slot]; if(!e||e.hp<=0) return;
  const i=G.hand.indexOf(G.selectedCard.c);
  playCard(i, e);
}
function playCard(i, target){
  const c=G.hand[i]; const cd=cardData(c.name);
  if(cd.cost>G.energy) return;
  G.energy-=cd.cost;
  // 升級牌：以強化效果覆寫（這裡簡化為相同 play，數值差異交由 Excel 對照；可擴充 playUp）
  const p=G.player;
  // 設定當前卡型給傷害函式
  G._curCardType=cd.type;
  cd.play(p, target||G.enemies.find(e=>e.hp>0), GAPI);
  G._curCardType=null;
  // 心眼消耗
  if(cd.type.includes('攻擊') && p.statuses.心眼) p.statuses.心眼=0;
  // 移到棄牌 / 消耗
  G.hand.splice(i,1);
  if(cd.exhaust) G.exhaustPile.push(c); else G.discardPile.push(c);
  G.selectedCard=null;
  checkCombatEnd();
  renderCombat(); renderHand();
}

/* —— 牌堆操作（給卡牌效果用） —— */
function draw(n){
  for(let k=0;k<n;k++){
    if(G.hand.length>=G.player.handLimit) break;
    if(G.drawPile.length===0){
      if(G.discardPile.length===0) break;
      G.drawPile=shuffle(G.discardPile); G.discardPile=[];
    }
    G.hand.push(G.drawPile.pop());
  }
}
function discardRandom(n){ for(let k=0;k<n && G.hand.length;k++){ const i=rnd(G.hand.length); G.discardPile.push(G.hand.splice(i,1)[0]); } renderHand(); }

/* ====================== 勝負判定 ====================== */
function checkCombatEnd(){
  if(!G.combatActive) return true;
  if(G.player.hp<=0){ playerDead(); return true; }
  if(G.enemies.every(e=>e.hp<=0)){ combatVictory(); return true; }
  return false;
}
function combatVictory(){
  if(!G.combatActive) return; G.combatActive=false;
  const p=G.player; const tier=G.combatTier;
  // 飾品：戰鬥結束
  p.relics.forEach(r=>{ const def=D.RELICS[r]; if(def?.onCombatEnd) def.onCombatEnd(GAPI); });
  // 飽食/口渴消耗
  const cost = tier==='boss'?30:10;
  p.food=Math.max(0,p.food-cost); p.water=Math.max(0,p.water-cost);
  // 統計
  G.run.kills[tier]=(G.run.kills[tier]||0)+1;
  // 戰利品
  const gold = (tier==='boss'?120:tier==='elite'?60:40)+rnd(31);
  const soul = (tier==='boss'?40:tier==='elite'?15:8);
  const exp = (tier==='boss'?60:tier==='elite'?30:15);
  p.gold+=gold; G.run.gold+=gold; G.meta.soul+=soul;
  gainExp(exp);
  showLoot(tier, {gold,soul,exp});
}
function playerDead(){
  if(!G.combatActive && G.screen==='settlement') return;
  G.combatActive=false;
  settlement(false);
}

/* ====================== 經驗 / 升級 ====================== */
function gainExp(n){
  const p=G.player; p.exp+=n;
  while(p.exp>=p.expNeed){ p.exp-=p.expNeed; p.level++; p.expNeed=Math.round(p.expNeed*1.3); p.maxHp+=8; p.hp+=8; p._levelGained=(p._levelGained||0)+1; }
}

/* ====================== 戰利品畫面 ====================== */
function showLoot(tier, amt){
  const p=G.player;
  // 隨機 3 選 1
  let pool=D.REWARD_POOL;
  let rarityFloor = tier==='boss'?'稀有':'普通';
  const opts=[]; const used=new Set();
  while(opts.length<3){
    let name=pick(pool);
    if(tier==='boss'){ const rares=pool.filter(n=>['稀有','罕見'].includes(D.CARDS[n].rarity)); if(rares.length) name=pick(rares); }
    if(!used.has(name)){ used.add(name); opts.push(name); }
    if(used.size>=pool.length) break;
  }
  let html=`<h2>戰鬥勝利！</h2>
    <div class="loot-line"><span><span class="ic-coin"></span> 金幣</span><b>+${amt.gold}</b></div>
    <div class="loot-line"><span>經驗值</span><b>+${amt.exp}${p._levelGained?`（升至 Lv.${p.level}！最大生命提升）`:''}</b></div>
    <div class="loot-line"><span><span class="ic-soul"></span> 靈魂能量</span><b>+${amt.soul}</b></div>`;
  // 菁英必掉飾品；boss 掉傳說飾品+稀有裝備
  let bonusRelic=null, bonusEquip=null;
  if(tier==='elite'||tier==='boss'){ bonusRelic=pick(tier==='boss'?D.RARE_RELICS:D.COMMON_RELICS); }
  if(tier==='boss'){ bonusEquip=pick(Object.keys(D.EQUIPMENT).filter(k=>D.EQUIPMENT[k].rarity!=='普通')); }
  if(bonusRelic){ p.relics.push(bonusRelic); const def=D.RELICS[bonusRelic]; if(def.onGet) def.onGet(GAPI); html+=`<div class="loot-line"><span>飾品</span><b>${bonusRelic}（${def.desc}）</b></div>`; }
  if(bonusEquip){ html+=`<div class="loot-line"><span>裝備</span><b>${bonusEquip}</b></div>`; G._pendingEquip=bonusEquip; }
  html+=`<div class="hairline" style="margin:14px 0"></div><h3 class="center">選擇一張卡牌加入牌組（3選1）</h3><div class="reward-cards" id="reward-cards"></div>
    <div class="center" style="margin-top:8px"><button class="btn" onclick="skipReward()">略過卡牌</button></div>`;
  p._levelGained=0;
  openModal(html);
  const rc=$('#reward-cards');
  opts.forEach(name=>{ const el=cardEl({name,up:false}); el.onclick=()=>takeReward(name); rc.appendChild(el); });
}
function takeReward(name){ G.player.deck.push(name); afterLoot(); }
function skipReward(){ afterLoot(); }
function afterLoot(){
  if(G._pendingEquip){ const eq=G._pendingEquip; G._pendingEquip=null; tryEquip(eq); }
  closeModal();
  // BOSS 戰後 → 進入下一層
  if(G.combatTier==='boss'){ nextFloor(); }
  else { enterMap(); }
}
function tryEquip(eqKey){
  const def=D.EQUIPMENT[eqKey]; const p=G.player;
  const cur=p.equipment[def.slot];
  // 自動裝備更好的（簡化）
  p.equipment[def.slot]=eqKey;
  toast(`已裝備 ${eqKey}${cur?`（替換 ${cur}）`:''}`);
}
function nextFloor(){
  if(G.run.floor>=3){ // 三張地圖後，因不明原因死亡 → 結算（勝利路線）
    settlement(true);
    return;
  }
  G.run.floor++;
  openModal(`<h2>安全區域</h2><p style="line-height:1.8">你擊敗了這一層的守護者，來到層與層之間的安全區域。可以在此稍作整備。</p>
    <div class="center gap" style="margin-top:16px;flex-wrap:wrap">
      <button class="btn" onclick="restHere()">休息（恢復20%生命）</button>
      <button class="btn" onclick="closeModal();generateMap();enterMap();">前往第 ${G.run.floor} 層 ▶</button>
    </div>`);
}
function restHere(){ const p=G.player; p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*0.2)); toast('恢復了生命'); closeModal(); generateMap(); enterMap(); }

/* ====================== 非戰鬥節點 ====================== */
function openTreasure(){
  const p=G.player; const gold=30+rnd(41); p.gold+=gold; G.run.gold+=gold;
  const relic=pick(D.COMMON_RELICS); p.relics.push(relic); const def=D.RELICS[relic]; if(def.onGet) def.onGet(GAPI);
  openModal(`<h2>▣ 寶箱</h2><div class="loot-line"><span><span class="ic-coin"></span> 金幣</span><b>+${gold}</b></div>
    <div class="loot-line"><span>飾品</span><b>${relic}（${def.desc}）</b></div>
    <div class="center" style="margin-top:16px"><button class="btn primary" onclick="closeModal();enterMap();">繼續</button></div>`);
}
function openCampfire(){
  openModal(`<h2>♨ 營火</h2><p>可進行一次性的休息。</p>
    <div class="center gap" style="margin:18px 0;flex-wrap:wrap">
      <button class="btn" onclick="campRest('hp')">休息<br><small class="note">恢復30%生命</small></button>
      <button class="btn" onclick="campRest('food')">進食<br><small class="note">飽食/口渴+40</small></button>
      <button class="btn" onclick="campRest('forge')">打磨<br><small class="note">強化一張卡牌</small></button>
    </div>`);
}
function campRest(type){
  const p=G.player;
  if(type==='hp'){ p.hp=Math.min(p.maxHp,p.hp+Math.round(p.maxHp*0.3)); closeModal(); enterMap(); toast('恢復了生命'); }
  else if(type==='food'){ p.food=Math.min(100,p.food+40); p.water=Math.min(100,p.water+40); closeModal(); enterMap(); toast('飽食與口渴已恢復'); }
  else if(type==='forge'){ openCardPicker('選擇要強化的卡牌', p.deck, (idx)=>{
      const name=p.deck[idx]; if(name.endsWith('＋')){toast('已強化');return;} p.deck[idx]=name+'＋'; closeModal(); enterMap(); toast(`已強化：${name}`); }); }
}
function openShop(){
  const p=G.player;
  const cards=[...new Set(Array.from({length:4},()=>pick(D.REWARD_POOL)))];
  const relics=[...new Set(Array.from({length:2},()=>pick(D.COMMON_RELICS)))];
  let html=`<h2>$ 流浪商人</h2><p class="dim">金幣：<b id="shop-gold">${p.gold}</b></p><div class="shop-grid" style="margin-top:12px">`;
  cards.forEach(c=>{ const price=50+rnd(40); html+=shopRow(`卡牌：${c}`, D.CARDS[c].text, price, `buyCard('${c}',${price},this)`); });
  relics.forEach(r=>{ const price=80+rnd(60); html+=shopRow(`飾品：${r}`, D.RELICS[r].desc, price, `buyRelic('${r}',${price},this)`); });
  html+=shopRow('藥水：治療藥水', '立即恢復25點生命', 40, `buyHeal(40,this)`);
  html+=`</div><div class="center" style="margin-top:16px"><button class="btn primary" onclick="closeModal();enterMap();">離開</button></div>`;
  openModal(html);
}
function shopRow(title,desc,price,onclick){
  return `<div class="shop-item"><div><b>${title}</b><br><small class="note">${desc}</small></div>
    <button class="btn" style="padding:6px 14px" onclick="${onclick}"><span class="ic-coin"></span> ${price}</button></div>`;
}
function buyCard(c,price,btn){ const p=G.player; if(p.gold<price){toast('金幣不足');return;} p.gold-=price; p.deck.push(c); btn.disabled=true; $('#shop-gold').textContent=p.gold; toast(`購得：${c}`); }
function buyRelic(r,price,btn){ const p=G.player; if(p.gold<price){toast('金幣不足');return;} p.gold-=price; p.relics.push(r); const def=D.RELICS[r]; if(def.onGet)def.onGet(GAPI); btn.disabled=true; $('#shop-gold').textContent=p.gold; toast(`購得：${r}`); }
function buyHeal(price,btn){ const p=G.player; if(p.gold<price){toast('金幣不足');return;} p.gold-=price; p.hp=Math.min(p.maxHp,p.hp+25); btn.disabled=true; $('#shop-gold').textContent=p.gold; toast('恢復25生命'); }
function openSmith(){
  const p=G.player;
  openModal(`<h2>⚒ 流浪鍛造師</h2>
    <div class="center gap" style="margin:18px 0;flex-wrap:wrap">
      <button class="btn" onclick="smithUpgrade()">強化卡牌<br><small class="note">免費強化一張牌</small></button>
      <button class="btn danger" onclick="smithRemove()">刪除卡牌<br><small class="note">移除一張牌</small></button>
    </div>
    <div class="center"><button class="btn primary" onclick="closeModal();enterMap();">離開</button></div>`);
}
function smithUpgrade(){ openCardPicker('選擇要強化的卡牌', G.player.deck, (idx)=>{ const n=G.player.deck[idx]; if(n.endsWith('＋')){toast('已強化');return;} G.player.deck[idx]=n+'＋'; closeModal(); enterMap(); toast(`已強化：${n}`); }); }
function smithRemove(){ openCardPicker('選擇要刪除的卡牌', G.player.deck, (idx)=>{ const n=G.player.deck.splice(idx,1); closeModal(); enterMap(); toast(`已刪除：${n}`); }); }

const EVENTS=[
  { title:'廢棄神龕', text:'一座古老神龕散發微光，似乎在等待供奉。',
    choices:[ {label:'供奉50金幣（最大生命+8）', do:(p)=>{ if(p.gold>=50){p.gold-=50;p.maxHp+=8;p.hp+=8;return '神明的祝福湧入體內。';} return '金幣不足，神龕黯淡下來。'; }},
              {label:'打破神龕（獲得隨機飾品，受到傷害）', do:(p)=>{ p.hp=Math.max(1,p.hp-10); const r=pick(D.COMMON_RELICS); p.relics.push(r); const def=D.RELICS[r];if(def.onGet)def.onGet(GAPI); return `你受了傷，但找到了 ${r}。`; }},
              {label:'離開', do:()=>'你轉身離去。'} ] },
  { title:'迷路的商隊', text:'一支商隊在此紮營，願意與你交易。',
    choices:[ {label:'購買補給（30金幣，飽食/口渴全滿）', do:(p)=>{ if(p.gold>=30){p.gold-=30;p.food=100;p.water=100;return '你飽餐了一頓。';} return '金幣不足。'; }},
              {label:'搶劫商隊（進入戰鬥）', do:(p)=>{ setTimeout(()=>startCombat(scaleEncounter(pick(D.ENCOUNTERS.normal)),'normal'),50); return '__combat__'; }},
              {label:'離開', do:()=>'你禮貌地拒絕了。'} ] },
  { title:'神秘的箱子', text:'路邊一只無人看管的箱子。',
    choices:[ {label:'打開（賭運氣）', do:(p)=>{ if(Math.random()<0.6){const g=40+rnd(40);p.gold+=g;return `裡面有 ${g} 金幣！`;} p.hp=Math.max(1,p.hp-12);return '是陷阱！你受了傷。'; }},
              {label:'無視', do:()=>'你謹慎地繞過。'} ] },
];
function openEvent(){
  const ev=pick(EVENTS);
  let html=`<h2>!? ${ev.title}</h2><p style="line-height:1.8">${ev.text}</p><div class="col gap" style="margin-top:16px">`;
  ev.choices.forEach((c,i)=>{ html+=`<button class="btn" onclick="resolveEvent(${EVENTS.indexOf(ev)},${i})">${c.label}</button>`; });
  html+=`</div>`; openModal(html);
}
function resolveEvent(ei,ci){
  const ev=EVENTS[ei]; const res=ev.choices[ci].do(G.player);
  if(res==='__combat__'){ closeModal(); return; }
  openModal(`<h2>${ev.title}</h2><p style="line-height:1.8">${res}</p>
    <div class="center" style="margin-top:16px"><button class="btn primary" onclick="closeModal();enterMap();">繼續</button></div>`);
}

/* ====================== 結算 ====================== */
function settlement(victory){
  show('settlement');
  const r=G.run; const k=r.kills;
  const diffMul = r.difficulty==='困難'?1.5:1;
  const score = Math.round((k.normal*10 + k.elite*40 + k.boss*120 + r.gold*0.1 + r.floor*50) * diffMul);
  const soulReward = Math.round(score*0.2);
  G.meta.soul+=soulReward;
  saveGame();
  $('#settle-body').innerHTML=`
    <h2>${victory?'你抵達了未知的終點…':'你倒下了'}</h2>
    <p class="dim center" style="margin-bottom:14px">${victory?'就在踏入下一層的瞬間，意識被未知吞沒。但輪迴石仍在發光。':'冒險在此終結，但這不是真正的結束。'}</p>
    <div class="loot-line"><span>擊敗小怪</span><b>${k.normal||0}</b></div>
    <div class="loot-line"><span>擊敗菁英</span><b>${k.elite||0}</b></div>
    <div class="loot-line"><span>擊敗 BOSS</span><b>${k.boss||0}</b></div>
    <div class="loot-line"><span>收集金幣</span><b>${r.gold}</b></div>
    <div class="loot-line"><span>抵達層數</span><b>第 ${r.floor} 層</b></div>
    <div class="loot-line"><span>難度</span><b>${r.difficulty}</b></div>
    <div class="hairline" style="margin:12px 0"></div>
    <div class="loot-line" style="font-size:20px"><span>總分</span><b>${score}</b></div>
    <div class="loot-line" style="font-size:20px"><span><span class="ic-soul"></span> 獲得靈魂能量</span><b>+${soulReward}</b></div>
    <p class="dim center" style="margin-top:10px">累積靈魂能量：${G.meta.soul}（用於周回強化）</p>
    <div class="center gap" style="margin-top:18px">
      <button class="btn primary" onclick="returnCityAfterRun()">返回城市</button>
      <button class="btn" onclick="initTitle()">回到標題</button>
    </div>`;
}
function returnCityAfterRun(){
  // 周回：保留 meta，重建角色（輪迴）
  G.run={ difficulty:'普通', floor:1, kills:{normal:0,elite:0,boss:0}, gold:0, nodesPassed:0, map:null };
  G.player=createPlayer(G.cls); bindPlayerStats();
  // 用靈魂能量給予永久加成（簡單範例：每50靈魂 +2最大生命）
  const bonus=Math.floor(G.meta.soul/50)*2;
  G.player.maxHp+=bonus; G.player.hp+=bonus;
  enterCity(false);
  toast(`輪迴石生效：基於靈魂能量，最大生命 +${bonus}`);
}

/* ====================== 背包 / 選單 ====================== */
function openBackpack(){
  const p=G.player;
  let html=`<h2>背包 / 人物狀態</h2>
    <div class="loot-line"><span>等級</span><b>Lv.${p.level}（${p.exp}/${p.expNeed}）</b></div>
    <div class="loot-line"><span>生命</span><b>${p.hp}/${p.maxHp}</b></div>
    <div class="loot-line"><span>力量 / 敏捷 / 智力 / 意志 / 體質</span><b>${eff(p,'str')} / ${eff(p,'agi')} / ${eff(p,'int')} / ${eff(p,'will')} / ${eff(p,'con')}</b></div>
    <div class="loot-line"><span>飽食度 / 口渴值</span><b>${p.food} / ${p.water}</b></div>
    <div class="loot-line"><span>負重</span><b>${relicWeight(p)} / ${carryMax(p)}</b></div>
    <div class="hairline" style="margin:10px 0"></div>
    <h3>裝備</h3>`;
  ['weapon','head','body','feet'].forEach(slot=>{ const e=p.equipment[slot]; const def=e?D.EQUIPMENT[e]:null; const names={weapon:'武器',head:'頭部',body:'身體',feet:'腳部'}; html+=`<div class="loot-line"><span>${names[slot]}</span><b>${e||'無'}${def?`（${def.desc}）`:''}</b></div>`; });
  html+=`<div class="hairline" style="margin:10px 0"></div><h3>飾品（${p.relics.length}）</h3>`;
  if(p.relics.length===0) html+='<p class="dim">尚無飾品</p>';
  p.relics.forEach(r=>{ const def=D.RELICS[r]; html+=`<div class="loot-line"><span>${r}</span><small class="note">${def?.desc||''}（負重${def?.weight||0}）</small></div>`; });
  html+=`<div class="hairline" style="margin:10px 0"></div><h3>牌組（${p.deck.length}）</h3><div class="row gap" style="flex-wrap:wrap;margin-top:8px">`;
  p.deck.forEach(c=>{ html+=`<span class="status-chip">${c}</span>`; });
  html+=`</div><div class="center" style="margin-top:16px"><button class="btn primary" onclick="closeModal()">關閉</button></div>`;
  openModal(html);
}
function openMenu(){
  openModal(`<h2>選單</h2><div class="col gap" style="margin-top:10px">
    <button class="btn" onclick="saveGame();toast('已儲存');">儲存遊戲</button>
    <button class="btn" onclick="closeModal();showTutorial();">查看戰鬥教學</button>
    <button class="btn" onclick="closeModal();enterCity(false);">放棄冒險並返回城市</button>
    <button class="btn danger" onclick="initTitle()">回到標題</button>
    <button class="btn" onclick="closeModal()">繼續遊戲</button></div>`);
}
function openCodex(){
  const keys=Object.keys(D.CARDS);
  let html='<h2>卡牌圖鑑</h2><div class="reward-cards" id="codex-cards" style="max-height:64vh;overflow:auto;padding:18px 4px 8px 16px"></div>'+
    '<div class="center" style="margin-top:10px"><button class="btn" onclick="closeModal()">關閉</button></div>';
  openModal(html);
  const wrap=$('#codex-cards');
  keys.forEach(name=>{ wrap.appendChild(cardEl({name,up:false})); });
}

/* ====================== 教學 ====================== */
function showTutorial(){
  const t=$('#tutorial');
  t.innerHTML=`<h4>戰鬥教學</h4>
    <p>• 速度條由左跑到右，<b>敏捷</b>越高越快輪到行動。</p>
    <p>• 每回合補滿<b>能量</b>並抽牌；點擊手牌出牌，攻擊牌需再點敵人選定目標。</p>
    <p>• <b>裝甲</b>像額外生命，會先被扣除；<b>體質</b>再為生命傷害提供最終減傷。</p>
    <p>• 敵人頭上的<b>意圖</b>顯示下一步行動，預判它來防守或進攻。</p>
    <p>• <b>飽食度</b>≥70 回合開始多1能量；<b>口渴值</b>≥70 多抽1張牌。</p>
    <p class="dim">（隨時可從右上選單 ≡ 再次查看）</p>
    <div class="center" style="margin-top:8px"><button class="btn" onclick="$('#tutorial').classList.remove('active')">知道了</button></div>`;
  t.classList.add('active');
}

/* ====================== 渲染：戰鬥 ====================== */
function renderCombat(){
  if(G.screen!=='combat') return;
  const p=G.player;
  $('#cb-top').innerHTML=`
    <span class="pill">⚔ ${D.CLASSES[p.cls].name} Lv.${p.level}</span>
    <span class="pill ic-heart"></span><span>${Math.max(0,p.hp)}/${p.maxHp}</span>
    <span class="pill ic-coin"></span><span>${p.gold}</span>
    <span class="pill">第 ${G.run.floor} 層</span>
    <span class="pill">難度 ${G.run.difficulty}</span>
    <span style="flex:1"></span>
    <button class="btn" style="padding:4px 12px" onclick="openBackpack()">背包</button>
    <button class="btn" style="padding:4px 12px" onclick="openMenu()">≡</button>`;
  // 速度條
  const tokens=[{label:'你',pos:p.speedPos,me:true},...G.enemies.filter(e=>e.hp>0).map((e,i)=>({label:(e.slot+1),pos:e.speedPos}))];
  $('#speedbar').innerHTML=tokens.map(t=>`<div class="speed-token" style="left:${clamp(t.pos,0,100)}%;${t.me?'background:var(--accent);color:#fff':''}">${t.label}</div>`).join('');
  // 玩家側
  $('#player-side').innerHTML=`
    <div class="vital-bars">
      <div class="vbar food"><div class="fill" style="height:${p.food}%"></div><div class="label">飽食</div></div>
      <div class="vbar water"><div class="fill" style="height:${p.water}%"></div><div class="label">口渴</div></div>
    </div>
    <div class="fighter" id="player-fighter">
      <div class="portrait">🛡️${p.block>0?`<div class="block-badge">${p.block}</div>`:''}</div>
      <div class="hpbar"><div class="fill" style="width:${clamp(p.hp/p.maxHp*100,0,100)}%"></div><div class="txt">${Math.max(0,p.hp)}/${p.maxHp}</div></div>
      <div class="status-row">${statusChips(p)}</div>
    </div>`;
  // 敵人側
  $('#enemy-side').innerHTML=G.enemies.map((e,i)=>{
    const dead=e.hp<=0;
    return `<div class="enemy ${dead?'dead':''} ${G.selectedCard?'targetable':''}" data-slot="${i}" onclick="clickEnemy(${i})">
      <div class="intent">${dead?'—':previewIntent(e)}</div>
      <div class="portrait">${enemyGlyph(e)}${e.block>0?`<div class="block-badge">${e.block}</div>`:''}</div>
      <div class="hpbar"><div class="fill" style="width:${clamp(e.hp/e.maxHp*100,0,100)}%"></div><div class="txt">${Math.max(0,e.hp)}/${e.maxHp}</div></div>
      <small class="note">${e.name}</small>
      <div class="status-row">${statusChips(e)}</div>
    </div>`;
  }).join('');
  // 牌堆
  $('#energy-orb').textContent=`${G.energy}/${G.player.energyMax||3}`;
  $('#draw-pile').querySelector('.cnt').textContent=G.drawPile.length;
  $('#discard-pile').querySelector('.cnt').textContent=G.discardPile.length;
  $('#exhaust-pile').querySelector('.cnt').textContent=G.exhaustPile.length;
}
function enemyGlyph(e){
  const map={食屍鬼:'🧟',有毒蜥蜴:'🦎',噴火蜥蜴:'🦎',幽魂:'👻',掠奪者:'🗡️',石頭人:'🗿',吸血蝙蝠:'🦇',落魄的獵手:'🏹',死靈術師:'☠️',嗜血的狼人:'🐺',獨眼巨人:'👹',古怪的石像:'🗿'};
  return map[e.key]||'☠';
}
function statusChips(unit){
  return Object.keys(unit.statuses||{}).filter(k=>unit.statuses[k]>0).map(k=>{
    const kind=D.STATUS[k]?.kind||'buff';
    return `<span class="status-chip ${kind}" title="${D.STATUS[k]?.desc||''}">${k} ${unit.statuses[k]}</span>`;
  }).join('');
}
function renderHand(){
  const h=$('#hand'); h.innerHTML='';
  G.hand.forEach((c,i)=>{ const el=cardEl(c); 
    if(cardData(c.name).cost>G.energy && G.pendingDiscard===0) el.classList.add('unplayable');
    if(G.selectedCard && G.selectedCard.c===c) el.classList.add('selected');
    if(G.pendingDiscard>0) el.classList.add('selected');
    el.onclick=()=>selectCard(i); h.appendChild(el); });
  $('#endturn-btn').textContent = G.pendingDiscard>0?`捨棄 ${G.pendingDiscard} 張`:'結束回合';
}
function cardEl(c){
  const cd=cardData(c.name); const el=document.createElement('div');
  el.className=`card t-${(cd.type||'技能').split('/')[0].replace(' 魔法','').replace('魔法','')}`;
  el.innerHTML=`<div class="cost">${cd.cost}</div>
    <div class="cname">${c.name}</div>
    <div class="ctype">${cd.type}${c.up?'（強化）':''}</div>
    <div class="ctext">${cd.text}</div>`;
  return el;
}

/* 浮動數字 */
function floatNum(unit, val, kind){
  if(G.screen!=='combat') return;
  let anchor;
  if(unit===G.player) anchor=$('#player-fighter');
  else { const idx=G.enemies.indexOf(unit); anchor=$$('.enemy')[idx]; }
  if(!anchor) return;
  const rect=anchor.getBoundingClientRect();
  const f=document.createElement('div'); f.className='float-dmg '+(kind==='block'?'float-block':kind==='heal'?'float-heal':'');
  f.textContent = kind==='block'?'格擋':(val<0?val:'+'+val);
  f.style.left=(rect.left+rect.width/2-10)+'px'; f.style.top=(rect.top+30)+'px'; f.style.position='fixed';
  document.body.appendChild(f); setTimeout(()=>f.remove(),1000);
}

/* ====================== 卡牌選擇彈窗（強化/刪除） ====================== */
function openCardPicker(title, deck, cb){
  let html=`<h2>${title}</h2><div class="reward-cards" id="picker-cards"></div>
    <div class="center" style="margin-top:8px"><button class="btn" onclick="closeModal();enterMap();">取消</button></div>`;
  openModal(html);
  const wrap=$('#picker-cards');
  deck.forEach((c,i)=>{ const el=cardEl({name:c,up:c.endsWith('＋')}); el.onclick=()=>cb(i); wrap.appendChild(el); });
}

/* ====================== Modal 控制 ====================== */
function openModal(html){ $('#modal').innerHTML=html; $('#overlay').classList.add('active'); }
function closeModal(){ $('#overlay').classList.remove('active'); }

/* ====================== 對戰鬥開放的 API（卡牌/敵人/飾品呼叫） ====================== */
const GAPI={
  get player(){return G.player;}, get enemies(){return G.enemies;},
  get energy(){return G.energy;}, set energy(v){G.energy=v;}, get pendingDiscard(){return G.pendingDiscard;}, set pendingDiscard(v){G.pendingDiscard=v;},
  dealDamage:(e,d)=>dealDamageToEnemy(e,d,{isCard:true,cardType:G._curCardType}),
  enemyDamage:(e,d)=>enemyDamageToPlayer(e,d),
  gainBlock:(n)=>{ G.player.block+=n; floatNum(G.player,n,'block'); },
  healPlayer:(n)=>{ G.player.hp=Math.min(G.player.maxHp,G.player.hp+n); floatNum(G.player,n,'heal'); },
  loseHpDirect:(n)=>loseHpDirect(n),
  applyStatus:(u,n,a,t)=>applyStatus(u,n,a,t),
  draw:(n)=>draw(n), discardRandom:(n)=>discardRandom(n),
  summon:(key,cnt)=>{ for(let i=0;i<cnt;i++){ if(G.enemies.length>=5) break; const def=D.ENEMIES[key]; const e={key,name:def.name,hp:def.hp,maxHp:def.hp,block:0,agi:def.agi,statuses:{},actions:def.actions,pattern:def.pattern,actIdx:0,def,speedPos:0,slot:G.enemies.length,_firstHit:true}; Object.defineProperties(e,{str:{get:()=>(e.statuses.力量||0)},agiEff:{get:()=>Math.max(1,e.agi+(e.statuses.敏捷||0)-(e.statuses.泥濘||0))}}); G.enemies.push(e); } renderCombat(); },
  log:(m)=>G.log(m),
};
G.dealDamage=GAPI.dealDamage; G.enemyDamage=GAPI.enemyDamage; G.gainBlock=GAPI.gainBlock; G.healPlayer=GAPI.healPlayer;
G.loseHpDirect=GAPI.loseHpDirect; G.applyStatus=GAPI.applyStatus; G.draw=GAPI.draw; G.discardRandom=GAPI.discardRandom; G.summon=GAPI.summon;
G.log=(m)=>{ const box=$('#log-box'); if(box){ const d=document.createElement('div'); d.textContent=m; box.appendChild(d); box.scrollTop=box.scrollHeight; while(box.children.length>40) box.removeChild(box.firstChild); } };

/* ====================== 啟動 ====================== */
window.addEventListener('DOMContentLoaded',()=>{
  bindUI();
  initTitle();
});
function bindUI(){
  $('#title-start').onclick=startGame;
  $('#title-continue').onclick=()=>{ show('saveselect'); renderSaveSlots(); };
  $('#char-confirm').onclick=()=>{ show('saveselect'); renderSaveSlots(); };
  $('#char-back').onclick=initTitle;
  $('#slot-back').onclick=()=>{ if(G.cls) show('charselect'); else initTitle(); };
  $('#map-confirm').onclick=confirmMove;
  $('#map-reset').onclick=()=>{ G.run.map.selNext=null; drawMap(); $('#map-confirm').disabled=true; $('#map-info').innerHTML='<p class="dim center">點選一個可前往的節點</p>'; $('#map-selnext').textContent=''; };
  $('#endturn-btn').onclick=endPlayerTurn;
  $('#city-dungeon').onclick=startDungeon;
  $('#city-inn').onclick=cityHeal;
  $('#city-smith').onclick=citySmith;
  $('#city-shop').onclick=()=>{ openShop(); };
  $('#city-guild').onclick=()=>openBackpack();
}
