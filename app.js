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
    confirmExit: false,
    loadError: null
  };

  const MIXED_N = 12;
  // Topic numbers are the R3 cram-sheet numbers (not VP chapter numbers).
  // src = the chapter(s) the topic comes from; secs = the quiz section(s) that cover it.
  // verify.py checks every quiz section is covered and every name here exists in the quiz data.
  const TOPIC_META = {
    1:{src:'VP-02', secs:['लय व लयकारी (गिनती)']},
    2:{src:'VP-03', secs:['रचना के प्रकार (पेशकार/कायदा/रेला/गत/चक्रदार)']},
    3:{src:'VP-02 + VP-04', secs:['लिपि · ग्रंथ · व्यक्ति-परिचय']},
    4:{src:'VP-05', secs:['दशप्राण · ग्रह · यति · क्रिया · जाति']},
    5:{src:'VP-05', secs:['दशप्राण · ग्रह · यति · क्रिया · जाति']},
    6:{src:'VP-06', secs:['कर्नाटक ताल-पद्धति']},
    7:{src:'VP-07', secs:['वाद्य (वर्गीकरण व पहचान)']},
    10:{src:'VP-08', secs:['ताल वर्गीकरण · मूल अंग · परिचय · तुलना']},
    11:{src:'VP-06 (taal list)', secs:['ताल वर्गीकरण · मूल अंग · परिचय · तुलना']},
    13:{src:'VP-09', secs:['तबले के छह घराने']},
    14:{src:'VP-10', secs:['पखावज के घराने']},
    15:{src:'VP-11', secs:['कलाकारों का जीवन-परिचय']},
    16:{src:'VP-12', secs:['घराना व बाज का मतलब']},
    17:{src:'VP-12', secs:['इतिहास व उत्पत्ति']},
    18:{src:'VP-13', secs:['संगति व गायन की शैलियाँ']},
    19:{src:'VP-14', secs:['ताल-निर्माण के नियम · सोलो · पढ़ंत · रियाज़']},
    20:{src:'VP-14 + VP-15', secs:['ताल-निर्माण के नियम · सोलो · पढ़ंत · रियाज़']}
  };
  let loaded = false;

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
      loaded = true;
      route();
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
      return all.slice(0,MIXED_N);
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
      all.sort((a,b) => String(a.date||'').localeCompare(String(b.date||'')));   // most recent attempt, not last section
      const last = all[all.length-1];
      if(last) lastLine = `Last quiz: ${last.score}/${last.total} (${last.sectionLabel||''})`;
    }
    return `
    <header class="top">
      ${themeToggleBtn()}
      <div class="name deva" data-href="#/" style="cursor:pointer;">आवर्तन</div>
      <div class="sub">Avartan · Visharad Purna Theory</div>
      <div class="rule"></div>
    </header>
    <div class="screen active">
      <div class="card home-card" data-href="#/read">
        <div class="label"><span class="deva">पढ़ें</span><span class="en">Read · ${CARDS.length} topics</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/quiz">
        <div class="label"><span class="deva">अभ्यास</span><span class="en">Quiz · ${QUIZ.length} questions</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="stat-line">${state.readTopics.length}/${CARDS.length} topics read</div>
      <div class="stat-line">${lastLine}</div>
      <div class="stat-line">${('serviceWorker' in navigator && navigator.serviceWorker.controller) ? '✓ Ready offline' : 'Preparing offline copy… open the app once more when online'}</div>
    </div>`;
  }

  // ---------- helpers ----------
  const TT = n => 'T' + n;   // topic label = R3 cram-sheet number (NOT the VP chapter number)
  function topicTitle(c){ return state.lang==='deva' ? c.titleDeva : c.titleEn; }
  function secKey(sec){ return sec === '__mixed__' ? 'mixed' : String(sections().indexOf(sec)); }
  function secFromKey(k){ if(k==='mixed') return '__mixed__'; const s = sections()[parseInt(k,10)]; return s===undefined ? null : s; }
  function topicsForSection(sec){ return CARDS.filter(c => ((TOPIC_META[c.num]||{}).secs||[]).includes(sec)); }
  function readLinks(sec){
    const ts = topicsForSection(sec);
    if(!ts.length) return '';
    return `<div class="read-links">${ts.map(c => `<span class="read-link" data-href="#/read/${c.num}">📖 Read topic ${TT(c.num)} · ${c.titleEn}</span>`).join('')}</div>`;
  }
  function correctText(q){
    return q.type==='mcq' ? q.opts[q.answerIdx]
      : (q.answer ? 'सही' : 'गलत') + (q.answerNote && q.answerNote.length>4 ? ` — ${q.answerNote.replace(/^सही\s*|^गलत\s*/,'')}` : '');
  }
  function header(){
    return `<header class="top">${themeToggleBtn()}<div class="name deva" data-href="#/" style="cursor:pointer;">आवर्तन</div></header>`;
  }

  function renderReadList(){
    const rows = CARDS.map(c => {
      const m = TOPIC_META[c.num] || {};
      return `
      <div class="card topic-row" data-href="#/read/${c.num}">
        <div>
          <div class="num">${TT(c.num)} · from ${m.src||''} <span class="tag read">Read</span></div>
          <div class="ti">${topicTitle(c)}</div>
          ${state.readTopics.includes(c.num) ? '<div class="done">✓ Read</div>' : ''}
        </div>
        <div class="arrow">→</div>
      </div>`;
    }).join('');
    return `${header()}
    <div class="screen active">
      <h2 class="scr-title">Topics · ${CARDS.length}</h2>
      <div class="hi-note">T-numbers are the topic numbers of the cram sheets. "from VP-xx" shows which chapter the topic comes from.</div>
      ${rows}
    </div>`;
  }

  function renderReadTopic(){
    const c = CARDS.find(x => x.num === state.currentTopic);
    if(!c) return '<div class="screen active">Not found.</div>';
    const en = state.lang === 'en';
    const m = TOPIC_META[c.num] || {secs:[]};
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
      fullchapHtml = `<div class="fullchap-stub">Full chapter text for ${TT(c.num)} isn't in the app yet — see your physical notes for now.</div>`;
    }
    const sec = m.secs[0];
    const n = sec ? questionsFor(sec).length : 0;
    const others = sec ? topicsForSection(sec).filter(x => x.num !== c.num) : [];
    const practise = n ? `<div class="btn-row"><button class="btn" data-href="#/quiz/run/${secKey(sec)}">Practise this topic · ${n} questions</button></div>
      ${others.length ? `<div class="hi-note">This quiz is shared with ${others.map(x=>TT(x.num)).join(', ')}.</div>` : ''}` : '';
    return `${header()}
    <div class="screen active">
      <div class="back-link" data-href="#/read">← सूची · All topics</div>
      <div class="lang-toggle">
        <button data-action="lang-en" class="${en?'active':''}">English</button>
        <button data-action="lang-deva" class="${!en?'active':''}">देवनागरी</button>
      </div>
      <div class="topic-head ${!en?'deva':''}">${en ? c.titleEn : c.titleDeva}</div>
      <div class="topic-head-sub">${TT(c.num)} · from ${m.src||''}</div>
      ${practise}

      <div class="box model">
        <div class="box-label">ऐसे लिखें · How to write this</div>
        <div class="box-body ${!en?'deva':''}">${en ? c.summaryEn : c.skeletonDeva}</div>
      </div>

      ${c.ember ? `<div class="box amber"><div class="box-label">⚑ खुला बिंदु · Open item${en ? ' (note is in Hindi)' : ''}</div><div class="box-body deva">${c.ember}</div></div>` : ''}

      <div class="facts-label">तथ्य · Facts asked in papers</div>
      ${en ? '<div class="hi-note">The questions and answers below are in Hindi, exactly as asked in the papers.</div>' : ''}
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
      return `<div class="card quiz-pick-row" data-href="#/quiz/run/${secKey(s)}">
        <div><div class="num"><span class="tag quiz">Quiz</span></div><div class="ti deva">${s}</div><div class="ct">${count} questions${last ? ` · last ${last.score}/${last.total}` : ''}</div></div>
        <div class="go">→</div>
      </div>`;
    }).join('');
    return `${header()}
    <div class="screen active">
      <h2 class="scr-title">Quiz · pick a section</h2>
      ${state.lang==='en' ? '<div class="hi-note">Quiz questions are in Hindi, as in the papers.</div>' : ''}
      <div class="card quiz-pick-row" data-href="#/quiz/run/mixed">
        <div><div class="num"><span class="tag quiz">Quiz</span></div><div class="ti">🔀 Mixed — ${MIXED_N} random</div><div class="ct">across all sections</div></div>
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
      feedback = `<div class="feedback deva">सही उत्तर: <b>${correctText(q)}</b><span class="sess">सत्र: ${q.session}</span></div>
        <div style="text-align:center;">${i < state.quizQueue.length-1 ? `<button class="btn" data-action="next-q">Next</button>` : `<button class="btn" data-action="finish-quiz">See result</button>`}</div>`;
    }
    const exitBox = state.confirmExit
      ? `<div class="confirm-box"><div>Leave this quiz? Your answers so far won't be saved.</div>
          <div class="btn-row"><button class="btn ghost" data-action="exit-cancel">Keep going</button><button class="btn" data-action="exit-yes">Leave quiz</button></div></div>`
      : `<div class="exit-row"><button class="exit-btn" data-action="exit-quiz" aria-label="Exit quiz">✕ Exit quiz</button></div>`;
    return `${header()}
    <div class="screen active">
      ${exitBox}
      <div class="ring-wrap">${ring(state.quizQueue.length, ans)}</div>
      <div class="q-num">Question ${i+1} of ${state.quizQueue.length}</div>
      <div class="q-session"><span class="tag quiz">Quiz</span> ${q.section}</div>
      <div class="q-text deva">${q.q}</div>
      <div>${optsHtml}</div>
      ${feedback}
      ${readLinks(q.section)}
    </div>`;
  }

  function renderQuizResult(){
    const queue = state.quizQueue, ans = state.quizAnswers;
    const score = ans.filter(a=>a===true).length;
    const total = queue.length;
    const misses = queue.filter((q,i) => ans[i] !== true);
    const note = score===total ? 'Full avartan — clean cycle.' : score>=total*0.7 ? 'Solid. Revisit the misses below.' : 'Worth a re-read before the next attempt. Misses are below.';
    const missHtml = misses.length ? `<h2 class="scr-title">Revisit · ${misses.length} ${misses.length===1?'miss':'misses'}</h2>` + misses.map(q => `
      <div class="card miss">
        <div class="q-session"><span class="tag quiz">Quiz</span> ${q.section}</div>
        <div class="q-text deva">${q.q}</div>
        <div class="feedback deva">सही उत्तर: <b>${correctText(q)}</b><span class="sess">सत्र: ${q.session}</span></div>
        ${readLinks(q.section)}
      </div>`).join('') : '';
    return `${header()}
    <div class="screen active">
      <h2 class="scr-title">परिणाम · Result</h2>
      <div class="ring-wrap">${ring(total, ans)}</div>
      <div class="result-score">${score}/${total}</div>
      <div class="result-note">${note}</div>
      <div class="result-actions">
        <button class="btn" data-action="restart-section">Try again</button>
        <button class="btn ghost" data-href="#/quiz">Other sections</button>
      </div>
      ${missHtml}
    </div>`;
  }

  function render(keep){
    const y = window.scrollY;
    let html = '';
    if(state.screen === 'home') html = renderHome();
    else if(state.screen === 'read-list') html = renderReadList();
    else if(state.screen === 'read-topic') html = renderReadTopic();
    else if(state.screen === 'quiz-list') html = renderQuizList();
    else if(state.screen === 'quiz-active') html = renderQuizActive();
    else if(state.screen === 'quiz-result') html = renderQuizResult();

    const tab = state.screen.startsWith('read') ? 'read' : state.screen.startsWith('quiz') ? 'quiz' : 'home';
    html += `<nav class="tabs">
      <button data-href="#/" class="${tab==='home'?'active':''}"><span class="deva">होम</span><span class="en">Home</span></button>
      <button data-href="#/read" class="${tab==='read'?'active':''}"><span class="deva">पढ़ें</span><span class="en">Read</span></button>
      <button data-href="#/quiz" class="${tab==='quiz'?'active':''}"><span class="deva">अभ्यास</span><span class="en">Quiz</span></button>
    </nav>`;
    root.innerHTML = html;
    if(keep !== false) root.querySelectorAll('.screen').forEach(e => e.classList.add('noanim'));   // fade only on a new screen/question, not on every tap
    bind();
    // new screen or new question -> top; in-page toggles (language, full chapter, theme, answering) keep the place
    window.scrollTo(0, keep === false ? 0 : y);
  }

  // ---------- routing (every screen has a URL; the phone back button works) ----------
  function nav(h){
    const cur = location.hash || '#/';
    if(cur === h) route(); else location.hash = h;
  }
  function replaceTo(h){ history.replaceState(null, '', h); route(); }

  function beginQuiz(sec){
    state.quizSection = sec;
    state.quizQueue = questionsFor(sec);
    state.quizIdx = 0;
    state.quizAnswers = new Array(state.quizQueue.length).fill(null);
    state._picked = null;
    state.screen = 'quiz-active';
  }
  function resultHash(){
    const ids = state.quizQueue.map(q => q.id).join('-');
    const bits = state.quizAnswers.map(a => a===true ? '1' : '0').join('');
    return `#/result/${secKey(state.quizSection)}/${ids}/${bits}`;
  }
  function loadResult(p){
    const sec = secFromKey(p[1]);
    if(sec === null || !p[2] || !p[3]) return false;
    const queue = p[2].split('-').map(id => QUIZ.find(q => q.id === parseInt(id,10)));
    if(queue.some(q => !q) || p[3].length !== queue.length || /[^01]/.test(p[3])) return false;
    state.quizSection = sec; state.quizQueue = queue;
    state.quizAnswers = p[3].split('').map(b => b === '1');
    state.screen = 'quiz-result';
    return true;
  }
  function route(){
    const p = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    state.confirmExit = false;
    if(!p.length) state.screen = 'home';
    else if(p[0] === 'read' && p[1]){
      const n = parseInt(p[1], 10);
      if(CARDS.some(c => c.num === n)){ state.currentTopic = n; state.fullChapOpen = false; state.screen = 'read-topic'; markRead(n); }
      else state.screen = 'read-list';
    }
    else if(p[0] === 'read') state.screen = 'read-list';
    else if(p[0] === 'quiz' && p[1] === 'run'){
      const sec = secFromKey(p[2]);
      if(sec === null) state.screen = 'quiz-list'; else beginQuiz(sec);
    }
    else if(p[0] === 'quiz') state.screen = 'quiz-list';
    else if(p[0] === 'result'){ if(!loadResult(p)) state.screen = 'quiz-list'; }
    else state.screen = 'home';
    render(false);
  }

  function bind(){
    root.querySelectorAll('[data-href]').forEach(el => {
      if(el.tagName !== 'BUTTON'){ el.setAttribute('role', 'link'); el.setAttribute('tabindex', '0'); }
      const go = () => nav(el.getAttribute('data-href'));
      el.addEventListener('click', go);
      el.addEventListener('keydown', e => { if(e.key === 'Enter' && el.tagName !== 'BUTTON') go(); });
    });
    root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const act = el.getAttribute('data-action');
      if(act === 'lang-en') setLang('en');
      else if(act === 'lang-deva') setLang('deva');
      else if(act === 'toggle-theme') toggleTheme();
      else if(act === 'toggle-fullchap'){ state.fullChapOpen = !state.fullChapOpen; render(); }
      else if(act === 'next-q'){ state.quizIdx++; state._picked=null; render(false); }
      else if(act === 'finish-quiz'){ finishQuiz(); }
      else if(act === 'restart-section'){ nav('#/quiz/run/' + secKey(state.quizSection)); }
      else if(act === 'exit-quiz'){
        if(state.quizAnswers.some(a => a !== null)){ state.confirmExit = true; render(); }
        else replaceTo('#/quiz');
      }
      else if(act === 'exit-cancel'){ state.confirmExit = false; render(); }
      else if(act === 'exit-yes'){ replaceTo('#/quiz'); }
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

  function finishQuiz(){
    const score = state.quizAnswers.filter(a=>a===true).length;
    const total = state.quizQueue.length;
    const label = state.quizSection === '__mixed__' ? 'Mixed' : state.quizSection;
    if(!state.quizHistory[state.quizSection]) state.quizHistory[state.quizSection] = [];
    state.quizHistory[state.quizSection].push({score, total, sectionLabel:label, date:new Date().toISOString()});
    LS.set('avartan:quizhist', state.quizHistory);
    replaceTo(resultHash());   // replaces the quiz page in history, so Back returns to the list, not into a fresh quiz
  }

  if('serviceWorker' in navigator){
    window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(()=>{}));
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('controllerchange', () => { if(loaded && state.screen==='home') render(); });
  }
  window.addEventListener('hashchange', () => { if(loaded) route(); });
  applyTheme();
  loadData();
})();
