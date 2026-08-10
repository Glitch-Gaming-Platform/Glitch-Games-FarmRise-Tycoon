# 0015. Continue plain GLB after crossing the original Meshopt trigger

- **Status:** Accepted
- **Date:** 2026-08-10

## Context

ADR 0010 chose plain GLB with HTTP gzip and required a new measurement once the model set exceeded
1 MB raw or 200 KB gzipped. The authored world now contains 34 assets, including visible work tools
and a more detailed farmer. It measures 1,026,928 raw bytes and about 258,606 gzip bytes, so both
original triggers have fired.

The Blender build now records raw and gzip bytes for raw, Draco and Meshopt variants directly in
`art/build_report.json`.

## Decision

Continue shipping plain GLB. On the current asset set:

| Option | Transport | Decoder | First load |
| --- | ---: | ---: | ---: |
| Plain GLB + gzip | 258,606 | 0 | 258,606 |
| Meshopt + gzip | 248,420 | about 5,000 | 253,420 |
| Draco + gzip | 197,113 | about 230,000 | 427,113 |

Meshopt's measured first-load saving is only about 5.2 KB, or 2%. That does not justify a new
runtime decoder, build configuration and failure path. Revisit when measured first-load savings
reach at least 25 KB, or when physical-device cold-load profiling identifies model transfer as a
user-visible bottleneck.

## Consequences

- The loader remains dependency-free and every browser receives ordinary GLB.
- The previous size-only Meshopt trigger is replaced by a measured net-savings trigger.
- The model payload is slightly over its 250 KB gzip budget and remains visible as follow-up work;
  continuing plain GLB does not redefine that budget away.
- Draco remains substantially worse because its decoder outweighs the transport saving.
- Every `art:build` refreshes the compression evidence instead of relying on a stale one-off report.

## Alternatives considered

- **Enable Meshopt immediately.** Technically valid, but a 5.2 KB win is too small for the added
  runtime and build complexity.
- **Raise the model budget.** Rejected; the overage should remain visible until reduced or justified
  by a separate decision.
- **Enable Draco.** Rejected because first load would grow by roughly 168 KB.
