import http from 'http';
import OpenAI from 'openai';
import { runComparison } from './scenarios/20260607-comparison.js';
import type { TurnResult } from './utils/display.js';

const PORT = 3000;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error('OPENAI_API_KEY not set');
  process.exit(1);
}

const client = new OpenAI({ apiKey });

const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Prompt Caching POC</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'SF Mono', 'Fira Code', Consolas, monospace; background: #0f172a; color: #e2e8f0; min-height: 100vh; padding: 2rem; }
h1 { text-align: center; margin-bottom: 0.25rem; font-size: 1.4rem; color: #f8fafc; }
.subtitle { text-align: center; color: #475569; font-size: 0.78rem; margin-bottom: 1.5rem; }
.status { text-align: center; margin-bottom: 0.8rem; font-size: 0.82rem; min-height: 1.2em; color: #94a3b8; }
.btn { display: block; margin: 0 auto 1.5rem; padding: 0.55rem 2rem; background: #3b82f6; color: white; border: none; border-radius: 8px; font-family: inherit; font-size: 0.88rem; cursor: pointer; transition: background 0.15s; }
.btn:hover:not(:disabled) { background: #2563eb; }
.btn:disabled { background: #1e40af; opacity: 0.55; cursor: default; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; }
.panel { background: #1e293b; border-radius: 12px; padding: 1.25rem; }
.panel-title { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.2rem; font-weight: bold; }
.panel-title.a { color: #34d399; }
.panel-title.b { color: #94a3b8; }
.panel-sub { font-size: 0.72rem; color: #475569; margin-bottom: 1rem; }
.turn { background: #0f172a; border-radius: 8px; padding: 0.9rem; margin-bottom: 0.55rem; opacity: 0; animation: fadeIn 0.3s ease forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
.turn-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.65rem; }
.turn-label { font-size: 0.7rem; color: #475569; padding-top: 2px; }
.turn-metrics { text-align: right; }
.ttf-value { font-size: 1.15rem; font-weight: bold; display: block; line-height: 1; }
.total-value { font-size: 0.68rem; color: #475569; display: block; margin-top: 2px; }
.bar-wrap { height: 7px; background: #1e293b; border-radius: 4px; overflow: hidden; margin-bottom: 0.4rem; }
.bar-fill { height: 100%; border-radius: 4px; width: 0%; transition: width 0.55s cubic-bezier(0.4,0,0.2,1); }
.turn-meta { display: flex; justify-content: space-between; font-size: 0.68rem; }
.turn-meta .cost { color: #475569; }
.ttf-label { font-size: 0.58rem; color: #475569; display: block; margin-bottom: 0.1rem; text-transform: uppercase; letter-spacing: 0.05em; }
.comparison { margin-top: 1.5rem; background: #1e293b; border-radius: 12px; padding: 1.25rem; display: none; }
.comparison h2 { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; }
.comp-header { display: flex; gap: 1rem; margin-bottom: 0.4rem; }
.comp-header span { flex: 1; font-size: 0.66rem; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; text-align: right; }
.comp-header span:first-child { text-align: left; flex: 1.4; }
.comp-row { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 0; border-bottom: 1px solid #0f172a; }
.comp-row:last-child { border-bottom: none; }
.comp-label { flex: 1.4; font-size: 0.78rem; color: #94a3b8; }
.comp-a { flex: 1; font-size: 0.82rem; text-align: right; }
.comp-b { flex: 1; font-size: 0.82rem; color: #94a3b8; text-align: right; }
.comp-saving { flex: 1; font-size: 0.82rem; text-align: right; font-weight: bold; }
.ttf-highlight { background: #052e16; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center; }
.ttf-highlight span:first-child { font-size: 0.7rem; color: #4ade80; text-transform: uppercase; letter-spacing: 0.05em; }
.ttf-highlight span:last-child { font-size: 1rem; font-weight: bold; color: #34d399; }
</style>
</head>
<body>
<h1>OpenAI Prompt Caching &mdash; POC</h1>
<p class="subtitle">gpt-4o &middot; system prompt ~10 000 tokens &middot; TTFT = Time to First Token</p>
<p class="status" id="status">Pronto.</p>
<button class="btn" id="runBtn" onclick="startRun()">&#9654; Run POC</button>

<div class="grid">
  <div class="panel">
    <div class="panel-title a">Scenario A &mdash; Cached session</div>
    <div class="panel-sub">Mesmo system prompt em todos os turnos &rarr; TTFT cai drasticamente a partir do turn 2</div>
    <div id="turns-a"></div>
  </div>
  <div class="panel">
    <div class="panel-title b">Scenario B &mdash; Uncached calls</div>
    <div class="panel-sub">Prefixo unico por chamada &rarr; TTFT alto em todos os turnos, cache miss garantido</div>
    <div id="turns-b"></div>
  </div>
</div>

<div class="comparison" id="comparison">
  <h2>Comparacao final</h2>
  <div class="comp-header">
    <span>Metrica</span>
    <span style="color:#34d399">Scenario A</span>
    <span>Scenario B</span>
    <span>Diferenca</span>
  </div>
  <div id="comp-body"></div>
</div>

<script>
var es = null;
var results = { A: [], B: [] };

function startRun() {
  document.getElementById('turns-a').innerHTML = '';
  document.getElementById('turns-b').innerHTML = '';
  document.getElementById('comparison').style.display = 'none';
  document.getElementById('comp-body').innerHTML = '';
  results = { A: [], B: [] };
  document.getElementById('runBtn').disabled = true;
  if (es) es.close();
  es = new EventSource('/run');
  es.onmessage = function(e) { handle(JSON.parse(e.data)); };
  es.onerror = function() {
    setStatus('Conexao encerrada.');
    document.getElementById('runBtn').disabled = false;
    es.close();
  };
}

function handle(data) {
  if (data.type === 'start') {
    setStatus('Rodando chamadas intercaladas: A1, B1, A2, B2 ... (comparacao justa)');
  } else if (data.type === 'result') {
    results[data.scenario].push(data);
    addCard(data);
  } else if (data.type === 'done') {
    setStatus('Concluido!');
    showComparison();
    document.getElementById('runBtn').disabled = false;
  }
}

function ttfColor(ms, scenario) {
  if (scenario === 'B') return '#94a3b8';
  if (ms < 300) return '#34d399';
  if (ms < 800) return '#86efac';
  if (ms < 1500) return '#fbbf24';
  return '#f87171';
}

function addCard(data) {
  var container = document.getElementById('turns-' + data.scenario.toLowerCase());
  var hit = data.cacheHitRate > 0;
  var barColor = hit ? '#34d399' : '#1e293b';
  var barBg = hit ? '#064e3b' : '#1e293b';
  var lColor = ttfColor(data.ttfTokenMs, data.scenario);
  var labelText = hit ? ('Cache hit ' + data.cacheHitRate.toFixed(0) + '%') : 'Cache miss';
  var labelColor = hit ? '#34d399' : '#475569';
  var costText = '$' + data.estimatedCostUsd.toFixed(6);
  var tokenText = data.cachedTokens + ' cached / ' + data.promptTokens + ' total';
  var id = 'bar-' + data.scenario + '-' + data.turn;

  var div = document.createElement('div');
  div.className = 'turn';
  div.innerHTML =
    '<div class="turn-top">' +
      '<span class="turn-label">Turn ' + data.turn + '</span>' +
      '<div class="turn-metrics">' +
        '<span class="ttf-label">TTFT</span>' +
        '<span class="ttf-value" style="color:' + lColor + '">' + data.ttfTokenMs + 'ms</span>' +
        '<span class="total-value">total: ' + data.latencyMs + 'ms</span>' +
      '</div>' +
    '</div>' +
    '<div class="bar-wrap" style="background:' + barBg + '">' +
      '<div class="bar-fill" id="' + id + '" style="background:' + barColor + '"></div>' +
    '</div>' +
    '<div class="turn-meta">' +
      '<span style="color:' + labelColor + '">' + labelText + '</span>' +
      '<span class="cost">' + tokenText + ' &middot; ' + costText + '</span>' +
    '</div>';

  container.appendChild(div);
  setTimeout(function() {
    var bar = document.getElementById(id);
    if (bar) bar.style.width = Math.max(data.cacheHitRate, hit ? 5 : 0) + '%';
  }, 60);
}

function avg(arr, key) { return arr.reduce(function(s, r) { return s + r[key]; }, 0) / arr.length; }
function sum(arr, key) { return arr.reduce(function(s, r) { return s + r[key]; }, 0); }

function showComparison() {
  var aTtf = avg(results.A, 'ttfTokenMs');
  var bTtf = avg(results.B, 'ttfTokenMs');
  var aLat = avg(results.A, 'latencyMs');
  var bLat = avg(results.B, 'latencyMs');
  var aCost = sum(results.A, 'estimatedCostUsd');
  var bCost = sum(results.B, 'estimatedCostUsd');
  var aHit = avg(results.A, 'cacheHitRate');

  var ttfSaving = ((bTtf - aTtf) / bTtf) * 100;
  var latSaving = ((bLat - aLat) / bLat) * 100;
  var costSaving = ((bCost - aCost) / bCost) * 100;

  var rows = [
    { label: 'TTFT medio (principal)', a: aTtf.toFixed(0) + 'ms', b: bTtf.toFixed(0) + 'ms', saving: ttfSaving },
    { label: 'Latencia total media', a: aLat.toFixed(0) + 'ms', b: bLat.toFixed(0) + 'ms', saving: latSaving },
    { label: 'Custo total', a: '$' + aCost.toFixed(6), b: '$' + bCost.toFixed(6), saving: costSaving },
    { label: 'Cache hit rate medio', a: aHit.toFixed(0) + '%', b: '0%', saving: null },
  ];

  var html = '';
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var savingHtml;
    if (r.saving !== null) {
      var sColor = r.saving > 0 ? '#34d399' : '#f87171';
      var sSign = r.saving > 0 ? '-' : '+';
      savingHtml = '<span class="comp-saving" style="color:' + sColor + '">' + sSign + Math.abs(r.saving).toFixed(0) + '%</span>';
    } else {
      savingHtml = '<span class="comp-saving" style="color:#64748b">n/a</span>';
    }
    var rowStyle = i === 0 ? ' style="background:#052e16;border-radius:6px;padding:0.5rem;"' : '';
    html += '<div class="comp-row"' + rowStyle + '>' +
      '<span class="comp-label">' + r.label + '</span>' +
      '<span class="comp-a" style="color:#34d399">' + r.a + '</span>' +
      '<span class="comp-b">' + r.b + '</span>' +
      savingHtml +
      '</div>';
  }

  document.getElementById('comp-body').innerHTML = html;
  document.getElementById('comparison').style.display = 'block';
}

function setStatus(msg) { document.getElementById('status').textContent = msg; }
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    return;
  }

  if (req.url === '/run') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const send = (data: object) => res.write('data: ' + JSON.stringify(data) + '\n\n');

    (async () => {
      send({ type: 'start' });
      await runComparison(client, (r: TurnResult & { scenario: 'A' | 'B' }) =>
        send({ type: 'result', ...r })
      );
      send({ type: 'done' });
      res.end();
    })().catch(err => {
      console.error(err);
      res.end();
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log('\nServidor rodando em http://localhost:' + PORT);
  console.log('Abra o browser e clique em "Run POC" para iniciar.\n');
});
