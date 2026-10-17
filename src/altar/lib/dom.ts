/** Screen helpers: every screen is drawn into #panel, every message into #status. */
type Child = Node | string

export const panel = () => document.getElementById('panel')!

export function byId<T extends HTMLElement>(id: string, type: { new (): T }): T | null {
  const el = document.getElementById(id)
  return el instanceof type ? el : null
}

export const targetOf = (e: Event): Element | null => (e.target instanceof Element ? e.target : null)

/** Every screen is built from elements and text; the CSP refuses HTML from strings. */
export function h(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value)
  el.append(...children)
  return el
}

export const p = (className: string, ...children: Child[]): HTMLElement => h('p', { class: className }, ...children)

export const symbol = (emoji: string): HTMLElement => h('span', { class: 'symbol', 'aria-hidden': 'true' }, emoji)

export const term = (emoji: string, name: string): Child[] => [`${emoji} `, h('strong', {}, name)]

export function show(...children: Child[]): void {
  panel().replaceChildren(...children)
}

/** For dead ends only: replaces the whole panel. */
export function refuse(message: string): void {
  show(p('thorn', message))
}

/** Writes to #status beside the view, so a filled form survives. */
export function setStatus(...children: Child[]): void {
  document.getElementById('status')?.replaceChildren(...children)
}

export const statusBox = (): HTMLElement => h('div', { class: 'status', id: 'status', 'aria-live': 'polite' })

export function inputRow(id: string, label: string, placeholder: string, value = ''): HTMLElement {
  const input = h('input', {
    id, class: 'quill', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', placeholder,
  })
  if (value) input.setAttribute('value', value)
  return h('div', { class: 'entry' }, h('div', {}, h('label', { class: 'sr', for: id }, label), input))
}

/**
 * Replays the field's error animation; the offsetWidth read restarts it.
 * aria-invalid tells a screen reader what the flash shows, until the next keystroke.
 */
export function refuseField(field: HTMLElement): void {
  field.setAttribute('aria-invalid', 'true')
  field.addEventListener('input', () => field.removeAttribute('aria-invalid'), { once: true })
  field.classList.remove('pricked')
  void field.offsetWidth
  field.classList.add('pricked')
  setTimeout(() => field.classList.remove('pricked'), 800)
}

export function bindField(fieldId: string, buttonId: string): void {
  const field = document.getElementById(fieldId)
  field?.addEventListener('input', () => setStatus())
  field?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const btn = byId(buttonId, HTMLButtonElement)
    if (btn && !btn.disabled) btn.click()
  })
}
