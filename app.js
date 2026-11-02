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
    q: '', jump: null, curQA: null, curPlayer: null, qf: {t:'', p:'', g:'paper'}, gl: '', ff: {g:'', k:''}, pf: {g:'', i:'', s:''},
    quizSection: null,
    quizQueue: [],
    quizIdx: 0,
    quizAnswers: [],
    _picked: null,
    confirmExit: false,
    curPaper: null,
    curEntry: null,
    answersError: null,
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
      <div class="card home-card" data-href="#/answers">
        <div class="label"><span class="deva">उत्तर</span><span class="en">Model answers · past papers</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/questions">
        <div class="label"><span class="deva">पूछे गए प्रश्न</span><span class="en">Past questions · find by topic</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/taals">
        <div class="label"><span class="deva">ताल-तालिका</span><span class="en">Taal sheet · matras, taali, khali</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/glossary">
        <div class="label"><span class="deva">शब्दावली</span><span class="en">Glossary · one-line meanings</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/flags">
        <div class="label"><span class="deva">⚑ ध्वज</span><span class="en">Flagged items · check with guru</span></div>
        <div class="arrow">→</div>
      </div>
      <div class="card home-card" data-href="#/players">
        <div class="label"><span class="deva">कलाकार</span><span class="en">Players · tabla and pakhawaj</span></div>
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

  // ---------- model answers (Stage B): data loads only when this section is opened ----------
  let ANSWERS = null, answersLoading = null;
  function loadAnswers(){
    if(ANSWERS) return Promise.resolve(ANSWERS);
    if(!answersLoading){
      answersLoading = fetch('answers-data.json')
        .then(r => { if(!r.ok) throw new Error('answers-data.json: ' + r.status); return r.json(); })
        .then(d => { ANSWERS = d; return d; })
        .catch(err => { answersLoading = null; throw err; });
    }
    return answersLoading;
  }
  const LK = () => state.lang === 'en' ? 'en' : 'hi';
  function paperByKey(k){ return ANSWERS.papers.find(p => p.key === k); }
  function entryChips(e){
    const L = LK(), m = e.markers, out = [];
    if(m.flag_count[L] > 0) out.push(`<span class="tag flag">⚑ ${m.flag_count[L]}</span>`);
    if(m.get_from_guru_placeholders[L] > 0) out.push(`<span class="tag guru">${m.get_from_guru_placeholders[L]} guru box${m.get_from_guru_placeholders[L]>1?'es':''}</span>`);
    else if(m.needs_material_from_guru) out.push(`<span class="tag guru">ask guru</span>`);
    if(m.created_for_this_answer) out.push(`<span class="tag made">created for this answer</span>`);
    return out.join('');
  }
  function langToggle(){
    const en = state.lang === 'en';
    return `<div class="lang-toggle">
        <button data-action="lang-en" class="${en?'active':''}">English</button>
        <button data-action="lang-deva" class="${!en?'active':''}">देवनागरी</button>
      </div>`;
  }

  function renderAnsLoading(){
    return `${header()}<div class="screen active"><h2 class="scr-title">Model answers</h2><div class="hi-note">Loading the answers…</div></div>`;
  }
  function renderAnsError(){
    return `${header()}<div class="screen active"><div class="box amber"><div class="box-label">⚠ Couldn't load the answers</div>
      <div class="box-body">${state.answersError || ''} Try reloading. If you are offline, open the app once while online so it can save the answers.</div></div></div>`;
  }
  function renderAnsList(){
    const L = LK();
    const groups = [];
    ANSWERS.papers.forEach(p => {
      let g = groups.find(x => x.sitting === p.sitting);
      if(!g){ g = {sitting: p.sitting, items: []}; groups.push(g); }
      g.items.push(p);
    });
    const html = groups.map(g => `<h2 class="scr-title">${g.sitting}</h2>` + g.items.map(p => {
      const flagged = p.entries.filter(e => e.markers.flag_count[L] > 0).length;
      const guru = p.entries.filter(e => e.markers.needs_material_from_guru).length;
      return `<div class="card topic-row" data-href="#/answers/${p.key}">
        <div><div class="num">PAPER ${p.paper} <span class="tag ans">Answers</span></div>
        <div class="ti">${p.sitting} · Paper ${p.paper}</div>
        <div class="ct">${p.entries.length} answers · ⚑ in ${flagged} · ${guru} need your guru</div></div>
        <div class="arrow">→</div></div>`;
    }).join('')).join('');
    return `${header()}
    <div class="screen active">
      <h2 class="scr-title">Model answers · ${ANSWERS.papers.length} papers</h2>
      ${langToggle()}
      <div class="box grey"><div class="box-label">How to read the markers</div><div class="box-body">
        <b>⚑</b> a point flagged in the answer to confirm with your guru.<br>
        <b>Amber box</b> "Composition needed from your notes or guru": left blank on purpose. Take it from your guru.<br>
        <b>Green label</b> from your notes · <b>amber label</b> created or adapted for this answer · <b>blue label</b> structure from a source.
      </div></div>
      ${html}
    </div>`;
  }
  function renderAnsPaper(){
    const L = LK(), p = paperByKey(state.curPaper);
    const rows = p.entries.map(e => `
      <div class="card topic-row" data-href="#/answers/${p.key}/${e.order}">
        <div><div class="num">${e.question_number[L]} · ${e.marks[L]} ${entryChips(e)}</div>
        <div class="ti ${L==='hi'?'deva':''}">${e.question_title[L]}</div></div>
        <div class="arrow">→</div></div>`).join('');
    return `${header()}
    <div class="screen active">
      <div class="back-link" data-href="#/answers">← All papers</div>
      ${langToggle()}
      <div class="topic-head">${p.sitting} · Paper ${p.paper}</div>
      <div class="topic-head-sub">${p.entries.length} answers</div>
      <div class="hi-note ${L==='hi'?'deva':''}">${p.paper_rule[L]}</div>
      ${rows}
    </div>`;
  }
  function renderAnsEntry(){
    const L = LK(), p = paperByKey(state.curPaper);
    const i = p.entries.findIndex(x => x.order === state.curEntry), e = p.entries[i];
    const m = e.markers, deva = L === 'hi' ? 'deva' : '';
    const notes = (m.other_get_from_guru_sentences[L] || []).concat(m.confirm_with_guru_sentences[L] || []);
    const prev = p.entries[i-1], next = p.entries[i+1];
    return `${header()}
    <div class="screen active">
      <div class="back-link" data-href="#/answers/${p.key}">← ${p.sitting} · Paper ${p.paper}</div>
      ${langToggle()}
      <div class="topic-head-sub">${e.question_number[L]} · ${e.marks[L]}</div>
      <div class="topic-head ${deva}">${e.question_title[L]}</div>
      <div class="chips">${entryChips(e)}</div>
      <div class="box model"><div class="box-label">${e.section[L]}</div>
        <div class="box-body ${deva}">${e.question_text[L]}</div>
        ${(e.choice_rule_in_question[L]||[]).map(r => `<div class="box-body ${deva}"><i>${r}</i></div>`).join('')}
        ${(L==='en' && e.question_text_en_is_translation) ? '<div class="hi-note">This English question text is a translation. The paper was set in Hindi only.</div>' : ''}
      </div>
      <div class="ans-body ${deva}">${e.answer_html[L]}</div>
      ${notes.length ? `<div class="box amber"><div class="box-label">Notes to raise with your guru</div>${notes.map(n => `<div class="box-body ${deva}">${n}</div>`).join('')}</div>` : ''}
      <div class="btn-row pn">
        ${prev ? `<button class="btn ghost" data-href="#/answers/${p.key}/${prev.order}">← ${prev.question_number[L]}</button>` : '<span></span>'}
        ${next ? `<button class="btn" data-href="#/answers/${p.key}/${next.order}">${next.question_number[L]} →</button>` : ''}
      </div>
    </div>`;
  }


  // ---------- Stage C: universal offline search ----------
  const TYPE_LABEL = {c:'Notes', f:'Full chapter', q:'Quiz', a:'Model answer', p:'Player', t:'Taal', g:'Glossary'};
  let SRCH = null, srchLoading = null, srchTimer = null;
  function escH(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function loadScript(src){ return new Promise((ok, bad) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => bad(new Error('Could not load ' + src)); document.head.appendChild(el); }); }
  function loadSearch(){
    if(SRCH) return Promise.resolve(SRCH);
    if(!srchLoading){
      srchLoading = loadScript('minisearch.min.js').then(() => loadScript('search-core.js')).then(() => loadScript('search.js'))
        .then(() => fetch('search-index.json'))
        .then(r => { if(!r.ok) throw new Error('search-index.json: ' + r.status); return r.json(); })
        .then(d => { SRCH = window.AvSearch.setup(d); return SRCH; })
        .catch(e => { srchLoading = null; throw e; });
    }
    return srchLoading;
  }
  function markHtml(text, set){        // escape, then wrap matching words in <mark>
    const C = window.AvCore, re = /[0-9०-९]+\/[0-9०-९]+|[A-Za-z0-9À-ɏḀ-ỿऀ-ॣ०-९ॱ-ॿ]+/g;
    let out = '', last = 0, m;
    while((m = re.exec(text))){
      const n = C.normTerm(m[0]), k = C.skel(n);
      out += escH(text.slice(last, m.index));
      out += (set[n] || (k && set['~' + k])) ? '<mark>' + escH(m[0]) + '</mark>' : escH(m[0]);
      last = m.index + m[0].length;
    }
    return out + escH(text.slice(last));
  }
  function jumpHash(r, q){
    const lang = r.l === 'hi' || r.l === 'deva' ? 'deva' : r.l === 'en' ? 'en' : '';
    return r.u + '?h=' + encodeURIComponent(r.g || '') + '&q=' + encodeURIComponent(q) + (lang ? '&l=' + lang : '') + (r.ty === 'f' ? '&f=1' : '');
  }
  function renderSearch(){
    return `${header()}
    <div class="screen active">
      <div class="search-box"><input id="sq" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="Search · खोजें  (tihai, कायदा, kuaad…)" value="${escH(state.q)}" aria-label="Search"></div>
      <div id="sres"></div>
    </div>`;
  }
  function paintResults(){
    const box = document.getElementById('sres'); if(!box) return;
    const q = state.q.trim();
    if(!q){ box.innerHTML = `<div class="hi-note">Type a word in English letters or Hindi. Spellings like <b>kayda / qaida / कायदा</b> or <b>tihai / तिहाई</b> find the same thing. Works offline.</div>`; return; }
    if(!SRCH){
      box.innerHTML = `<div class="hi-note">Loading search…</div>`;
      loadSearch().then(paintResults).catch(e => { box.innerHTML = `<div class="hi-note">Search could not load (${escH(e.message)}). Open the app once with internet, then try again.</div>`; });
      return;
    }
    const r = SRCH.search(q, 40), set = SRCH.highlightTerms(r.tokens);
    if(!r.results.length){ box.innerHTML = `<div class="hi-note">Nothing found for “${escH(q)}”. Try fewer words or another spelling.</div>`; return; }
    box.innerHTML = `<div class="topic-head-sub">${r.results.length} results${r.mode === 'or' ? ' · closest matches' : ''}</div>` + r.results.map(x => `
      <div class="card res" data-href="${escH(jumpHash(x, q))}">
        <div class="res-meta"><span class="tag ${x.ty === 'a' ? 'ans' : x.ty === 'q' ? 'quiz' : ''}">${TYPE_LABEL[x.ty]}</span> ${escH(x.sr)}</div>
        <div class="res-ti ${x.l === 'hi' || x.l === 'deva' ? 'deva' : ''}">${markHtml(x.ti, set)}</div>
        ${x.tx && x.tx !== x.ti ? `<div class="res-tx ${x.l === 'hi' || x.l === 'deva' ? 'deva' : ''}">${markHtml(x.tx, set)}</div>` : ''}
      </div>`).join('');
    box.onclick = e => { const c = e.target.closest('[data-href]'); if(c) nav(c.getAttribute('data-href')); };
  }
  function wireSearch(){
    const inp = document.getElementById('sq'); if(!inp) return;
    inp.addEventListener('input', () => {
      state.q = inp.value;
      clearTimeout(srchTimer);
      srchTimer = setTimeout(() => { history.replaceState(null, '', '#/search' + (state.q.trim() ? '?q=' + encodeURIComponent(state.q.trim()) : '')); paintResults(); }, 140);
    });
    paintResults();
    if(!state.q) inp.focus();
  }
  // after opening a result: switch language, mark the words, scroll to the passage
  function applyJump(){
    const j = state.jump; if(!j) return; state.jump = null;
    loadSearch().then(() => {
      const C = window.AvCore, scr = root.querySelector('.screen'); if(!scr) return;
      const set = j.q ? SRCH.highlightTerms(C.tokenize(j.q).filter(t => !C.STOP[t.toLowerCase()])) : {};
      const walker = document.createTreeWalker(scr, NodeFilter.SHOW_TEXT), nodes = [];
      while(walker.nextNode()){ const n = walker.currentNode; if(n.parentNode && !/^(SCRIPT|STYLE|MARK|BUTTON)$/.test(n.parentNode.tagName) && n.nodeValue.trim()) nodes.push(n); }
      nodes.forEach(n => {
        const html = markHtml(n.nodeValue, set);
        if(html.indexOf('<mark>') < 0) return;
        const sp = document.createElement('span'); sp.innerHTML = html; n.parentNode.replaceChild(sp, n);
      });
      let target = null;
      if(j.h){
        [j.h, j.h.slice(0, 12)].some(key => {
          let best = null, len = 1e9;
          scr.querySelectorAll('*').forEach(el => { if(el.closest('.tabs')) return; const t = C.keyOf(el.textContent); if(t.length < len && t.indexOf(key) >= 0){ best = el; len = t.length; } });
          target = best; return !!best;
        });
      }
      if(!target) target = scr.querySelector('mark');
      if(target){ const blk = target.closest('p,li,tr,.card,.box,.fact-row,div') || target; blk.classList.add('jump-hit'); blk.scrollIntoView({block:'center'}); }
    }).catch(() => {});
  }
  function renderQA(){
    const q = state.curQA; if(!q) return renderQuizList();
    const opts = q.type === 'mcq'
      ? q.opts.map((o, oi) => `<div class="opt deva ${oi === q.answerIdx ? 'correct' : ''}">${o}</div>`).join('')
      : [[true, 'सही · True'], [false, 'गलत · False']].map(([v, l]) => `<div class="opt ${v === q.answer ? 'correct' : ''}">${l}</div>`).join('');
    return `${header()}
    <div class="screen active">
      <div class="back-link" data-href="#/search${state.q ? '?q=' + encodeURIComponent(state.q) : ''}">← Search</div>
      <div class="q-session"><span class="tag quiz">Quiz</span> ${q.section}</div>
      <div class="q-text deva">${q.q}</div>
      <div>${opts}</div>
      <div class="feedback deva">सही उत्तर: <b>${correctText(q)}</b><span class="sess">सत्र: ${q.session}</span></div>
      ${readLinks(q.section)}
    </div>`;
  }

  // ---------- Stage D: players ----------
  let PLAYERS = null, playersLoading = null;
  function loadPlayers(){
    if(PLAYERS) return Promise.resolve(PLAYERS);
    if(!playersLoading){
      playersLoading = fetch('players-data.json').then(r => { if(!r.ok) throw new Error('players-data.json: ' + r.status); return r.json(); })
        .then(d => { PLAYERS = d.players; return PLAYERS; }).catch(e => { playersLoading = null; throw e; });
    }
    return playersLoading;
  }
  function playerById(id){ return (PLAYERS || []).find(p => p.id === id); }
  function renderPlayersLoading(){ return `${header()}<div class="screen active"><div class="hi-note">Loading players…</div></div>`; }
  function renderPlayers(){
    const f = state.pf, all = PLAYERS;
    const gh = Array.from(new Set(all.map(p => p.gharana_key))).sort();
    const list = all.filter(p => (!f.g || p.gharana_key === f.g) && (!f.i || p.instrument.indexOf(f.i) >= 0) && (!f.s || (f.s === 'syl' ? p.in_syllabus : !p.in_syllabus)));
    const opt = (v, cur, lab) => `<option value="${escH(v)}" ${cur === v ? 'selected' : ''}>${escH(lab)}</option>`;
    return `${header()}
    <div class="screen active">
      <div class="topic-head">Players</div>
      <div class="topic-head-sub">${list.length} of ${all.length} shown</div>
      <div class="filters">
        <select data-pf="g" aria-label="Gharana">${opt('', f.g, 'All gharanas')}${gh.map(g => opt(g, f.g, g)).join('')}</select>
        <select data-pf="i" aria-label="Instrument">${opt('', f.i, 'Tabla and pakhawaj')}${opt('tabla', f.i, 'Tabla')}${opt('pakhawaj', f.i, 'Pakhawaj')}</select>
        <select data-pf="s" aria-label="Syllabus">${opt('', f.s, 'Syllabus and context')}${opt('syl', f.s, 'In syllabus')}${opt('ctx', f.s, 'Context only (modern)')}</select>
      </div>
      ${list.map(p => `
      <div class="card topic-row" data-href="#/players/${p.id}">
        <div><div class="num"><span class="tag ${p.in_syllabus ? 'ans' : 'quiz'}">${p.in_syllabus ? 'Syllabus' : 'Context'}</span> ${escH(p.gharana_key)} · ${escH(p.instrument)}${p.flags.length || p.web_flags.length ? ' <span class="tag flag">⚑</span>' : ''}</div>
        <div class="ti">${escH(p.name_en)} <span class="deva">· ${escH(p.name_deva)}</span></div></div>
        <div class="arrow">→</div></div>`).join('')}
    </div>`;
  }
  function pRow(label, val, hi){ return val ? `<div class="p-row"><div class="p-lab">${label}</div><div class="p-val ${hi ? 'deva' : ''}">${escH(val)}</div></div>` : ''; }
  function renderPlayer(){
    const p = state.curPlayer;
    if(!p) return renderPlayers();
    const w = p.web, proj = p.in_syllabus && (p.born || p.gurus || p.known_for || p.honours);
    const srcs = p.sources.map(x => x.url ? `<a href="${escH(x.url)}" target="_blank" rel="noopener">${escH(x.label)}</a>` : escH(x.label)).join(' · ');
    return `${header()}
    <div class="screen active">
      <div class="back-link" data-href="#/players">← All players</div>
      <div class="topic-head-sub"><span class="tag ${p.in_syllabus ? 'ans' : 'quiz'}">${p.in_syllabus ? 'In syllabus' : 'Context, not syllabus'}</span> ${escH(p.gharana_key)} · ${escH(p.instrument)}</div>
      <div class="topic-head">${escH(p.name_en)}</div>
      <div class="topic-head deva" style="font-size:20px;">${escH(p.name_deva)}</div>
      ${proj ? `<div class="box model"><div class="box-label">From your notes (unchanged)</div>
        ${pRow('Gharana', p.gharana, true)}${pRow('Born', p.born, true)}${pRow('Gurus', p.gurus, true)}${pRow('Known for', p.known_for, true)}${pRow('Honours', p.honours, true)}</div>`
        : (p.in_syllabus ? `<div class="box grey"><div class="box-label">From your notes</div>${pRow('Gharana', p.gharana, true)}${pRow('Note', p.known_for, true)}</div>` : '')}
      ${w ? `<div class="box grey"><div class="box-label">From the web (cited) · checked ${escH(w.checked)}${p.in_syllabus ? '' : ' · modern player, context only'}</div>
        ${pRow('Status', w.status)}${pRow('Born', w.born)}${pRow('Died', w.died)}${pRow('Gharana', w.gharana)}${pRow('Gurus', w.gurus)}${pRow('Awards', w.awards)}${pRow('Known for', w.known_for)}${pRow('Students', w.students)}</div>` : ''}
      ${p.flags.map(t => `<div class="box amber"><div class="box-label">⚑ Note from your chapter</div><div class="box-body deva">${escH(t.text)}</div></div>`).join('')}
      ${p.web_flags.map(t => `<div class="box amber"><div class="box-label">⚑ Sources differ</div><div class="box-body">${escH(t)}</div></div>`).join('')}
      <div class="hi-note">Sources: ${srcs}</div>
    </div>`;
  }

  // ---------- Stage E: question finder, taal sheet, glossary, flagged items ----------
  const XDATA = {};   // lazily loaded small data files
  function loadX(name){
    if(XDATA[name] && XDATA[name].d) return Promise.resolve(XDATA[name].d);
    if(!XDATA[name]) XDATA[name] = {};
    if(!XDATA[name].p) XDATA[name].p = fetch(name + '-data.json').then(r => { if(!r.ok) throw new Error(name + '-data.json: ' + r.status); return r.json(); })
      .then(d => (XDATA[name].d = d)).catch(e => { XDATA[name].p = null; throw e; });
    return XDATA[name].p;
  }
  function loadingScreen(msg){ return `${header()}<div class="screen active"><div class="hi-note">${msg}</div></div>`; }
  // ----- past-question finder (built from the model-answers data) -----
  function finderRows(){
    const f = state.qf, needle = (f.t || '').trim().toLowerCase(), L = LK();
    const rows = [];
    ANSWERS.papers.forEach(p => p.entries.forEach(e => {
      if(f.p && p.key !== f.p) return;
      const hay = (e.question_title.en + ' ' + e.question_title.hi + ' ' + e.question_text.en + ' ' + e.question_text.hi).toLowerCase();
      if(needle && hay.indexOf(needle) < 0) return;
      rows.push({p, e, key: e.question_title.en.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim()});
    }));
    const cnt = {}; ANSWERS.papers.forEach(p => p.entries.forEach(e => { const k = e.question_title.en.toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim(); cnt[k] = (cnt[k] || 0) + 1; }));
    rows.forEach(r => r.n = cnt[r.key]);
    rows.sort((a, b) => f.g === 'title' ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : (b.p.key < a.p.key ? -1 : b.p.key > a.p.key ? 1 : 0) || (a.e.order - b.e.order));
    return rows;
  }
  function finderListHtml(){
    const L = LK(), rows = finderRows();
    if(!rows.length) return `<div class="hi-note">No question matches. Try a shorter word.</div>`;
    return `<div class="topic-head-sub">${rows.length} questions</div>` + rows.map(r => `
      <div class="card topic-row" data-href="#/answers/${r.p.key}/${r.e.order}">
        <div><div class="num">${escH(r.p.sitting)} · Paper ${escH(r.p.paper)} · ${escH(r.e.question_number[L])} · ${escH(r.e.marks[L])}${r.n > 1 ? ` <span class="tag flag">asked ${r.n}×</span>` : ''}</div>
        <div class="ti ${L==='hi'?'deva':''}">${escH(r.e.question_title[L])}</div></div><div class="arrow">→</div></div>`).join('');
  }
  function renderFinder(){
    const f = state.qf, opt = (v, cur, lab) => `<option value="${escH(v)}" ${cur === v ? 'selected' : ''}>${escH(lab)}</option>`;
    return `${header()}
    <div class="screen active">
      <div class="topic-head">Past questions</div>
      ${langToggle()}
      <div class="search-box"><input id="qft" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Filter: kayda, तिहाई, jhaptaal…" value="${escH(f.t)}" aria-label="Filter questions"></div>
      <div class="filters">
        <select data-qf="p" aria-label="Paper">${opt('', f.p, 'All 14 papers')}${ANSWERS.papers.map(p => opt(p.key, f.p, p.sitting + ' · Paper ' + p.paper)).join('')}</select>
        <select data-qf="g" aria-label="Order">${opt('paper', f.g, 'Newest paper first')}${opt('title', f.g, 'Group repeated questions (A–Z)')}</select>
      </div>
      <div id="qflist">${finderListHtml()}</div>
    </div>`;
  }
  // ----- taal sheet -----
  function taalMarks(t){
    if(!t.taali) return '';
    const parts = t.vibhag.split('+').map(Number); let b = 1, n = 2, out = [];
    parts.forEach(len => {
      let sym;
      if(t.khali.indexOf(b) >= 0) sym = '0';
      else if(b === 1) sym = '×';
      else { sym = String(n); n++; }
      out.push(`<span class="mk"><b>${sym}</b><i>${b}${len > 1 ? '–' + (b + len - 1) : ''}</i></span>`);
      b += len;
    });
    return out.join('');
  }
  function renderTaals(){
    const D = XDATA.taal.d, row = (a, b) => b ? pRow(a, b) : '';
    return `${header()}
    <div class="screen active">
      <div class="topic-head">Taal sheet</div>
      <div class="hi-note">${escH(D.note)} Symbols: ${D.symbols.map(s => '<b>' + escH(s.sym) + '</b> ' + escH(s.meaning)).join(' · ')}</div>
      ${D.taals.map(t => `
      <div class="card taal">
        <div class="ti"><span>${escH(t.name_en)}</span> <span class="deva">· ${escH(t.name_deva)}</span></div>
        <div class="p-row"><div class="p-lab">Matras</div><div class="p-val">${t.matras} · vibhag ${escH(t.vibhag)}${t.padvarg ? ' · <span class="deva">' + escH(t.padvarg) + '</span>' : ''}${t.padvarg_note ? ' <span class="deva">(' + escH(t.padvarg_note) + ')</span>' : ''}</div></div>
        ${t.taali ? `<div class="p-row"><div class="p-lab">Taali</div><div class="p-val">${t.taali.join(', ')} · khali ${t.khali.join(', ')} · sam 1</div></div>
        <div class="p-row"><div class="p-lab">Marks</div><div class="p-val marks">${taalMarks(t)}</div></div>` : ''}
        ${t.theka_deva ? `<div class="p-row"><div class="p-lab">Theka</div><div class="p-val deva">${escH(t.theka_deva)}<div class="srcline">${escH(t.theka_src)}</div></div></div>
          <div class="p-row"><div class="p-lab">Marks</div><div class="p-val deva">${escH(t.theka_marks)}</div></div>` : ''}
        ${t.theka_web ? `<div class="p-row"><div class="p-lab">Theka</div><div class="p-val">${escH(t.theka_web)}<div class="srcline">${escH(t.theka_src)} · not from your notes</div></div></div>` : ''}
        ${t.flags.map(x => `<div class="box amber"><div class="box-label">⚑ Check</div><div class="box-body">${escH(x)}</div></div>`).join('')}
        <div class="srcline">Sources: ${t.sources.map(x => x.url ? `<a href="${escH(x.url)}" target="_blank" rel="noopener">${escH(x.label)}</a>` : escH(x.label)).join(' · ')}</div>
      </div>`).join('')}
    </div>`;
  }
  // ----- glossary -----
  function renderGlossary(){
    const D = XDATA.glossary.d, f = (state.gl || '').trim().toLowerCase();
    const list = D.entries.filter(g => !f || (g.term_en + ' ' + g.term_deva + ' ' + g.definition).toLowerCase().indexOf(f) >= 0);
    return `${header()}
    <div class="screen active">
      <div class="topic-head">Glossary</div>
      <div class="hi-note">${escH(D.note)}</div>
      <div class="search-box"><input id="glq" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Filter terms…" value="${escH(state.gl)}" aria-label="Filter glossary"></div>
      <div id="gllist">${glossaryList(list)}</div>
    </div>`;
  }
  function glossaryList(list){
    return list.map(g => `<div class="card gl"><div class="ti"><span>${escH(g.term_en)}</span> <span class="deva">· ${escH(g.term_deva)}</span></div>
      <div class="gl-def deva">${escH(g.definition)}</div><div class="srcline">${escH(g.source)}</div></div>`).join('') || '<div class="hi-note">No term matches.</div>';
  }
  // ----- flagged items -----
  function renderFlags(){
    const D = XDATA.flags.d, f = state.ff, groups = ['Model answers', 'Chapters', 'Topic cards', 'Players', 'Taal sheet'];
    const opt = (v, cur, lab) => `<option value="${escH(v)}" ${cur === v ? 'selected' : ''}>${escH(lab)}</option>`;
    const items = D.items.filter(i => (!f.g || i.group === f.g) && (!f.k || i.kind.indexOf(f.k) >= 0));
    const tag = k => ({flag: '<span class="tag flag">⚑ flag</span>', guru: '<span class="tag guru">ask guru</span>', made: '<span class="tag made">made for this answer</span>'})[k] || '';
    return `${header()}
    <div class="screen active">
      <div class="topic-head">Flagged items</div>
      <div class="topic-head-sub">${items.length} of ${D.items.length} · every ⚑, "ask guru" and "made for this answer" in one list</div>
      <div class="filters">
        <select data-ff="g" aria-label="Where">${opt('', f.g, 'Everywhere')}${groups.map(g => opt(g, f.g, g + ' (' + D.items.filter(i => i.group === g).length + ')')).join('')}</select>
        <select data-ff="k" aria-label="Kind">${opt('', f.k, 'All kinds')}${opt('flag', f.k, '⚑ flags')}${opt('guru', f.k, 'Ask guru')}${opt('made', f.k, 'Made for this answer')}</select>
      </div>
      ${items.map(i => `<div class="card topic-row" data-href="${escH(i.url)}"><div><div class="num">${escH(i.group)} ${i.kind.map(tag).join(' ')}</div>
        <div class="ti ${/[ऀ-ॿ]/.test(i.label) ? 'deva' : ''}">${escH(i.label)}</div>${i.text ? `<div class="res-tx deva">${escH(i.text)}</div>` : ''}</div><div class="arrow">→</div></div>`).join('')}
    </div>`;
  }
  function wireX(){
    const qi = document.getElementById('qft');
    if(qi && state.screen === 'finder') qi.addEventListener('input', () => { state.qf.t = qi.value; const b = document.getElementById('qflist'); if(b){ b.innerHTML = finderListHtml(); bindIn(b); } });
    const gi = document.getElementById('glq');
    if(gi) gi.addEventListener('input', () => { state.gl = gi.value; const f = state.gl.trim().toLowerCase(); document.getElementById('gllist').innerHTML = glossaryList(XDATA.glossary.d.entries.filter(g => !f || (g.term_en + ' ' + g.term_deva + ' ' + g.definition).toLowerCase().indexOf(f) >= 0)); });
    root.querySelectorAll('select[data-qf]').forEach(el => el.addEventListener('change', () => { state.qf[el.getAttribute('data-qf')] = el.value; render(); }));
    root.querySelectorAll('select[data-ff]').forEach(el => el.addEventListener('change', () => { state.ff[el.getAttribute('data-ff')] = el.value; render(); }));
  }
  function bindIn(box){ box.querySelectorAll('[data-href]').forEach(el => { el.setAttribute('role', 'link'); el.setAttribute('tabindex', '0'); el.addEventListener('click', () => nav(el.getAttribute('data-href'))); }); }

  function render(keep){
    const y = window.scrollY;
    let html = '';
    if(state.screen === 'home') html = renderHome();
    else if(state.screen === 'read-list') html = renderReadList();
    else if(state.screen === 'read-topic') html = renderReadTopic();
    else if(state.screen === 'quiz-list') html = renderQuizList();
    else if(state.screen === 'quiz-active') html = renderQuizActive();
    else if(state.screen === 'quiz-result') html = renderQuizResult();
    else if(state.screen === 'ans-loading') html = renderAnsLoading();
    else if(state.screen === 'ans-error') html = renderAnsError();
    else if(state.screen === 'ans-list') html = renderAnsList();
    else if(state.screen === 'ans-paper') html = renderAnsPaper();
    else if(state.screen === 'ans-entry') html = renderAnsEntry();
    else if(state.screen === 'x-loading') html = loadingScreen('Loading…');
    else if(state.screen === 'finder') html = renderFinder();
    else if(state.screen === 'taals') html = renderTaals();
    else if(state.screen === 'glossary') html = renderGlossary();
    else if(state.screen === 'flags') html = renderFlags();
    else if(state.screen === 'players-loading') html = renderPlayersLoading();
    else if(state.screen === 'players') html = renderPlayers();
    else if(state.screen === 'player') html = renderPlayer();
    else if(state.screen === 'search') html = renderSearch();
    else if(state.screen === 'qa') html = renderQA();

    let tab = state.screen.startsWith('read') ? 'read' : state.screen.startsWith('quiz') ? 'quiz' : state.screen.startsWith('ans') ? 'ans' : (state.screen === 'search' || state.screen === 'qa') ? 'search' : 'home';
    if(state.screen.startsWith('player')) tab = 'players';
    html += `<nav class="tabs">
      <button data-href="#/" class="${tab==='home'?'active':''}"><span class="deva">होम</span><span class="en">Home</span></button>
      <button data-href="#/read" class="${tab==='read'?'active':''}"><span class="deva">पढ़ें</span><span class="en">Read</span></button>
      <button data-href="#/quiz" class="${tab==='quiz'?'active':''}"><span class="deva">अभ्यास</span><span class="en">Quiz</span></button>
      <button data-href="#/answers" class="${tab==='ans'?'active':''}"><span class="deva">उत्तर</span><span class="en">Answers</span></button>
      <button data-href="#/search" class="${tab==='search'?'active':''}"><span class="deva">खोजें</span><span class="en">Search</span></button>
    </nav>`;
    root.innerHTML = html;
    if(keep !== false) root.querySelectorAll('.screen').forEach(e => e.classList.add('noanim'));   // fade only on a new screen/question, not on every tap
    bind();
    // new screen or new question -> top; in-page toggles (language, full chapter, theme, answering) keep the place
    window.scrollTo(0, keep === false ? 0 : y);
    if(state.screen === 'search') wireSearch();
    wireX();
    root.querySelectorAll('select[data-pf]').forEach(el => el.addEventListener('change', () => { state.pf[el.getAttribute('data-pf')] = el.value; render(); }));
    if(state.jump && !/^ans-(loading|error)$/.test(state.screen)) applyJump();
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
    const hashRaw = (location.hash || '').replace(/^#\/?/, ''), qi = hashRaw.indexOf('?');
    const p = (qi < 0 ? hashRaw : hashRaw.slice(0, qi)).split('/').filter(Boolean);
    const qp = new URLSearchParams(qi < 0 ? '' : hashRaw.slice(qi + 1));
    state.confirmExit = false; state.jump = null;
    if(qp.get('h') !== null || (qp.get('q') && p[0] !== 'search')){
      state.jump = { h: qp.get('h') || '', q: qp.get('q') || '', f: qp.get('f') === '1' };
      if(qp.get('l')) state.lang = qp.get('l') === 'deva' ? 'deva' : 'en';
      if(qp.get('q')) state.q = qp.get('q');
    }
    if(!p.length) state.screen = 'home';
    else if(p[0] === 'read' && p[1]){
      const n = parseInt(p[1], 10);
      if(CARDS.some(c => c.num === n)){ state.currentTopic = n; state.fullChapOpen = !!(state.jump && state.jump.f); state.screen = 'read-topic'; markRead(n); }
      else state.screen = 'read-list';
    }
    else if(p[0] === 'read') state.screen = 'read-list';
    else if(p[0] === 'questions'){
      if(!ANSWERS){
        state.screen = 'x-loading'; render(false);
        loadAnswers().then(() => { if(state.screen === 'x-loading') route(); })
          .catch(e => { state.screen = 'ans-error'; state.answersError = String(e && e.message || e); render(false); });
        return;
      }
      state.screen = 'finder';
    }
    else if(p[0] === 'taals' || p[0] === 'glossary' || p[0] === 'flags'){
      const nm = p[0] === 'taals' ? 'taal' : p[0];
      if(!(XDATA[nm] && XDATA[nm].d)){
        state.screen = 'x-loading'; render(false);
        loadX(nm).then(() => { if(state.screen === 'x-loading') route(); })
          .catch(e => { state.screen = 'ans-error'; state.answersError = String(e && e.message || e); render(false); });
        return;
      }
      state.screen = p[0];
    }
    else if(p[0] === 'players'){
      if(!PLAYERS){
        state.screen = 'players-loading'; render(false);
        loadPlayers().then(() => { if(state.screen === 'players-loading') route(); })
          .catch(e => { state.screen = 'ans-error'; state.answersError = String(e && e.message || e); render(false); });
        return;
      }
      state.curPlayer = p[1] ? (playerById(p[1]) || null) : null;
      state.screen = state.curPlayer ? 'player' : 'players';
    }
    else if(p[0] === 'search'){ state.q = qp.get('q') || ''; state.screen = 'search'; }
    else if(p[0] === 'qa'){ state.curQA = QUIZ.find(x => String(x.id) === p[1]) || null; state.screen = state.curQA ? 'qa' : 'quiz-list'; }
    else if(p[0] === 'quiz' && p[1] === 'run'){
      const sec = secFromKey(p[2]);
      if(sec === null) state.screen = 'quiz-list'; else beginQuiz(sec);
    }
    else if(p[0] === 'quiz') state.screen = 'quiz-list';
    else if(p[0] === 'result'){ if(!loadResult(p)) state.screen = 'quiz-list'; }
    else if(p[0] === 'answers'){
      if(!ANSWERS){
        state.screen = 'ans-loading'; render(false);
        loadAnswers().then(() => { if(state.screen === 'ans-loading') route(); })
          .catch(e => { state.screen = 'ans-error'; state.answersError = String(e && e.message || e); render(false); });
        return;
      }
      const paper = p[1] && paperByKey(p[1]);
      const ent = paper && p[2] && paper.entries.find(x => String(x.order) === p[2]);
      if(ent){ state.curPaper = paper.key; state.curEntry = ent.order; state.screen = 'ans-entry'; }
      else if(paper){ state.curPaper = paper.key; state.screen = 'ans-paper'; }
      else state.screen = 'ans-list';
    }
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
