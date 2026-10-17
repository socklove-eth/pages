#!/usr/bin/env node
/**
 * Builds each page in src/ into one self-contained HTML file.
 *
 *   node build.mjs [name]     every page, or one
 *   node build.mjs --serve    then serve dist/ on :4174
 *   node build.mjs --dev      development RPC set; never pinned
 *
 * dist/<name>/index.html is pinned as a directory so ipfs://<cid>/ resolves.
 * dist/local/ holds the same bytes as flat files for file://; never pinned.
 * dist/index.html, the Index, has a button per page and one to /local/, the
 * Localnet, on a local Anvil; never pinned.
 *
 * Source directives (an unbuilt source still renders):
 *   <link rel="stylesheet" href="../../light/light.css"> -> removed; inlined with page.css
 *   <link rel="stylesheet" href="../../page.css">  -> inlined, fonts as data:
 *   src="../../logo.png"                           -> inlined as data:
 *   <!--PAGE:FAVICON-->                            -> inlined <link rel=icon>
 *   <!--PAGE:LOGIC-->                              -> the page's bundle
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { directoryCid } from './scripts/cid.mjs'
import { audit } from './scripts/audit.mjs'
import { lockCsp } from './scripts/csp.mjs'
import { pageConfig, rpcUrls } from './scripts/env.mjs'
import { serve } from './scripts/serve.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DIST = join(HERE, 'dist')
const LOCAL = join(DIST, 'local')
const BUILD = join(HERE, 'build')

// The page list; shell.test.ts parses it. Paths derive from name.
const PAGES = [
  { name: 'altar', symbol: '💒', chain: true },
  { name: 'sigil', symbol: '👀' },
]
const subName = (page) => `${page.name}.${pageConfig(HERE).name}`

const MIME = { woff2: 'font/woff2', png: 'image/png', svg: 'image/svg+xml' }

function dataUri(relPath) {
  const mime = MIME[relPath.split('.').pop()]
  if (!mime) throw new Error(`no MIME type known for ${relPath}`)
  return `data:${mime};base64,${readFileSync(join(HERE, relPath)).toString('base64')}`
}

// One Vite run per page: the IIFE format takes a single entry.
function buildLogic(pages, dev) {
  const vite = join(HERE, 'node_modules/.bin/vite')
  if (!existsSync(vite)) throw new Error('vite not found — run npm ci')
  for (const page of pages) {
    const out = `${page.name}.iife.js`
    execFileSync(vite, ['build', '--mode', dev ? 'development' : 'production'], {
      cwd: HERE,
      env: { ...process.env, PAGE_ENTRY: `src/${page.name}/main.ts`, PAGE_OUT: out },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    if (!existsSync(join(BUILD, out))) throw new Error(`${page.name}: vite produced no ${out}`)
  }
}

/** The packages bundled into a page, with their licence texts; none if Vite listed none. */
function bundledLicences(page) {
  const file = join(BUILD, `${page.name}.licenses.json`)
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
}

// A page is copied alone, so it carries its own licence notices.
function notices(page) {
  const bundled = bundledLicences(page)
  const parts = [
    `${subName(page)}\n\n` +
      "SockLove's own code in this page is under the MIT License below. The Cinzel\n" +
      'and Outfit fonts inlined in its CSS, subsets of the originals, are under the\n' +
      `SIL Open Font License 1.1${bundled.length ? ',\nand the bundled libraries under their own licences,' : ','} all below. The name, the\n` +
      "logo and the favicon are not licensed: they are SockLove's marks, reserved.\n" +
      'This page, unmodified, may be copied, pinned, mirrored and served, name, logo\n' +
      'and favicon included.',
    readFileSync(join(HERE, 'LICENSE'), 'utf8').trim(),
    readFileSync(join(HERE, 'fonts', 'OFL.txt'), 'utf8').trim(),
  ]
  parts.push('Built with Vite and its bundler, both MIT; any interop helpers they emit\ncarry that licence.')
  for (const dep of bundled) {
    if (!dep.text) throw new Error(`${page.name}: ${dep.name} ships no licence text`)
    parts.push(`${dep.name} ${dep.version} (${dep.identifier})\n\n${dep.text.trim()}`)
  }
  const text = parts.join('\n\n---\n\n')
  for (const bad of ['<!--', '-->', '--!>']) {
    if (text.includes(bad)) throw new Error(`${page.name}: a licence text contains ${bad}`)
  }
  return `<!--\n${text}\n-->\n`
}

/** light.css, then page.css with its fonts inlined. */
const pageCss = () =>
  readFileSync(join(HERE, 'light', 'light.css'), 'utf8') + '\n' +
  readFileSync(join(HERE, 'page.css'), 'utf8').replace(/url\('(fonts\/[^']+\.woff2)'\)/g, (_, p) => `url('${dataUri(p)}')`)

function build(page) {
  let html = readFileSync(join(HERE, 'src', page.name, 'index.html'), 'utf8')

  const css = pageCss()
  // Replacer functions, not strings: a bundle contains `$&` and `$1`.
  html = html.replace(/\s*<link\s+rel="stylesheet"\s+href="(?:\.\.\/)*light\/light\.css"\s*\/?>/, '')
  html = html.replace(/<link\s+rel="stylesheet"\s+href="(?:\.\.\/)*page\.css"\s*\/?>/, () => `<style>\n${css}\n  </style>`)
  html = html.replace(/<!--\s*PAGE:FAVICON\s*-->/, () => `<link rel="icon" type="image/png" href="${dataUri('favicon.png')}">`)
  html = html.replace(/src="(?:\.\.\/)*(logo\.png)"/g, (_, file) => `src="${dataUri(file)}"`)

  const directives = html.match(/<!--\s*PAGE:LOGIC\s*-->/g) ?? []
  if (directives.length > 1) throw new Error(`${page.name}: ${directives.length} PAGE:LOGIC directives, expected 1`)
  if (directives.length === 0) throw new Error(`${page.name}: no PAGE:LOGIC directive`)
  html = html.replace(/<!--\s*PAGE:LOGIC\s*-->/, () => readFileSync(join(BUILD, `${page.name}.iife.js`), 'utf8'))

  // Hash before appending the notices comment.
  html = lockCsp(html, page.name)
  html += notices(page)

  mkdirSync(join(DIST, page.name), { recursive: true })
  writeFileSync(join(DIST, page.name, 'index.html'), html)
  mkdirSync(LOCAL, { recursive: true })
  writeFileSync(join(LOCAL, `${page.name}.html`), html)
  return html
}

/** The Index and the Localnet, never pinned; one panel per block. */
function indexPage(title, subtitle, panels, script = '', notice = false) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — SockLove</title>
<link rel="icon" type="image/png" href="${dataUri('favicon.png')}">
<style>
${pageCss()}
a.step { text-decoration: none; line-height: normal; }
</style>
<body>
  <header class="page-header">
    <img class="page-logo" src="${dataUri('logo.png')}" alt="SockLove">
    <h1 class="page-title">${title}</h1>
    <div class="page-rule"></div>
    <p class="page-subtitle">${subtitle}</p>
  </header>
  <main class="page-main">
${panels.map((body) => `    <div class="panel">\n${body}\n    </div>`).join('\n')}
  </main>
  <footer class="page-footer">
    <p class="page-tagline">Consent as Architecture</p>${notice ? '\n    <p class="page-notice"></p>' : ''}
  </footer>
${script}${notice ? noticeScript : ''}</body>
</html>
`
}

// The notice names the tab's RPC endpoint, by host, when it has one.
const noticeScript = `<script>
  try {
    const url = sessionStorage.getItem('rpc')
    const host = url ? new URL(url).host : ''
    if (host) {
      const value = document.createElement('span')
      Object.assign(value, { className: 'inscription', textContent: host, title: 'Copy', tabIndex: 0 })
      value.setAttribute('role', 'button')
      value.setAttribute('aria-label', 'Copy the RPC endpoint')
      // The ✓ only once the host is on the clipboard.
      let copiedTimer
      const copy = async () => {
        let copied = false
        try {
          await navigator.clipboard.writeText(host)
          copied = true
        } catch (e) {
          try {
            getSelection().selectAllChildren(value)
            copied = document.execCommand('copy')
          } catch (e) {}
        }
        if (!copied) return
        // A newer copy restarts the ✓ rather than having an older one clear it.
        clearTimeout(copiedTimer)
        value.classList.add('sealed')
        copiedTimer = setTimeout(() => value.classList.remove('sealed'), 1400)
      }
      value.addEventListener('click', copy)
      value.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          copy()
        }
      })
      document.querySelector('.page-notice').replaceChildren('☝️ The RPC endpoint, ', value, ', sees you ask.')
    }
  } catch (e) {}
</script>
`

const bytesNote = () => (dev ? 'Bytes you never pin.' : 'The bytes you pin.')

const byName = () => [...PAGES].sort((a, b) => a.name.localeCompare(b.name))

const links = (items) =>
  `      <p class="crossroads">${items.map(([href, symbol, name]) => `<a class="step way" href="${href}"><span class="symbol" aria-hidden="true">${symbol}</span>${name}</a>`).join(' ')}</p>`

const LOCAL_RPC = 'http://127.0.0.1:8545'

// dist/local/index.html, the Localnet: sets sessionStorage 'rpc' to a local Anvil for this tab.
function writeLocalnet() {
  const chainPages = byName().filter((p) => p.chain)
  writeFileSync(
    join(LOCAL, 'index.html'),
    indexPage(
      'Localnet',
      `${bytesNote()} A chain you own.`,
      [links(chainPages.map((p) => [`${p.name}.html`, p.symbol, p.name])), links([['../', '📑', 'Index']])],
      `<script>
  try { sessionStorage.setItem('rpc', '${LOCAL_RPC}') } catch (e) {}
</script>
`,
      true,
    ),
  )
}

// dist/index.html, the Index: back from the local chain, it forgets that endpoint, so the tab reads Ethereum again.
function writeIndex() {
  writeFileSync(
    join(DIST, 'index.html'),
    indexPage(
      'Index',
      bytesNote(),
      [
        links(byName().map((p) => [`/${p.name}/`, p.symbol, p.name])),
        links([['/local/', '🪞', 'Localnet']]),
      ],
      `<script>
  try { if (sessionStorage.getItem('rpc') === '${LOCAL_RPC}') sessionStorage.removeItem('rpc') } catch (e) {}
</script>
`,
    ),
  )
}

const argv = process.argv.slice(2)
const dev = argv.includes('--dev')
const wanted = argv.filter((a) => !a.startsWith('--'))
const targets = wanted.length ? PAGES.filter((p) => wanted.includes(p.name)) : PAGES

if (!targets.length) {
  console.error(`no such page. known: ${PAGES.map((p) => p.name).join(', ')}`)
  process.exit(1)
}

// A full build starts clean so removed pages leave nothing behind.
if (!wanted.length) rmSync(DIST, { recursive: true, force: true })

const urls = rpcUrls(HERE, dev)
console.log(`  RPC set (${dev ? 'development' : 'production'}): ${urls.length} endpoints`)
for (const u of urls) console.log(`    ${u}`)
console.log('')

buildLogic(targets, dev)

let failed = false
for (const page of targets) {
  const html = build(page)
  const problems = audit(html)
  console.log(`  ${page.name.padEnd(10)} ${(Buffer.byteLength(html) / 1024).toFixed(1).padStart(8)} KB  ${subName(page)}`)
  for (const p of problems) console.error(`    not self-contained: ${p}`)
  if (problems.length) failed = true
  else console.log(`    -> ${(await directoryCid(join(DIST, page.name))).cid}`)
}
writeLocalnet()
writeIndex()
if (failed) process.exit(1)

if (argv.includes('--serve')) {
  serve(DIST, 4174).on('listening', () => console.log('\n  serving dist/ -> http://localhost:4174/'))
}
