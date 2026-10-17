/**
 * The built Sigil in jsdom: ten Marks for a valid hash, nothing otherwise.
 *
 *   node localnet/sigil-check.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { check, report, until, watchedConsole } from './check.mjs'

const PAGE = fileURLToPath(new URL('../dist/sigil/index.html', import.meta.url))
const consoleNoise = []

// jsdom's window.crypto is getter-only and lacks subtle; Node's stands in.
function boot(crypto = globalThis.crypto, url = 'https://sigil.socklove.eth.limo/') {
  return new JSDOM(readFileSync(PAGE, 'utf8'), {
    virtualConsole: watchedConsole(consoleNoise, ['error', 'warn', 'info', 'log', 'debug']),
    url, runScripts: 'dangerously',
    beforeParse(w) {
      Object.defineProperty(w, 'crypto', { value: crypto, configurable: true })
    },
  })
}
const state = (dom) => ({
  marks: dom.window.document.querySelectorAll('#out .mark').length,
  value: dom.window.document.getElementById('hash').value,
  msg: dom.window.document.getElementById('msg').textContent.trim(),
  label: dom.window.document.getElementById('out').getAttribute('aria-label'),
  invalid: dom.window.document.getElementById('hash').getAttribute('aria-invalid'),
  spoken: dom.window.document.getElementById('spoken').textContent,
})

/** A paste as the browser delivers one: the page reads the text and sets the field itself. */
const paste = (dom, text) => {
  const event = new dom.window.Event('paste', { bubbles: true, cancelable: true })
  event.clipboardData = { getData: () => text }
  dom.window.document.getElementById('hash').dispatchEvent(event)
}

const type = (dom, v) => {
  const f = dom.window.document.getElementById('hash')
  f.value = v
  f.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}

const VALID = '0xe0e486cadd1b2ce95a6105f8168186ffeb9af4241e7b4aa718c14c7430f8aaed'
// Reference vector, kept independent of the page. VALID derives to these
// indices (fixed by the KDF constants); EXPECT holds their words.
const INDICES = [57, 1, 27, 29, 42, 7, 18, 55, 39, 38]
const EXPECT = 'tongue · seat · fire · hammer · moon · candle · pill · bed · hourglass · rose'
const MARKS = JSON.parse(readFileSync(fileURLToPath(new URL('../marks/marks.json', import.meta.url)), 'utf8'))

console.log('\nThe screen')
{
  const dom = boot()
  const d = dom.window.document
  check('it reads exactly so',
    d.querySelector('.panel .lead')?.textContent === 'Say the 🧿 Marks aloud and sign only if both agree.'
      && d.querySelector('.panel .lead strong')?.textContent === 'Marks',
    d.querySelector('.panel .lead')?.textContent)
  check('its field is labelled, its placeholder exact',
    d.querySelector('label[for="hash"]')?.textContent === 'Transaction hash'
      && d.getElementById('hash')?.getAttribute('placeholder') === 'Insert transaction hash…')
  check('the logo is named SockLove', d.querySelector('.page-logo')?.getAttribute('alt') === 'SockLove')
  check('before a hash: "No Marks" to a screen reader, nothing underneath',
    state(dom).label === 'No Marks' && state(dom).spoken === '' && state(dom).msg === '' && state(dom).marks === 0, JSON.stringify(state(dom)))
}

console.log('\nA valid hash')
{
  const dom = boot()
  type(dom, VALID)
  const msg = dom.window.document.getElementById('msg')
  check('while it derives: "Reading the 🧿 Marks…", "Reading the Marks" to a screen reader',
    msg.textContent === 'Reading the 🧿 Marks…' && msg.querySelector('strong')?.textContent === 'Marks'
      && state(dom).label === 'Reading the Marks', `${msg.textContent} / ${state(dom).label}`)
  const ok = await until(() => state(dom).marks === 10, 20000)
  const s = state(dom)
  check('renders exactly ten Marks', ok && s.marks === 10, `${s.marks}`)
  check('the spoken names are the reference vector',
    s.label === EXPECT.replaceAll(' · ', ', '), s.label)
  check('and spoken from a hidden live line, the image itself not live',
    s.spoken === s.label && dom.window.document.getElementById('spoken').getAttribute('aria-live') === 'polite'
      && !dom.window.document.getElementById('out').hasAttribute('aria-live'), s.spoken)
  check('and neither the Marks nor their spoken line is translated',
    ['out', 'spoken'].every((id) => dom.window.document.getElementById(id).getAttribute('translate') === 'no'))
  const cells = [...dom.window.document.querySelectorAll('#out .mark')]
  const shown = cells.map((c) => `${c.querySelector('.mark-emoji')?.textContent} ${c.querySelector('.mark-name')?.textContent}`)
  check('each Mark shows its emoji and name from marks.json',
    shown.join('|') === INDICES.map((i) => MARKS[i].join(' ')).join('|')
      && shown.map((m) => m.split(' ')[1]).join(' · ') === EXPECT, shown.join('|'))
  check('and says nothing underneath', s.msg === '', JSON.stringify(s.msg))
  const numbers = [...dom.window.document.querySelectorAll('#out .mark-number')]
  check('each Mark numbered 1 to 10, in order', numbers.map((n) => n.textContent).join(' ') === '1 2 3 4 5 6 7 8 9 10', numbers.map((n) => n.textContent).join(' '))
  check('the numbers hidden from screen readers', numbers.every((n) => n.getAttribute('aria-hidden') === 'true'))
}

console.log('\nAnything but a hash is refused silently')
for (const [name, value, emptied] of [
  ['the zero hash',               '0x' + '0'.repeat(64), true],
  ['a short hash',                '0xdeadbeef'],
  ['a hash one char short',       '0x' + 'a'.repeat(63)],
  ['a hash one char over',        '0x' + 'a'.repeat(65)],
  ['a whole pasted line',         'tx: 0x' + 'a'.repeat(64) + ' (mined)'],
  ['non-hex of the right length', '0x' + 'z'.repeat(64), true],
  ['an empty field',              ''],
]) {
  const dom = boot()
  type(dom, value)
  await new Promise(r => setTimeout(r, 2500))
  const s = state(dom)
  check(`${name}: no marks, no words${emptied ? ', the field emptied and marked invalid' : ''}`,
        s.marks === 0 && s.msg === '' && s.label === 'No Marks' && s.spoken === '' && (!emptied || (s.value === '' && s.invalid === 'true')),
        `marks=${s.marks} msg=${JSON.stringify(s.msg)} value=${JSON.stringify(s.value)} invalid=${s.invalid}`)
}

console.log('\nA paste')
{
  const dom = boot()
  paste(dom, 'not a hash')
  check('a pasted non-hash: emptied, marked invalid for a screen reader', state(dom).value === '' && state(dom).invalid === 'true', JSON.stringify(state(dom)))
  paste(dom, VALID)
  check('then a pasted hash: the mark gone at once', state(dom).invalid === null, JSON.stringify(state(dom)))
  check('and the ten Marks drawn', await until(() => state(dom).marks === 10, 20000), JSON.stringify(state(dom)))
}

console.log('\nThe same hash again')
{
  // A crypto that counts derivations: the same hash, entered again, must not start another.
  let derived = 0
  const subtle = globalThis.crypto.subtle
  const counting = { subtle: new Proxy(subtle, { get: (t, k) => (k === 'deriveBits' ? (...a) => { derived++; return t.deriveBits(...a) } : t[k]?.bind?.(t) ?? t[k]) }) }
  const dom = boot(counting)
  type(dom, VALID)
  const field = dom.window.document.getElementById('hash')
  for (let i = 0; i < 5; i++) field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  type(dom, VALID + 'a')
  type(dom, VALID)
  await until(() => state(dom).marks === 10, 20000)
  check('Enter five times while it derives: no second derivation', derived === 2, `${derived} derivations`)
  check('and the ten Marks drawn', state(dom).marks === 10, JSON.stringify(state(dom)))
  field.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  paste(dom, `0X${VALID.slice(2).toUpperCase()}\n`)
  await new Promise((r) => setTimeout(r, 500))
  check('then Enter, and the same hash pasted in capitals: still no new derivation', derived === 2 && state(dom).marks === 10, `${derived} derivations`)
}

console.log('\nNo WebCrypto')
{
  // No crypto.subtle: an old browser, or plain http.
  const dom = boot({})
  type(dom, VALID)
  const spoke = await until(() => state(dom).msg !== '' && !state(dom).msg.startsWith('Reading'), 5000)
  const s = state(dom)
  check('it says "This browser cannot read the Marks."', spoke && s.msg === 'This browser cannot read the Marks.', s.msg)
  check('in the error colour, not the note colour',
    dom.window.document.getElementById('msg').className === 'thorn',
    dom.window.document.getElementById('msg').className)
  check('and still draws no marks, and speaks none', s.marks === 0 && s.spoken === '', `${s.marks} ${JSON.stringify(s.spoken)}`)
}

console.log('\nRecovery')
{
  const dom = boot()
  type(dom, '0xdeadbeef')
  type(dom, VALID)
  const ok = await until(() => state(dom).marks === 10, 20000)
  check('a bad hash then a good one still renders', ok, JSON.stringify(state(dom)))
}

console.log('\nA shared gateway')
{
  const dom = boot(globalThis.crypto, 'https://gateway.example/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi/')
  const panel = dom.window.document.querySelector('.panel')
  check('"This Page cannot run here.", and nothing else',
    panel?.textContent.trim() === 'This Page cannot run here.' && !dom.window.document.getElementById('hash'), panel?.textContent.trim())
}

console.log(`\nConsole: ${consoleNoise.length} message(s)`)
for (const m of consoleNoise.slice(0, 20)) console.log(`  ✗ [${m.level}] ${m.text.slice(0, 200)}`)
check('the page logged nothing', consoleNoise.length === 0, `${consoleNoise.length} message(s)`)

report()
