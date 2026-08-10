# 0001. npm workspaces monorepo with a shared contract package

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The client and the server must agree exactly on wire formats and on the rules that decide money. Two
repositories, or one repository with duplicated types, guarantees drift: a crop's growth time gets
tuned on one side and the server silently starts rejecting legitimate saves.

The workspace was empty, so no existing package manager or layout constrained the choice. Node 22
and npm 10 were available.

## Decision

A single repository with npm workspaces:

- `packages/shared` — wire schemas, domain definitions, pure rules. The only thing both sides import.
- `apps/game` — Vite + Three.js client.
- `apps/server` — Next.js API.

npm workspaces rather than pnpm or Yarn: it is already installed with Node, needs no `packageManager`
field or corepack setup, and this repository has no dependency-graph complexity that would justify a
second tool.

## Consequences

- A schema change breaks the type-check on both sides in the same commit. That is the whole point.
- `packages/shared` must be built before the server runs — services import its build output, not its
  source. This is documented in the README and in BACKEND.md's troubleshooting table, and wired as a
  `predb:seed` script.
- `apps/server` imports without `.js` extensions (its bundler resolves TypeScript directly);
  `packages/shared` and `apps/game` use explicit `.js` specifiers. Inconsistent, but each matches its
  own toolchain.
- npm's hoisting means a stray import of an undeclared transitive dependency will resolve locally and
  fail in CI. The lint boundary rules catch the architectural cases; the rest relies on review.

## Alternatives considered

- **Two repositories with a published `@farmrise/shared` package.** Correct at scale, and far too
  much release ceremony for a project this size.
- **A single Next.js app serving the client too.** Fewer moving parts, but the client/server boundary
  becomes a convention instead of a build-time fact, and Vite's dev experience is lost.
- **pnpm.** Better disk usage and stricter resolution; not worth adding a required tool.
