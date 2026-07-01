(function(){
  const root = document.getElementById('app');
  const LS = {
    get(k, fallback){ try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; } },
    set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  };

  let CARDS = [], QUIZ = [], FULLCHAP = {};
  let state = {
    screen: 'home',
    lang: LS.get('avartan:lang', 'en'),
    theme: LS.get('avartan:theme', 'light'),
    readTopics: LS.get('avartan:read', []),
    quizHistory: LS.get('avartan:quizhist', {}),
    currentTopic: null,
    fullChapOpen: false,
    quizSection: null,
    quizQueue: [],
    quizIdx: 0,
    quizAnswers: [],
    _picked: null,
    loadError: null
  };

  function applyTheme(){
    document.documentElement.setAttribute('data-theme', state.theme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if(metaTheme) metaTheme.setAttribute('content', state.theme === 'dark' ? '#1A1512' : '#F6F3EC');
  }
  function toggleTheme(){
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    LS.set('avartan:theme', state.theme);
    applyTheme();
    render();
  }

  // file:// has no http origin, so fetch() on local JSON is blocked by the browser
  // and throws instead of silently returning bad data — caught explicitly below
  // so the person sees a real message instead of a blank screen.
  async function loadData(){
    try{
      const [c, q, fc] = await Promise.all([
        fetch('cards-data.json').then(r=>{ if(!r.ok) throw new Error('cards-data.json: '+r.status); return r.json(); }),
        fetch('quiz-data.json').then(r=>{ if(!r.ok) throw new Error('quiz-data.json: '+r.status); return r.json(); }),
        fetch('fullchap-data.json').then(r=>{ if(!r.ok) throw new Error('fullchap-data.json: '+r.status); return r.json(); })
      ]);
      CARDS = c; QUIZ = q; FULLCHAP = fc;
      render();
    } catch(err){
      state.loadError = (window.location.protocol === 'file:')
        ? "Avartan needs to run from a web server, not opened directly as a file — fetch() for the data files is blocked on file://. See README.md for the 5-minute GitHub Pages setup, or run a local server (e.g. `python3 -m http.server`) in this folder and open it via http://localhost."
        : ("Couldn't load app data (" + (err && err.message ? err.message : 'unknown error') + "). Try reloading — if it keeps failing, check your connection or reinstall the app.");
      renderError();
    }
  }

  function renderError(){
    root.innerHTML = `<header class="top"><div class="name deva">आवर्तन</div></header>
    <div class="screen active">
      <div class="box amber">
        <div class="box-label">⚠ लोड नहीं हुआ · Couldn't load</div>
        <div class="box-body">${state.loadError}</div>
      </div>
    </div>`;
  }

  function sections(){
    const seen = [];
    QUIZ.forEach(q => { if(!seen.includes(q.section)) seen.push(q.section); });
    return seen;
  }
  function questionsFor(sec){
    if(sec === '__mixed__'){
      const all = QUIZ.slice();
      const rnd = mulberry32(Date.now() % 100000);
      for(let i=all.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [all[i],all[j]]=[all[j],all[i]]; }
      return all.slice(0,12);
    }
    return QUIZ.filter(q => q.section === sec);
  }
  function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

  function themeToggleBtn(){
    const isDark = state.theme === 'dark';
    return `<button class="theme-toggle" data-action="toggle-theme" aria-label="Toggle theme">${isDark ? '☀️' : '🌙'}</button>`;
  }

  function setLang(l){ state.lang = l; LS.set('avartan:lang', l); render(); }
  function markRead(num){ if(!state.readTopics.includes(num)){ state.readTopics.push(num); LS.set('avartan:read', state.readTopics); } }

  function ring(total, answers){
    const r=42, cx=50, cy=50, size=100;
    let ticks='';
    for(let i=0;i<total;i++){
      const ang=(i/total)*2*Math.PI-Math.PI/2;
      const x1=cx+r*Math.cos(ang), y1=cy+r*Math.sin(ang);
      const x2=cx+(r-9)*Math.cos(ang), y2=cy+(r-9)*Math.sin(ang);
      let col='var(--line)';
      if(answers[i]===true) col='var(--green)';
      if(answers[i]===false) col='var(--bad)';
      ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    }
    const answered = answers.filter(a=>a!==null).length;
    return `<svg width="118" height="118" viewBox="0 0 ${size} ${size}">
      <text x="50" y="14" text-anchor="middle" font-size="9" fill="var(--copper-light)" font-weight="700">✕</text>
      ${ticks}
      <text x="50" y="55" text-anchor="middle" font-size="15" fill="var(--text)" font-weight="700">${answered}/${total}</text>
    </svg>`;
  }

  // ---------- screens ----------
  function renderHome(){
    const histKeys = Object.keys(state.quizHistory);
    let lastLine = 'No quiz attempts yet';
    if(histKeys.length){
      const all = [].concat(...histKeys.map(k=>state.quizHistory[k]));
      const last = all[all.length-1];
      if(last) lastLine = `Last quiz: ${last.score}/${last.total} (${last.sectionLabel||''})`;
    }
    return `
    <header class="top">
      ${themeToggleBtn()}
      <div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div>
      <div class="sub">Avartan · Visharad Purna Theory</div>
      <div class="rule"></div>
    </header>
    <div class="screen active">
      <div class="card home-card" data-go="read-list">
        <div class="label"><span class="deva">पढ़ें</span><span class="en">Read · 17 topics</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-go="quiz-list">
        <div class="label"><span class="deva">अभ्यास</span><span class="en">Quiz · ${QUIZ.length} questions</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="stat-line">${state.readTopics.length}/${CARDS.length} topics read</div>
      <div class="stat-line">${lastLine}</div>
    </div>`;
  }

  function renderReadList(){
    const rows = CARDS.map(c => `
      <div class="card topic-row" data-go="read-topic" data-num="${c.num}">
        <div>
          <div class="num">VP-${String(c.num).padStart(2,'0')}</div>
          <div class="ti">${state.lang==='deva' ? c.titleDeva : c.titleEn}</div>
          ${state.readTopics.includes(c.num) ? '<div class="done">✓ Read</div>' : ''}
        </div>
        <div class="arrow">→</div>
      </div>`).join('');
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div></header>
    <div class="screen active">
      <h2 class="scr-title">Topics · 17</h2>
      ${rows}
    </div>`;
  }

  function renderReadTopic(){
    const c = CARDS.find(x => x.num === state.currentTopic);
    if(!c) return '<div class="screen active">Not found.</div>';
    const en = state.lang === 'en';
    const factsRows = c.facts.map(f => `
      <div class="fact-row">
        <div class="fact-q">${f.fact}</div>
        <div><div class="fact-a">${f.value}</div><span class="fact-session">${f.session}</span></div>
      </div>`).join('');
    let fullchapHtml = '';
    const fcEntry = FULLCHAP[String(c.num)];
    if(fcEntry){
      fullchapHtml = `<div class="fullchap-link" data-action="toggle-fullchap">${state.fullChapOpen ? '▲ Hide full chapter' : '▼ Read full chapter'}</div>`;
      if(state.fullChapOpen){
        const fcSections = en ? fcEntry.en : fcEntry.deva;
        fullchapHtml += `<div class="fullchap-body ${!en?'deva':''}">${fcSections.map(([t,b]) => `
          <div class="fc-sect"><div class="fc-t ${!en?'deva':''}">${t}</div><div>${b}</div></div>`).join('')}</div>`;
      }
    } else {
      fullchapHtml = `<div class="fullchap-stub">Full chapter text for VP-${String(c.num).padStart(2,'0')} isn't in the app yet — see your physical notes for now.</div>`;
    }
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div></header>
    <div class="screen active">
      <div class="back-link" data-go="read-list">← सूची · All topics</div>
      <div class="lang-toggle">
        <button data-action="lang-en" class="${en?'active':''}">English</button>
        <button data-action="lang-deva" class="${!en?'active':''}">देवनागरी</button>
      </div>
      <div class="topic-head ${!en?'deva':''}">${en ? c.titleEn : c.titleDeva}</div>
      <div class="topic-head-sub">VP-${String(c.num).padStart(2,'0')}</div>

      <div class="box model">
        <div class="box-label">ऐसे लिखें · How to write this</div>
        <div class="box-body ${!en?'deva':''}">${en ? c.summaryEn : c.skeletonDeva}</div>
      </div>

      ${c.ember ? `<div class="box amber"><div class="box-label">⚑ खुला बिंदु · Open item</div><div class="box-body deva">${c.ember}</div></div>` : ''}

      <div class="facts-label">तथ्य · Facts asked in papers</div>
      ${factsRows}

      <div style="margin-top:16px;">${fullchapHtml}</div>
    </div>`;
  }

  function renderQuizList(){
    const secs = sections();
    const rows = secs.map(s => {
      const count = questionsFor(s).length;
      const hist = state.quizHistory[s];
      const last = hist && hist.length ? hist[hist.length-1] : null;
      return `<div class="card quiz-pick-row" data-action="pick-section" data-section="${encodeURIComponent(s)}">
        <div><div class="ti deva">${s}</div><div class="ct">${count} questions${last ? ` · last ${last.score}/${last.total}` : ''}</div></div>
        <div class="go">→</div>
      </div>`;
    }).join('');
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div></header>
    <div class="screen active">
      <h2 class="scr-title">Quiz · pick a section</h2>
      <div class="card quiz-pick-row" data-action="pick-section" data-section="__mixed__">
        <div><div class="ti">🔀 Mixed — 12 random</div><div class="ct">across all sections</div></div>
        <div class="go">→</div>
      </div>
      ${rows}
    </div>`;
  }

  function renderQuizActive(){
    const i = state.quizIdx, q = state.quizQueue[i], ans = state.quizAnswers;
    const answeredThis = ans[i] !== null;
    let optsHtml = '';
    if(q.type === 'mcq'){
      optsHtml = q.opts.map((o,oi) => {
        let cls='opt';
        if(answeredThis){
          if(oi===q.answerIdx) cls+=' correct';
          else if(oi===state._picked) cls+=' incorrect';
        }
        return `<button class="${cls} deva" ${answeredThis?'disabled':''} data-pick="${oi}">${o}</button>`;
      }).join('');
    } else {
      [[true,'सही · True'],[false,'गलत · False']].forEach(([v,label]) => {
        let cls='opt';
        if(answeredThis){
          if(v===q.answer) cls+=' correct';
          else if(v===state._picked) cls+=' incorrect';
        }
        optsHtml += `<button class="${cls}" ${answeredThis?'disabled':''} data-pick="${v}">${label}</button>`;
      });
    }
    let feedback = '';
    if(answeredThis){
      const correctText = q.type==='mcq' ? q.opts[q.answerIdx] : (q.answer ? 'सही' : 'गलत') + (q.answerNote && q.answerNote.length>4 ? ` — ${q.answerNote.replace(/^सही\s*|^गलत\s*/,'')}` : '');
      feedback = `<div class="feedback deva">सही उत्तर: <b>${correctText}</b><span class="sess">सत्र: ${q.session}</span></div>
        <div style="text-align:center;">${i < state.quizQueue.length-1 ? `<button class="btn" data-action="next-q">Next</button>` : `<button class="btn" data-action="finish-quiz">See result</button>`}</div>`;
    }
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div></header>
    <div class="screen active">
      <div class="ring-wrap">${ring(state.quizQueue.length, ans)}</div>
      <div class="q-num">Question ${i+1} of ${state.quizQueue.length}</div>
      <div class="q-session">${q.section}</div>
      <div class="q-text deva">${q.q}</div>
      <div>${optsHtml}</div>
      ${feedback}
    </div>`;
  }

  function renderQuizResult(){
    const score = state.quizAnswers.filter(a=>a===true).length;
    const total = state.quizQueue.length;
    const note = score===total ? 'Full avartan — clean cycle.' : score>=total*0.7 ? 'Solid. Revisit the misses below.' : 'Worth a re-read before the next attempt.';
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-go="home" style="cursor:pointer;">आवर्तन</div></header>
    <div class="screen active">
      <h2 class="scr-title">परिणाम · Result</h2>
      <div class="ring-wrap">${ring(total, state.quizAnswers)}</div>
      <div class="result-score">${score}/${total}</div>
      <div class="result-note">${note}</div>
      <div class="result-actions">
        <button class="btn" data-action="restart-section">Try again</button>
        <button class="btn ghost" data-go="quiz-list">Other sections</button>
      </div>
    </div>`;
  }

  function render(){
    let html = '';
    if(state.screen === 'home') html = renderHome();
    else if(state.screen === 'read-list') html = renderReadList();
    else if(state.screen === 'read-topic') html = renderReadTopic();
    else if(state.screen === 'quiz-list') html = renderQuizList();
    else if(state.screen === 'quiz-active') html = renderQuizActive();
    else if(state.screen === 'quiz-result') html = renderQuizResult();

    const tab = state.screen.startsWith('read') ? 'read' : state.screen.startsWith('quiz') ? 'quiz' : 'home';
    html += `<nav class="tabs">
      <button data-go="home" class="${tab==='home'?'active':''}"><span class="deva">होम</span><span class="en">Home</span></button>
      <button data-go="read-list" class="${tab==='read'?'active':''}"><span class="deva">पढ़ें</span><span class="en">Read</span></button>
      <button data-go="quiz-list" class="${tab==='quiz'?'active':''}"><span class="deva">अभ्यास</span><span class="en">Quiz</span></button>
    </nav>`;
    root.innerHTML = html;
    bind();
  }

  function bind(){
    root.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => {
      const go = el.getAttribute('data-go');
      if(go === 'read-topic'){
        state.currentTopic = parseInt(el.getAttribute('data-num'));
        state.fullChapOpen = false;
        state.screen = 'read-topic';
        markRead(state.currentTopic);
      } else { state.screen = go; }
      render();
    }));
    root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const act = el.getAttribute('data-action');
      if(act === 'lang-en') setLang('en');
      else if(act === 'lang-deva') setLang('deva');
      else if(act === 'toggle-theme') toggleTheme();
      else if(act === 'toggle-fullchap'){ state.fullChapOpen = !state.fullChapOpen; render(); }
      else if(act === 'pick-section'){
        const sec = decodeURIComponent(el.getAttribute('data-section'));
        startSection(sec);
      }
      else if(act === 'next-q'){ state.quizIdx++; state._picked=null; render(); }
      else if(act === 'finish-quiz'){ finishQuiz(); render(); }
      else if(act === 'restart-section'){ startSection(state.quizSection); }
    }));
    root.querySelectorAll('[data-pick]').forEach(el => el.addEventListener('click', () => {
      const raw = el.getAttribute('data-pick');
      const q = state.quizQueue[state.quizIdx];
      const picked = q.type==='mcq' ? parseInt(raw) : raw==='true';
      state._picked = picked;
      const correct = q.type==='mcq' ? picked===q.answerIdx : picked===q.answer;
      state.quizAnswers[state.quizIdx] = correct;
      render();
    }));
  }

  function startSection(sec){
    state.quizSection = sec;
    state.quizQueue = questionsFor(sec);
    state.quizIdx = 0;
    state.quizAnswers = new Array(state.quizQueue.length).fill(null);
    state._picked = null;
    state.screen = 'quiz-active';
    render();
  }
  function finishQuiz(){
    const score = state.quizAnswers.filter(a=>a===true).length;
    const total = state.quizQueue.length;
    const label = state.quizSection === '__mixed__' ? 'Mixed' : state.quizSection;
    if(!state.quizHistory[state.quizSection]) state.quizHistory[state.quizSection] = [];
    state.quizHistory[state.quizSection].push({score, total, sectionLabel:label, date:new Date().toISOString()});
    LS.set('avartan:quizhist', state.quizHistory);
    state.screen = 'quiz-result';
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
  }
  applyTheme();
  loadData();
})();
