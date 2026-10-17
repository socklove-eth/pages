/** Sigil page: a hash in, ten Marks out, read in the browser; nothing leaves the page. */
import { CannotRead, EMOJIS, NAMES, marks, normalize } from '../../marks/marks.ts'

/** frame-ancestors is ignored in a <meta> CSP, so framing is refused here. */
function framed(): boolean {
  try {
    return self !== top
  } catch {
    return true
  }
}

/** A path gateway serves every CID from one origin, which could then script this page; gateways decode `%69pfs` too. */
function onSharedGateway(): boolean {
  try {
    return /\/ip[fn]s\//i.test(decodeURIComponent(location.pathname))
  } catch {
    return true
  }
}

function paragraph(className: string, text: string): HTMLElement {
  const el = document.createElement('p')
  el.className = className
  el.textContent = text
  return el
}

function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const el = document.getElementById(id)
  if (!(el instanceof type)) throw new Error(`#${id} is missing`)
  return el
}

function start(): void {
  const input = byId('hash', HTMLInputElement)
  const out = byId('out', HTMLElement)
  const msg = byId('msg', HTMLElement)
  // A label change is rarely announced, so the drawn names are also spoken from here.
  const spoken = byId('spoken', HTMLElement)

  /** A newer input supersedes a derivation still running. */
  let generation = 0
  // The hash drawn or being drawn: the same hash again starts no second derivation.
  let current: string | null = null

  function note(text = '', isError = false): void {
    msg.className = isError ? 'thorn' : 'note'
    msg.textContent = text
  }

  function reading(): void {
    const term = document.createElement('strong')
    term.textContent = 'Marks'
    note('Reading the 🧿 ')
    msg.append(term, '…')
  }

  function clear(label = 'No Marks'): void {
    out.textContent = ''
    out.setAttribute('aria-label', label)
    spoken.textContent = ''
    note()
  }

  /** One aria-label on the container instead of one per cell. */
  function draw(indices: number[]): void {
    out.textContent = ''
    for (const [place, i] of indices.entries()) {
      const cell = document.createElement('span')
      cell.className = 'mark'
      // The place fixes the reading order on any layout; the container's label already gives it.
      const number = document.createElement('span')
      number.className = 'mark-number'
      number.setAttribute('aria-hidden', 'true')
      number.textContent = String(place + 1)
      const emoji = document.createElement('span')
      emoji.className = 'mark-emoji'
      emoji.textContent = EMOJIS[i]!
      const name = document.createElement('span')
      name.className = 'mark-name'
      name.textContent = NAMES[i]!
      cell.append(number, emoji, name)
      out.append(cell)
    }
    const names = indices.map((i) => NAMES[i]).join(', ')
    out.setAttribute('aria-label', names)
    spoken.textContent = names
  }

  /** Replays the field's error animation; the offsetWidth read restarts it. */
  function refuseField(): void {
    input.value = ''
    input.setAttribute('aria-invalid', 'true')
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'), { once: true })
    input.classList.remove('pricked')
    void input.offsetWidth
    input.classList.add('pricked')
    setTimeout(() => input.classList.remove('pricked'), 800)
  }

  function render(value: string): void {
    const hash = normalize(value)
    if (hash && hash === current) return
    current = hash
    const mine = ++generation
    clear('Reading the Marks')
    reading()
    marks(value).then(
      (indices) => {
        if (mine !== generation) return
        draw(indices)
        note()
      },
      (e: unknown) => {
        if (mine !== generation) return
        current = null
        clear()
        if (e instanceof CannotRead) note(e.message, true)
        else refuseField()
      },
    )
  }

  const hexLength = (value: string): number => value.replace(/\s+/g, '').replace(/^0x/i, '').length

  function handle(value: string): void {
    if (hexLength(value) === 64) render(value)
    else {
      generation++
      current = null
      clear()
    }
  }

  input.addEventListener('input', () => handle(input.value))
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    handle(input.value)
    // Enter is a whole attempt, as a paste is: anything but a hash is refused.
    if (hexLength(input.value) !== 64) refuseField()
  })
  input.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text')
    if (!text) return
    e.preventDefault()
    // Set in code, so no input event clears an earlier refusal's mark.
    input.removeAttribute('aria-invalid')
    input.value = text.trim()
    handle(input.value)
    if (hexLength(input.value) !== 64) refuseField()
  })
}

if (framed() || onSharedGateway()) {
  document.querySelector('.panel')?.replaceChildren(paragraph('note', 'This Page cannot run here.'))
} else {
  start()
}
