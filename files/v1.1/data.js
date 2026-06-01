/* =====================================================================
 *  data.js  —  遊戲內容資料層（資料驅動）
 *  所有卡牌 / 怪物 / 飾品 / 狀態效果都集中在這裡，方便依照 Excel 擴充。
 *  ===================================================================== */

/* ---------------------------------------------------------------------
 * 狀態效果定義
 *   kind: 'buff' | 'debuff'
 *   stack: true 表示可疊層；decay 表示每回合是否自動 -1
 * ------------------------------------------------------------------- */
const STATUS = {
  力量:   { name:'力量',   kind:'buff',   desc:'攻擊傷害 +N' },
  敏捷:   { name:'敏捷',   kind:'buff',   desc:'速度條移動速度 +N（暫時）' },
  智力:   { name:'智力',   kind:'buff',   desc:'魔法傷害 +N' },
  意志:   { name:'意志',   kind:'buff',   desc:'抵抗負面狀態 +N%' },
  體質:   { name:'體質',   kind:'buff',   desc:'受擊最終減傷 +N' },
  破甲:   { name:'破甲',   kind:'buff',   desc:'對裝甲額外造成 +N 傷害' },
  持續護甲:{ name:'持續護甲', kind:'buff', desc:'每回合開始獲得 N 點裝甲' },
  劍氣:   { name:'劍氣',   kind:'buff',   desc:'劍氣流派資源' },
  心眼:   { name:'心眼',   kind:'buff',   desc:'下一張攻擊牌傷害提高' },
  穿甲:   { name:'穿甲',   kind:'buff',   desc:'下一次攻擊無視裝甲' },
  瞄準:   { name:'瞄準',   kind:'buff',   desc:'攻擊必定暴擊' },
  激怒:   { name:'激怒',   kind:'buff',   desc:'力量提高' },
  逃走:   { name:'逃走',   kind:'buff',   desc:'層數滿時逃離戰鬥' },

  流血:   { name:'流血',   kind:'debuff', decay:false, desc:'回合結束時受到等同層數的傷害，之後 -1' },
  中毒:   { name:'中毒',   kind:'debuff', decay:false, desc:'回合結束受到等同層數傷害，之後 -1' },
  燃燒:   { name:'燃燒',   kind:'debuff', decay:false, desc:'回合結束受到等同層數傷害，之後減半' },
  虛弱:   { name:'虛弱',   kind:'debuff', decay:true,  desc:'造成的傷害 -25%' },
  易損:   { name:'易損',   kind:'debuff', decay:true,  desc:'受到的傷害 +50%' },
  裂甲:   { name:'裂甲',   kind:'debuff', decay:true,  desc:'裝甲受到的傷害 +25%' },
  恐懼:   { name:'恐懼',   kind:'debuff', decay:true,  desc:'抽牌 -1' },
  泥濘:   { name:'泥濘',   kind:'debuff', decay:true,  desc:'敏捷 -1' },
  嘲諷:   { name:'嘲諷',   kind:'debuff', decay:true,  desc:'必須優先攻擊此目標' },
  破綻:   { name:'破綻',   kind:'debuff', decay:false, desc:'被特定攻擊利用' },
  穿刺羽毛:{ name:'穿刺羽毛', kind:'debuff', decay:false, desc:'打出手牌時獲得等量流血' },
  狩獵標記:{ name:'狩獵標記', kind:'debuff', decay:true, desc:'受到傷害 +40%' },
  生存本能:{ name:'生存本能', kind:'buff',  decay:true,  desc:'受到傷害 -40%' },
};

/* ---------------------------------------------------------------------
 * 卡牌資料（對應「騎士牌組.xlsx」）
 *   type: '攻擊' | '防禦' | '技能' | '能力'，可含 '魔法'
 *   cost: 能量消耗
 *   exhaust: 是否消耗（用後移除本場）
 *   target: 'enemy' | 'all' | 'self' | 'none'
 *   build(p,e,g)：執行效果的函式（p=玩家, e=目標敵人, g=遊戲）
 *   text: 說明文字（{X} 會被動態數值替換）
 * ------------------------------------------------------------------- */
const CARDS = {
  斬擊: {
    name:'斬擊', type:'攻擊', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'造成 4+力量 點傷害。',
    play:(p,e,g)=>{ g.dealDamage(e, 4 + p.str); },
  },
  順劈斬: {
    name:'順劈斬', type:'攻擊', rarity:'普通', cost:2, target:'all', starter:true,
    text:'對所有敵人造成 6+力量 點傷害，並附加等同傷害的流血。',
    play:(p,e,g)=>{ g.enemies.forEach(en=>{ if(en.hp>0){ const d=g.dealDamage(en, 6+p.str); g.applyStatus(en,'流血',d); } }); },
  },
  袈裟斬: {
    name:'袈裟斬', type:'攻擊', rarity:'普通', cost:2, target:'enemy', starter:true,
    text:'造成 6+力量 點傷害。若敵人沒有裝甲，傷害 +25%。',
    play:(p,e,g)=>{ let d=6+p.str; if(e.block<=0) d=Math.round(d*1.25); g.dealDamage(e,d); },
  },
  近身搏擊: {
    name:'近身搏擊', type:'攻擊', rarity:'普通', cost:0, target:'enemy', starter:true,
    text:'造成 2+力量/2 點傷害。若被裝甲格擋抽1張牌，否則施加1層易損。',
    play:(p,e,g)=>{ const hadBlock=e.block>0; const d=2+Math.floor(p.str/2); g.dealDamage(e,d); if(hadBlock) g.draw(1); else g.applyStatus(e,'易損',1); },
  },
  格擋: {
    name:'格擋', type:'防禦', rarity:'普通', cost:1, target:'self', starter:true,
    text:'獲得 4+體質 點裝甲。',
    play:(p,e,g)=>{ g.gainBlock(4+p.con); },
  },
  緊急迴避: {
    name:'緊急迴避', type:'防禦', rarity:'普通', cost:0, target:'self', exhaust:true, starter:true,
    text:'獲得 4+敏捷 點裝甲。消耗。',
    play:(p,e,g)=>{ g.gainBlock(4+p.agi); },
  },
  磨利刀刃: {
    name:'磨利刀刃', type:'技能', rarity:'普通', cost:1, target:'self', starter:true,
    text:'獲得3點破甲。',
    play:(p,e,g)=>{ g.applyStatus(p,'破甲',3); },
  },
  二連斬: {
    name:'二連斬', type:'攻擊', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'造成 3+力量 點傷害兩次。',
    play:(p,e,g)=>{ g.dealDamage(e,3+p.str); if(e.hp>0)g.dealDamage(e,3+p.str); },
  },
  刺擊: {
    name:'刺擊', type:'攻擊', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'造成 4+力量 點傷害，並附加等同傷害的流血。',
    play:(p,e,g)=>{ const d=g.dealDamage(e,4+p.str); g.applyStatus(e,'流血',d); },
  },
  慎重斬擊: {
    name:'慎重斬擊', type:'攻擊/防禦', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'造成 3+力量 點傷害，獲得 3+體質 點裝甲。',
    play:(p,e,g)=>{ g.dealDamage(e,3+p.str); g.gainBlock(3+p.con); },
  },
  熱血沸騰: {
    name:'熱血沸騰', type:'技能', rarity:'普通', cost:0, target:'self', starter:true,
    text:'失去6點生命，獲得2點能量與本回合2點力量。',
    play:(p,e,g)=>{ g.loseHpDirect(6); g.energy+=2; g.applyStatus(p,'力量',2,true); },
  },
  緊急包紮: {
    name:'緊急包紮', type:'技能', rarity:'普通', cost:0, target:'self', exhaust:true, starter:true,
    text:'恢復 3+意志 點生命。消耗。',
    play:(p,e,g)=>{ g.healPlayer(3+p.will); },
  },
  魯莽衝鋒: {
    name:'魯莽衝鋒', type:'攻擊', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'造成 10+力量 點傷害，並隨機捨棄2張手牌。',
    play:(p,e,g)=>{ g.dealDamage(e,10+p.str); g.discardRandom(2); },
  },
  看穿: {
    name:'看穿', type:'技能', rarity:'普通', cost:1, target:'enemy', starter:true,
    text:'施加2層易損。',
    play:(p,e,g)=>{ g.applyStatus(e,'易損',2); },
  },
  決死之劍: {
    name:'決死之劍', type:'攻擊', rarity:'罕見', cost:2, target:'enemy', starter:true,
    text:'失去10點生命，造成 10+力量 點傷害；自身生命<50%時傷害 +50%。',
    play:(p,e,g)=>{ g.loseHpDirect(10); let d=10+p.str; if(p.hp < p.maxHp*0.5) d=Math.round(d*1.5); g.dealDamage(e,d); },
  },
  千刀萬剮: {
    name:'千刀萬剮', type:'攻擊', rarity:'罕見', cost:2, target:'enemy', starter:true,
    text:'造成 8+力量 點傷害並附加等同傷害的流血。',
    play:(p,e,g)=>{ const d=g.dealDamage(e,8+p.str); g.applyStatus(e,'流血',d); },
  },
  刁鑽: {
    name:'刁鑽', type:'能力', rarity:'普通', cost:1, target:'self', starter:true,
    text:'本場戰鬥中，自身造成傷害額外附加5點流血。',
    play:(p,e,g)=>{ p.combatFlags.bleedOnHit = (p.combatFlags.bleedOnHit||0)+5; },
  },
  戰鬥步伐: {
    name:'戰鬥步伐', type:'能力', rarity:'普通', cost:1, target:'self', starter:true,
    text:'本場戰鬥中獲得2點敏捷。',
    play:(p,e,g)=>{ g.applyStatus(p,'敏捷',2); },
  },
  深呼吸: {
    name:'深呼吸', type:'技能', rarity:'罕見', cost:1, target:'self', starter:true,
    text:'抽2張牌，然後捨棄2張手牌。',
    play:(p,e,g)=>{ g.draw(2); g.pendingDiscard=2; },
  },
  防守反擊: {
    name:'防守反擊', type:'防禦', rarity:'罕見', cost:2, target:'self', starter:true,
    text:'獲得 8+體質 點裝甲，直到下回合每次受攻擊使對方 +3 流血。',
    play:(p,e,g)=>{ g.gainBlock(8+p.con); p.combatFlags.thorns=(p.combatFlags.thorns||0)+3; },
  },
  燕返: {
    name:'燕返', type:'攻擊', rarity:'稀有', cost:1, target:'enemy', starter:true,
    text:'造成 6+力量 點傷害 ×3，並附加等同傷害的流血。',
    play:(p,e,g)=>{ for(let i=0;i<3;i++){ if(e.hp>0){ const d=g.dealDamage(e,6+p.str); g.applyStatus(e,'流血',d);} } },
  },
  剖腹: {
    name:'剖腹', type:'攻擊', rarity:'普通', cost:2, target:'enemy', starter:true,
    text:'造成 8+力量 點傷害，並附加等同傷害的流血 ×2。',
    play:(p,e,g)=>{ const d=g.dealDamage(e,8+p.str); g.applyStatus(e,'流血',d*2); },
  },
  死鬥: {
    name:'死鬥', type:'技能', rarity:'普通', cost:0, target:'self', starter:true,
    text:'失去5點生命，本回合 +5 力量；生命<50%時改為持續整場戰鬥。',
    play:(p,e,g)=>{ g.loseHpDirect(5); const perm = p.hp < p.maxHp*0.5; g.applyStatus(p,'力量',5,!perm); },
  },
};

/* 起始牌組（戰士）：對應 Excel 中常見的初始配置 */
const STARTER_DECK = ['斬擊','斬擊','斬擊','斬擊','斬擊','格擋','格擋','格擋','格擋','二連斬','刺擊','慎重斬擊'];

/* 卡池：戰鬥後 3 選 1 的候選 */
const REWARD_POOL = ['順劈斬','袈裟斬','近身搏擊','磨利刀刃','緊急迴避','魯莽衝鋒','看穿','戰鬥步伐','刁鑽','熱血沸騰','緊急包紮','深呼吸','千刀萬剮','防守反擊','決死之劍','剖腹','死鬥','燕返'];

/* ---------------------------------------------------------------------
 * 怪物資料（對應「第一層怪物.xlsx」）
 *   actions: 行動清單；intentType 用於顯示意圖圖示
 *   pattern: 'loop' 依序循環 | 'random' 隨機起點後循環
 *   onSpawn(en,g)：戰鬥開始固有效果
 * ------------------------------------------------------------------- */
function atk(dmg, times=1){ return {intent:'attack', dmg, times}; }

const ENEMIES = {
  食屍鬼: { name:'食屍鬼', hp:28, agi:3, tier:'normal', pattern:'random',
    inherent:'死亡時使隨機敵人 +3 力量',
    onDeath:(en,g)=>{ const alive=g.enemies.filter(x=>x.hp>0); if(alive.length){ g.applyStatus(alive[(Math.random()*alive.length)|0],'力量',3);} },
    actions:[ {label:'造成10點傷害',intent:'attack',do:(en,g)=>g.enemyDamage(en,10)},
              {label:'造成4點傷害×2',intent:'attack',do:(en,g)=>{g.enemyDamage(en,4);g.enemyDamage(en,4);}},
              {label:'施加1層虛弱',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'虛弱',1)} ] },
  有毒蜥蜴: { name:'有毒蜥蜴', hp:35, agi:3, tier:'normal', pattern:'loop',
    inherent:'受到的中毒傷害 -50%',
    actions:[ {label:'造成8點傷害+2層中毒',intent:'attack',do:(en,g)=>{g.enemyDamage(en,8);g.applyStatus(g.player,'中毒',2);}},
              {label:'獲得10點裝甲',intent:'defend',do:(en,g)=>en.block+=10},
              {label:'施加5層中毒',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'中毒',5)},
              {label:'獲得3點力量',intent:'buff',do:(en,g)=>g.applyStatus(en,'力量',3)} ] },
  噴火蜥蜴: { name:'噴火蜥蜴', hp:30, agi:3, tier:'normal', pattern:'loop',
    inherent:'受到的燃燒傷害 -50%',
    actions:[ {label:'造成8點傷害+2層燃燒',intent:'attack',do:(en,g)=>{g.enemyDamage(en,8);g.applyStatus(g.player,'燃燒',2);}},
              {label:'獲得10點裝甲',intent:'defend',do:(en,g)=>en.block+=10},
              {label:'施加5層燃燒',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'燃燒',5)},
              {label:'獲得3點力量',intent:'buff',do:(en,g)=>g.applyStatus(en,'力量',3)} ] },
  幽魂: { name:'幽魂', hp:25, agi:4, tier:'normal', pattern:'random',
    inherent:'每回合第一次受到非魔法傷害 -90%',
    onTurnStart:(en)=>{ en._firstHit=true; },
    actions:[ {label:'造成10點傷害',intent:'attack',do:(en,g)=>g.enemyDamage(en,10)},
              {label:'造成2點傷害×4',intent:'attack',do:(en,g)=>{for(let i=0;i<4;i++)g.enemyDamage(en,2);}},
              {label:'施加1層恐懼',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'恐懼',1)},
              {label:'獲得1點敏捷',intent:'buff',do:(en,g)=>g.applyStatus(en,'敏捷',1)} ] },
  掠奪者: { name:'掠奪者', hp:41, agi:3, tier:'normal', pattern:'loop',
    inherent:'戰鬥開始擁有15點裝甲',
    onSpawn:(en)=>{ en.block=15; },
    actions:[ {label:'造成14點傷害並附加流血',intent:'attack',do:(en,g)=>{const d=g.enemyDamage(en,14);g.applyStatus(g.player,'流血',d);}},
              {label:'獲得12點裝甲 +1力量',intent:'defend',do:(en,g)=>{en.block+=12;g.applyStatus(en,'力量',1);}},
              {label:'造成6點傷害×2 +2裂甲',intent:'attack',do:(en,g)=>{g.enemyDamage(en,6);g.enemyDamage(en,6);g.applyStatus(g.player,'裂甲',2);}} ] },
  石頭人: { name:'石頭人', hp:50, agi:1, tier:'normal', pattern:'loop',
    inherent:'戰鬥開始擁有5點持續護甲',
    onSpawn:(en,g)=>{ g.applyStatus(en,'持續護甲',5); },
    actions:[ {label:'獲得20點裝甲',intent:'defend',do:(en,g)=>en.block+=20},
              {label:'施加2層泥濘',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'泥濘',2)},
              {label:'造成20點傷害',intent:'attack',do:(en,g)=>g.enemyDamage(en,20)} ] },
  吸血蝙蝠: { name:'吸血蝙蝠', hp:18, agi:3, tier:'normal', pattern:'loop',
    inherent:'造成傷害時回復2點生命',
    actions:[ {label:'造成5點傷害×2並附加流血',intent:'attack',do:(en,g)=>{let d=g.enemyDamage(en,5)+g.enemyDamage(en,5);g.applyStatus(g.player,'流血',d);en.hp=Math.min(en.maxHp,en.hp+2);}},
              {label:'造成10點傷害並回復5點生命',intent:'attack',do:(en,g)=>{g.enemyDamage(en,10);en.hp=Math.min(en.maxHp,en.hp+5);}} ] },
  落魄的獵手: { name:'落魄的獵手', hp:22, agi:3, tier:'normal', pattern:'loop',
    inherent:'戰鬥開始擁有10點裝甲',
    onSpawn:(en)=>{ en.block=10; },
    actions:[ {label:'造成5點傷害×2 +2裂甲',intent:'attack',do:(en,g)=>{g.enemyDamage(en,5);g.enemyDamage(en,5);g.applyStatus(g.player,'裂甲',2);}},
              {label:'對自己施加瞄準',intent:'buff',do:(en,g)=>g.applyStatus(en,'瞄準',1)},
              {label:'造成14點傷害',intent:'attack',do:(en,g)=>g.enemyDamage(en,14)} ] },

  /* 菁英 */
  死靈術師: { name:'死靈術師', hp:100, agi:2, tier:'elite', pattern:'loop',
    inherent:'每個死去的我方單位使自身 +3 力量',
    actions:[ {label:'召喚2隻食屍鬼',intent:'special',do:(en,g)=>g.summon('食屍鬼',2)},
              {label:'施加1層恐懼',intent:'debuff',do:(en,g)=>g.applyStatus(g.player,'恐懼',1)},
              {label:'造成10點傷害×2',intent:'attack',do:(en,g)=>{g.enemyDamage(en,10);g.enemyDamage(en,10);}} ] },
  嗜血的狼人: { name:'嗜血的狼人', hp:120, agi:3, tier:'elite', pattern:'loop',
    inherent:'每降低25%生命 +1力量 +1敏捷',
    onHpChange:(en,g)=>{ const q=Math.floor((1-en.hp/en.maxHp)*4); if(q>(en._q||0)){ g.applyStatus(en,'力量',q-(en._q||0)); g.applyStatus(en,'敏捷',q-(en._q||0)); en._q=q; } },
    actions:[ {label:'造成10點傷害×2並附加流血',intent:'attack',do:(en,g)=>{let d=g.enemyDamage(en,10)+g.enemyDamage(en,10);g.applyStatus(g.player,'流血',d);}},
              {label:'造成15點傷害並回復5點生命',intent:'attack',do:(en,g)=>{g.enemyDamage(en,15);en.hp=Math.min(en.maxHp,en.hp+5);}},
              {label:'獲得20點裝甲，下回合+1力量',intent:'defend',do:(en,g)=>{en.block+=20;en._nextStr=1;}} ] },

  /* BOSS */
  獨眼巨人: { name:'獨眼巨人', hp:300, agi:5, tier:'boss', pattern:'loop',
    inherent:'血量階段轉換：<50%解除緩慢並激怒，<20%進入狂暴',
    onSpawn:(en,g)=>{ en._phase=0; },
    onHpChange:(en,g)=>{
      if(en._phase<1 && en.hp<=en.maxHp*0.5){ en._phase=1; g.applyStatus(en,'力量',5); g.log(`${en.name} 激怒了！`); }
      if(en._phase<2 && en.hp<=en.maxHp*0.2){ en._phase=2; g.applyStatus(en,'力量',5); g.applyStatus(en,'敏捷',2); g.log(`${en.name} 進入狂暴狀態！`); }
    },
    actions:[ {label:'造成20點傷害',intent:'attack',do:(en,g)=>g.enemyDamage(en,20)},
              {label:'造成10點傷害並獲得10裝甲',intent:'attack',do:(en,g)=>{g.enemyDamage(en,10);en.block+=10;}},
              {label:'造成5點傷害×3 +5破甲',intent:'attack',do:(en,g)=>{for(let i=0;i<3;i++)g.enemyDamage(en,5);g.applyStatus(en,'破甲',5);}},
              {label:'重擊：造成20點傷害 +2裂甲',intent:'special',do:(en,g)=>{g.enemyDamage(en,20);g.applyStatus(g.player,'裂甲',2);}} ] },
  古怪的石像: { name:'古怪的石像', hp:220, agi:3, tier:'boss', pattern:'loop',
    inherent:'戰鬥開始沉眠（受傷-20%），3回合後甦醒並每回合 +1力量+1敏捷',
    onSpawn:(en,g)=>{ en._sleep=3; },
    onTurnStart:(en,g)=>{ if(en._sleep>0){ en._sleep--; if(en._sleep===0) g.log(`${en.name} 甦醒了！`);} else { g.applyStatus(en,'力量',1); g.applyStatus(en,'敏捷',1);} },
    actions:[ {label:'獲得30點裝甲',intent:'defend',do:(en,g)=>en.block+=30},
              {label:'造成15點傷害 +2易損',intent:'attack',do:(en,g)=>{g.enemyDamage(en,15);g.applyStatus(g.player,'易損',2);}},
              {label:'造成20點傷害並獲得10裝甲',intent:'attack',do:(en,g)=>{g.enemyDamage(en,20);en.block+=10;}},
              {label:'造成10點傷害×3',intent:'attack',do:(en,g)=>{for(let i=0;i<3;i++)g.enemyDamage(en,10);}} ] },
};

/* 各階層遭遇配置：小怪 / 菁英 / BOSS 池 */
const ENCOUNTERS = {
  normal: [ ['食屍鬼','食屍鬼'], ['有毒蜥蜴'], ['噴火蜥蜴'], ['幽魂','吸血蝙蝠'],
            ['掠奪者'], ['石頭人'], ['落魄的獵手','落魄的獵手'], ['食屍鬼','吸血蝙蝠'] ],
  elite:  [ ['死靈術師'], ['嗜血的狼人'] ],
  boss:   [ ['獨眼巨人'], ['古怪的石像'] ],
};

/* ---------------------------------------------------------------------
 * 飾品資料（對應「飾品效果.xlsx」）
 *   負重 weight；hooks 在特定時機觸發
 * ------------------------------------------------------------------- */
const RELICS = {
  力量之石:   { name:'力量之石', rarity:'普通', weight:1, desc:'力量 +1', onGet:(g)=>g.player.baseStr+=1 },
  敏捷之石:   { name:'敏捷之石', rarity:'普通', weight:1, desc:'敏捷 +1', onGet:(g)=>g.player.baseAgi+=1 },
  意志之石:   { name:'意志之石', rarity:'普通', weight:1, desc:'意志 +1', onGet:(g)=>g.player.baseWill+=1 },
  智力之石:   { name:'智力之石', rarity:'普通', weight:1, desc:'智力 +1', onGet:(g)=>g.player.baseInt+=1 },
  體質之石:   { name:'體質之石', rarity:'普通', weight:1, desc:'體質 +1', onGet:(g)=>g.player.baseCon+=1 },
  老舊的勳章: { name:'老舊的勳章', rarity:'普通', weight:1, desc:'最大生命 +10', onGet:(g)=>{g.player.maxHp+=10;g.player.hp+=10;} },
  士氣勳章:   { name:'士氣勳章', rarity:'罕見', weight:2, desc:'最大生命 +20', onGet:(g)=>{g.player.maxHp+=20;g.player.hp+=20;} },
  破舊的平底鍋:{ name:'破舊的平底鍋', rarity:'普通', weight:1, desc:'戰鬥開始時獲得10點裝甲', onCombatStart:(g)=>g.gainBlock(10) },
  磨刀石:     { name:'磨刀石', rarity:'普通', weight:1, desc:'戰鬥開始時獲得3點破甲', onCombatStart:(g)=>g.applyStatus(g.player,'破甲',3) },
  鎖子甲:     { name:'鎖子甲', rarity:'罕見', weight:2, desc:'戰鬥開始時獲得4點持續護甲', onCombatStart:(g)=>g.applyStatus(g.player,'持續護甲',4) },
  槌子:       { name:'槌子', rarity:'普通', weight:1, desc:'戰鬥開始對所有敵人施加1層裂甲', onCombatStart:(g)=>g.enemies.forEach(e=>g.applyStatus(e,'裂甲',1)) },
  碎玻璃:     { name:'碎玻璃', rarity:'普通', weight:1, desc:'戰鬥開始對所有敵人施加5層流血', onCombatStart:(g)=>g.enemies.forEach(e=>g.applyStatus(e,'流血',5)) },
  煙霧彈:     { name:'煙霧彈', rarity:'罕見', weight:2, desc:'戰鬥開始對所有敵人施加2層虛弱', onCombatStart:(g)=>g.enemies.forEach(e=>g.applyStatus(e,'虛弱',2)) },
  燃燒彈:     { name:'燃燒彈', rarity:'罕見', weight:2, desc:'戰鬥開始對所有敵人施加10層燃燒', onCombatStart:(g)=>g.enemies.forEach(e=>g.applyStatus(e,'燃燒',10)) },
  震盪的時鐘: { name:'震盪的時鐘', rarity:'稀有', weight:3, desc:'戰鬥開始對所有敵人施加2層易損', onCombatStart:(g)=>g.enemies.forEach(e=>g.applyStatus(e,'易損',2)) },
  劣質的調味料:{ name:'劣質的調味料', rarity:'普通', weight:1, desc:'戰鬥開始恢復3點生命', onCombatStart:(g)=>g.healPlayer(3) },
  破舊的碗:   { name:'破舊的碗', rarity:'普通', weight:1, desc:'戰鬥結束額外獲得10金幣', onCombatEnd:(g)=>g.run.gold+=10 },
  損壞的餐具: { name:'損壞的餐具', rarity:'普通', weight:1, desc:'戰鬥結束恢復5飽食/5口渴', onCombatEnd:(g)=>{g.player.food=Math.min(100,g.player.food+5);g.player.water=Math.min(100,g.player.water+5);} },
  破舊的鍋鏟: { name:'破舊的鍋鏟', rarity:'普通', weight:1, desc:'每場戰鬥首張攻擊牌 +5 傷害', onCombatStart:(g)=>g.player.combatFlags.firstAtkBonus=5 },
  風車:       { name:'風車', rarity:'普通', weight:1, desc:'戰鬥開始多抽1張並捨棄1張', onCombatStart:(g)=>{g.draw(1);g.pendingDiscard=(g.pendingDiscard||0)+1;} },
  'Gary的鍵盤':{ name:'Gary的鍵盤', rarity:'稀有', weight:1, desc:'從速度條80%開始行動', onCombatStart:(g)=>{ g.player.speedPos=80; } },
  'Hubert的滑鼠':{ name:'Hubert的滑鼠', rarity:'稀有', weight:1, desc:'手牌上限+2，戰鬥開始多抽2張', onGet:(g)=>g.player.handLimit+=2, onCombatStart:(g)=>g.draw(2) },
  月貓的抱枕: { name:'月貓的抱枕', rarity:'稀有', weight:1, desc:'每場戰鬥第一次致死傷害免疫一次', onCombatStart:(g)=>g.player.combatFlags.deathSave=true },
};

const COMMON_RELICS = ['力量之石','敏捷之石','意志之石','智力之石','體質之石','老舊的勳章','破舊的平底鍋','磨刀石','槌子','碎玻璃','劣質的調味料','破舊的碗','損壞的餐具','破舊的鍋鏟','風車'];
const RARE_RELICS = ['士氣勳章','鎖子甲','煙霧彈','燃燒彈','震盪的時鐘','Gary的鍵盤','Hubert的滑鼠','月貓的抱枕'];

/* ---------------------------------------------------------------------
 * 裝備資料（武器 + 頭/身/腳）
 * ------------------------------------------------------------------- */
const EQUIPMENT = {
  生鏽的鐵劍: { name:'生鏽的鐵劍', slot:'weapon', rarity:'普通', durability:30, dmgBonus:2, desc:'基礎傷害 +2' },
  騎士長劍:   { name:'騎士長劍', slot:'weapon', rarity:'罕見', durability:40, dmgBonus:4, desc:'基礎傷害 +4' },
  破舊頭盔:   { name:'破舊頭盔', slot:'head', rarity:'普通', durability:25, armor:4, desc:'起始裝甲 +4' },
  皮甲:       { name:'皮甲', slot:'body', rarity:'普通', durability:30, armor:6, desc:'起始裝甲 +6' },
  舊靴:       { name:'舊靴', slot:'feet', rarity:'普通', durability:25, armor:3, desc:'起始裝甲 +3' },
  鋼盔:       { name:'鋼盔', slot:'head', rarity:'罕見', durability:35, armor:7, desc:'起始裝甲 +7' },
  鎖鏈胸甲:   { name:'鎖鏈胸甲', slot:'body', rarity:'罕見', durability:40, armor:10, desc:'起始裝甲 +10' },
};

/* 角色職業 */
const CLASSES = {
  戰士: {
    name:'戰士',
    desc:'擅長近戰攻擊與防禦，以強大的力量與堅韌的意志輾碎敵人。',
    baseStr:3, baseAgi:2, baseInt:1, baseWill:2, baseCon:3,
    maxHp:80,
    deck: STARTER_DECK,
    startEquip:{ weapon:'生鏽的鐵劍', head:'破舊頭盔', body:'皮甲', feet:'舊靴' },
  },
};

/* 暴露給其他檔案 */
window.GAMEDATA = { STATUS, CARDS, STARTER_DECK, REWARD_POOL, ENEMIES, ENCOUNTERS, RELICS, COMMON_RELICS, RARE_RELICS, EQUIPMENT, CLASSES };
