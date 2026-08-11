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
  // ===== 第二关·只换typeIds(头像种类)，布局全不动 =====
  // 规则1: 12种×15张=180(3的倍数)
  // 规则2: 每组三连分属浅/中/深三档(按layer排序三等分，每档60张，每类型每档5张)
  // 规则3: 初始裸露位每类型≤3张(27裸露位>12类型，max1数学不可能→放宽至max3)
  // 规则4: 同款禁止同层左右相邻/上下紧贴(8邻域禁同，仅同层非多米诺)
  // 规则5: 顶层可视互不重复(由规则3保证≤3张/类型，最优分布9类型×2+3类型×3=27)
  // 算法: 两阶段构造 — Phase1分配27裸露位(max3+邻域)，Phase2填充153非裸露位(配额5+邻域)
  var typeIds;
  if(level.types>=12 && total>100){
    var T=level.types, C=level.copies;
    // ===== 基础元信息 =====
    var posMeta=[], layerPositions, pm, gid, i, j, tt;
    for(i=0; i<positions.length; i++){
      layerPositions=positions[i];
      for(j=0; j<layerPositions.length; j++){
        pm = layerPositions[j];
        posMeta.push({layer:i, stack:pm.stack||0, x:pm.x, y:pm.y, domino:!!pm.domino});
      }
    }
    var POS_NUM = posMeta.length;
    var CS = CONFIG.CARD_SIZE, BP = CONFIG.BOARD_PAD + CONFIG.BOARD_BORDER;
    var STEP = CONFIG.STEP;
    // 网格行列(3×3邻格)
    var col=new Array(POS_NUM), row=new Array(POS_NUM);
    for(gid=0; gid<POS_NUM; gid++){
      if(posMeta[gid].domino){ col[gid]=-1; row[gid]=-1; continue; }
      col[gid]=Math.round((posMeta[gid].x-BP)/STEP);
      row[gid]=Math.round((posMeta[gid].y-BP)/STEP);
    }
    // ===== 三档深度池(规则2): 按layer排序三等分，每档60张 =====
    var sortedGids=[];
    for(gid=0; gid<POS_NUM; gid++) sortedGids.push(gid);
    sortedGids.sort(function(a,b){
      var la=posMeta[a].layer, lb=posMeta[b].layer;
      if(la!==lb) return la-lb;
      return (posMeta[a].stack||0)-(posMeta[b].stack||0);
    });
    var THIRD=Math.floor(POS_NUM/3);
    var DEEP=[], MID=[], SHALLOW=[];
    for(var sd=0; sd<THIRD; sd++) DEEP.push(sortedGids[sd]);
    for(sd=THIRD; sd<2*THIRD; sd++) MID.push(sortedGids[sd]);
    for(sd=2*THIRD; sd<POS_NUM; sd++) SHALLOW.push(sortedGids[sd]);
    var tierOf=new Array(POS_NUM);
    for(sd=0; sd<DEEP.length; sd++) tierOf[DEEP[sd]]='d';
    for(sd=0; sd<MID.length; sd++) tierOf[MID[sd]]='m';
    for(sd=0; sd<SHALLOW.length; sd++) tierOf[SHALLOW[sd]]='s';
    // 初始裸露(同isBlocked逻辑)
    var exposed = (function(){
      var res=new Array(POS_NUM);
      for(var s=0; s<POS_NUM; s++) res[s]=false;
      for(s=0; s<POS_NUM; s++){
        var me=posMeta[s];
        var r1={left:me.x, top:me.y, right:me.x+CS, bottom:me.y+CS};
        var blocked=false;
        for(var k=0; k<POS_NUM; k++){
          if(k===s) continue;
          var o=posMeta[k];
          var hi = o.layer>me.layer || (o.layer===me.layer && o.stack>me.stack);
          if(!hi) continue;
          var r2={left:o.x, top:o.y, right:o.x+CS, bottom:o.y+CS};
          var lx=Math.max(r1.left,r2.left), rx=Math.min(r1.right,r2.right);
          var ty=Math.max(r1.top,r2.top),  by=Math.min(r1.bottom,r2.bottom);
          if(rx>lx && by>ty){ blocked=true; break; }
        }
        if(!blocked) res[s]=true;
      }
      return res;
    })();

    // 辅助：判断两位置是否8邻域相邻(仅同层非多米诺)
    function isNeighbor(a,b){
      if(posMeta[a].domino || posMeta[b].domino) return false;
      if(posMeta[a].layer!==posMeta[b].layer) return false;
      return (Math.abs(col[a]-col[b])<=1 && Math.abs(row[a]-row[b])<=1);
    }
    // 预计算每个位置的8邻域(加速邻域检查)
    var nbrs=new Array(POS_NUM);
    for(gid=0; gid<POS_NUM; gid++){
      nbrs[gid]=[];
      for(var nb=0; nb<POS_NUM; nb++){
        if(gid!==nb && isNeighbor(gid,nb)) nbrs[gid].push(nb);
      }
    }
    // Fisher-Yates shuffle(均匀分布)
    function shuf(arr){
      var a=arr.slice(), n=a.length, si, sj, st;
      for(si=n-1; si>0; si--){ sj=Math.floor(Math.random()*(si+1)); st=a[si]; a[si]=a[sj]; a[sj]=st; }
      return a;
    }

    // 裸露位索引列表
    var expoList=[];
    for(var ei0=0; ei0<POS_NUM; ei0++) if(exposed[ei0]) expoList.push(ei0);

    // ===== 两阶段构造算法 MAX_TRIES=3000 =====
    // Phase 1: 分配27裸露位(max3/类型 + 8邻域检查)
    // Phase 2: 填充153非裸露位(每类型每档5张配额 + 8邻域检查)
    // 校验: ①裸露≤3/类型 ②每类型每档5张 ③同层8邻域无同款
    var MAX_TRIES=3000, generated=false;
    for(var tc=0; tc<MAX_TRIES && !generated; tc++){
      typeIds = new Array(POS_NUM);
      for(i=0; i<POS_NUM; i++) typeIds[i]=-1;
      var typeCnt=new Array(T), typeTierCnt=[];
      for(tt=0; tt<T; tt++){ typeCnt[tt]=0; typeTierCnt.push({d:0,m:0,s:0}); }
      var typeExpo=new Array(T);
      for(tt=0; tt<T; tt++) typeExpo[tt]=0;
      var fail=false;

      // ===== Phase 1: 分配裸露位(max3/类型 + 邻域) =====
      var se=shuf(expoList);
      for(var ei=0; ei<se.length && !fail; ei++){
        var pos=se[ei];
        var cands=[];
        for(tt=0; tt<T; tt++){
          if(typeExpo[tt]>=3) continue;
          var ok=true;
          for(var k2=0; k2<nbrs[pos].length; k2++){
            if(typeIds[nbrs[pos][k2]]===tt){ ok=false; break; }
          }
          if(ok) cands.push(tt);
        }
        if(cands.length===0){ fail=true; break; }
        cands.sort(function(a,b){ return typeExpo[a]-typeExpo[b]; });
        var mv=typeExpo[cands[0]], mc=[];
        for(var ci=0; ci<cands.length; ci++){
          if(typeExpo[cands[ci]]===mv) mc.push(cands[ci]);
        }
        var typ=mc[Math.floor(Math.random()*mc.length)];
        typeIds[pos]=typ; typeCnt[typ]++; typeExpo[typ]++;
        typeTierCnt[typ][tierOf[pos]]++;
      }
      if(fail) continue;

      // ===== Phase 2: 填充非裸露位(每类型每档5张 + 邻域) =====
      var tiers2=[DEEP,MID,SHALLOW], tcs2=['d','m','s'];
      for(var ti=0; ti<3 && !fail; ti++){
        var pool=tiers2[ti], tc3=tcs2[ti], ua=[];
        for(var pi=0; pi<pool.length; pi++){
          if(typeIds[pool[pi]]<0) ua.push(pool[pi]);
        }
        ua=shuf(ua);
        for(var ui=0; ui<ua.length && !fail; ui++){
          var pos2=ua[ui], c2=[];
          for(tt=0; tt<T; tt++){
            if(typeTierCnt[tt][tc3]>=5) continue;
            var ok2=true;
            for(var k3=0; k3<nbrs[pos2].length; k3++){
              if(typeIds[nbrs[pos2][k3]]===tt){ ok2=false; break; }
            }
            if(ok2) c2.push(tt);
          }
          if(c2.length===0){
            for(tt=0; tt<T; tt++){
              if(typeTierCnt[tt][tc3]<5) c2.push(tt);
            }
          }
          if(c2.length===0){ fail=true; break; }
          c2.sort(function(a,b){ return typeTierCnt[b][tc3]-typeTierCnt[a][tc3]; });
          var typ2=c2[0];
          typeIds[pos2]=typ2; typeCnt[typ2]++;
          typeTierCnt[typ2][tc3]++;
        }
      }
      if(fail) continue;

      // 兜底：剩余空位
      for(var ri=0; ri<POS_NUM; ri++){
        if(typeIds[ri]<0){
          var fit=-1;
          for(tt=0; tt<T; tt++){ if(typeCnt[tt]<C){ fit=tt; break; } }
          if(fit<0) fit=Math.floor(Math.random()*T);
          typeIds[ri]=fit; typeCnt[fit]++;
        }
      }

      // ===== 强制校验 =====
      // ① 裸露位每类型≤3
      var eC=new Array(T);
      for(tt=0; tt<T; tt++) eC[tt]=0;
      var chk1=true;
      for(i=0; i<POS_NUM; i++){
        if(exposed[i]){
          eC[typeIds[i]]++;
          if(eC[typeIds[i]]>3){ chk1=false; break; }
        }
      }
      if(!chk1) continue;

      // ② 每类型每档正好5张
      var chk2=true;
      for(tt=0; tt<T; tt++){
        if(typeTierCnt[tt].d!==5 || typeTierCnt[tt].m!==5 || typeTierCnt[tt].s!==5){ chk2=false; break; }
      }
      if(!chk2) continue;

      // ③ 同层8邻域无同款
      var chk3=true;
      for(var a=0; a<POS_NUM && chk3; a++){
        if(posMeta[a].domino) continue;
        for(var k4=0; k4<nbrs[a].length; k4++){
          var b=nbrs[a][k4];
          if(b<=a) continue;
          if(typeIds[a]===typeIds[b]){ chk3=false; break; }
        }
      }
      if(!chk3) continue;

      generated=true;
    }
    if(!generated){
      // 极端兜底
      var deck=[];
      for(var zz=0; zz<T; zz++){ for(var zc=0; zc<C; zc++) deck.push(zz); }
      typeIds = shuf(deck);
    }
  }else{
    // 第一关：简单shuffle
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
  // ===== 关键修复：不能 tray.shift() 直接删牌（会破坏"每种类型数量=3倍数"）=====
  // 正确做法：把卡槽第一张牌 重新放回棋盘的随机空位，视觉上等同于"移除"，
  // 但总数不变，3倍数约束不被破坏。
  var card = tray.shift();
  if(!card){ render(); return; }
  // 收集棋盘上现存未移除卡牌的坐标，作为"合法锚点"集合
  var active = [], i;
  for(i=0; i<cards.length; i++){
    if(!cards[i].removed) active.push(cards[i]);
  }
  if(active.length === 0){
    // 棋盘已经空了（极端情况），那就放回棋盘中间的默认位置
    card.x = Math.round(INNER_W/2 - CONFIG.CARD_SIZE/2);
    card.y = Math.round(INNER_H/2 - CONFIG.CARD_SIZE/2);
  }else{
    // 从现存的合法锚点里随机挑一个，做微小的Q单位偏移（避免完美重叠遮挡出bug）
    var pick = active[Math.floor(Math.random()*active.length)];
    var offsets = [
      {dx:0,           dy:0},
      {dx:CONFIG.Q,    dy:0},
      {dx:-CONFIG.Q,   dy:0},
      {dx:0,           dy:CONFIG.Q},
      {dx:0,           dy:-CONFIG.Q}
    ];
    var off = offsets[Math.floor(Math.random()*offsets.length)];
    // 夹在棋盘内容区范围内
    card.x = Math.max(0, Math.min(INNER_W - CONFIG.CARD_SIZE, pick.x + off.dx));
    card.y = Math.max(0, Math.min(INNER_H - CONFIG.CARD_SIZE, pick.y + off.dy));
    // 层放到最高，保证玩家能看到它（视觉上"消除"后它是新出现的一张）
    card.layer = 9999;
    card.stack = 0;
  }
  // 标记为"回到棋盘"：removed=false, 重新挂载DOM（因为choose里会加out类+removed=true，所以要重置）
  card.removed = false;
  card.el.classList.remove("out");
  card.el.style.left = card.x + "px";
  card.el.style.top = card.y + "px";
  card.el.style.zIndex = card.layer*20 + card.stack + 1;
  tools.clear--;
  playClearSound();
  render();
  checkEnd();
}
function useStash(){
  // 条件：暂存工具可用 && 卡槽有牌 && 暂存区没满（满3张才不让放，不满可以分多次凑）
  if(!tools.stash || !tray.length || stash.length >= CONFIG.STASH_MAX) return;
  tools.stash--;
  var avail = CONFIG.STASH_MAX - stash.length;        // 暂存区还能放几张
  var n = Math.min(avail, tray.length);               // 一次尽可能多塞（但不超过卡槽现存）
  stash = stash.concat(tray.splice(tray.length-n, n));// 塞到暂存区末尾
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
