// ===== 全局参数：修改此处，游戏自动适配 =====
var CONFIG = {
  CARD_SIZE: 62,       // 卡牌尺寸（正方形边长）
  CARD_GAP: 2,         // 同层卡牌间距
  BOARD_W: 560,        // 棋盘宽度
  BOARD_H: 580,        // 棋盘高度
  BOARD_BORDER: 5,     // 棋盘边框宽度
  BOARD_PAD: 12,       // 棋盘内边距
  TRAY_SLOTS: 7,       // 消除槽位数量
  STEP: 64,            // 同层卡牌间距 = CARD_SIZE + CARD_GAP
  Q: 15.5,             // ===== 规则4：唯一偏移基础单位 = 1/4 边长 =====
  STASH_MAX: 3,        // 暂存区最大数量
  LIVES: 3             // 初始生命
};
var INNER_W = CONFIG.BOARD_W - CONFIG.BOARD_BORDER*2 - CONFIG.BOARD_PAD*2; // 526
var INNER_H = CONFIG.BOARD_H - CONFIG.BOARD_BORDER*2 - CONFIG.BOARD_PAD*2; // 546

var TYPES = Array.from({length:12}, function(_,i){ return { name:"应援照 "+(i+1), image:"images/cards/"+(i+1)+".jpg" }; });
var LEVELS = [
  { title:"第 1 关", tip:"热身一下哈", types:9, copies:6 },
  { title:"第 2 关", tip:"别笑 你来你也过不了第二关", types:12, copies:15 }
];
// ===== 终极异常捕获：window.onerror（早期错误）+ try/catch（执行期错误）双保险 =====
function showFatalError(title, msg){
  var bar=document.createElement("div");
  bar.style.cssText="position:fixed;left:0;right:0;top:0;z-index:99999;background:#e11d48;color:#fff;padding:14px 20px;font-size:14px;font-family:Consolas,微软雅黑,monospace;white-space:pre-wrap;line-height:1.5;box-shadow:0 4px 16px #0004";
  bar.innerHTML="<b style=\"font-size:16px\">❌ "+title+"（请把下面内容截图反馈）</b><br><br>"+msg;
  try{ document.body.prepend(bar); }catch(_e1){ try{document.documentElement.prepend(bar);}catch(_e2){} }
  try{ alert(title+"\n\n"+msg); }catch(_e3){}
}
window.addEventListener("error", function(e){
  showFatalError("脚本加载错误", e.message+"\n位置: "+e.filename+":"+e.lineno+":"+e.colno);
});
function $(sel, must){
  if(must===undefined) must=true;
  var el=document.querySelector(sel);
  if(must && !el) throw new Error("找不到DOM元素: "+sel+"\n请确认 index.html 里有没有这个 id");
  return el;
}
// ===== 变量声明外置：让后面函数能访问到 =====
var board, trayEl, stashEl, modal, quizModal, devModal, certModal, bgm;
var cards=[], tray=[], stash=[], currentLevel=0, lives=CONFIG.LIVES, tools={clear:0,stash:0,shuffle:0}, runStartedAt=0, timerId=null, ended=false, quizUsed=false, audioCtx=null, musicOn=false;
function shuffle(a){ return a.slice().sort(function(){return Math.random()-.5;}); }
var DEV_PASS, devPwd, devFb;
function startRun(){ currentLevel=0; lives=CONFIG.LIVES; runStartedAt=Date.now(); clearInterval(timerId); timerId=setInterval(renderTime,1000); beginLevel(); renderTime(); }
// ===== 规则3：grid 仅生成规整网格，固定行列，禁止每格随机偏移 =====
function grid(rows, cols, left, top, dx, dy) {
  var ST=CONFIG.STEP, dxi=dx||0, dyi=dy||0, out=[], r, c, i;
  for(i=0; i<rows*cols; i++){
    r=Math.floor(i/cols); c=i%cols;
    out.push({x:left+c*ST+dxi, y:top+r*ST+dyi, stack:0, domino:false});
  }
  return out;
}
// ===== 规则1+4：domino 竖列堆叠，向内偏移不压线；层间距 = 1Q(15.5)露出1/4顶端 =====
function domino(x, y, count) {
  var v=CONFIG.Q, out=[], i;  // v=1Q：露出顶端1/4
  for(i=0; i<count; i++) out.push({x:x, y:(y+(count-1-i)*v), stack:i, domino:true});
  return out;
}
// 居中计算：指定列数对应的 left 坐标
function centerLeft(cols) {
  return Math.round((INNER_W-(cols*CONFIG.STEP-CONFIG.CARD_GAP))/2);
}
// ===== 规则2+3+4+5+6：羊了个羊原版布局 =====
// 规则2：左右多米诺备用堆；中间3-4行主网格，不留大面积空白
// 规则3：主区域严格规整网格行列对齐
// 规则4：所有"错位偏移"（堆叠错位）只能是 Q (1/4边长=15.5) 的整数倍
// 规则5：全覆盖层（dx=0, dy=0）时，下层边缘零外露
// 规则6：多米诺堆与容器边框留 dominoPad=2Q 空隙，不压线
function boardPositions(level) {
  var Q=CONFIG.Q, ST=CONFIG.STEP, S=CONFIG.CARD_SIZE;
  var _2Q=2*Q;
  // ===== 规则2：中间主网格统一 4行 × 6列（4行符合"3-4行"要求，中间填充满不留白） =====
  var ROWS=4, COLS=6;
  var mainLeft=centerLeft(COLS);
  var mainH=ROWS*ST-CONFIG.CARD_GAP;
  var base=Math.round((INNER_H-mainH)/2);

  if (level===0) {
    // ===== 第一关：54张；简单3层堆叠，左右无多米诺 =====
    // 24 + 24 + 6 = 54  ✓（types=9 × copies=6 = 54）
    return [
      // L0 底层：4×6=24张（4行符合规则2"3-4行主网格"）
      grid(ROWS,COLS, mainLeft,       base,       0, 0),
      // L1：4×6=24张，向右下偏移 2Q（1/4遮挡，符合规则4的Q整数倍错位）
      grid(ROWS,COLS, mainLeft+_2Q,   base+_2Q,   0, 0),
      // L2 顶层：补6张 3×2 小网格，放在主网格右下区域，覆盖L1的 1/4 右下角
      grid(3,2,
        mainLeft + (COLS-2)*ST,  // 贴主网格右侧最后2列
        base  + (ROWS-3)*ST + _2Q,  // 垂直贴主网格底部最后3行，并再向下错位2Q
        0, 0)
    ];
  }

  // ===== 第二关（地狱）：180张；主网格5层(120) + 顶部新增2行×4列×5层(40) + 多米诺10×2(20) =====
  // 120 + 40 + 20 = 180  ✓（types=12 × copies=15 = 180）
  var dominoPad=_2Q;                               // 规则6：多米诺和边框留 2Q=31px 空隙
  var dominoPerSide=10;                             // 每叠10张（从12减到10，凑180=12×15）
  var dominoH = S + (dominoPerSide-1)*Q;            // 10张总高
  var dominoY = INNER_H - dominoH;                  // 多米诺底部对齐内容区

  // ===== 主网格5层堆叠（每层4×6=24张，错位都是Q整数倍 ✓规则4） =====
  var mainLayers=[
    {dx:0,    dy:0   },   // L0 底层对齐（规整网格✓规则3）
    {dx:0,    dy:0   },   // L1 全覆盖（dx=0,dy=0 → 下层边缘零外露 ✓规则5）
    {dx:0,    dy:_2Q },   // L2 半遮挡（向下错位 2Q）
    {dx:_2Q,  dy:_2Q },   // L3 右下1/4遮挡（各错位2Q）
    {dx:0,    dy:0   },   // L4 顶层全覆盖
  ];
  var layers=[], l, off;
  for(l=0; l<mainLayers.length; l++){
    off=mainLayers[l];
    layers.push(grid(ROWS,COLS, mainLeft+off.dx, base+off.dy, 0, 0));
  }
  // ===== 新增：顶部2行×4列×5层堆叠（40张），紧贴主网格上方 =====
  var topCols=4, topRows=2;
  var topLeft=centerLeft(topCols);                  // 4列居中
  var topBase=base-topRows*ST+CONFIG.CARD_GAP;      // 紧贴主网格上方
  var topLayers=[
    {dx:0,    dy:0   },   // 全覆盖
    {dx:0,    dy:0   },   // 全覆盖
    {dx:0,    dy:_2Q },   // 半遮挡
    {dx:_2Q,  dy:_2Q },   // 1/4遮挡
    {dx:0,    dy:0   },   // 全覆盖顶层
  ];
  for(l=0; l<topLayers.length; l++){
    off=topLayers[l];
    layers.push(grid(topRows, topCols, topLeft+off.dx, topBase+off.dy, 0, 0));
  }
  // ===== 规则2：左右多米诺竖列备用卡牌堆 =====
  var leftArr=domino(dominoPad, dominoY, dominoPerSide);
  var rightArr=domino(INNER_W-S-dominoPad, dominoY, dominoPerSide);
  layers.push(leftArr.concat(rightArr));
  return layers;
}
function beginLevel(){
  ended=false; cards=[]; tray=[]; stash=[]; tools={clear:0,stash:0,shuffle:0}; quizUsed=false;
  board.innerHTML=""; trayEl.innerHTML=""; modal.classList.add("hidden");
  var level=LEVELS[currentLevel], S=CONFIG.CARD_SIZE;
  var positions=boardPositions(currentLevel);
  var total=0, i, j, k, layerPositions, point, totalPerLayer=[];
  // ===== 先算：总张数、每层各有几张（分层边界） =====
  for(i=0; i<positions.length; i++){
    totalPerLayer.push(positions[i].length);
    total += positions[i].length;
  }
  // ===== 更随机的 typeId 分配（只针对第二关/地狱模式，第一关保持原简单shuffle） =====
  // 旧版 shuffle(flat) 的问题：概率性出现 3-4 张同类型连续出现，玩家一点就连消 → 太简单
  // 新版：先用「均匀轮询法」保证每种类型每隔 TYPES 张才出现 1 次，绝不3连相邻，再做跨层交换洗牌
  var typeIds;
  if(level.types>=12 && total>100){
    // —— 地狱级分散 ——
    var T=level.types, C=level.copies;
    typeIds=new Array(total);
    // Step1：轮询填充。typeIds[pos] = pos % T  →  天然每T张才重复1次，C轮下来均匀分散
    for(i=0; i<total; i++) typeIds[i] = i%T;
    // Step2：分层边界（用 totalPerLayer 算出每张卡属于哪一层，保证跨层交换、不三张挤同一层）
    var layerOf=new Array(total), cur=0;
    for(i=0; i<totalPerLayer.length; i++){
      for(k=0; k<totalPerLayer[i]; k++){ layerOf[cur+k]=i; }
      cur += totalPerLayer[i];
    }
    // Step3：做 2000 次「不同层之间随机交换」，只接受不产生 3 连同类型 的交换
    //  → 既有随机性，又保持分散、不连号，三张同款必须跨越不同层掀开大堆遮挡才能集齐
    var tries=0, swaps=0, a, b, tmp, safeA, safeB;
    var noTriple = function(arr, p){
      // 检查位置p附近（p-2..p+2）有没有3个连续相同的
      for(var s=Math.max(0,p-2); s<=Math.min(arr.length-3,p+2); s++){
        if(arr[s]===arr[s+1] && arr[s+1]===arr[s+2]) return false;
      }
      return true;
    };
    while(swaps<2000 && tries<40000){
      tries++;
      a=Math.floor(Math.random()*total);
      b=Math.floor(Math.random()*total);
      if(a===b) continue;
      if(layerOf[a]===layerOf[b]) continue;      // 同一层不换，强制跨层分散
      if(typeIds[a]===typeIds[b]) continue;       // 同类型不换，无意义
      tmp=typeIds[a]; typeIds[a]=typeIds[b]; typeIds[b]=tmp;
      safeA=noTriple(typeIds,a); safeB=noTriple(typeIds,b);
      if(safeA && safeB){ swaps++; }
      else{ typeIds[b]=typeIds[a]; typeIds[a]=tmp; }   // 回滚
    }
  }else{
    // 第一关（简单模式）：保持原shuffle
    typeIds=shuffle(Array.from({length:level.types}, function(_,id){ return Array.from({length:level.copies}, function(){return id;}); }).flat());
  }
  // ===== 以下生成 cards 流程完全不变 =====
  var cardId=0;
  for(i=0; i<positions.length; i++){
    layerPositions=positions[i];
    for(j=0; j<layerPositions.length; j++){
      point=layerPositions[j];
      cards.push({id:cardId,typeId:typeIds[cardId],layer:i,stack:point.stack||0,x:point.x,y:point.y,domino:!!point.domino,removed:false});
      cardId++;
    }
  }
  for(i=0; i<cards.length; i++) createTile(cards[i]);
  render();
}
function createTile(card){
  var el=document.createElement("button");
  el.className="tile";
  el.style.left=card.x+"px";
  el.style.top=card.y+"px";
  el.style.zIndex=card.layer*20+card.stack+1;
  el.innerHTML='<img src="'+TYPES[card.typeId].image+'" alt="'+TYPES[card.typeId].name+'">';
  el.setAttribute("aria-label", TYPES[card.typeId].name);
  (function(c){ el.onclick=function(){ choose(c); }; })(card);
  board.appendChild(el);
  card.el=el;
}
// ===== 规则1：原版羊了个羊遮挡判定 —— 只要有任意区域被压住 → 不可点击 =====
// 只有整张卡牌 100% 完全暴露、没有被别的卡牌覆盖任何一个像素时，才可选中
function isBlocked(card){
  var S=CONFIG.CARD_SIZE;
  var r1={left:card.x, top:card.y, right:card.x+S, bottom:card.y+S};
  var i, o, higher, r2, ixL, ixR, ixT, ixB;
  for(i=0; i<cards.length; i++){
    o=cards[i];
    if(o.removed || o.id===card.id) continue;
    higher = o.layer>card.layer || (o.layer===card.layer && o.stack>card.stack);
    if(!higher) continue;
    r2={left:o.x, top:o.y, right:o.x+S, bottom:o.y+S};
    ixL=Math.max(r1.left,r2.left); ixR=Math.min(r1.right,r2.right);
    ixT=Math.max(r1.top,r2.top);  ixB=Math.min(r1.bottom,r2.bottom);
    // ===== 规则1：只要重叠面积>0（有任何区域被盖住）就判定为被遮挡 =====
    if(ixR>ixL && ixB>ixT) return true;
  }
  return false;
}
function choose(card){
  if(ended||card.removed||isBlocked(card)) return;
  initAudio();
  card.removed=true; card.el.classList.add("out"); tray.push(card);
  var same=tray.filter(function(x){return x.typeId===card.typeId;});
  var typeIdCur=card.typeId;
  if(same.length===3){
    render();
    setTimeout(function(){
      tray=tray.filter(function(x){return x.typeId!==typeIdCur;});
      playClearSound(); render(); checkEnd();
    },150);
    return;
  }
  render();
  if(tray.length>=CONFIG.TRAY_SLOTS) setTimeout(function(){ if(tray.length>=CONFIG.TRAY_SLOTS) failLevel(); },170);
}
function render(){
  var i, c, available, k, el;
  for(i=0; i<cards.length; i++){
    c=cards[i];
    available=!c.removed && !isBlocked(c);
    c.el.classList.toggle("blocked", !c.removed && !available);
    c.el.classList.toggle("available", available);
    c.el.disabled=!available;
    c.el.style.pointerEvents=available?"auto":"none";
    c.el.style.cursor=available?"pointer":"not-allowed";
    c.el.setAttribute("aria-disabled", String(!available));
  }
  renderPile(trayEl, tray, false);
  renderPile(stashEl, stash, true);
  var remEl=document.querySelector("#remaining");
  if(remEl && remEl.parentNode) remEl.parentNode.removeChild(remEl);
  document.querySelector("#levelName").textContent=LEVELS[currentLevel].title;
  document.querySelector("#tip").textContent=LEVELS[currentLevel].tip;
  var livesTxt="";
  for(i=0; i<lives; i++) livesTxt += (i===0?"♥ ":"♥");
  document.querySelector("#lives").textContent = livesTxt.replace(/\s+$/,"") || "--";
  document.querySelector("#trayCount").textContent=tray.length+" / "+CONFIG.TRAY_SLOTS;
  document.querySelector("#stashLabel").textContent=stash.length+" / "+CONFIG.STASH_MAX;
  var stashArea=document.querySelector("#stashArea");
  if(stash.length===0) stashArea.classList.add("hidden"); else stashArea.classList.remove("hidden");
  var keys=["clear","stash","shuffle"];
  for(i=0; i<keys.length; i++){
    k=keys[i];
    document.querySelector("#"+k+"Count").textContent=tools[k];
    document.querySelector("#"+k+"Btn").disabled = tools[k]===0;
  }
  document.querySelector("#quizBtn").disabled=quizUsed;
  document.querySelector("#quizHint").textContent = quizUsed ? "本次生命已经答过题了" : "本次生命可答题一次，答对后三种道具各可用一次";
  renderRanking();
  adjustMobileScale();
}
// ===== 移动端自适应缩放：整体外壳等比缩放，保证棋盘+多米诺+消除槽比例一致 =====
function adjustMobileScale(){
  var vw=window.innerWidth;
  var shell=document.querySelector(".game-shell");
  if(!shell) return;
  // 和 CSS @media (max-width:600px) 保持一致的触发条件
  if(vw < 600){
    // 利用 98% 屏幕宽度做缩放（留一点呼吸感），并限制 scale 最大为 1 不放大
    var available = vw * 0.98;
    var scale = available / 560;
    if(scale > 1) scale = 1;
    shell.style.setProperty("--scale", String(scale));
    // 高度补偿：transform-scale 不改变文档流占位高度，用负 margin 吃掉缩放后的空白
    var realH = shell.offsetHeight;
    var diff = realH * (1 - scale);
    shell.style.marginBottom = "-" + Math.round(diff) + "px";
  }else{
    shell.style.setProperty("--scale", "1");
    shell.style.marginBottom = "";
  }
}
window.addEventListener("resize", adjustMobileScale);
adjustMobileScale();
function renderPile(target, pile, returnable){
  target.innerHTML="";
  var i, slot, card, el;
  if(target===trayEl){
    for(i=0; i<CONFIG.TRAY_SLOTS; i++){
      slot=document.createElement("div");
      slot.className="tray-slot";
      slot.style.cssText="flex:0 0 62px;width:62px;height:62px;border:1px dashed #58aab3;border-radius:9px;";
      card=pile[i];
      if(card){
        el=card.el.cloneNode(true);
        el.className="tile";
        el.style.cssText="position:relative;width:100%;height:100%;max-width:none;min-width:0;box-shadow:0 2px 0 #027789;";
        el.disabled=true;
        slot.appendChild(el);
      }
      target.appendChild(slot);
    }
    return;
  }
  for(i=0; i<pile.length; i++){
    card=pile[i];
    el=card.el.cloneNode(true);
    el.className="tile";
    el.style.cssText="";
    el.disabled=!returnable;
    if(returnable){ (function(cc){ el.onclick=function(){ returnFromStash(cc); }; })(card); }
    target.appendChild(el);
  }
}
function returnFromStash(card){
  if(tray.length>=CONFIG.TRAY_SLOTS) return;
  stash=stash.filter(function(c){return c!==card;});
  tray.push(card);
  var same=tray.filter(function(x){return x.typeId===card.typeId;});
  var typeIdCur=card.typeId;
  if(same.length===3){
    render();
    setTimeout(function(){
      tray=tray.filter(function(x){return x.typeId!==typeIdCur;});
      playClearSound(); render(); checkEnd();
    },150);
    return;
  }
  render();
  if(tray.length>=CONFIG.TRAY_SLOTS) setTimeout(function(){ if(tray.length>=CONFIG.TRAY_SLOTS) failLevel(); },170);
}
function checkEnd(){
  var any=false, i;
  for(i=0; i<cards.length; i++){ if(!cards[i].removed){ any=true; break; } }
  if(!any && tray.length===0 && stash.length===0){
    if(currentLevel===0){
      showModal("第 1 关通关！","🎊","准备进入第二关~","进入第 2 关", function(){ currentLevel=1; beginLevel(); });
    }else finishRun();
  }
}
function failLevel(){
  if(ended) return;
  ended=true; lives--;
  if(lives>0) showModal("本关挑战失败","🐑","还有 "+lives+" 条生命。本次生命的道具将重置。","再试一次", beginLevel);
  else showModal("输了 out","💙","重新从第 1 关开始","重新开始", startRun);
}
function finishRun(){
  ended=true; clearInterval(timerId);
  // ===== 第二关通关：弹出奖状 =====
  showCert();
  // 同时保存成绩到排行榜
  var name="小秤砣";
  var list=scores().concat([{name:name, seconds:elapsed()}]);
  list.sort(function(a,b){return a.seconds-b.seconds;});
  list=list.slice(0,8);
  localStorage.setItem("support-match-scores", JSON.stringify(list));
  renderRanking();
}
// ===== 奖状弹窗逻辑 =====
function showCert(){
  var certModal=$("#certModal");
  var input=$("#certInput");
  var btn=$("#certBtn");
  var closeRow=$(".cert-actions");
  var nameEl=$("#certName");
  var timeEl=$("#certTime");
  var dateEl=$("#certDate");
  // 填入用时和日期
  var sec=elapsed();
  var mm=String(Math.floor(sec/60)).padStart(2,"0");
  var ss=String(sec%60).padStart(2,"0");
  timeEl.textContent=mm+":"+ss;
  var d=new Date();
  dateEl.textContent=d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0");
  // 重置初始状态
  nameEl.textContent="???";
  input.value="";
  input.style.display="";
  btn.style.display="";
  closeRow.classList.add("hidden");
  certModal.classList.remove("hidden");
  certModal.style.zIndex="200";
  setTimeout(function(){ input.focus(); }, 100);
  // 生成奖状按钮
  btn.onclick=function(){
    var name=(input.value||"").trim()||"小秤砣";
    nameEl.textContent=name;
    input.style.display="none";
    btn.style.display="none";
    closeRow.classList.remove("hidden");
    // 更新排行榜名字
    var list=scores();
    if(list.length>0){
      list[list.length-1].name=name;
      localStorage.setItem("support-match-scores", JSON.stringify(list));
      renderRanking();
    }
    playClearSound();
  };
  input.onkeydown=function(e){ if(e.key==="Enter") btn.click(); };
  // 关闭按钮
  $("#certClose").onclick=function(){
    certModal.classList.add("hidden");
    startRun();
  };
}
function showModal(title, emoji, text, button, action, needName){
  modal.classList.remove("hidden");
  document.querySelector("#modalTitle").textContent=title;
  document.querySelector("#modalEmoji").textContent=emoji;
  document.querySelector("#modalText").textContent=text;
  document.querySelector("#nameLabel").style.display = needName ? "block" : "none";
  document.querySelector("#playerName").style.display = needName ? "block" : "none";
  document.querySelector("#saveBtn").style.display = "none";
  var act=document.querySelector("#modalAction");
  act.textContent=button;
  act.onclick=action;
}
function elapsed(){ return Math.floor((Date.now()-runStartedAt)/1000); }
function renderTime(){
  var sec=elapsed();
  var mm=String(Math.floor(sec/60)).padStart(2,"0");
  var ss=String(sec%60).padStart(2,"0");
  document.querySelector("#timer").textContent=mm+":"+ss;
}
function useClear(){
  if(!tools.clear || !tray.length) return;
  tools.clear--; tray.shift(); playClearSound(); render(); checkEnd();
}
function useStash(){
  if(!tools.stash || !tray.length || stash.length) return;
  tools.stash--;
  var n=Math.min(CONFIG.STASH_MAX, tray.length);
  stash=tray.splice(tray.length-n, n);
  render();
}
function useShuffle(){
  if(!tools.shuffle) return;
  tools.shuffle--;
  var active=[], spots=[], i;
  for(i=0; i<cards.length; i++){ if(!cards[i].removed) active.push(cards[i]); }
  for(i=0; i<active.length; i++) spots.push({x:active[i].x, y:active[i].y});
  spots=shuffle(spots);
  for(i=0; i<active.length; i++){
    active[i].x=spots[i].x; active[i].y=spots[i].y;
    active[i].el.style.left=active[i].x+"px";
    active[i].el.style.top=active[i].y+"px";
  }
  render();
}
var QUESTIONS=[
  {q:"下列哪个角色不是古偶世界的？",a:["宫尚角","虞昶轩","夏侯澹"],ok:1},
  {q:"杨东东最喜欢的零食？",a:["薯片","泡面","辣条"],ok:1},
  {q:"杨东东最喜欢的动画ip是？",a:["史努比","蜡笔小新","喜羊羊"],ok:0}
];
function openQuiz(){
  if(quizUsed) return;
  var q=QUESTIONS[Math.floor(Math.random()*QUESTIONS.length)];
  quizModal.classList.remove("hidden");
  document.querySelector("#question").textContent=q.q;
  var answers=document.querySelector("#answers");
  answers.innerHTML="";
  document.querySelector("#answerFeedback").textContent="";
  var i, b, txt;
  for(i=0; i<q.a.length; i++){
    txt=q.a[i];
    b=document.createElement("button");
    b.textContent=txt;
    (function(idx, okVal){ b.onclick=function(){ answerQuiz(idx===okVal); }; })(i, q.ok);
    answers.appendChild(b);
  }
}
function answerQuiz(correct){
  quizUsed=true;
  var feedback=document.querySelector("#answerFeedback");
  if(correct){
    tools={clear:1,stash:1,shuffle:1};
    feedback.textContent="答对了！消除、暂存、洗牌三种道具各可用一次~";
    playClearSound();
  }else{
    feedback.textContent="这次没答对，下次加油吖。";
  }
  setTimeout(function(){ quizModal.classList.add("hidden"); render(); }, 1100);
}
function scores(){
  try{ return JSON.parse(localStorage.getItem("support-match-scores")||"[]"); }catch(_e){ return []; }
}
function renderRanking(){
  var list=scores();
  document.querySelector("#bestScore").textContent = list[0] ? (list[0].seconds+"s") : "--";
  var html="", i;
  if(list.length===0){
    document.querySelector("#ranking").innerHTML="<li>留下你的名字吧！</li>";
    return;
  }
  for(i=0; i<list.length; i++){
    html += "<li>"+safe(list[i].name)+"<span>"+list[i].seconds+" 秒</span></li>";
  }
  document.querySelector("#ranking").innerHTML=html;
}
function safe(v){
  var d=document.createElement("div");
  d.textContent=v;
  return d.innerHTML;
}
function saveScore(){
  var name=(document.querySelector("#playerName").value||"").trim()||"小秤砣";
  var list=scores().concat([{name:name, seconds:elapsed()}]);
  list.sort(function(a,b){return a.seconds-b.seconds;});
  list=list.slice(0,8);
  localStorage.setItem("support-match-scores", JSON.stringify(list));
  startRun();
}
function initAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==="suspended") audioCtx.resume();
}
function playClearSound(){
  if(!audioCtx) return;
  var delays=[0, 0.11];
  var i, delay, o, g;
  for(i=0; i<delays.length; i++){
    delay=delays[i];
    o=audioCtx.createOscillator();
    g=audioCtx.createGain();
    o.type="sine";
    o.frequency.value = (i===1) ? 880 : 660;
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime+delay);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime+delay+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime+delay+0.22);
    o.connect(g).connect(audioCtx.destination);
    o.start(audioCtx.currentTime+delay);
    o.stop(audioCtx.currentTime+delay+0.24);
  }
}
// ===== 【最关键】所有DOM操作 + 事件绑定 + 启动代码 全部包进 try/catch =====
try{
  board=$("#board"); trayEl=$("#tray"); stashEl=$("#stash");
  modal=$("#modal"); quizModal=$("#quizModal"); devModal=$("#devModal"); certModal=$("#certModal"); bgm=$("#bgm");
  var allModals=[modal, quizModal, devModal, certModal], m;
  for(m=0; m<allModals.length; m++) allModals[m].style.zIndex="200";
  $("#restartBtn").onclick=startRun;
  $("#clearBtn").onclick=useClear;
  $("#stashBtn").onclick=useStash;
  $("#shuffleBtn").onclick=useShuffle;
  $("#quizBtn").onclick=openQuiz;
  $("#musicBtn").onclick=function(){
    musicOn=!musicOn;
    try{
      if(musicOn){ bgm.play(); }else{ bgm.pause(); }
      $("#musicBtn").classList.toggle("active", musicOn);
    }catch(_e){ musicOn=false; }
  };
  DEV_PASS="djb";
  devPwd=$("#devPwd"); devFb=$("#devFeedback");
  function closeDev(){
    devModal.classList.add("hidden");
    devPwd.value=""; devFb.textContent="";
    var guide=$("#devGuide");
    if(guide) guide.classList.add("hidden");
    devPwd.style.display="";
    $("#devConfirm").textContent="验证进入";
    $("#devConfirm").onclick=devVerify;
  }
  $("#devBtn").onclick=function(){
    devFb.textContent=""; devPwd.value="";
    devModal.classList.remove("hidden");
    setTimeout(function(){ devPwd.focus(); }, 50);
  };
  $("#devCancel").onclick=closeDev;
  devPwd.addEventListener("keydown", function(e){
    if(e.key==="Enter") $("#devConfirm").click();
  });
  function devVerify(){
    if(devPwd.value===DEV_PASS){
      if(currentLevel===0){
        // 第一关：密码正确 → 直接进入第二关
        closeDev(); ended=false; modal.classList.add("hidden");
        currentLevel=1; lives=CONFIG.LIVES; runStartedAt=Date.now();
        clearInterval(timerId); timerId=setInterval(renderTime,1000);
        beginLevel(); renderTime(); playClearSound();
      }else{
        // 第二关：密码正确 → 直接通关，走正常通关流程（弹奖状）
        closeDev();
        finishRun();
      }
    }else{
      devFb.textContent="口令错误，你不是管理员吧:D";
      devFb.style.color="";
      devPwd.select();
    }
  }
  $("#devConfirm").onclick=devVerify;
  startRun();
}catch(err){
  var msg = (err && err.message) ? err.message : String(err);
  var stack = (err && err.stack) ? ("\n\n调用栈:\n"+err.stack) : "";
  showFatalError("脚本运行错误", msg+stack);
}
