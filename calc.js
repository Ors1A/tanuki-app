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

  // Ingrediente da ficha contado em "un" (ex.: Recheio Shimeji 1 un) -> peso por porção pela Montagem (22 g).
  function pesoNaMontagem(ficha, nomeIngrediente, unidade) {
    if (unidadeBase(unidade) !== 'un') return null;
    const m = ((ficha && ficha.montagem) || []).find(i => i.preparo && norm(i.preparo) === norm(nomeIngrediente));
    return m && m.quantidade > 0 && unidadeBase(m.unidade) !== 'un' ? { quantidade: m.quantidade, unidade: unidadeBase(m.unidade) } : null;
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

  // g e ml somam juntos: a planilha já trata 1 g = 1 ml (mesmo custo por unidade; vinagre e mirin ~1 g/ml)
  const grupo = u => { const b = unidadeBase(u); return b === 'g' || b === 'ml' ? 'peso' : b; };

  function chaveCompra(nome, unidade, contexto) {
    const final = norm(nome).includes('salm') ? (contexto === 'onigiri' ? 'Salmão para onigiri' : 'Salmão para poke') : nome;
    return { chave: norm(final) + '|' + grupo(unidade), nome: final };
  }

  // Peso da porção de um adicional, escrito na Observação da aba Produtos ("35 g", "12,5 ml", "1 un", "1/4 de folha").
  function porcaoDoProduto(pd) {
    const s = String((pd && pd.obs) || '').trim();
    const fr = s.match(/^(\d+)\s*\/\s*(\d+)\s*de\s+folha/i);
    if (fr && +fr[2] > 0) return { quantidade: +fr[1] / +fr[2], unidade: 'un' };
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(g|ml|un)\b/i);
    return m ? { quantidade: Number(m[1].replace(',', '.')), unidade: m[2].toLowerCase() } : null;
  }

  function listaCompras(producao, pratos, preparos, produtos) {
    const soma = {}, semFicha = [];
    pratos = pratos || []; preparos = preparos || {}; produtos = produtos || [];
    function somar(nome, qtd, un, ctx) {
      const k = chaveCompra(nome, un, ctx), u = unidadeBase(un);
      const l = soma[k.chave] = soma[k.chave] || { chave: k.chave, nome: k.nome, quantidade: 0, unidade: u, aproximado: false };
      if (l.unidade !== u) { l.unidade = 'ml'; l.aproximado = true; } // misturou g e ml: mostra em ml, com "≈"
      l.quantidade += qtd;
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
      const porcao = porcaoDoProduto(pd);
      if (porcao) {
        // "Insumo Manga" -> soma no insumo Manga; receita que o app não lê (Goma Dare, Ajitama) -> entra pelo peso da porção
        const nomeLinha = /^insumo\s+/i.test(fichaNome) ? fichaNome.replace(/^insumo\s+/i, '') : (fichaNome || pd.nome);
        return somar(nomeLinha, qtd * porcao.quantidade, porcao.unidade, ctx);
      }
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

  const api = { norm, lerNumero, unidadeBase, porPorcaoDe, pesoNaMontagem, porcaoDoProduto, escalarReceita, porcoesPorIngrediente, resumoLeva, contarNaLeva, chaveCompra, listaCompras };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else g.TanukiCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);
