# idlezada

Ferramentas estáticas para o **Baiak Idle** — gerador de builds das 5 árvores,
simulador interativo e calculadora de stamina. HTML/JS puro, **sem build**.

## Estrutura

```
idlezada/
├─ public/               # o que vai pro ar (alvo do deploy)
│  ├─ index.html         # home: gerador de 3 builds
│  ├─ app.js             # UI da tela de builds + localStorage
│  ├─ engine.js          # motor: custo/validação/aggregate/encode-decode + autobuild
│  ├─ trees.js           # dados das 5 árvores (window.TREES) — gerado de data/trees.json
│  ├─ styles.css
│  ├─ simuladorbuild.html# simulador interativo (aba Simulador)
│  └─ stamina.html       # calculadora de stamina (aba Stamina)
├─ data/trees.json       # fonte dos dados das árvores (não publicada)
├─ docs/                 # specs internas (não publicadas)
└─ .github/workflows/deploy.yml
```

## Rodar local

Abra `public/index.html` no navegador (duplo-clique). Sem servidor, sem dependências.

## Deploy (Cloudflare Pages via GitHub Actions)

Cada push na `main` dispara `.github/workflows/deploy.yml`, que roda
`wrangler pages deploy public --project-name=idlezada`.

Pré-requisitos (feitos uma vez, no lado Cloudflare/GitHub):

1. Criar o projeto Pages:
   ```
   npx wrangler pages project create idlezada --production-branch=main
   ```
   (com `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` exportados no ambiente)
2. Cadastrar os secrets do repositório:
   ```
   gh secret set CLOUDFLARE_API_TOKEN     # token com permissão Cloudflare Pages: Edit
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

URL de produção: `https://idlezada.pages.dev`

## Dados / re-sync

`public/trees.js` é gerado de `data/trees.json`. Quando o bundle do jogo mudar,
basta regenerar `trees.js` a partir do `trees.json` atualizado — o motor é agnóstico
e lê qualquer árvore no mesmo formato.
