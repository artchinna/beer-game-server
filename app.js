(function(){
  var ROLE_META = {
    customer:   {label:'Customer (ลูกค้า)',            color:'var(--customer)'},
    retailer:   {label:'Retailer (ร้านค้าปลีก)',        color:'var(--retailer)'},
    wholesaler: {label:'Wholesaler (ร้านค้าส่ง)',        color:'var(--wholesaler)'},
    distributor:{label:'Distributor (ผู้จัดจำหน่าย)',    color:'var(--distributor)'},
    factory:    {label:'Factory (โรงงาน)',              color:'var(--factory)'}
  };
  var ROLE_ORDER = ['retailer','wholesaler','distributor','factory'];
  var ALL_ROLES = ['customer','retailer','wholesaler','distributor','factory'];

  function esc(s){ var d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
  function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function randomTeamCode(){
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var code = '';
    for(var i=0;i<4;i++){ code += chars[Math.floor(Math.random()*chars.length)]; }
    return code;
  }
  function copyText(text){
    if(navigator.clipboard && navigator.clipboard.writeText){ return navigator.clipboard.writeText(text); }
    return new Promise(function(resolve,reject){
      try{
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('copy failed'));
      }catch(e){ reject(e); }
    });
  }
  function attachCopyButtons(container){
    var btns = container.querySelectorAll('.copybtn[data-url]');
    btns.forEach(function(b){
      b.addEventListener('click', function(){
        var url = b.getAttribute('data-url');
        copyText(url).then(function(){
          var orig = b.textContent;
          b.textContent = '✓ คัดลอกแล้ว'; b.classList.add('copied');
          setTimeout(function(){ b.textContent = orig || 'คัดลอกลิงก์'; b.classList.remove('copied'); }, 1500);
        }).catch(function(){
          b.textContent = 'คัดลอกไม่สำเร็จ';
          setTimeout(function(){ b.textContent = 'คัดลอกลิงก์'; }, 1500);
        });
      });
    });
  }

  var app = document.getElementById('app');

  function baseUrl(){ return location.origin + location.pathname; }
  function linkFor(r, tm){ return baseUrl() + '#role=' + r + (tm ? '&team=' + encodeURIComponent(tm) : ''); }
  function parseHash(){
    var p = new URLSearchParams(location.hash.replace(/^#/,''));
    return { role: p.get('role'), team: (p.get('team')||'').trim().toUpperCase() };
  }

  var ws = null, currentRole = null, currentTeam = null, latestPayload = null;

  function wsUrl(){
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host;
  }

  function connect(role, team){
    currentRole = role; currentTeam = team; latestPayload = null;
    if(ws){ try{ ws.onclose = null; ws.close(); }catch(e){} }
    ws = new WebSocket(wsUrl());
    ws.addEventListener('open', function(){
      send({type:'join', role:role, team:team});
    });
    ws.addEventListener('message', function(ev){
      var msg;
      try{ msg = JSON.parse(ev.data); }catch(e){ return; }
      if(msg.type === 'state'){ latestPayload = msg.payload; render(); }
      else if(msg.type === 'error'){ app.innerHTML = '<div class="card status err">'+esc(msg.message)+'</div>'; }
    });
    ws.addEventListener('close', function(){
      setTimeout(function(){
        if(currentRole===role && currentTeam===team){ connect(role, team); }
      }, 1500);
    });
    ws.addEventListener('error', function(){});
  }

  function send(obj){ if(ws && ws.readyState === WebSocket.OPEN){ ws.send(JSON.stringify(obj)); } }

  function renderLanding(){
    var html = '<h1>🍺 Beer Game Multiplayer</h1>';
    html += '<div class="sub">เล่นได้ฟรี ไม่ต้องล็อกอิน รองรับหลายทีมพร้อมกัน แต่ละทีมมีรหัสของตัวเอง</div>';
    html += '<div class="card"><h3>เริ่มต้นที่นี่</h3>';
    html += '<div class="sub">ถ้าคุณเป็น Game Master ให้กดปุ่มด้านล่างเพื่อสร้าง/เข้าทีม แล้วแจกลิงก์ผู้เล่นให้ทีมของคุณ</div>';
    html += '<button id="masterBtn">🎛 ฉันคือ Game Master</button>';
    html += '<div class="status" style="margin-top:12px">ถ้าคุณเป็นผู้เล่น ให้รอรับลิงก์เฉพาะทีม (มีรหัสทีมต่อท้าย) จาก Game Master ของทีมคุณ</div>';
    html += '</div>';
    app.innerHTML = html;
    document.getElementById('masterBtn').addEventListener('click', function(){ location.hash = 'role=master'; });
  }

  function renderTeamEntry(){
    var suggested = randomTeamCode();
    var html = '<h1>🎛 Beer Game — Game Master</h1>';
    html += '<div class="sub">สร้างทีมใหม่ หรือกลับเข้าทีมเดิมด้วยรหัสทีม</div>';
    html += '<div class="card"><h3>รหัสทีม</h3>';
    html += '<input type="text" id="teamInput" maxlength="12" value="'+suggested+'" style="text-transform:uppercase;font-size:20px;font-weight:700;letter-spacing:2px;text-align:center">';
    html += '<div class="status">พิมพ์รหัสทีมเดิมถ้าจะกลับเข้าเกมที่เริ่มไว้แล้ว หรือใช้รหัสที่สุ่มให้ก็ได้สำหรับทีมใหม่</div>';
    html += '<div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">';
    html += '<button id="goBtn">เข้าสู่ทีมนี้</button>';
    html += '<button class="secondary" id="rerollBtn">สุ่มรหัสใหม่</button>';
    html += '</div></div>';
    app.innerHTML = html;
    document.getElementById('rerollBtn').addEventListener('click', function(){
      document.getElementById('teamInput').value = randomTeamCode();
    });
    document.getElementById('goBtn').addEventListener('click', function(){
      var code = document.getElementById('teamInput').value.trim().toUpperCase();
      if(!code) return;
      location.hash = 'role=master&team=' + encodeURIComponent(code);
    });
  }

  function boot(){
    var h = parseHash();
    var role = h.role, team = h.team;
    if(!role || (role!=='master' && !ROLE_META[role])){ renderLanding(); return; }
    if(role!=='master' && !team){
      app.innerHTML = '<h1>🍺 Beer Game</h1><div class="card">ลิงก์นี้ยังไม่มีรหัสทีม กรุณาขอลิงก์เต็มจาก Game Master ของทีมคุณ</div>';
      return;
    }
    if(role==='master' && !team){ renderTeamEntry(); return; }
    document.title = 'Beer Game — ' + (role==='master' ? 'Master' : ROLE_META[role].label) + ' [' + team + ']';
    app.innerHTML = '<div class="card">กำลังเชื่อมต่อ...</div>';
    connect(role, team);
  }

  function render(){
    if(!latestPayload) return;
    if(currentRole === 'master'){ renderMaster(latestPayload); }
    else { renderRole(latestPayload); }
  }

  // ---------- station / customer role view ----------
  function renderRole(payload){
    var role = currentRole, team = currentTeam;
    var isCustomer = role === 'customer';
    var meta = payload.meta, mine = payload.mine;
    var meLabel = ROLE_META[role].label, color = ROLE_META[role].color;

    var html = '<h1>🍺 Beer Game</h1>';
    html += '<div class="teamtag">ทีม: '+esc(team)+'</div>';
    html += '<div class="sub">คุณคือ <b>'+esc(meLabel)+'</b> — เห็นแค่ข้อมูลของตัวเองเท่านั้น</div>';

    if(!meta.started){
      html += '<div class="card">รอ Game Master ของทีมนี้กด "เริ่มเกมใหม่" ก่อน</div>';
      app.innerHTML = html;
      return;
    }

    html += '<div class="card" style="border-top-color:'+color+'">';
    html += '<div class="row"><span class="lbl">รอบ</span><span class="val">'+meta.round+' / '+meta.maxRounds+'</span></div>';

    if(isCustomer){
      var nextRound = meta.round + 1;
      var suggested = mine.suggestedDemand;
      html += '<h3 style="margin-top:14px">ป้อนดีมานด์ลูกค้ารอบที่ '+nextRound+'</h3>';
      if(meta.gameOver){
        html += '<div class="status">เกมจบแล้ว</div>';
      } else if(mine.submitted){
        html += '<div class="status ok">✓ ส่งดีมานด์รอบนี้แล้ว ('+mine.pendingDemand+' หน่วย) — รอผู้เล่นคนอื่น</div>';
      } else {
        html += '<label>จำนวนที่ลูกค้าต้องการ (ค่าแนะนำ: '+suggested+')</label>';
        html += '<input type="number" min="0" step="1" id="qtyInput" value="'+suggested+'">';
        html += '<div class="err" id="qtyErr">กรอกจำนวนที่ถูกต้อง (0 ขึ้นไป)</div>';
        html += '<div style="margin-top:10px"><button id="submitBtn">ส่งดีมานด์รอบนี้</button></div>';
      }
      if(mine.history && mine.history.length){
        html += '<h3 style="margin-top:16px">ประวัติดีมานด์ที่คุณส่ง</h3><table class="log"><tr><th>รอบ</th><th>ดีมานด์</th></tr>';
        mine.history.forEach(function(h){ html += '<tr><td>'+h.round+'</td><td>'+h.demand+'</td></tr>'; });
        html += '</table>';
      }
    } else {
      html += '<div class="row"><span class="lbl">คำสั่งซื้อที่ได้รับล่าสุด</span><span class="val">'+mine.lastIncomingOrder+'</span></div>';
      html += '<div class="row"><span class="lbl">สต็อกคงเหลือ</span><span class="val">'+mine.inv+'</span></div>';
      html += '<div class="row"><span class="lbl">ของค้างส่ง (Backlog)</span><span class="val backlog">'+mine.backlog+'</span></div>';
      html += '<div class="row"><span class="lbl">ต้นทุนรอบล่าสุด</span><span class="val">'+mine.lastCost.toFixed(1)+' บาท</span></div>';
      html += '<div class="row"><span class="lbl">ต้นทุนสะสม</span><span class="val">'+mine.totalCost.toFixed(1)+' บาท</span></div>';

      html += '<h3 style="margin-top:14px">สั่งของสำหรับรอบถัดไป</h3>';
      if(meta.gameOver){
        html += '<div class="status">เกมจบแล้ว — ต้นทุนสะสมของคุณ: '+mine.totalCost.toFixed(1)+' บาท</div>';
      } else if(mine.submitted){
        html += '<div class="status ok">✓ ส่งคำสั่งซื้อรอบนี้แล้ว ('+mine.pendingOrder+' หน่วย) — รอผู้เล่นคนอื่น</div>';
      } else {
        html += '<label>'+(role==='factory' ? 'จำนวนที่จะสั่งผลิต' : 'จำนวนที่จะสั่งจากสถานีก่อนหน้า')+'</label>';
        html += '<input type="number" min="0" step="1" id="qtyInput" value="'+mine.lastIncomingOrder+'">';
        html += '<div class="err" id="qtyErr">กรอกจำนวนที่ถูกต้อง (0 ขึ้นไป)</div>';
        html += '<div style="margin-top:10px"><button id="submitBtn">ส่งคำสั่งซื้อรอบนี้</button></div>';
      }
      if(mine.history && mine.history.length){
        html += '<h3 style="margin-top:16px">ประวัติของคุณ</h3><table class="log"><tr><th>รอบ</th><th>ได้รับ</th><th>สั่ง</th><th>สต็อก</th><th>Backlog</th></tr>';
        mine.history.forEach(function(h){ html += '<tr><td>'+h.round+'</td><td>'+h.incomingOrder+'</td><td>'+h.orderPlaced+'</td><td>'+h.inv+'</td><td>'+h.backlog+'</td></tr>'; });
        html += '</table>';
      }
    }
    html += '</div>';
    app.innerHTML = html;

    var btn = document.getElementById('submitBtn');
    if(btn){
      btn.addEventListener('click', function(){
        var inputEl = document.getElementById('qtyInput');
        var v = parseInt(inputEl.value, 10);
        var errEl = document.getElementById('qtyErr');
        if(isNaN(v) || v < 0){ errEl.style.display='block'; return; }
        errEl.style.display = 'none';
        btn.disabled = true;
        send({ type: isCustomer ? 'submitDemand' : 'submitOrder', value: v });
      });
    }
  }

  // ---------- game master view ----------
  function renderMaster(payload){
    var team = currentTeam;
    var meta = payload.meta, customer = payload.customer, stations = payload.stations;

    var html = '<h1>🎛 Beer Game — Game Master</h1>';
    html += '<div class="teamtag">ทีม: '+esc(team)+'</div>';
    html += '<div class="sub">มุมมองรวมสำหรับผู้ดำเนินเกมเท่านั้น — ผู้เล่นแต่ละสถานีเห็นแค่ข้อมูลของตัวเอง · <a href="'+linkFor('master','')+'">สลับ/สร้างทีมอื่น</a></div>';

    html += '<div class="card"><h3>ลิงก์แชร์ให้ผู้เล่นในทีมนี้</h3>';
    html += '<div class="sub">กด "คัดลอกลิงก์" แล้วส่งให้ผู้เล่นทางแชท — อย่าคลิกเปิดลิงก์ตรงๆ ในหน้านี้</div>';
    html += '<div class="linklist">';
    ALL_ROLES.forEach(function(r){
      var url = linkFor(r, team);
      html += '<div class="linkrow"><span class="linklabel">'+ROLE_META[r].label.split(' ')[0]+'</span><span class="linkurl">'+esc(url)+'</span><button class="copybtn" data-url="'+esc(url)+'">คัดลอกลิงก์</button></div>';
    });
    html += '</div></div>';

    html += '<div class="card"><div class="row"><span class="lbl">รอบ</span><span class="val">'+(meta.started?meta.round:0)+' / '+meta.maxRounds+'</span></div>';
    if(meta.started && meta.gameOver){ html += '<div class="status ok">เกมจบแล้ว</div>'; }
    html += '<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">';
    if(!meta.started){
      html += '<label style="min-width:120px">จำนวนรอบ</label><input type="number" id="maxRoundsInput" min="1" step="1" value="'+meta.maxRounds+'" style="max-width:100px">';
    }
    html += '<button id="resetBtn">'+(meta.started?'เริ่มเกมใหม่':'เริ่มเกม')+'</button>';
    var canProcess = customer.submitted && ROLE_ORDER.every(function(r){ return stations[r].submitted; });
    if(meta.started && !meta.gameOver){
      html += '<button id="processBtn" '+(canProcess?'':'disabled')+'>ประมวลผลรอบที่ '+(meta.round+1)+'</button>';
    }
    html += '</div>';
    if(meta.started && !meta.gameOver && !canProcess){
      var waiting = [];
      if(!customer.submitted) waiting.push('Customer');
      ROLE_ORDER.forEach(function(r){ if(!stations[r].submitted) waiting.push(ROLE_META[r].label.split(' ')[0]); });
      html += '<div class="status">รอ: '+waiting.join(', ')+'</div>';
    }
    html += '</div>';

    if(meta.started){
      html += '<div class="grid">';
      html += '<div class="minicard" style="--stcolor:'+ROLE_META.customer.color+'"><h4>Customer</h4>';
      html += '<div class="row"><span>สถานะ</span><span class="badge '+(customer.submitted?'yes':'')+'">'+(customer.submitted?'ส่งแล้ว':'ยังไม่ส่ง')+'</span></div></div>';
      ROLE_ORDER.forEach(function(r){
        var s = stations[r];
        html += '<div class="minicard" style="--stcolor:'+ROLE_META[r].color+'"><h4>'+ROLE_META[r].label.split(' ')[0]+'</h4>';
        html += '<div class="row"><span>สต็อก</span><span>'+s.inv+'</span></div>';
        html += '<div class="row"><span>Backlog</span><span>'+s.backlog+'</span></div>';
        html += '<div class="row"><span>ต้นทุนสะสม</span><span>'+s.totalCost.toFixed(1)+'</span></div>';
        html += '<div class="row"><span>สถานะรอบนี้</span><span class="badge '+(s.submitted?'yes':'')+'">'+(s.submitted?'ส่งแล้ว':'ยังไม่ส่ง')+'</span></div></div>';
      });
      html += '</div>';
      html += '<div class="card"><h3>คำสั่งซื้อในแต่ละรอบ (Bullwhip Effect)</h3><div class="legend" id="legend"></div><canvas id="chart" height="220"></canvas></div>';
    }

    app.innerHTML = html;
    attachCopyButtons(app);

    var rb = document.getElementById('resetBtn');
    if(rb) rb.addEventListener('click', function(){
      rb.disabled = true;
      var mrInput = document.getElementById('maxRoundsInput');
      var mr = mrInput ? parseInt(mrInput.value,10) : undefined;
      send({type:'resetGame', maxRounds: mr});
      setTimeout(function(){ rb.disabled = false; }, 800);
    });
    var pb = document.getElementById('processBtn');
    if(pb) pb.addEventListener('click', function(){ pb.disabled = true; send({type:'processRound'}); });

    if(meta.started){ buildLegend(); drawChart(meta, stations); }
  }

  function buildLegend(){
    var legend = document.getElementById('legend');
    if(!legend) return;
    var items = ROLE_ORDER.map(function(r){
      return '<span><span class="dot" style="background:'+cssVar('--'+r)+'"></span>'+ROLE_META[r].label.split(' ')[0]+'</span>';
    });
    items.push('<span><span class="dot" style="background:#999999"></span>ดีมานด์ลูกค้าจริง</span>');
    legend.innerHTML = items.join('');
  }

  function drawChart(meta, stations){
    var canvas = document.getElementById('chart');
    if(!canvas) return;
    var ratio = window.devicePixelRatio || 1;
    var cssWidth = canvas.parentElement.clientWidth;
    var cssHeight = 220;
    canvas.width = cssWidth*ratio; canvas.height = cssHeight*ratio; canvas.style.height = cssHeight+'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.clearRect(0,0,cssWidth,cssHeight);

    var round = meta.round || 0;
    if(round === 0){
      ctx.fillStyle = cssVar('--text-muted'); ctx.font='13px sans-serif';
      ctx.fillText('กราฟจะแสดงหลังเริ่มเล่น', 10, cssHeight/2);
      return;
    }
    var padL=34, padR=10, padT=10, padB=24;
    var chartW = cssWidth-padL-padR, chartH = cssHeight-padT-padB;
    var maxVal = 8;
    ROLE_ORDER.forEach(function(r){ stations[r].history.forEach(function(h){ if(h.orderPlaced>maxVal) maxVal=h.orderPlaced; }); });
    maxVal = Math.ceil(maxVal*1.15);

    ctx.strokeStyle = cssVar('--border'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+chartH); ctx.lineTo(padL+chartW,padT+chartH); ctx.stroke();

    ctx.fillStyle = cssVar('--text-muted'); ctx.font='10px sans-serif';
    for(var s=0;s<=4;s++){
      var val = Math.round(maxVal*s/4);
      var y = padT+chartH-(chartH*s/4);
      ctx.fillText(String(val), 2, y+3);
      ctx.strokeStyle = cssVar('--border'); ctx.globalAlpha=0.4;
      ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function xPos(r){ return padL + (round<=1?0:chartW*(r-1)/(round-1)); }
    function yPos(v){ return padT+chartH-(chartH*v/maxVal); }

    ctx.strokeStyle = '#999999'; ctx.setLineDash([4,3]); ctx.lineWidth=1.5;
    ctx.beginPath();
    var retHist = stations.retailer.history;
    for(var r=1;r<=round;r++){
      var rec = retHist[r-1];
      var v = rec ? rec.incomingOrder : 0;
      var x=xPos(r), y=yPos(v);
      if(r===1) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke(); ctx.setLineDash([]);

    ROLE_ORDER.forEach(function(rkey){
      ctx.strokeStyle = cssVar('--'+rkey); ctx.lineWidth=2;
      ctx.beginPath();
      var hist = stations[rkey].history;
      for(var r=1;r<=round;r++){
        var rec = hist[r-1];
        if(!rec) continue;
        var x=xPos(r), y=yPos(rec.orderPlaced);
        if(r===1) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    });

    ctx.fillStyle = cssVar('--text-muted'); ctx.font='10px sans-serif';
    ctx.fillText('1', xPos(1)-2, cssHeight-6);
    if(round>2) ctx.fillText(String(round), xPos(round)-8, cssHeight-6);
  }

  window.addEventListener('resize', function(){ if(latestPayload && currentRole==='master') renderMaster(latestPayload); });
  window.addEventListener('hashchange', boot);
  boot();
})();
