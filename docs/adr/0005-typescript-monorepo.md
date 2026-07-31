# ADR-0005: TypeScript monorepo with a shared contract

**Status:** Accepted
**Date:** 2026-07-31

## Context

The bridge is an I/O-bound HTTP service: run `tmux capture-pane`, parse text,
return JSON. Almost any language does this well, so the choice turns on
something other than raw suitability.

Three clients consume the same protocol:

1. the bridge server, which implements it
2. a phone PWA, which consumes it
3. the Garmin app, written in Monkey C, which **cannot import anything**

That third client is the interesting constraint. Monkey C has no package
manager and no way to consume a TypeScript type or an OpenAPI schema. It will
re-implement parsing by hand, against documentation, no matter what is chosen.

So the question is not "how do we share the contract with all three" — that is
impossible. It is "how do we keep the two that *can* share it from drifting,
and how do we make the third's manual implementation as safe as possible".

## Decision

A pnpm workspace with `packages/shared` holding the wire contract as Zod
schemas, imported by the server and by the PWA.

```
packages/shared    Zod schemas + inferred types + text helpers
packages/server    Fastify bridge
packages/web       PWA (planned)
edge-app           Monkey C — implements the contract by hand
```

Zod rather than plain TypeScript types because the contract needs to exist at
**runtime**, not only at compile time. The device is an untrusted client
sending hand-written JSON; the server must validate what arrives, and deriving
types from the validator means the two cannot disagree.

The shared package also holds the text helpers — ANSI stripping, width-aware
wrapping, content hashing. These are not there for convenience. The server and
the PWA must wrap text identically: if they disagreed about where a line
breaks, they would disagree about line numbering, and a hash computed on one
would not match the other, breaking approvals across clients.

For the Monkey C side, `protocol.ts` is written as documentation as much as
code — short field names, explicit reasoning, and a version constant, because
every breaking change is a change to software already installed on someone's
handlebars.

## Consequences

**One language across server and PWA.** The contract is enforced by the
compiler on both sides of the network for the two clients that can be.

**Runtime validation is free.** Every request is parsed with the same schema
that produced the types.

**Monkey C still drifts if we let it.** The mitigation is discipline, not
tooling: the protocol is versioned, `docs/api.md` is the normative reference
for the device implementation, and response shapes only ever gain optional
fields.

**Node's type stripping runs the sources directly.** `node --experimental-strip-types`
means development has no build step, and the same files compile to JavaScript
for the container. It requires `.ts` extensions in imports, hence
`allowImportingTsExtensions` and `rewriteRelativeImportExtensions`.

**pnpm rather than npm.** Workspace support that works, and a lockfile the
Docker build can rely on for layer caching.

## Alternatives considered

**Python with FastAPI and Pydantic.** Equally good at the server, and Pydantic
covers the runtime-validation requirement. Rejected because the PWA is
TypeScript regardless, so the contract would be maintained by hand in two
places — which is exactly where things drift. Adding a second runtime to the
deployment for no gain compounded it.

**Go.** A single static binary, trivial deployment, excellent performance. Same
contract-duplication problem, plus more code for the text handling that is most
of this service.

**OpenAPI with generated clients.** Would help if the device could consume a
generated client. It cannot, so the generator's output serves only the two
clients that already share types — a build step for no benefit.

**A single package rather than a workspace.** Would work today, with the server
exporting types the PWA imports. Rejected because it makes the PWA depend on
the server's dependency tree, and the contract is the thing that should be
depended on.

## Revisit when

- The PWA is dropped, which would remove the main reason for a shared package.
- Monkey C gains a way to consume generated code, which would change the
  calculus entirely.
