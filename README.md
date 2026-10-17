# SockLove Pages

[![Release](https://img.shields.io/badge/release-1.0%20%C2%B7%20Proposal-FF3355?style=flat-square)](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md)
[![Licence](https://img.shields.io/badge/licence-MIT-666?style=flat-square)](https://github.com/socklove-eth/pages/blob/v1.0/LICENSE)

> One file. One name. One purpose.

---

The two 📄 **Pages** of `1.0`: one [HTML](https://html.spec.whatwg.org/) file
each, loading no other file, pinned on 🕸️ **[IPFS](https://ipfs.tech/)** under
an 📛 **[ENS](https://ens.domains/)** sub-name. Both serve the
💍 **[Ring](https://etherscan.io/address/socklove.eth)**, the
🔐 **[Safe](https://safe.global/)** `1.4.1` at
`0x0857293192bF97Ee73bB471c185E1933Fa51E0ca` that 🌐 `socklove.eth` resolves to.

| Page | Name | Wallet | What it does |
|---|---|---|---|
| 💒 **[Altar](https://altar.socklove.eth.limo)** | `altar.socklove.eth` | Only to act. | The 🧎 **[Proposal](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md)**, then the yes. |
| 👀 **[Sigil](https://sigil.socklove.eth.limo)** | `sigil.socklove.eth` | Never. | A transaction hash as ten 🧿 **[Marks](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json)**. |

- **Rules:** [STANDARD.md](https://github.com/socklove-eth/pages/blob/v1.0/STANDARD.md).
- **Threat model:** [SECURITY.md](https://github.com/socklove-eth/pages/blob/v1.0/SECURITY.md).
- **Design:** [ARCHITECTURE.md](https://github.com/socklove-eth/docs/blob/v1.0/ARCHITECTURE.md).
- **CIDs:** [RELEASE.md](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md),
the release's record.
- **Verification:** [RELEASES.md](https://github.com/socklove-eth/docs/blob/v1.0/RELEASES.md),
how to check them.

---

## ⚙️ Commands

Needs [npm](https://docs.npmjs.com/) `12` and
[Node.js](https://nodejs.org/docs/latest/api/) `26` or later (enforced by
`devEngines`), and [Anvil](https://www.getfoundry.sh/anvil) on `PATH`. Start
with `npm ci`: the bundle records each module's path, so the CIDs reproduce
only from the `node_modules` directory `npm ci` makes, never a linked one.

| Command | Does |
|---|---|
| `npm run build` | Builds the Pages and prints their CIDs. |
| `npm run preview` | Builds, then serves `dist/` on `:4174`. |
| `npm run dev` | The same, with [.env.development](https://github.com/socklove-eth/pages/blob/v1.0/.env.development)'s endpoint. |
| `npm run lint` | [Oxlint](https://oxc.rs/docs/guide/usage/linter), type-aware; `lint:unused` runs [Knip](https://knip.dev/). |
| `npm run typecheck` | [TypeScript](https://www.typescriptlang.org/docs/). |
| `npm test` | [Vitest](https://vitest.dev/); `test:watch` reruns on save. |
| `npm run test:harness` | Builds, then the four harnesses, Anvil on `:8546`. |
| `npm run test:e2e` | Builds, then [Playwright](https://playwright.dev/), Anvil on `:8547`, the Pages on `:4178`. |
| `npm run test:all` | Lint through `test:e2e`, in order. |
| `npm run test:fork` | The assumed chain, on a running fork on `:8548`. |
| `npm run localnet` | Stages a 1-of-1 chain on `:8545`, prints its keys and exits. |
| `npm run localnet:serve` | Stages it and serves the built Pages on the LAN, `:4177`. |

---

## 🗺️ Code map

| | Where | Holds |
|---|---|---|
| 💒 | [altar/](https://github.com/socklove-eth/pages/tree/v1.0/src/altar), in [src/](https://github.com/socklove-eth/pages/tree/v1.0/src) | [index.html](https://github.com/socklove-eth/pages/blob/v1.0/src/altar/index.html); [main.ts](https://github.com/socklove-eth/pages/blob/v1.0/src/altar/main.ts), the screens; [lib/](https://github.com/socklove-eth/pages/tree/v1.0/src/altar/lib): chain, wallet, storage, dom, copy, [ABIs](https://docs.soliditylang.org/en/latest/abi-spec.html), batch, config, signed link, [QR](https://www.iso.org/standard/83389.html), `rpc.endpoints`, **SafeTx** types. |
| 👀 | [sigil/](https://github.com/socklove-eth/pages/tree/v1.0/src/sigil), in [src/](https://github.com/socklove-eth/pages/tree/v1.0/src) | [index.html](https://github.com/socklove-eth/pages/blob/v1.0/src/sigil/index.html); [main.ts](https://github.com/socklove-eth/pages/blob/v1.0/src/sigil/main.ts), the screen. |
| 🧿 | [marks/](https://github.com/socklove-eth/pages/tree/v1.0/marks) | [marks.json](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json), the 64 Marks; [marks.ts](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.ts), the derivation; [marks.test.ts](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.test.ts), pinning [marks.json](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json)'s hash. |
| ✨ | [light/](https://github.com/socklove-eth/pages/tree/v1.0/light) | The ✨ **[Light](https://github.com/socklove-eth/docs/blob/v1.0/STYLE.md)**, [light.css](https://github.com/socklove-eth/pages/blob/v1.0/light/light.css), beside [light.test.ts](https://github.com/socklove-eth/pages/blob/v1.0/light/light.test.ts). |
| 🪟 | [page.css](https://github.com/socklove-eth/pages/blob/v1.0/page.css), [fonts/](https://github.com/socklove-eth/pages/tree/v1.0/fonts), [logo.png](https://github.com/socklove-eth/pages/blob/v1.0/logo.png), [favicon.png](https://github.com/socklove-eth/pages/blob/v1.0/favicon.png) | The shell and layout, [Cinzel](https://fonts.google.com/specimen/Cinzel) and [Outfit](https://fonts.google.com/specimen/Outfit), the logo and favicon. |
| 🏗️ | [build.mjs](https://github.com/socklove-eth/pages/blob/v1.0/build.mjs), [scripts/](https://github.com/socklove-eth/pages/tree/v1.0/scripts) | The build: audit, csp, cid, env, age, serve. |
| 📐 | [shell.test.ts](https://github.com/socklove-eth/pages/blob/v1.0/shell.test.ts) | [STANDARD.md](https://github.com/socklove-eth/pages/blob/v1.0/STANDARD.md), per Page; every other unit test sits beside its code. |
| 🧪 | [localnet/](https://github.com/socklove-eth/pages/tree/v1.0/localnet) | The local chain, keys, the four harnesses and the fork check. Altar's harness is split by concern in its own [altar/](https://github.com/socklove-eth/pages/tree/v1.0/localnet/altar) here, and all four share [check.mjs](https://github.com/socklove-eth/pages/blob/v1.0/localnet/check.mjs); beside them, vendored Safe and ENS fixtures, in [artifacts/](https://github.com/socklove-eth/pages/tree/v1.0/localnet/artifacts), each hash-checked. |
| 🖥️ | [e2e/](https://github.com/socklove-eth/pages/tree/v1.0/e2e) | Playwright specs and the test wallet. |
| 🤖 | [.github/](https://github.com/socklove-eth/pages/tree/v1.0/.github) | [pages.yml](https://github.com/socklove-eth/pages/blob/v1.0/.github/workflows/pages.yml), [dependabot.yml](https://github.com/socklove-eth/pages/blob/v1.0/.github/dependabot.yml). |

Two things never change without their tests:
[marks.json](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json),
whose hash a test pins, and the [CSS](https://www.w3.org/Style/CSS/) classes
each Page's script sets.

---

## 🏗️ Build

[build.mjs](https://github.com/socklove-eth/pages/blob/v1.0/build.mjs) inlines
the Light, [page.css](https://github.com/socklove-eth/pages/blob/v1.0/page.css),
the Pages' shared stylesheet, fonts, logo and favicon, bundles each Page's
script with [Vite](https://vite.dev/), and hashes each inline script and style
into the
[Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
[audit.mjs](https://github.com/socklove-eth/pages/blob/v1.0/scripts/audit.mjs)
fails the build on any external reference, a missing or loose policy, or a
missing bundle. The output, unminified and unmapped, never committed:

| Output | Is |
|---|---|
| `build/<PAGE>.iife.js` | Vite's bundle; `<PAGE>.licenses.json`, its licences. |
| `dist/<PAGE>/index.html` | Pinned, so `ipfs://<CID>/` resolves. |
| `dist/local/<PAGE>.html` | The same bytes, flat, never pinned; Sigil runs from `file://`. |
| `dist/local/index.html` | The localnet index, never pinned. |
| `dist/index.html` | The index, never pinned. |

---

## 🎛️ Configuration

| Variable | In | Read by |
|---|---|---|
| `RPC_URLS` | [.env](https://github.com/socklove-eth/pages/blob/v1.0/.env); [.env.development](https://github.com/socklove-eth/pages/blob/v1.0/.env.development). | The build: Altar's baked endpoints, in order; `npm run dev`: `http://127.0.0.1:8545`. |
| `ENS_NAME`, `ENS_LABEL`, `ENS_REGISTRY_WITH_FALLBACK`, `ENS_PUBLIC_RESOLVER`, `SAFE_MULTI_SEND_CALL_ONLY`, `SAFE` | [.env](https://github.com/socklove-eth/pages/blob/v1.0/.env). | The build, local chain and fork check: `socklove.eth`; `sockthief`, the label the Proposal hands over; addresses, the Ring's included, where the local chain places it too. |
| `ANVIL_RPC`, `ANVIL_PORT`, `PORT` | The environment, as in [.env.example](https://github.com/socklove-eth/pages/blob/v1.0/.env.example). | `ANVIL_RPC`: the local chain (default `:8545`) and the fork check (`:8548`); `ANVIL_PORT`: `test:harness`'s Anvil (`8546`); `PORT`: `localnet:serve` (`4177`). |

[.env](https://github.com/socklove-eth/pages/blob/v1.0/.env) is committed, a
build input to the CID; a `.env.local`, `.env.production.local` or
`.env.development.local` fails the build.
[env.mjs](https://github.com/socklove-eth/pages/blob/v1.0/scripts/env.mjs)
refuses anything but a `.eth` name, a plain label and checksummed addresses.

`RPC_URLS` holds ten keyless endpoints of ten operators, each passing a
[CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS) preflight
and answering every call Altar makes. They are tried in order, ranked by what
the operator keeps, nothing first, then the shortest retention; a decentralised
network leads:

1. `https://eth.api.pocket.network`
2. `https://0xrpc.io/eth`
3. `https://ethereum-rpc.publicnode.com`
4. `https://rpc.mevblocker.io`
5. `https://ethereum-json-rpc.stakely.io`
6. `https://rpc-eth.blockmachine.io`
7. `https://eth.drpc.org`
8. `https://ethereum.public.blockpi.network/v1/rpc/public`
9. `https://rpc.swiftnodes.io/rpc/eth`
10. `https://mainnet.rpc.sentio.xyz`

The
🔧 **[Living Registry](https://github.com/socklove-eth/docs/blob/v1.0/REGISTRY.md)**
record `rpc.endpoints` can put others ahead.

---

## 🕹️ Rehearsing the Proposal

On ⛓️ **[Ethereum](https://ethereum.org/)** the Proposal happens once, for
real. To rehearse it as often as you like, run it on a local chain:

```bash
anvil --silent &   # A local chain on :8545, chain 31337.
npm run localnet   # Stages a 1-of-1 Ring; prints owner A's and owner B's keys.
npm run preview    # Builds, then serves the index on http://localhost:4174/.
```

Import each key into a wallet in its own browser profile, on
`http://127.0.0.1:8545`. The index has a button per Page. Its localnet button
(`/local/`) points the tab at `http://127.0.0.1:8545`, named in the notice; the
localnet index's own index button forgets it. The endpoint belongs to the tab,
so:

1. As owner A, open the index, press the localnet button, then the Altar button.
Enter owner B's address and press the Ask button: the wallet signs, and Altar
shows the hash and the QR code of the signed link.
2. As owner B, in one tab of B's profile: the index, localnet, then the signed
link. The Yes button executes, and the Ring is 2-of-2.
3. Run `npm run localnet` again to stage a fresh 1-of-1 Ring.

For two devices, start Anvil with `--host 0.0.0.0`, build, and run
`npm run localnet:serve`. Sigil works offline.

---

## ✅ Tests

| Layer | Runs | Covers |
|---|---|---|
| Unit (Vitest), 278 | `npm test`, in [jsdom](https://github.com/jsdom/jsdom). | Every module with logic in [src/](https://github.com/socklove-eth/pages/tree/v1.0/src), [marks/](https://github.com/socklove-eth/pages/tree/v1.0/marks) and [scripts/](https://github.com/socklove-eth/pages/tree/v1.0/scripts) but the screens (Altar's [main.ts](https://github.com/socklove-eth/pages/blob/v1.0/src/altar/main.ts) and Sigil's [main.ts](https://github.com/socklove-eth/pages/blob/v1.0/src/sigil/main.ts)), which the harnesses and browser tests cover: the batch, the SafeTx and its owner check, the record's rules, storage, wallet errors, the ABIs against the vendored Safe; the Marks and [marks.json](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json)'s hash; the build scripts; beside them, the shell, the Light's rules, and every vendored fixture's [SHA-256](https://csrc.nist.gov/pubs/fips/180-4/upd1/final). |
| Harnesses (jsdom, Anvil), 227 + 10 + 32 + 17 | [all.mjs](https://github.com/socklove-eth/pages/blob/v1.0/localnet/all.mjs) on the built Pages, each on a reset Anvil on `:8546`. | Every Altar screen, message and refusal in its exact copy, the asker unable to answer though at **Threshold** 1; signing against a real Safe; Sigil's silence on bad input; the LAN build, its endpoints rewritten to the LAN's Anvil. |
| Browser (Playwright), 232 | The built Pages on `:4178`, Anvil on `:8547`. | [Chromium](https://www.chromium.org/) and [Firefox](https://www.firefox.com/), 116 each: what only a real browser shows, namely wallets and chain switches, the CSP and [Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API), refusals (frames, path gateways, `file://`, [JavaScript](https://tc39.es/ecma262/) off), copying, the QR code, the LAN Altar over plain http, layout and 44px targets on every screen, the Marks' rows and numbers, colours, fonts and button names. |
| Fork, 35 | `npm run test:fork`, a fork of Ethereum on `:8548`. | Every address's bytes, the Ring's setup, the name's resolver, registrant, approval and sub-names, `rpc.endpoints`; at 1-of-1, the batch executed, then reverted. |

The fork check runs on a fork of Ethereum on `:8548`:

```bash
anvil --silent --port 8548 --fork-url <RPC_URL> &
npm run test:fork
```

To reach the screen asking for an endpoint, store one nothing answers in
[`sessionStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)
key `rpc` and reload:

```js
sessionStorage.setItem('rpc', 'http://127.0.0.1:1'); location.reload()
```

A browser run fails on any Page log, any failed request and any request that
leaves this machine; the staged chain answers for every baked endpoint. The
harness runs the Page's **Nonce** read every 100 s, a third of its five minutes,
allowing 130 s for the Done screen. The local Ring is created as the Ring was,
then placed at its address.

---

## 🤖 CI

[pages.yml](https://github.com/socklove-eth/pages/blob/v1.0/.github/workflows/pages.yml)
runs read-only from a clean install, on a push to `main` or a `v*` tag, weekly
and on demand:

| Job | Runs |
|---|---|
| Build and reproduce | Lint, Knip, typecheck, unit, build; a clean rebuild to the same CIDs, which [Kubo](https://github.com/ipfs/kubo) `0.43.1` ([SHA-512](https://csrc.nist.gov/pubs/fips/180-4/upd1/final)-checked, `unixfs-v1-2025`) matches and exports as [CAR](https://ipld.io/specs/transport/car/) files; on a tag, the CIDs in [RELEASE.md](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md). |
| Harnesses and browser tests | `test:harness`, then `test:e2e`. |
| Fork parity | Weekly or on demand: `test:fork` on a fork from the first baked endpoint. |
| Workflow audit | [zizmor](https://docs.zizmor.sh/), auditor persona. |

npm `12.2.0`, Node.js per
[.nvmrc](https://github.com/socklove-eth/pages/blob/v1.0/.nvmrc),
[Foundry](https://www.getfoundry.sh/) `1.8.5`; actions pinned by SHA,
credentials unpersisted.
[dependabot.yml](https://github.com/socklove-eth/pages/blob/v1.0/.github/dependabot.yml)
alerts only, weekly, with a cooldown: a bump changes the CID, so it ships only
in a release.

---

## 🧰 Dependencies and licence

Versions are exact, in
[package.json](https://github.com/socklove-eth/pages/blob/v1.0/package.json).
Only [viem](https://viem.sh/) `2.57.4` and [qr](https://github.com/paulmillr/qr)
`0.7.2`, with `ox`, `abitype`, `@noble/curves` and `@noble/hashes`, are bundled,
into Altar alone.
[.npmrc](https://github.com/socklove-eth/pages/blob/v1.0/.npmrc) refuses install
scripts and any release under a week old; after each CI `npm ci`,
`scripts/age.mjs 7` fails if
[package-lock.json](https://github.com/socklove-eth/pages/blob/v1.0/package-lock.json)
holds one. Every Page ends with the licences its bytes owe.

[MIT](https://opensource.org/license/mit), in
[LICENSE](https://github.com/socklove-eth/pages/blob/v1.0/LICENSE);
[NOTICE](https://github.com/socklove-eth/pages/blob/v1.0/NOTICE) lists the rest,
[REUSE.toml](https://github.com/socklove-eth/pages/blob/v1.0/REUSE.toml) per
file.
