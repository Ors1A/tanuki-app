'use strict';
const $ = s => document.querySelector(s);
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento: segue sem cache */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
};

let pin = LS.get('tanuki_pin') || '';
let dados = null;
let aba = 'dashboard';
let busca = { etq: '', custo: '' };
let rodadaSel = 0;
let calc = { prato: '', n: null };

// ---------- utilidades ----------
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = n => (n == null || isNaN(n)) ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = f => (f == null || isNaN(f)) ? '—' : (f * 100).toFixed(0) + '%';
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(n) < 10 ? 2 : 1 });
const foneLink = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 10 ? 'https://wa.me/' + (d.length <= 11 ? '55' + d : d) : ''; };

// ---------- dados ----------
async function buscar() {
  const r = await fetch(window.TANUKI_API, { method: 'POST', body: JSON.stringify({ pin }), redirect: 'follow' });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.erro || 'erro'); e.senha = j.erro === 'senha'; e.bloqueado = j.erro === 'bloqueado'; throw e; }
  return j;
}

async function atualizar(silencioso) {
  const btn = $('#btn-atualizar');
  btn.classList.add('gira');
  try {
    dados = await buscar();
    LS.set('tanuki_dados', JSON.stringify(dados));
    $('#status').textContent = 'Atualizado ' + new Date(dados.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    desenhar();
  } catch (e) {
    if (e.senha) { sair(); $('#login-erro').textContent = 'Senha incorreta.'; return; }
    if (e.bloqueado) { $('#status').textContent = 'Bloqueado 15 min (senhas erradas)'; return; }
    if (!silencioso || !dados) $('#status').textContent = 'Sem conexão';
    else $('#status').textContent = 'Offline · dados salvos';
  } finally {
    btn.classList.remove('gira');
  }
}

function entrar() {
  $('#login').hidden = true; $('#app').hidden = false;
  try { dados = JSON.parse(LS.get('tanuki_dados')); } catch (e) { dados = null; }
  if (dados) { $('#status').textContent = 'Salvo ' + new Date(dados.geradoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); desenhar(); }
  else $('#tela').innerHTML = '<p class="mudo">Carregando…</p>';
  atualizar(true);
}

function sair() {
  pin = ''; dados = null;
  LS.del('tanuki_pin'); LS.del('tanuki_dados');
  $('#app').hidden = true; $('#login').hidden = false; $('#pin').value = '';
}

// ---------- telas ----------
function desenhar() {
  if (dados && !dados.producao && aba === 'producao') aba = 'dashboard';
  $('[data-aba="producao"]').hidden = !(dados && dados.producao); // só aparece quando o Apps Script envia os pedidos
  document.querySelectorAll('#abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  if (!dados) return;
  const tela = $('#tela');
  tela.innerHTML = aba === 'dashboard' ? telaDashboard() : aba === 'receitas' ? telaReceitas() : aba === 'producao' ? telaProducao()
    : aba === 'etiquetas' ? telaEtiquetas() : telaCustos();
  ligar();
}

function grafico(serie) {
  if (!serie || serie.length < 2) return '<p class="mudo">Ainda não há dias suficientes para o gráfico.</p>';
  const W = 320, H = 150, p = 24;
  const max = Math.max.apply(null, serie.map(s => Math.max(s.faturamento, s.lucro, 1)));
  const min = Math.min(0, Math.min.apply(null, serie.map(s => s.lucro)));
  const x = i => p + i * (W - 2 * p) / (serie.length - 1);
  const y = v => H - p - (v - min) / (max - min) * (H - 2 * p);
  const linha = (k, cor) => '<polyline fill="none" stroke="' + cor + '" stroke-width="2.5" points="' +
    serie.map((s, i) => x(i).toFixed(1) + ',' + y(s[k]).toFixed(1)).join(' ') + '"/>' +
    serie.map((s, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(s[k]).toFixed(1) + '" r="3" fill="' + cor + '"/>').join('');
  const rot = serie.map((s, i) => (i === 0 || i === serie.length - 1 || serie.length <= 6)
    ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" font-size="9" text-anchor="middle" fill="#777">' + esc(s.data.slice(8) + '/' + s.data.slice(5, 7)) + '</text>' : '').join('');
  return '<svg class="graf" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Faturamento e lucro por dia">' +
    '<line x1="' + p + '" x2="' + (W - p) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#e6e1da"/>' +
    '<text x="' + p + '" y="12" font-size="9" fill="#777">' + esc(brl(max)) + '</text>' +
    linha('faturamento', '#eb6834') + linha('lucro', '#2a78d6') + rot + '</svg>' +
    '<div class="leg"><span><i style="background:#eb6834"></i>Faturamento</span><span><i style="background:#2a78d6"></i>Lucro</span></div>';
}

function telaDashboard() {
  const d = dados.dashboard, k = d.kpis;
  const opts = d.pratos.map((p, i) => '<option value="' + i + '">' + esc(p.prato) + (p.placeholder ? ' (exemplo)' : '') + '</option>').join('');
  return '<div class="grade">' +
    '<div class="card"><div class="rot">Pratos</div><div class="val">' + esc(k.pratosCadastrados) + '</div></div>' +
    '<div class="card"><div class="rot">Custo médio</div><div class="val l">' + brl(k.custoMedio) + '</div></div>' +
    '<div class="card"><div class="rot">Preço médio</div><div class="val">' + brl(k.precoMedioSugerido) + '</div></div>' +
    '<div class="card"><div class="rot">Margem média</div><div class="val a">' + pct(k.margemMedia) + '</div></div></div>' +
    '<div class="card"><div class="rot">Faturamento × lucro por dia</div>' + grafico(d.serieFaturamentoLucro) + '</div>' +
    '<h2>Prato</h2><select id="sel-prato"><option value="">Selecione um prato…</option>' + opts + '</select><div id="painel-prato"></div>';
}

function painelPrato(p) {
  if (!p) return '';
  let h = (p.placeholder ? '<div class="aviso">Dados de exemplo: esta ficha ainda não tem aba própria na planilha.</div>' : '') +
    '<div class="grade" style="grid-template-columns:repeat(3,1fr)">' +
    '<div class="card"><div class="rot">Custo</div><div class="val l">' + brl(p.custoTotalPrato) + '</div></div>' +
    '<div class="card"><div class="rot">Preço</div><div class="val">' + brl(p.precoVendaSugerido) + '</div></div>' +
    '<div class="card"><div class="rot">Margem</div><div class="val a">' + pct(p.margem) + '</div></div></div>';
  if (p.ingredientes && p.ingredientes.length) {
    h += '<div class="card"><table><thead><tr><th>Ingrediente</th><th class="n">Qtd</th><th class="n">Custo</th></tr></thead><tbody>' +
      p.ingredientes.map(i => '<tr><td>' + esc(i.nome) + '</td><td class="n">' + esc(i.quantidade == null ? '—' : i.quantidade + ' ' + (i.unidade || '')) + '</td><td class="n">' + brl(i.custoIngrediente) + '</td></tr>').join('') +
      '</tbody></table></div>';
  }
  return h;
}

// ---------- receitas e calculadora de porções ----------
function pratosReceita() {
  return (dados.dashboard.pratos || []).filter(p => !p.placeholder && p.ingredientes && p.ingredientes.length)
    .sort((a, b) => (a.categoria === 'Verão' ? 0 : 1) - (b.categoria === 'Verão' ? 0 : 1));
}

function telaReceitas() {
  const lista = pratosReceita();
  if (!lista.length) return '<p class="mudo">Nenhuma receita encontrada na planilha.</p>';
  const p = lista.find(x => x.prato === calc.prato);
  const opts = lista.map(x => '<option value="' + esc(x.prato) + '"' + (x === p ? ' selected' : '') + '>' + esc(x.prato) + '</option>').join('');
  return '<select id="sel-receita"><option value="">Selecione uma receita…</option>' + opts + '</select>' + painelReceita(p);
}

function painelReceita(p) {
  if (!p) return '<p class="mudo">Escolha uma receita para ver os ingredientes e ajustar as porções.</p>';
  const base = p.rendimentoPorcoes || 1;
  if (calc.n == null) calc.n = base;
  const pre = [1, 5, 10, 20].map(v => '<button data-n="' + v + '" class="' + (calc.n === v ? 'on' : '') + '">' + v + '</button>').join('');
  return '<div class="card"><div class="rot">Quantas porções?</div>' +
    '<div class="calc"><input id="calc-n" type="number" inputmode="decimal" min="0" step="any" value="' + esc(calc.n) + '">' + pre + '</div>' +
    '<p class="mudo">A ficha da planilha rende ' + num(base) + ' porção(ões).</p>' +
    '<div id="tab-receita">' + tabelaReceita(p, calc.n) + '</div></div>' + passos(p);
}

function tabelaReceita(p, n) {
  const f = n / (p.rendimentoPorcoes || 1);
  return '<table><thead><tr><th>Ingrediente</th><th class="n">Quantidade</th></tr></thead><tbody>' +
    p.ingredientes.map(i => '<tr><td>' + esc(i.nome) + '</td><td class="qtd">' +
      (i.quantidade == null ? '—' : num(i.quantidade * f) + ' ' + esc(i.unidade || '')) + '</td></tr>').join('') + '</tbody></table>';
}

function passos(p) {
  const m = p.modoPreparo;
  const t = (Array.isArray(m) ? m : String(m || '').split(/\n+/)).map(x => String(x).trim()).filter(Boolean);
  if (!t.length) return '<p class="mudo">Modo de preparo ainda não cadastrado para esta receita.</p>';
  return '<div class="card"><div class="rot">Modo de preparo</div><ol class="passos">' + t.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>';
}

// ---------- produção do dia (dados.producao vem do Apps Script) ----------
function acharFicha(nome) {
  const n = norm(nome), l = pratosReceita();
  return l.find(p => norm(p.prato) === n) || l.find(p => norm(p.prato).includes(n) || n.includes(norm(p.prato)));
}

function telaProducao() {
  const pr = dados.producao;
  const itens = pr.itens || [];
  const soma = {}, semReceita = [];
  itens.forEach(it => {
    const f = acharFicha(it.item);
    if (!f) { semReceita.push(it.item); return; }
    const fator = it.quantidade / (f.rendimentoPorcoes || 1);
    f.ingredientes.forEach(i => {
      const k = norm(i.nome) + '|' + (i.unidade || '');
      soma[k] = soma[k] || { nome: i.nome, un: i.unidade || '', q: 0 };
      soma[k].q += (i.quantidade || 0) * fator;
    });
  });
  const ing = Object.keys(soma).map(k => soma[k]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const linha = (a, b) => '<div class="sub"><span>' + a + '</span><b>' + b + '</b></div>';
  const pedidos = (pr.pedidos || []).map(p => {
    const link = foneLink(p.telefone);
    const its = (p.itens || []).map(i => linha(esc(i.item), esc(i.quantidade) + '×')).join('') +
      (p.adicionais || []).map(a => linha('+ ' + esc(a.adicional), esc(a.quantidade) + '×')).join('');
    return '<div class="card"><div class="etq"><div><b>' + esc(p.cliente) + '</b>' +
      (p.status ? '<span class="tag">' + esc(p.status) + '</span>' : '') + '</div><div>' +
      (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(p.telefone) + '</a>' : esc(p.telefone || '')) + '</div></div>' + its + '</div>';
  }).join('');
  return '<p class="mudo">' + (pr.leva ? esc(pr.leva) + ' · ' : '') + (pr.pedidos || []).length + ' pedidos</p>' +
    '<h2>A produzir</h2><div class="card">' + (itens.map(i => linha(esc(i.item), esc(i.quantidade) + '×')).join('') || '<p class="mudo">Nenhum pedido pago.</p>') + '</div>' +
    '<h2>Ingredientes para esta produção</h2><div class="card">' + (ing.map(i => linha(esc(i.nome), num(i.q) + ' ' + esc(i.un))).join('') || '<p class="mudo">Sem receitas para somar.</p>') + '</div>' +
    (semReceita.length ? '<p class="aviso">Sem ficha na planilha, não somados: ' + esc(semReceita.join(', ')) + '</p>' : '') +
    '<h2>Pedidos por cliente</h2>' + (pedidos || '<p class="mudo">Nenhum pedido.</p>');
}

function telaEtiquetas() {
  const abas = dados.etiquetas || [];
  if (!abas.length) return '<p class="mudo">Nenhuma aba de etiquetas encontrada nas planilhas de pedidos.</p>';
  const lista = abas.slice().reverse();
  if (rodadaSel >= lista.length) rodadaSel = 0;
  const r = lista[rodadaSel];
  const q = norm(busca.etq);
  const linhas = r.linhas.filter(l => !q || norm(l.join(' ')).includes(q));
  const clientes = new Set(r.linhas.map(l => l[0])).size;
  const sel = '<select id="sel-rodada">' + lista.map((a, i) => '<option value="' + i + '"' + (i === rodadaSel ? ' selected' : '') + '>' + esc(a.aba) + '</option>').join('') + '</select>';
  const itens = linhas.map(l => {
    const link = foneLink(l[1]);
    const extras = l.slice(3).filter(Boolean).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="card etq"><div><b>' + esc(l[0]) + '</b>' + esc(l[2]) + '<br>' + extras + '</div>' +
      '<div>' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(l[1]) + '</a>' : esc(l[1])) + '</div></div>';
  }).join('');
  return sel + '<input type="search" id="busca-etq" placeholder="Buscar cliente, item…" value="' + esc(busca.etq) + '">' +
    '<p class="mudo">' + r.linhas.length + ' etiquetas · ' + clientes + ' clientes' + (q ? ' · ' + linhas.length + ' na busca' : '') + '</p>' +
    (itens || '<p class="mudo">Nada encontrado.</p>');
}

function telaCustos() {
  const q = norm(busca.custo);
  const pratos = dados.dashboard.pratos.filter(p => !q || norm(p.prato).includes(q));
  const insumos = Object.keys(dados.insumos || {}).map(k => dados.insumos[k]).filter(i => !q || norm(i.nome).includes(q));
  const fichas = pratos.map(p => '<details class="card"><summary><span>' + esc(p.prato) + (p.placeholder ? ' <span class="mudo">(exemplo)</span>' : '') +
    '</span><span class="pill">' + brl(p.custoTotalPrato) + '</span></summary>' + painelPrato(p) + '</details>').join('');
  const tab = insumos.length ? '<div class="card"><table><thead><tr><th>Insumo</th><th class="n">Custo/un.</th></tr></thead><tbody>' +
    insumos.map(i => '<tr><td>' + esc(i.nome) + (i.observacao ? '<br><span class="mudo">' + esc(i.observacao) + '</span>' : '') + '</td><td class="n">' +
      brl(i.custoUnitario) + (i.unidade ? '<br><span class="mudo">por ' + esc(i.unidade) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="mudo">Nenhum insumo encontrado.</p>';
  return '<input type="search" id="busca-custo" placeholder="Buscar prato ou insumo…" value="' + esc(busca.custo) + '">' +
    '<h2>Custo por prato</h2>' + (fichas || '<p class="mudo">Nenhum prato encontrado.</p>') + '<h2>Insumos</h2>' + tab +
    '<button class="sair" id="btn-sair">Sair e apagar dados deste aparelho</button>';
}

function ligar() {
  const sp = $('#sel-prato');
  if (sp) sp.onchange = () => { $('#painel-prato').innerHTML = painelPrato(dados.dashboard.pratos[sp.value]); };
  const se = $('#sel-receita');
  if (se) se.onchange = () => { calc.prato = se.value; calc.n = null; desenhar(); };
  const cn = $('#calc-n');
  if (cn) cn.oninput = () => {
    const v = parseFloat(String(cn.value).replace(',', '.'));
    const p = pratosReceita().find(x => x.prato === calc.prato);
    if (!(v >= 0) || !p) return;
    calc.n = v; $('#tab-receita').innerHTML = tabelaReceita(p, v);
    document.querySelectorAll('.calc button').forEach(b => b.classList.toggle('on', +b.dataset.n === v));
  };
  document.querySelectorAll('.calc button').forEach(b => b.onclick = () => { calc.n = +b.dataset.n; desenhar(); });
  const sr = $('#sel-rodada');
  if (sr) sr.onchange = () => { rodadaSel = +sr.value; desenhar(); };
  const be = $('#busca-etq');
  if (be) be.oninput = () => { busca.etq = be.value; refazerBusca('#busca-etq'); };
  const bc = $('#busca-custo');
  if (bc) bc.oninput = () => { busca.custo = bc.value; refazerBusca('#busca-custo'); };
  const bs = $('#btn-sair');
  if (bs) bs.onclick = () => { if (confirm('Sair e apagar os dados salvos neste aparelho?')) sair(); };
}

// redesenha mantendo o foco e o cursor na caixa de busca
function refazerBusca(sel) {
  const pos = $(sel).selectionStart;
  desenhar();
  const el = $(sel); el.focus(); el.setSelectionRange(pos, pos);
}

// ---------- início ----------
document.querySelectorAll('#abas button').forEach(b => b.onclick = () => { aba = b.dataset.aba; desenhar(); window.scrollTo(0, 0); });
$('#btn-atualizar').onclick = () => atualizar(false);
$('#form-login').onsubmit = async ev => {
  ev.preventDefault();
  pin = $('#pin').value.trim();
  $('#login-erro').textContent = 'Entrando…';
  try {
    dados = await buscar();
    LS.set('tanuki_pin', pin); LS.set('tanuki_dados', JSON.stringify(dados));
    $('#login-erro').textContent = '';
    entrar();
  } catch (e) {
    $('#login-erro').textContent = e.senha ? 'Senha incorreta.'
      : e.bloqueado ? 'Muitas senhas erradas. Espere 15 minutos.'
      : 'Não consegui conectar. Confira a internet.';
  }
};
document.addEventListener('visibilitychange', () => { if (!document.hidden && pin && !$('#app').hidden) atualizar(true); });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (pin) entrar(); else $('#login').hidden = false;
