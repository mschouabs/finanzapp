# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Everyday people (usuarios comunes) who want to control their personal finances and spending. They use it on the web and on their phone. Not finance professionals. Confirmed by the owner; no deeper segmentation was stated.

## Product Purpose

FinanzApp helps a person see and control where their money goes: income, expenses, cards, wallets, goals, investments, trips and money owed to them. Success: the person can answer "what is happening with my money?" quickly and trust the number they see.

## Positioning

Entries can be made in natural language, and a built-in assistant (Luca) reads across the whole system instead of showing isolated cards. Cards understand billing cycles (cierre y vencimiento). *Assumption from the repo's own audit, not confirmed by the owner.*

## Operating Context

- Next.js 16 + React 19 + Tailwind, Supabase backend, deployed on Vercel.
- The same web app is wrapped for phones with Capacitor (`com.finanzapp.app`, loading the production URL). Per Impeccable's rule, a native wrapper around a website stays `web`.
- Existing areas under `/dashboard`: resumen, ingresos-gastos, gastos-variables, billeteras, tarjetas, metas, inversiones, viajes, me-deben, historial, importar, configuracion, and Luca.
- Interface in Spanish (rioplatense). Amounts in pesos; some users have foreign-currency or trip spending.

## Capabilities and Constraints

- Known structural problems from `docs/evolucion/01-auditoria-y-propuesta.md` (Sept 2026): no single source of truth, money movements leave no trace (wallet balances get overwritten), and the app shows data without interpreting it. A central financial core (`src/lib/finanzas/nucleo.ts`) and a pilot summary at `/dashboard/nuevo-resumen` are the first step.
- Constraint carried from that audit: the same metric must read the same on every screen.
- Undecided: whether the pilot summary replaces the classic one; store distribution of the mobile build.

## Brand Commitments

Name: FinanzApp. The assistant is named Luca. Dark background `#080D13` is used for Android. No other brand commitments were stated; treat the existing look as incumbent evidence, not approved direction.

## Evidence on Hand

- The audit and proposal document in `docs/evolucion/`.
- A working app with real screens and demo data (`src/lib/demo.ts`).
- Absent: user research, testimonials, store ratings, pricing. Do not fabricate them.

## Product Principles

1. One source of truth: every number agrees with every other number.
2. Money leaves a trail. Transfers, card payments and adjustments are movements, not overwritten balances.
3. Interpret, don't just display. Say what is happening and what to do.
4. Fast entry beats complete forms. Capture a spend in seconds.
5. Calm and clear for non-experts. No finance jargon without a plain explanation.

## Accessibility & Inclusion

No product-specific standard established. Assume WCAG AA as a floor, readable on small phone screens, Spanish copy in plain language.
