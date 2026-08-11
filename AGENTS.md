# Repository agent instructions

Read [`docs/AI_INSTRUCTIONS.md`](docs/AI_INSTRUCTIONS.md) before changing this repository.

## Required Node runtime

Use Node 24 for every install, native dependency rebuild, test, development server, and production
build. The pinned local version is in `.nvmrc`, and the Glitch production container also uses Node
24.

Before running npm commands, verify:

```bash
node --version
```

It must report Node 24. In shells that do not automatically honor `.nvmrc`, run `nvm use` or prefix
commands with the Node 24 binary path. Do not run this repository under Node 20. Do not use the
installed Node 22.13 runtime for verification: in this checkout, opening a `better-sqlite3` database
under that runtime caused a native segmentation fault, which Vitest surfaced only as
`[vitest-pool]: Worker exited unexpectedly` in `apps/server/tests/unit/migrator.test.ts`.

If that worker error appears, check `node --version` and run this smoke test under Node 24 before
debugging application code:

```bash
node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); console.log(db.prepare('select 1').get()); db.close()"
```

Do not report verification as passing until `npm run verify` completes under Node 24.
