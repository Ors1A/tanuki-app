# Site do Tanuki Ramen (GitHub Pages)

Repositório `Ors1A/tanuki-app`, publicado em https://ors1a.github.io/tanuki-app/ (branch `main`). Tem só duas coisas: o **app de consulta (PWA)** na raiz e a **página de pedidos do verão** em `pedido-verao/`. O resto do negócio (planilhas, formulários, receitas, marca) fica no Google Drive do usuário e **não é visível aqui**.

## Como trabalhar com o usuário
- Responder em português, linguagem simples, passos curtos. O usuário não é técnico e prefere que o Claude execute.
- Nunca inventar valores (preços, datas, horários). Se faltar dado, perguntar.

## Regras de ouro
- **Nada é publicado sem OK.** Antes de qualquer commit ou push: mostrar o `git diff --stat` (e o diff do que importa) e esperar um "pode publicar" explícito. Um push vai ao ar em ~1 minuto, para clientes reais.
- **Nunca `git push --force`**, nunca reescrever histórico, nunca apagar a branch `main`.
- **Segredos:** nunca escrever nem mostrar senhas, tokens ou chaves (senha do PWA, Pix, tokens). Não existe `.env` neste repositório e nada assim deve entrar nele. Se aparecer algo parecido num arquivo, parar e avisar.
- **Trabalhar em branch** quando a mudança for grande ou experimental; `main` é o que está no ar.
- Se uma permissão ou ferramenta bloquear, parar e avisar, em vez de contornar.

## O que roda onde (importante)
- **Aqui (site estático):** só HTML, CSS e JavaScript que rodam no navegador do cliente. Não há servidor.
- **No Apps Script (fora deste repositório):** quem grava pedidos, valida, calcula preço, gera o Pix e fala com as planilhas é o `servico-pedido-verao.gs` e o `Api.gs`. Mudar a página aqui **não muda** essas regras. Se a mudança pede lógica de servidor (preço, estoque, limite de pedidos, validação), avisar o usuário: isso é feito no Drive/Apps Script, não nesta nuvem.
- A página de pedidos chama o Apps Script por uma URL `/exec`. Não trocar essa URL sem o usuário pedir.

## Mapa de arquivos
Raiz (app de consulta, PWA, instalável):
- `index.html`, `app.js`, `style.css`: telas e lógica do app. `config.js`: endereço da API. Se pedir senha, é no Apps Script, nunca no código.
- `sw.js`: service worker (cache offline). **Ao mudar qualquer arquivo do app, subir a versão do cache em `sw.js`**, senão os celulares continuam com a versão velha.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`: instalação no celular. No repositório os ícones ficam na raiz (no Drive ficam em `icons/`).

`pedido-verao/` (página própria de pedidos do verão, uma etapa por tela):
- `index.html` (tudo em um arquivo) e `banner.jpg`.
- Mudanças aqui afetam a venda do verão (poke e onigiri): ser cuidadoso, testar o fluxo inteiro no navegador antes de pedir o OK.

## De onde vêm os arquivos (Drive do usuário)
O Drive é a fonte; este repositório é a cópia publicada. Quando o trabalho começa no Drive, os caminhos são:

| No Drive (`Tanuki/`) | Neste repositório |
|---|---|
| `_publicar/app-raiz/` (index.html, app.js, sw.js) | raiz |
| `pwa-tanuki/` (style.css, config.js, manifest, `icons/`) | raiz (ícones sem a pasta `icons/`) |
| `_publicar/pedido-verao/` | `pedido-verao/` |

Nunca publicar `SENHA-DO-PWA.txt`, `LEIA-ME.md`, scripts `.gs`, testes `.js` ou o `.json` de teste: eles ficam só no Drive.

## Se a mudança nasceu na nuvem
Como a nuvem só enxerga este repositório, a mudança precisa voltar ao Drive depois (para o Drive não ficar desatualizado). Ao terminar, deixar claro no resumo final quais arquivos mudaram, para o usuário (ou o Claude no computador) copiar de volta.

## Regras de conteúdo
- Prazos divulgados ao público: usar o prazo "meia-noite da véspera", nunca o horário real de fechamento do formulário.
- Avisos de alergênicos e informações de salmão devem ser mantidos como estão; só alterar se o usuário pedir.
- Salmão é fresco (sem menção a congelamento).
- Em caso de dúvida sobre preço, sabor, data ou regra do cardápio, perguntar: a decisão vigente está no Drive e pode ter mudado.
