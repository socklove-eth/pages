# SockLove Pages Standard

> Nobody maintains a page. It is finished when it is placed.

---

What every 📄 **[Page](https://github.com/socklove-eth/pages/tree/v1.0)** must
do and refuse. How a Page looks and speaks:
[STYLE.md](https://github.com/socklove-eth/docs/blob/v1.0/STYLE.md).

---

## 🎯 One job

A Page does **one job**, perfectly, and nothing else. **Once pinned, it never
changes.** Only a critical or serious vulnerability re-pins it, in a new
release; anything else is a new Page.

---

## 🧭 No way out

A Page **never navigates away or opens a tab**. A value worth checking
elsewhere is a copy target. On a signing screen everything pressable acts.

---

## 🪟 Shell

A Page is one window-high shell: logo, title, subtitle; the *Consent as
Architecture* tagline in the footer. **Only the middle scrolls**: no second
scrolling region, no sticky element, no scrolling document.

**The notice** — who a Page talks to — is one footer line under the tagline, led
by ☝️, and nowhere else; it shows only when there is a party to name. Its one
pressable part copies what it names; it is never a link.

---

## ⌨️ Fields and buttons

- **A field refused for what was just entered silently empties and briefly
shows the thorn** (`.pricked`,
[STYLE.md](https://github.com/socklove-eth/docs/blob/v1.0/STYLE.md)),
marked invalid for a screen reader until the field next changes or takes a
paste. What each field takes:
[ARCHITECTURE.md](https://github.com/socklove-eth/docs/blob/v1.0/ARCHITECTURE.md).
- **A button is read by its words alone.** Its emoji is hidden from screen
readers; its words name it.

---

## 🛡️ Where a Page refuses to run

A `<meta>`
[CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy)
ignores `frame-ancestors`, and a Page on 🕸️ **[IPFS](https://ipfs.tech/)**
sets no headers of its own. So in a frame, or on a path gateway (`/ipfs/` or
`/ipns/`, in any case, anywhere in the decoded path), a Page **refuses in
script and never redirects**. A Page that keeps state also refuses `file://`,
where every local file shares one storage. A refusing Page keeps its shell and
says so in the middle.

---

## ✋ What a Page never adds

1. **Relay.** The wallet is reached in the browser, never paired through one.
2. **Login.** There is nothing to sign in to: the one signature is the one that
acts.
3. **Batching.** A Page sends one transaction and never batches calls itself:
the 💍 **[Ring](https://etherscan.io/address/socklove.eth)**, a
🔐 **[Safe](https://safe.global/)**, batches them inside it.
4. **Simulator.** The chain decides: a third party's simulation could differ
from the chain, and is an unnamed party.
5. **Subresources.** A Page is one file and loads nothing beside it; its **CID**
covers every byte, leaving [subresource integrity](https://www.w3.org/TR/SRI/)
nothing to check.

---

## 🏷️ Naming a Page

1. **One plain word, naming the whole job.**
2. **No collision with project vocabulary** (Ring, **Threshold**,
🧎 **[Proposal](https://github.com/socklove-eth/.github/blob/v1.0/RELEASE.md)**)
unless the word already names the job:
👀 **[Sigil](https://sigil.socklove.eth.limo)** draws a sigil.
3. **No phishing bait**, as *keys* is.
4. **Its emoji passes the same tests.**

Place-names where admission is the point, thing-names where the object is.

---

## 🔍 How it is checked

[audit.mjs](https://github.com/socklove-eth/pages/blob/v1.0/scripts/audit.mjs)
and
[shell.test.ts](https://github.com/socklove-eth/pages/blob/v1.0/shell.test.ts)
hold every Page to this standard. They confirm that a Page:

- Never navigates away.
- Is one file, with its shell, licence notices and relative paths.
- References nothing outside itself.
- Carries its refusals.
- Sets a Content-Security-Policy that lets no script write
[HTML](https://html.spec.whatwg.org/) from a string.

The browser tests then run those refusals, and a reviewer checks the rest.
