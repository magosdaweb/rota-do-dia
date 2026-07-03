# Rota do dia

Checklist diário com recorrência estilo Google Agenda, painel de performance e gráfico de ocupação de tempo.

## Rodar localmente

```bash
npm install
npm run dev
```

URL local: `http://127.0.0.1:5173`.

## Supabase

Projeto configurado: `rota-do-dia`.

O schema está em `supabase/schema.sql` e o login anônimo está ativo.

```bash
VITE_SUPABASE_URL=https://fmsxxtxreylhvezthvan.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_VVn3YH6tt9u8BqU-PaPRuA_MW6CmiWw
```

## Cloudflare Pages

URL pública: `https://rota-do-dia.pages.dev`.

Configuração ativa:

- Repositório: `magosdaweb/rota-do-dia`.
- Branch de produção: `main`.
- Build command: `npm run build`.
- Build output: `dist`.
- Project name: `rota-do-dia`.

O deploy automático está configurado pela integração nativa do Cloudflare Pages com GitHub. Todo `push` em `main` dispara uma nova implantação.
