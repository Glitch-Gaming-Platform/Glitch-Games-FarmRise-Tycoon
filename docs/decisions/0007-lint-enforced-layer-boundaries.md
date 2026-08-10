# 0007. Layer boundaries enforced by ESLint, not convention

- **Status:** Accepted
- **Date:** 2026-08-09

## Context

The brief's central requirement is that reusable engine systems stay independent of game-specific
rules. Documented architecture rules erode: an engineer under time pressure adds one import from
`engine/` into `game/`, review misses it, and six months later the engine is not liftable.

This project is also explicitly intended to be extended by AI agents, which are, if anything, more
inclined to reach for the import that makes the type error go away.

## Decision

The dependency rules from ARCHITECTURE.md are encoded as `import/no-restricted-paths` zones in
`eslint.config.js`, each with a message naming the correct fix. `npm run lint` fails on a violation
and `npm run verify` runs lint.

`eslint-import-resolver-typescript` is a required dependency, because without it the rule cannot see
through the `@engine/*`-style path aliases and would silently ignore most imports.

## Consequences

- The architecture is a build-time fact, not a document.
- Error messages teach: "engine/ is game-agnostic. Move the shared behaviour into engine/ or invert
  the dependency with a port/interface."
- Changing a boundary now requires editing this config deliberately, which surfaces in review.
- Test files are exempt — they legitimately assemble fixtures across layers.
- The resolver adds noticeable time to `npm run lint` on a large tree. Acceptable.
- The rule matches paths, not semantics. It cannot stop `game/` from importing something through a
  re-export chain that launders the path, so review still matters.

## Alternatives considered

- **Documentation only.** Tried everywhere, works nowhere.
- **`dependency-cruiser`.** More expressive, and a second tool and config to keep in step with the
  ESLint one.
- **Separate packages per layer with real package boundaries.** The strongest enforcement, and it
  imposes build orchestration and versioning on internal layers that change together.
