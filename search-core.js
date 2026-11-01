/* Avartan search core: shared by the build script (Node) and the app (browser).
   Same code builds the index and reads the query, so spellings are always treated identically. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AvCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEVA_RE = /[ऀ-ॿ]/;
  // words = fractions (5/4), or runs of Latin letters/digits/Devanagari (danda and abbreviation sign excluded)
  var TOK_RE = /[0-9०-९]+\/[0-9०-९]+|[A-Za-z0-9À-ɏḀ-ỿऀ-ॣ०-९ॱ-ॿ]+/g;

  function tokenize(s) { return String(s).replace(/['’`]/g, '').match(TOK_RE) || []; }
  function hasDeva(s) { return DEVA_RE.test(s); }

  function normDeva(w) {
    w = w.normalize('NFD').replace(/़/g, '').normalize('NFC');            // nukta
    w = w.replace(/[‌‍]/g, '');
    w = w.replace(/[०-९]/g, function (d) { return String(d.charCodeAt(0) - 0x0966); });   // Devanagari digits
    w = w.replace(/ँ/g, 'ं');                                          // chandrabindu -> anusvara
    // nasal + halant + stop consonant -> anusvara (सङ्गत / सन्गत / संगत ; हिन्दी / हिंदी)
    w = w.replace(/[ङञणनम]्(?=[क-घच-झट-ढत-धप-भ])/g, 'ं');
    w = w.replace(/ी/g, 'ि').replace(/ू/g, 'ु');            // long ee/oo matra -> short
    w = w.replace(/ई/g, 'इ').replace(/ऊ/g, 'उ');            // long ee/oo vowel -> short
    w = w.replace(/ऑ/g, 'ओ').replace(/ॉ/g, 'ो');            // ऑ/ॉ -> ओ/ो
    return w;
  }
  function normRoman(w) {
    w = w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    w = w.replace(/q/g, 'k').replace(/w/g, 'v').replace(/z/g, 'j').replace(/x/g, 'ks');
    w = w.replace(/ph/g, 'f').replace(/sh/g, 's').replace(/ch+/g, 'c');
    w = w.replace(/ee|ii|ie/g, 'i').replace(/oo|uu/g, 'u').replace(/ay/g, 'ai');
    w = w.replace(/(.)\1+/g, '$1');                                              // aa->a, tt->t, ll->l ...
    return w;
  }
  // one normalised form for any word, either script
  function normTerm(w) {
    if (!w) return '';
    w = String(w).normalize('NFC');
    if (/^[0-9]+\/[0-9]+$/.test(w) || /^[0-9]+$/.test(w)) return w;
    return hasDeva(w) ? normDeva(w) : normRoman(w);
  }

  // ---- sound skeleton: consonants only, so Roman and Devanagari spellings of one word meet ----
  var DEV_C = {'क':'k','ख':'kh','ग':'g','घ':'gh','ङ':'n','च':'c','छ':'c','ज':'j','झ':'jh','ञ':'n',
    'ट':'t','ठ':'th','ड':'d','ढ':'dh','ण':'n','त':'t','थ':'th','द':'d','ध':'dh','न':'n',
    'प':'p','फ':'f','ब':'b','भ':'bh','म':'m','य':'y','र':'r','ल':'l','ळ':'l','व':'v',
    'श':'s','ष':'s','स':'s','ह':'h'};
  function skelOf(n) {            // n is already normTerm'd
    var out = '', prevVowel = false, i, ch, m;
    if (hasDeva(n)) {
      for (i = 0; i < n.length; i++) {
        ch = n[i];
        if (DEV_C[ch]) {
          m = DEV_C[ch];
          if ((m === 'y' || m === 'v') && out.length && prevVowel) { prevVowel = false; continue; }
          out += m; prevVowel = true;
        } else if (ch === 'ं') { out += 'n'; prevVowel = false; }
        else if ((ch >= 'ा' && ch <= 'ौ') || (ch >= 'ऄ' && ch <= 'औ')) prevVowel = true;
        else if (ch === '्') prevVowel = false;
      }
    } else {
      for (i = 0; i < n.length; i++) {
        ch = n[i];
        if ('aeiou'.indexOf(ch) >= 0) { prevVowel = true; continue; }
        if (!/[a-z]/.test(ch)) { continue; }
        if ((ch === 'y' || ch === 'v') && out.length && prevVowel) { continue; }
        out += ch; prevVowel = false;
      }
    }
    return out.replace(/(.)\1+/g, '$1');
  }
  function skel(n) { var s = skelOf(n); return s.length >= 3 && !/^[0-9]/.test(n) ? s : ''; }

  var STOP = {};
  ('a an the of in on at to for and or is are was be by with as from this that these those it its what which who whom how why when where ' +
   'write note notes explain describe give any one two three four five six seven following about between into than then also not no yes only ' +
   'के का की में है और से को पर एक या यह वह इस उस कि भी ही ने तो हैं था थे थी लिखें लिखिए बताइए').split(' ').forEach(function (w) { STOP[w] = 1; });

  // split long answer text into passages of about 320 chars (same function in build and app)
  function chunkText(text) {
    var lines = String(text).split(/\n+/), out = [], cur = '', i, ln;
    for (i = 0; i < lines.length; i++) {
      ln = lines[i].replace(/\s*\|\s*/g, ' · ').replace(/[ \t ]+/g, ' ').trim();
      if (!ln) continue;
      if (cur && (cur.length + ln.length) > 320) { out.push(cur); cur = ''; }
      cur = cur ? cur + ' ' + ln : ln;
      while (cur.length > 520) {                         // very long single line: cut at a space
        var cut = cur.lastIndexOf(' ', 420); if (cut < 200) cut = 420;
        out.push(cur.slice(0, cut)); cur = cur.slice(cut).trim();
      }
    }
    if (cur) out.push(cur);
    return out;
  }
  // letters/digits only: used to find a passage inside the rendered answer
  function keyOf(s) {
    s = String(s).normalize('NFC').toLowerCase(); var o = '', i, c;
    for (i = 0; i < s.length; i++) { c = s[i]; if (/[a-z0-9ऀ-ॣ०-ॿ]/.test(c)) o += c; }
    return o;
  }

  function msOptions() {
    return {
      idField: 'id', fields: ['t', 'x', 'k'], storeFields: ['ty', 'ti', 'sr', 'tx', 'u', 'g', 'l'],
      tokenize: function (s, field) { return field === 'k' ? String(s).split(' ').filter(Boolean) : tokenize(s); },
      processTerm: function (t, field) { return field === 'k' ? t : (normTerm(t) || null); }
    };
  }
  // skeleton words of a text, for the k field
  function skelText(text) {
    var seen = {}, out = [], toks = tokenize(text), i, s;
    for (i = 0; i < toks.length; i++) { s = skel(normTerm(toks[i])); if (s && !seen[s]) { seen[s] = 1; out.push(s); } }
    return out.join(' ');
  }
  return { tokenize: tokenize, normTerm: normTerm, skel: skel, skelText: skelText, hasDeva: hasDeva, STOP: STOP,
           chunkText: chunkText, keyOf: keyOf, msOptions: msOptions };
});
