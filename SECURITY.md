# SockLove Pages Security

> One page asks for a signature. Read it before you sign.

---

## 🤝 What you trust

💒 **[Altar](https://altar.socklove.eth.limo)**: your browser and wallet, the
🕸️ **[IPFS](https://ipfs.tech/)** gateway serving the
📄 **[Page](https://github.com/socklove-eth/pages/tree/v1.0)**, the
`contenthash` it follows, the 🔐 **[Safe](https://safe.global/)** contracts and
the parts below. 👀 **[Sigil](https://sigil.socklove.eth.limo)**: your browser's
cryptography, the same gateway and `contenthash`; no wallet, no network. Verify
the **CID**, or fetch the Page from your own IPFS node's subdomain gateway,
`http://<CID>.ipfs.localhost:8080/`. Sigil also runs as a saved file, with
[Kubo](https://github.com/ipfs/kubo)'s
`ipfs get <CID>/index.html -o sigil.html`; Altar refuses `file://`.

| Part | Trusted for | Can it hurt you |
|---|---|---|
| 💍 **[Ring](https://etherscan.io/address/socklove.eth)** | Everything. | It enforces the **Threshold** in code. |
| **Wallet** | Showing what you sign. | **The one surface a compromised Page cannot redraw.** Read it: it shows the **SafeTx**, not the owner inside its data, so compare the hash between the two screens, shown once the asker has signed. |
| Gateway | Serving the bytes the name points at. | A subdomain or 📛 **[ENS](https://ens.domains/)** gateway such as the .eth.limo gateway gives each Page its own origin: a convenience, not an authority. A path gateway's shared origin is refused. |
| **ENS** | Until the yes that ends the 🧎 **[Proposal](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md)**: its built-in registry and resolver binding the name to the Ring, and the root and governance above. | At 1-of-1 another resolver or address is refused; the Ring itself is pinned. |
| **Endpoints** | Nothing. | They can lie about state but move nothing: the Ring and the resolver are pinned, off-chain lookups off; their first answer sets the chain, each held to it, ⛓️ **[Ethereum](https://ethereum.org/)** or the local chain. One you supply replaces the rest for the tab, the 🔧 **[Living Registry](https://github.com/socklove-eth/docs/blob/v1.0/REGISTRY.md)**'s included, and is forgotten when the first read through it fails at load or after the Connect button, when it cannot be reached or answers for another chain as the Ask or Yes button acts, or when it reads the name unset or moved where the screen can be redrawn. |
| **Living Registry** | Naming [RPC](https://ethereum.org/developers/docs/apis/json-rpc/) endpoints. | Only the Ring, which owns 🌐 `socklove.eth`, writes it; an endpoint it names is trusted no more than any other: [ARCHITECTURE.md](https://github.com/socklove-eth/docs/blob/v1.0/ARCHITECTURE.md). |
| **Sigil** | Nothing. | It cannot reach the network; a faulty one makes the 🧿 **[Marks](https://github.com/socklove-eth/pages/blob/v1.0/marks/marks.json)** disagree — a refusal, not a loss; a hostile one could make them agree, so verify its name and CID as Altar's. |
| **Link** | Nothing. | The signature is recovered, never trusted. |

**The signed link is the capability:** `<PAGE_URL>#<FRAGMENT>`, leaving Altar
only as a [QR code](https://www.iso.org/standard/83389.html), query dropped. At
Threshold 1 its holder can send it from any address; guard it as a key. An
earlier Ring transaction moves the **Nonce**, voiding it. The Nonce signed is
the one the endpoint reports, and the wallet shows it. A lying endpoint could
report a later one: the link is then valid only once the Ring reaches that
Nonce, and the Page shows that link until a reload, or until the Ring moves past
that Nonce.

The residual risk is every dapp's: you must be looking at the right bytes.

---

## 🕵️ What each party learns

- The RPC endpoint: your IP, and that you use Altar. At 1-of-1, the Nonce read
every five minutes (none while hidden, one on return) shows you are still there;
a failed endpoint learns as much. After the yes, it ties your IP to that
transaction: while the tab is open, the receipt wait polls every few seconds
until the receipt arrives, its endpoint is forgotten, or a read fails once Done
shows; across a reload, Altar asks every twelve seconds whether the send still
stands, until the send is seen, the Nonce moves, a read fails, or six minutes
after the send pass. The notice names the host answering now.
- Your wallet's node: what it sends.
- The gateway: your IP and the name, never the link's fragment.
- Cameras: a QR code on screen.

---

## 🎯 Scope

**In scope:**

- Altar showing one transaction, signing another.
- A Page misstating the chain state it read.
- A tampered signed link accepted, or recovering the wrong signer.
- Sigil drawing Marks for a hash it was not given.
- A Page reaching the network past its
[Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).
- A CID not matching its source.
- In `1.0`, any surface but Altar asking for a signature.

**Out of scope:** a lying public RPC, stale gateway bytes, compromised keys.

Report a finding:
[SECURITY.md](https://github.com/socklove-eth/.github/blob/v1.0/SECURITY.md).

---

## ⚠️ Known limitations

- **One reviewer**,
🔥 **[Sockpusher](https://etherscan.io/address/sockpusher.socklove.eth)**:
[ALTAR_1.0.md](https://github.com/socklove-eth/audits/blob/v1.0/internal/ALTAR_1.0.md),
[SIGIL_1.0.md](https://github.com/socklove-eth/audits/blob/v1.0/internal/SIGIL_1.0.md).
- **Altar is mostly bundled [viem](https://viem.sh/) and
[qr](https://github.com/paulmillr/qr).**
- **Frame refusal is script**, as is path gateway refusal: strippable by a
hostile copy, and skipped in a frame that runs no script, where the Page lies
inert; a `<meta>` CSP neither refuses framing nor stops an opener navigating a
Page. Verify name and CID.
- **Current major browser engines enforce
[Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API)**;
an older one skips that layer.
- **Sigil's sixty bits guard a fixed hash**, not two chosen together to match:
[ARCHITECTURE.md](https://github.com/socklove-eth/docs/blob/v1.0/ARCHITECTURE.md).
- **Wallets name themselves**; a malicious one already owns the Page.
- **Altar accepts the local chain from any endpoint answering for it, and
loopback endpoints**; a signature there is worthless on Ethereum.
