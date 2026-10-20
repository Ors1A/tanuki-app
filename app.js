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
    $('#status').textContent = dados ? 'Offline · dados salvos' : 'Sem conexão';
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
    '<div class="calc"><input id="calc-n" type="text" inputmode="decimal" autocomplete="off" value="' + esc(String(calc.n).replace('.', ',')) + '">' + pre + '</div>' +
    '<p class="erro" id="calc-aviso" role="alert"></p>' +
    '<p class="mudo">A ficha da planilha rende ' + num(base) + ' porção(ões).</p>' +
    '<div id="tab-receita">' + tabelaReceita(p, calc.n) + '</div></div>' + passos(p);
}

function tabelaReceita(p, n) {
  const f = n / (p.rendimentoPorcoes || 1);
  const todos = '<table><thead><tr><th>Ingrediente</th><th class="n">Quantidade</th></tr></thead><tbody>' +
    p.ingredientes.map(i => '<tr><td>' + esc(i.nome) + '</td><td class="qtd">' +
      (i.quantidade == null ? '—' : num(i.quantidade * f) + ' ' + esc(i.unidade || '')) + '</td></tr>').join('') + '</tbody></table>';
  if (!p.montagem || !p.montagem.length) return todos;
  // montagem: quantidade por porção (1 bowl, 1 onigiri) x número de porções
  const aberto = document.querySelector('#tab-receita details.todos');
  return '<table><thead><tr><th>Montagem</th><th class="n">Quantidade</th></tr></thead><tbody>' +
    p.montagem.map(i => '<tr><td>' + esc(i.nome) + (i.obs ? '<br><span class="mudo">' + esc(i.obs) + '</span>' : '') + '</td><td class="qtd">' +
      (i.quantidade == null ? '—' : num(i.quantidade * n) + ' ' + esc(i.unidade || '')) + '</td></tr>').join('') + '</tbody></table>' +
    '<details class="todos"' + (aberto && aberto.open ? ' open' : '') + '><summary class="mudo">Todos os ingredientes (da planilha)</summary>' + todos + '</details>';
}

function listaPassos(m) {
  return (Array.isArray(m) ? m : String(m || '').split(/\n+/)).map(x => String(x).trim()).filter(Boolean);
}

function passos(p) {
  const t = listaPassos(p.modoPreparo);
  const etapas = (p.montagem || []).filter(i => listaPassos(i.modoPreparo).length).map(i =>
    '<div class="card"><div class="rot">Como fazer: ' + esc(i.nome) + '</div><ol class="passos">' + listaPassos(i.modoPreparo).map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>').join('');
  if (!t.length && !etapas) return '<p class="mudo">Modo de preparo ainda não cadastrado para esta receita.</p>';
  return (t.length ? '<div class="card"><div class="rot">Modo de preparo</div><ol class="passos">' + t.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></div>' : '') + etapas;
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

// ---------- contagem das etiquetas (formato novo) ----------
// Vinagrete é grátis e vai em pote separado: conta à parte, não é "adicional".
function resumoEtiquetas(linhas) {
  const r = { oni: {}, poke: {}, adic: {}, acomp: {}, sob: {}, vin: 0 };
  const soma = (o, k, n) => { o[k] = (o[k] || 0) + n; };
  linhas.forEach(l => {
    const prod = String(l[1] || '').trim(), i = prod.indexOf(' - ');
    if (i < 0) return;
    const tipo = norm(prod.slice(0, i)), m = /^(.*?)(?:\s+x(\d+))?$/.exec(prod.slice(i + 3).trim());
    const sabor = m[1], q = m[2] ? +m[2] : 1;
    if (tipo === 'onigiri') soma(r.oni, sabor, q);
    else if (tipo === 'acompanhamento') soma(r.acomp, sabor, q);
    else if (tipo === 'sobremesa') soma(r.sob, sabor, q);
    else if (tipo === 'poke') {
      const p = r.poke[sabor] = r.poke[sabor] || { total: 0, sem: 0, com: 0 };
      const ex = String(l[2] || '').split(',').map(x => x.trim()).filter(Boolean);
      if (ex.some(x => norm(x) === 'vinagrete')) r.vin++;
      const pagos = ex.filter(x => norm(x) !== 'vinagrete');
      p.total++; if (pagos.length) p.com++; else p.sem++;
      pagos.forEach(x => { const mm = /^(\d+)x\s+(.*)$/.exec(x); soma(r.adic, mm ? mm[2] : x, mm ? +mm[1] : 1); });
    }
  });
  return r;
}

function htmlResumo(r) {
  const val = v => typeof v === 'number' ? v : v.total;
  const tot = o => Object.keys(o).reduce((a, k) => a + val(o[k]), 0);
  const lista = (o, fmt) => Object.keys(o).sort((a, b) => val(o[b]) - val(o[a]))
    .map(k => '<div class="sub"><span>' + esc(k) + '</span><b>' + fmt(o[k]) + '</b></div>').join('');
  const bloco = (t, corpo) => corpo ? '<h2>' + t + '</h2><div class="card">' + corpo + '</div>' : '';
  const soma = k => Object.keys(r.poke).reduce((a, n) => a + r.poke[n][k], 0);
  const nOni = tot(r.oni), nPoke = tot(r.poke), nAd = tot(r.adic);
  return '<div class="grade"><div class="card"><div class="rot">Onigiris</div><div class="val l">' + nOni + '</div></div>' +
    '<div class="card"><div class="rot">Pokes</div><div class="val">' + nPoke + '</div></div></div>' +
    bloco('Onigiris por sabor', lista(r.oni, v => v)) +
    bloco('Pokes por sabor', lista(r.poke, v => v.total + ' <span class="mudo">(' + v.sem + ' sem · ' + v.com + ' com adicionais)</span>') +
      (nPoke ? '<div class="sub"><span>Sem adicionais (todos)</span><b>' + soma('sem') + '</b></div>' +
        '<div class="sub"><span>Com adicionais (todos)</span><b>' + soma('com') + '</b></div>' +
        '<div class="sub"><span>Com vinagrete</span><b>' + r.vin + '</b></div>' : '')) +
    bloco('Adicionais dos pokes (' + nAd + ' no total)', lista(r.adic, v => v)) +
    bloco('Acompanhamentos', lista(r.acomp, v => v)) + bloco('Sobremesas', lista(r.sob, v => v));
}

// ---------- imprimir / baixar PDF das etiquetas (mesmo modelo de 10/10) ----------
function nomeBonito(n) {
  if (n !== n.toUpperCase() && n !== n.toLowerCase()) return n;
  return n.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase())
    .replace(/\s(De|Da|Do|Dos|Das)(?=\s|$)/g, x => x.toLowerCase());
}

function linhasEtiqueta(linhas) {
  return linhas.map(l => {
    const prod = String(l[1] || '').trim(), i = prod.indexOf(' - ');
    if (i < 0) return null;
    const m = /^(.*?)(?:\s+x(\d+))?$/.exec(prod.slice(i + 3).trim());
    return { nome: nomeBonito(String(l[0] || '').trim()), tipo: prod.slice(0, i).trim(), sabor: m[1], q: m[2] ? +m[2] : 1, adic: String(l[2] || '').trim() };
  }).filter(Boolean);
}

function rodadaAtual() {
  const lista = (dados && dados.etiquetas || []).slice().reverse();
  return lista[rodadaSel] || lista[0];
}

function htmlComandas(ls, retirada) {
  const pessoas = [];
  ls.forEach(l => {
    let p = pessoas.find(x => x.nome.toLowerCase() === l.nome.toLowerCase());
    if (!p) pessoas.push(p = { nome: l.nome, itens: [] });
    p.itens.push(l);
  });
  const tipos = ['Poke', 'Onigiri', 'Acompanhamento', 'Sobremesa'];
  return '<div class="pgrade">' + pessoas.map(p => {
    const pokes = p.itens.filter(i => i.tipo === 'Poke');
    let k = 0, html = '';
    tipos.forEach(t => {
      const grupo = p.itens.filter(i => i.tipo === t);
      if (!grupo.length) return;
      html += '<h4>' + t + (t === 'Poke' && pokes.length > 1 ? ' (' + pokes.length + ')' : '') + '</h4><ul>' + grupo.map(i => {
        if (t === 'Poke') { k++; return '<li><span><b>' + (pokes.length > 1 ? k + '. ' : '') + esc(i.sabor) + '</b>' + (i.adic ? '<span class="psub">+ ' + esc(i.adic) + '</span>' : '') + '</span></li>'; }
        return '<li><span><b>' + i.q + 'x</b> ' + esc(i.sabor) + '</span></li>';
      }).join('') + '</ul>';
    });
    return '<div class="comanda"><div class="cab"><div class="mk">Tanuki' + (retirada ? ' · Retirada ' + esc(retirada) : '') + '</div><h3>' + esc(p.nome) +
      '</h3></div>' + html + '<div class="rod">Conferir antes de fechar o saco</div></div>';
  }).join('') + '</div>';
}

function htmlTampas(ls) {
  return '<div class="pgrade">' + ls.filter(l => l.tipo === 'Poke').map(l =>
    '<div class="tampa"><div class="n">' + esc(l.nome) + '</div><div class="p">Poke - ' + esc(l.sabor) + '</div><div class="a">' + (l.adic ? esc(l.adic) : '&nbsp;') + '</div></div>').join('') + '</div>';
}

// Avisos de alergênicos e validade: texto do modelo aprovado de 10/10, não alterar sem pedido do usuário.
const CONTEM_ONIGIRI = { 'Salmão': 'Contém leite', 'Tuna Mayo': 'Contém ovo', 'Shimeji (vegetariano)': 'Contém castanha de caju e leite' };

const contemOnigiri = sb => { const k = Object.keys(CONTEM_ONIGIRI).find(x => norm(x) === norm(sb)); return k ? CONTEM_ONIGIRI[k] : ''; };

function htmlOnigiris(ls) {
  const tot = {};
  ls.filter(l => l.tipo === 'Onigiri').forEach(l => { tot[l.sabor] = (tot[l.sabor] || 0) + l.q; });
  return Object.keys(tot).map(sb => {
    let h = '<div class="pgrade" style="margin-bottom:12px">';
    for (let i = 0; i < tot[sb]; i++) {
      h += '<div class="oni"><div class="s">' + esc(sb.replace(' (vegetariano)', '')) + '</div>' + (sb.indexOf('vegetariano') >= 0 ? '<div class="v">vegetariano</div>' : '') +
        '<div class="av">' + (contemOnigiri(sb) ? '<b>' + esc(contemOnigiri(sb)) + '</b><br>' : '') + 'Consumir em até 2 dias. Manter a 8 °C ou menos</div></div>';
    }
    return h + '</div>';
  }).join('');
}

// Uma fonte só para todas as tampas (a maior que cabe na mais cheia), para ficarem iguais.
function ajustarTampas() {
  const as = [].slice.call(document.querySelectorAll('#impressao .tampa .a')).filter(a => a.textContent.trim());
  let melhor = 24;
  as.forEach(a => {
    let lo = 10, hi = 24;
    while (hi - lo > 0.25) {
      const mid = (lo + hi) / 2;
      a.style.fontSize = mid + 'px';
      if (a.scrollHeight > a.clientHeight + 1 || a.scrollWidth > a.clientWidth + 1) hi = mid; else lo = mid;
    }
    melhor = Math.min(melhor, lo);
  });
  as.forEach(a => { a.style.fontSize = melhor + 'px'; });
}

function corpoImpressao(qual, ls, retirada) {
  return qual === 'tampas' ? htmlTampas(ls) : qual === 'onigiris' ? htmlOnigiris(ls) : htmlComandas(ls, retirada);
}

function mostrarImpressao(qual, corpo) {
  let el = $('#impressao');
  if (!el) { el = document.createElement('div'); el.id = 'impressao'; document.body.appendChild(el); }
  el.innerHTML = corpo;
  document.body.classList.add('medindo'); // mostra fora da tela só para medir as tampas
  if (qual === 'tampas') ajustarTampas();
  document.body.classList.remove('medindo');
}

function imprimir(qual) {
  const r = rodadaAtual();
  if (!r) return;
  const retirada = (LS.get('tanuki_retirada') || '').trim();
  const corpo = corpoImpressao(qual, linhasEtiqueta(r.linhas), retirada);
  if (!corpo.replace(/<div class="pgrade"[^>]*><\/div>/g, '')) { alert('Nada para imprimir nesta rodada.'); return; }
  // iPhone com o app aberto pelo ícone: a Apple ignora a impressão. Gera o PDF e abre a folha de compartilhar.
  if (navigator.standalone) { gerarPdf(qual, r, retirada); return; }
  mostrarImpressao(qual, corpo);
  document.body.classList.add('imprimindo');
  window.print();
}

// PDF das etiquetas (A4, mm). Mesmos agrupamentos e textos de htmlComandas, htmlTampas e htmlOnigiris.
const PDF = { margem: 10, larg: 63, cols: 3 };

// Maior fonte (pt) entre max e min que cabe em larg (mm). Deixa a fonte ajustada no doc.
function pdfCaber(doc, txt, larg, max, min, estilo) {
  let fs = max;
  doc.setFont('helvetica', estilo);
  doc.setFontSize(fs);
  while (fs > min && doc.getTextWidth(txt) > larg) { fs -= 0.5; doc.setFontSize(fs); }
  return fs;
}

// Linhas tracejadas da grade de corte (linhas x 3 colunas).
function pdfGrade(doc, altura, linhas) {
  doc.setDrawColor(150); doc.setLineWidth(0.2); doc.setLineDashPattern([1, 1], 0);
  for (let r = 0; r < linhas; r++) for (let c = 0; c < PDF.cols; c++)
    doc.rect(PDF.margem + c * PDF.larg, PDF.margem + r * altura, PDF.larg, altura);
  doc.setLineDashPattern([], 0); doc.setDrawColor(0);
}

// Posição da caixa i (começa em 0). Nova página quando a folha enche.
function pdfCelula(doc, i, porPag, altura) {
  if (i > 0 && i % porPag === 0) doc.addPage();
  if (i % porPag === 0) pdfGrade(doc, altura, porPag / PDF.cols);
  const pos = i % porPag;
  return { x: PDF.margem + (pos % PDF.cols) * PDF.larg, y: PDF.margem + Math.floor(pos / PDF.cols) * altura };
}

// Desenha (ou só mede, com desenhar = false) os itens da comanda. Devolve a altura final (mm).
function pdfComandaItens(doc, p, x, y, fs, desenhar) {
  const xi = x + 3, w = PDF.larg - 6, lh = fs * 0.4234;
  const pokes = p.itens.filter(i => i.tipo === 'Poke');
  let k = 0, yy = y + 17;
  ['Poke', 'Onigiri', 'Acompanhamento', 'Sobremesa'].forEach(t => {
    const grupo = p.itens.filter(i => i.tipo === t);
    if (!grupo.length) return;
    if (desenhar) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(0);
      doc.text(t.toUpperCase() + (t === 'Poke' && pokes.length > 1 ? ' (' + pokes.length + ')' : ''), xi, yy);
      doc.setLineWidth(0.15); doc.line(xi, yy + 1.2, xi + w, yy + 1.2);
    }
    yy += 4;
    grupo.forEach(i => {
      if (t === 'Poke') k++;
      const txt = t === 'Poke' ? (pokes.length > 1 ? k + '. ' : '') + i.sabor : i.q + 'x ' + i.sabor;
      doc.setFont('helvetica', t === 'Poke' ? 'bold' : 'normal'); doc.setFontSize(fs);
      const linhas = doc.splitTextToSize(txt, w - 4);
      if (desenhar) {
        doc.setLineWidth(0.2); doc.rect(xi, yy - fs * 0.25, 2.5, 2.5);
        linhas.forEach((ln, j) => doc.text(ln, xi + 4, yy + j * lh));
      }
      yy += linhas.length * lh;
      if (t === 'Poke' && i.adic) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        const la = 7 * 0.4234, ad = doc.splitTextToSize('+ ' + i.adic, w - 4);
        if (desenhar) { doc.setTextColor(120); ad.forEach((ln, j) => doc.text(ln, xi + 4, yy + j * la)); doc.setTextColor(0); }
        yy += ad.length * la;
      }
      yy += 1.5;
    });
  });
  return yy;
}

function pdfComanda(doc, p, retirada, x, y) {
  // a maior fonte de 9 a 6 pt que deixa os itens acima do rodapé (7 mm)
  const fs = [9, 8.5, 8, 7.5, 7, 6.5, 6].find(f => pdfComandaItens(doc, p, x, y, f, false) <= y + 83) || 6;
  const xi = x + 3, w = PDF.larg - 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
  doc.text('TANUKI' + (retirada ? ' · RETIRADA ' + retirada : ''), xi, y + 4);
  doc.setTextColor(0);
  pdfCaber(doc, p.nome, w, 13, 9, 'bold');
  doc.text(p.nome, xi, y + 11);
  doc.setLineWidth(0.5); doc.line(xi, y + 13, xi + w, y + 13);
  pdfComandaItens(doc, p, x, y, fs, true);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120);
  doc.text('Conferir antes de fechar o saco', x + PDF.larg / 2, y + 86, { align: 'center' });
  doc.setTextColor(0);
}

function pdfComandas(doc, ls, retirada) {
  const pessoas = [];
  ls.forEach(l => {
    let p = pessoas.find(x => x.nome.toLowerCase() === l.nome.toLowerCase());
    if (!p) pessoas.push(p = { nome: l.nome, itens: [] });
    p.itens.push(l);
  });
  pessoas.forEach((p, i) => { const c = pdfCelula(doc, i, 9, 90); pdfComanda(doc, p, retirada, c.x, c.y); });
}

function pdfTampas(doc, ls) {
  const cards = ls.filter(l => l.tipo === 'Poke');
  // uma fonte só para todas as tampas: a maior que cabe no adicional mais comprido (mín. 6 pt)
  let fs = 12;
  cards.forEach(l => {
    if (!l.adic) return;
    doc.setFont('helvetica', 'normal');
    let f = 12; doc.setFontSize(f);
    while (f > 6 && doc.splitTextToSize(l.adic, PDF.larg - 6).length * f * 0.4234 > 14) { f -= 0.5; doc.setFontSize(f); }
    fs = Math.min(fs, f);
  });
  cards.forEach((l, i) => {
    const c = pdfCelula(doc, i, 24, 33), cx = c.x + PDF.larg / 2;
    pdfCaber(doc, l.nome, PDF.larg - 6, 11, 7, 'bold');
    doc.text(l.nome, cx, c.y + 7, { align: 'center' });
    pdfCaber(doc, 'Poke - ' + l.sabor, PDF.larg - 6, 9, 6, 'normal');
    doc.text('Poke - ' + l.sabor, cx, c.y + 12.5, { align: 'center' });
    doc.setLineWidth(0.15); doc.line(c.x + 3, c.y + 15, c.x + PDF.larg - 3, c.y + 15);
    if (l.adic) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
      doc.splitTextToSize(l.adic, PDF.larg - 6).forEach((ln, j) => doc.text(ln, cx, c.y + 19 + j * fs * 0.4234, { align: 'center' }));
    }
  });
}

function pdfOnigiris(doc, ls) {
  const tot = {};
  ls.filter(l => l.tipo === 'Onigiri').forEach(l => { tot[l.sabor] = (tot[l.sabor] || 0) + l.q; });
  let i = 0;
  Object.keys(tot).forEach(sb => {
    if (i % 3) i += 3 - (i % 3); // cada sabor começa numa linha nova
    const nome = sb.replace(' (vegetariano)', ''), aviso = contemOnigiri(sb);
    for (let n = 0; n < tot[sb]; n++, i++) {
      const c = pdfCelula(doc, i, 27, 28), cx = c.x + PDF.larg / 2;
      let yy = c.y + 7;
      pdfCaber(doc, nome, PDF.larg - 6, 12, 8, 'bold');
      doc.text(nome, cx, yy, { align: 'center' });
      yy += 4;
      if (sb.indexOf('vegetariano') >= 0) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
        doc.text('vegetariano', cx, yy, { align: 'center' }); yy += 3;
      }
      doc.setFontSize(7);
      if (aviso) {
        doc.setFont('helvetica', 'bold');
        doc.splitTextToSize(aviso, PDF.larg - 6).forEach(ln => { doc.text(ln, cx, yy, { align: 'center' }); yy += 2.96; });
      }
      doc.setFont('helvetica', 'normal');
      doc.splitTextToSize('Consumir em até 2 dias. Manter a 8 °C ou menos', PDF.larg - 6).forEach(ln => { doc.text(ln, cx, yy, { align: 'center' }); yy += 2.96; });
    }
  });
}

// Gera o PDF e entrega pelo Compartilhar do aparelho (no iPhone: Salvar em Arquivos). Sem Compartilhar, baixa o arquivo.
async function gerarPdf(qual, r, retirada) {
  if (!window.jspdf) { alert('Não consegui gerar o PDF. Tente de novo.'); return; }
  try {
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const ls = linhasEtiqueta(r.linhas);
    if (qual === 'tampas') pdfTampas(doc, ls);
    else if (qual === 'onigiris') pdfOnigiris(doc, ls);
    else pdfComandas(doc, ls, retirada);
    const nome = 'tanuki-' + qual + '.pdf';
    const file = new File([doc.output('blob')], nome, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); }
      catch (e) { if (e.name !== 'AbortError') throw e; } // cancelar o compartilhar não é erro
    } else doc.save(nome);
  } catch (e) {
    alert('Não consegui gerar o PDF. Tente de novo.');
  }
}

// Página só de impressão (aberta pelo iPhone): monta as etiquetas a partir do link, sem senha e sem buscar dados.
function paginaImpressao(qual) {
  let d = null;
  try { d = JSON.parse(decodeURIComponent(location.hash.slice(1))); } catch (e) { /* link quebrado */ }
  if (!d || !Array.isArray(d.l)) { document.body.textContent = 'Link de impressão inválido. Volte ao app e toque de novo.'; return; }
  document.body.classList.add('sopagina');
  mostrarImpressao(qual, corpoImpressao(qual, linhasEtiqueta(d.l), d.r || ''));
  const topo = document.createElement('div');
  topo.className = 'naoimprime';
  topo.innerHTML = '<button class="gerar">Imprimir ou salvar PDF</button><p class="mudo">Na tela de impressão do iPhone, toque em Compartilhar e escolha “Salvar em Arquivos” para ter o PDF.</p>' +
    '<a href="./" class="sair">Voltar ao app</a>';
  topo.querySelector('button').onclick = () => { document.body.classList.add('imprimindo'); window.print(); };
  document.body.insertBefore(topo, document.body.firstChild);
}
window.addEventListener('afterprint', () => document.body.classList.remove('imprimindo'));

function htmlImprimir(r) {
  const ls = linhasEtiqueta(r.linhas);
  const nCom = new Set(ls.map(l => l.nome.toLowerCase())).size;
  const nPoke = ls.filter(l => l.tipo === 'Poke').length;
  const nOni = ls.filter(l => l.tipo === 'Onigiri').reduce((a, l) => a + l.q, 0);
  return '<h2>Imprimir ou baixar PDF</h2><div class="card">' +
    '<div class="rot">Retirada (opcional, sai na comanda)</div><input type="text" id="ret" placeholder="ex.: 24/10" value="' + esc(LS.get('tanuki_retirada') || '') + '">' +
    '<div class="pbtns"><button data-imp="comandas">Comandas (' + nCom + ')</button><button data-imp="tampas">Tampas do poke (' + nPoke + ')</button><button data-imp="onigiris">Onigiris (' + nOni + ')</button></div>' +
    '<p class="mudo">Abre a impressão do aparelho. No computador ou Android, escolha “Salvar como PDF”. No iPhone, use o botão de compartilhar da tela de impressão.</p></div>';
}

// Pede ao serviço de pedidos para refazer a aba "Etiquetas Impressão" (leva ativa, só pedidos pagos) e recarrega a lista.
async function gerarEtiquetas() {
  const b = $('#btn-gerar-etq');
  b.disabled = true; b.textContent = 'Gerando…';
  try {
    const j = await (await fetch(window.TANUKI_SERVICO + '?acao=etiquetas', { redirect: 'follow' })).json();
    if (!j.ok) throw new Error('servico');
    rodadaSel = 0;
    await atualizar(false);
    $('#status').textContent += ' · ' + j.linhas + ' etiquetas geradas';
  } catch (e) {
    alert('Não consegui gerar as etiquetas. Confira a internet e tente de novo.');
    desenhar();
  }
}

function telaEtiquetas() {
  const abas = dados.etiquetas || [];
  const gerar = '<button class="gerar" id="btn-gerar-etq">Gerar etiquetas da leva ativa</button>';
  if (!abas.length) return gerar + '<p class="mudo">Nenhuma aba de etiquetas encontrada nas planilhas de pedidos.</p>';
  const lista = abas.slice().reverse();
  if (rodadaSel >= lista.length) rodadaSel = 0;
  const r = lista[rodadaSel];
  const novo = !/telefone/i.test(String((r.cabecalho || [])[1] || '')); // novo: Nome | Produto - Sabor | Adicionais | Origem
  const q = norm(busca.etq);
  const linhas = r.linhas.filter(l => !q || norm(l.join(' ')).includes(q));
  const clientes = new Set(r.linhas.map(l => l[0])).size;
  const sel = '<select id="sel-rodada">' + lista.map((a, i) => '<option value="' + i + '"' + (i === rodadaSel ? ' selected' : '') + '>' + esc(a.aba) + '</option>').join('') + '</select>';
  const itens = linhas.map(l => {
    if (novo) {
      const ad = String(l[2] || '').split(',').map(x => x.trim()).filter(Boolean).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
      return '<div class="card etq"><div><b>' + esc(l[0]) + '</b>' + esc(l[1]) + '<br>' + ad + '</div><div class="mudo">' + esc(l[3] || '') + '</div></div>';
    }
    const link = foneLink(l[1]);
    const extras = l.slice(3).filter(Boolean).map(t => '<span class="tag">' + esc(t) + '</span>').join('');
    return '<div class="card etq"><div><b>' + esc(l[0]) + '</b>' + esc(l[2]) + '<br>' + extras + '</div>' +
      '<div>' + (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(l[1]) + '</a>' : esc(l[1])) + '</div></div>';
  }).join('');
  return gerar + sel + (novo ? htmlResumo(resumoEtiquetas(r.linhas)) + htmlImprimir(r) : '') + '<input type="search" id="busca-etq" placeholder="Buscar cliente, item…" value="' + esc(busca.etq) + '">' +
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
    const txt = String(cn.value).trim().replace(',', '.');
    const v = txt === '' ? NaN : Number(txt);
    const p = pratosReceita().find(x => x.prato === calc.prato);
    const ruim = !(v >= 0) || !isFinite(v);
    cn.classList.toggle('inv', ruim);
    $('#calc-aviso').textContent = ruim ? 'Digite um número, por exemplo 10 ou 2,5.' : '';
    if (ruim || !p) return;
    calc.n = v; $('#tab-receita').innerHTML = tabelaReceita(p, v);
    document.querySelectorAll('.calc button').forEach(b => b.classList.toggle('on', +b.dataset.n === v));
  };
  document.querySelectorAll('.calc button').forEach(b => b.onclick = () => { calc.n = +b.dataset.n; desenhar(); });
  const rt = $('#ret');
  if (rt) rt.oninput = () => LS.set('tanuki_retirada', rt.value);
  document.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => imprimir(b.dataset.imp));
  const bg = $('#btn-gerar-etq');
  if (bg) bg.onclick = gerarEtiquetas;
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then(r => { if (r) r.update(); }).catch(() => {}); // procura versão nova do app
  if (pin && !$('#app').hidden) atualizar(true);
});

if ('serviceWorker' in navigator) {
  // versão nova do app: o service worker assume e a página recarrega uma vez (não na primeira instalação)
  const jaTinhaSW = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (jaTinhaSW && !recarregou) { recarregou = true; location.reload(); } });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
const qualImprimir = new URLSearchParams(location.search).get('imprimir');
if (qualImprimir) paginaImpressao(qualImprimir);
else if (pin) entrar(); else $('#login').hidden = false;
