# Rota do dia

Checklist diário com recorrência estilo Google Agenda, painel de performance e gráfico de ocupação de tempo.

## Rodar localmente

```bash
npm install
npm run dev
```

URL local: `http://127.0.0.1:5173`.

## Supabase

1. Crie um projeto no Supabase.
2. Ative login anônimo em `Authentication > Providers > Anonymous sign-ins`.
3. Rode o SQL de `supabase/schema.sql`.
4. Copie `.env.example` para `.env` e preencha:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Sem essas variáveis, o app funciona em modo local com `localStorage`.

## Cloudflare Pages

Configuração esperada:

- build command: `npm run build`.
- build output: `dist`.
- project name: `rota-do-dia`.

O workflow `.github/workflows/deploy.yml` publica no Cloudflare Pages a cada `push` em `main` ou `master`.

Secrets necessários no GitHub:

```bash
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
