# PraxTalk

AI-native customer messaging platform — live chat, email, WhatsApp, voice and in-app, unified into one inbox with **Atlas**, an autonomous agent that resolves conversations end to end.

A product of [Praxxii Global](https://praxxiiglobal.com).

- **Live**: [praxtalk.com](https://praxtalk.com)
- **Status**: Open beta · 2026

## Stack

| Layer    | Choice                                       |
| -------- | -------------------------------------------- |
| Framework| Next.js 16 (App Router, Turbopack, RSC)      |
| Language | TypeScript 5 — end-to-end, 0 `any`           |
| UI       | Tailwind 4 (oklch `@theme` tokens)           |
| Database | Convex (TS-native, document-based, reactive) |
| Auth     | Custom token (per Praxxii convention)        |
| Hosting  | Vercel                                       |
| Type     | Inter Tight · JetBrains Mono · Instrument Serif |

## Surfaces (planned)

| Subdomain               | Purpose                                          |
| ----------------------- | ------------------------------------------------ |
| `www.praxtalk.com`      | Marketing site (this repo, `/app`)               |
| `app.praxtalk.com`      | Operator dashboard (auth, workspace-scoped)      |
| `cdn.praxtalk.com/widget.js` | Public embeddable widget keyed by workspaceId |

## Local development

```bash
npm install
npm run dev   # → http://localhost:3000
```

```bash
npm run build # production build (next build, Turbopack)
```

## Project structure

```
app/                   Next.js App Router (marketing routes)
  layout.tsx           Fonts, metadata
  page.tsx             Marketing homepage (composes sections)
  icon.tsx             Generated favicon
  opengraph-image.tsx  Generated OG card
  globals.css          Tailwind 4 + @theme tokens
components/marketing/  Marketing sections (Nav, Hero, etc.)
design/                Original design reference snapshot
lib/                   Shared utilities (cn, etc.)
```

## Repo conventions

- **No SQL** — Convex documents only (when added)
- **Multi-tenant from day one** — every entity workspace-scoped
- **Honest copy** — no fabricated metrics, logos, or unearned compliance badges. "Open beta" framing, "GDPR ready · SOC 2 in progress" only

## License

Proprietary © 2026 Praxxii Global. All rights reserved.
