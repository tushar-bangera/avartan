/* Avartan search engine (browser + Node). Needs AvCore and MiniSearch. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.AvSearch = factory(root.AvCore, root.MiniSearch);
})(typeof self !== 'undefined' ? self : this, function (C, MiniSearch) {
  'use strict';
  var ms = null, groups = {}, ready = false;
  function setup(data) {
    ms = MiniSearch.loadJS(data.ms, C.msOptions());
    groups = {};
    data.aliases.forEach(function (g, gi) {
      g.forEach(function (w) {
        var toks = C.tokenize(w); if (toks.length !== 1) return;
        var n = C.normTerm(toks[0]); (groups[n] = groups[n] || []).push(gi);
      });
    });
    groups._list = data.aliases; ready = true; return api;
  }
  function aliasWords(n) {          // single and multi word alternatives for one normalised token
    var out = [], gl = groups[n] || [], i, j;
    for (i = 0; i < gl.length; i++) for (j = 0; j < groups._list[gl[i]].length; j++) out.push(groups._list[gl[i]][j]);
    return out;
  }
  function termSpecs(tok) {
    var n = C.normTerm(tok), specs = [], seen = {}, sk;
    function push(s) { if (!seen[s.key]) { seen[s.key] = 1; specs.push(s.q); } }
    var isNum = /^[0-9]+(\/[0-9]+)?$/.test(n);
    push({ key: 'w' + n, q: isNum ? { queries: [n], fields: ['t', 'x'], prefix: false, fuzzy: 0 } :
      { queries: [tok], fields: ['t', 'x'], combineWith: 'OR', prefix: n.length >= 3, fuzzy: n.length >= 5 ? 0.2 : (n.length === 4 ? 0.1 : 0), boost: { t: 3 } } });
    if (!isNum) {
      sk = C.skel(n);
      if (sk) push({ key: 'k' + sk, q: { queries: [sk], fields: ['k'], prefix: false, fuzzy: sk.length >= 6 ? 0.15 : 0, weights: { fuzzy: 0.3, prefix: 0.3 } } });
      aliasWords(n).forEach(function (w) {
        var tk = C.tokenize(w), nn = tk.map(C.normTerm).join(' ');
        if (tk.length === 1) {
          push({ key: 'w' + nn, q: { queries: [nn], fields: ['t', 'x'], prefix: false, fuzzy: 0 } });
          var s2 = C.skel(nn); if (s2) push({ key: 'k' + s2, q: { queries: [s2], fields: ['k'], prefix: false, fuzzy: 0 } });
        } else {
          push({ key: 'm' + nn, q: { combineWith: 'AND', fields: ['t', 'x'], prefix: false, fuzzy: 0, queries: tk.map(function (t) { return C.normTerm(t); }) } });
        }
      });
    }
    return specs;
  }
  function highlightTerms(tokens) {      // set of normalised words and skeletons to mark in a page
    var set = {}; tokens.forEach(function (t) {
      var n = C.normTerm(t); set[n] = 1; var s = C.skel(n); if (s) set['~' + s] = 1;
      aliasWords(n).forEach(function (w) { C.tokenize(w).forEach(function (x) { var m = C.normTerm(x); set[m] = 1; var s2 = C.skel(m); if (s2) set['~' + s2] = 1; }); });
    }); return set;
  }
  function search(q, limit) {
    if (!ready) return { results: [], tokens: [] };
    var all = C.tokenize(q), tokens = all.filter(function (t) { return !C.STOP[t.toLowerCase()]; });
    if (!tokens.length) tokens = all;
    if (!tokens.length) return { results: [], tokens: [] };
    var perTok = tokens.map(function (t) { return { combineWith: 'OR', queries: termSpecs(t) }; });
    var res = ms.search({ combineWith: 'AND', queries: perTok }, { boost: { t: 3 } });
    var mode = 'and';
    if (!res.length && tokens.length > 1) {          // forgive one unmatched word
      var map = {}, i;
      perTok.forEach(function (pt) { ms.search(pt).forEach(function (r) { var m = map[r.id] || (map[r.id] = { r: r, n: 0, s: 0 }); m.n++; m.s += r.score; }); });
      res = Object.keys(map).map(function (k) { var m = map[k]; m.r.score = m.s * (m.n / tokens.length) * (m.n / tokens.length); return m.r; })
        .filter(function (r) { return true; }).sort(function (a, b) { return b.score - a.score; });
      var need = Math.max(1, tokens.length - 1);
      res = res.filter(function (r) { return map[r.id].n >= need; }); mode = 'or';
    }
    // boost passages where the words appear together / as an exact phrase, and prefer the question line
    var phrase = tokens.map(C.normTerm).join(' ');
    res.forEach(function (r) {
      var low = C.tokenize(r.tx || '').map(C.normTerm).join(' ');
      if (tokens.length > 1 && low.indexOf(phrase) >= 0) r.score *= 1.8;
      var tt = C.tokenize(r.ti || '').map(C.normTerm).join(' ');
      if (tt.indexOf(phrase) >= 0) r.score *= 1.5;
    });
    res.forEach(function (r) { if (r.ty === 'g') r.score *= 1.7; else if (r.ty === 't' || r.ty === 's') r.score *= 1.3; });
    res.sort(function (a, b) { return b.score - a.score; });
    // one passage per (page, anchor)
    var seen = {}, out = [];
    for (var j = 0; j < res.length; j++) { var key = res[j].u + '|' + res[j].g; if (seen[key]) continue; seen[key] = 1; out.push(res[j]); if (out.length >= (limit || 40)) break; }
    return { results: out, tokens: tokens, mode: mode };
  }
  var api = { setup: setup, search: search, highlightTerms: highlightTerms, isReady: function () { return ready; } };
  return api;
});
