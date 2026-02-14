# TypeScript Migration Guardrails

This document defines the non-negotiable constraints for the full Vue + Electron TypeScript refactor.

## Goals

- Keep all existing functionality unchanged.
- Keep all existing UI layout unchanged.
- Migrate business/runtime source code from JavaScript to TypeScript.
- Add engineering guardrails (lint, typecheck, tests, hooks, CI).

## Baseline Commands

The following commands are treated as baseline verification points:

- `pnpm --dir apps/main build`
- `pnpm --dir apps/window build`
- `pnpm --dir apps/backend build`
- `pnpm start`

## Zero-JS Source Policy

- Business/runtime source must not keep hand-written `.js` files.
- JavaScript is only allowed for build/runtime artifacts and infra scripts.
- HTML files must not contain inline business scripts; load TS-compiled module files instead.

## Safety Constraints

- No functional behavior changes.
- No visual layout changes.
- Migration should remain rollback-friendly (small, isolated steps).
