'use strict';
// Contas do app (receita ajustável e lista de compras). Sem tela: testado no Node (testes-app/calc.test.js, no Drive).
(function (g) {
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const num = n => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  // Nome da leva casa com a ficha se for igual, ou se a ficha contém o nome ("Poke Apimentado" -> "Poke Apimentado (atum)").
  // Nunca o contrário ("Shimeji e Tofu" não pode cair na ficha "Shimeji").
  const casa = (ficha, nome) => { const x = norm(ficha), y = norm(nome); return !!y && (x === y || x.includes(y)); };
  // igual primeiro; por "contém", só se houver um candidato só (senão vai para "Sem ficha")
  const achar = (lista, nome, campo) => {
    const igual = lista.find(o => norm(o[campo]) === norm(nome));
    if (igual) return igual;
    const c = lista.filter(o => casa(o[campo], nome));
    return c.length === 1 ? c[0] : undefined;
  };

  function lerNumero(txt) {
    const s = String(txt == null ? '' : txt).trim().replace(',', '.');
    if (!s) return null;
    const v = Number(s);
    return isFinite(v) && v > 0 ? v : null;
  }

  const unidadeBase = u => norm(u).replace(/\s*cru$/, '');

  // Quanto do preparo vai em 1 porção do prato. Sem a linha na ficha, só um preparo em "un" vale 1;
  // em g ou ml devolve null (o item não fica tocável), para não mostrar "1 ml por bowl".
  function porPorcaoDe(ficha, preparo) {
    const l = ((ficha && ficha.ingredientes) || []).find(i => norm(i.nome) === norm(preparo && preparo.nome));
    if (l) return l.quantidade > 0 && unidadeBase(l.unidade) === preparo.unidade ? l.quantidade : null;
    return preparo && preparo.unidade === 'un' ? 1 : null;
  }

  function escalarReceita(preparo, porPorcao, porcoes) {
    const f = porPorcao * porcoes / preparo.rende;
    return preparo.ingredientes.map(i => ({ nome: i.nome, quantidade: i.quantidade * f, unidade: i.unidade }));
  }

  // null quando o ingrediente não tem medida (quantidade 0): não dá para calcular a partir dele
  function porcoesPorIngrediente(preparo, porPorcao, indice, novaQtd) {
    const q = preparo.ingredientes[indice].quantidade;
    return q > 0 && porPorcao > 0 ? novaQtd * preparo.rende / (q * porPorcao) : null;
  }

  function resumoLeva(porcoes, naLeva, palavra = 'porções') {
    const base = 'Dá para ' + num(porcoes) + ' ' + palavra + '.';
    if (naLeva == null) return base;
    const d = Math.round((naLeva - porcoes) * 100) / 100;
    return base + (d > 0 ? ' Faltam ' + num(d) + ' para a leva.' : d < 0 ? ' Sobram ' + num(-d) + '.' : ' Fecha a leva.');
  }

  function contarNaLeva(producao, prato) {
    const its = ((producao && producao.itens) || []).filter(i => casa(prato, i.item));
    return its.length ? its.reduce((s, i) => s + (Number(i.quantidade) || 0), 0) : null;
  }

  function chaveCompra(nome, unidade, contexto) {
    const final = norm(nome).includes('salm') ? (contexto === 'onigiri' ? 'Salmão para onigiri' : 'Salmão para poke') : nome;
    return { chave: norm(final) + '|' + unidadeBase(unidade), nome: final };
  }

  function listaCompras(producao, pratos, preparos, produtos) {
    const soma = {}, semFicha = [];
    pratos = pratos || []; preparos = preparos || {}; produtos = produtos || [];
    function somar(nome, qtd, un, ctx) {
      const k = chaveCompra(nome, un, ctx);
      // shortcut: mesmo insumo em g e em ml fica em duas linhas; converter só se o dono pedir
      soma[k.chave] = soma[k.chave] || { chave: k.chave, nome: k.nome, quantidade: 0, unidade: unidadeBase(un) };
      soma[k.chave].quantidade += qtd;
    }
    function expandir(nome, qtd, un, ctx, prof) {
      const p = preparos[norm(nome)];
      if (!p) return somar(nome, qtd, un, ctx);
      if (prof > 5 || unidadeBase(un) !== p.unidade) { semFicha.push(nome); return; }
      const f = qtd / p.rende;
      p.ingredientes.forEach(i => expandir(i.nome, i.quantidade * f, i.unidade, ctx, prof + 1));
    }
    function porProduto(nome, qtd, ctxPadrao) {
      const pd = achar(produtos, nome, 'nome');
      const ctx = pd && /onigiri/i.test(pd.pai || '') ? 'onigiri' : ctxPadrao;
      const fichaNome = pd ? String(pd.ficha || '').trim() : '';
      if (fichaNome && preparos[norm(fichaNome)]) return expandir(fichaNome, qtd, 'un', ctx, 0);
      semFicha.push(nome + ' (' + num(qtd) + ' porções)');
    }
    ((producao && producao.itens) || []).forEach(it => {
      const q = Number(it.quantidade) || 0;
      const f = achar(pratos, it.item, 'prato');
      if (!f) return porProduto(it.item, q, /onigiri/i.test(it.item) ? 'onigiri' : 'poke');
      const ctx = /onigiri/i.test(f.prato) ? 'onigiri' : 'poke';
      const fator = q / (f.rendimentoPorcoes || 1);
      (f.ingredientes || []).forEach(i => expandir(i.nome, (i.quantidade || 0) * fator, i.unidade, ctx, 0));
    });
    ((producao && producao.adicionais) || []).forEach(a => porProduto(a.adicional, Number(a.quantidade) || 0, 'poke'));
    const linhas = Object.keys(soma).map(k => soma[k]).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return { linhas, semFicha };
  }

  const api = { norm, lerNumero, unidadeBase, porPorcaoDe, escalarReceita, porcoesPorIngrediente, resumoLeva, contarNaLeva, chaveCompra, listaCompras };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.TanukiCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
