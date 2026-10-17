import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import {
  bindField, byId, h, inputRow, p, panel, refuse, refuseField, setStatus, show, statusBox, symbol, term, targetOf,
} from './dom.ts'

beforeEach(() => {
  document.body.replaceChildren(h('div', { id: 'panel' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('h', () => {
  it('sets every attribute and appends nodes and text in order', () => {
    const el = h('div', { id: 'x', class: 'a b', 'data-copy': 'v' }, 'one ', h('strong', {}, 'two'))
    expect(el.tagName).toBe('DIV')
    expect(el.getAttribute('id')).toBe('x')
    expect(el.getAttribute('class')).toBe('a b')
    expect(el.getAttribute('data-copy')).toBe('v')
    expect(el.innerHTML).toBe('one <strong>two</strong>')
  })

  it('treats a string child as text, never as markup', () => {
    const el = h('p', {}, '<img src=x onerror=alert(1)>')
    expect(el.children).toHaveLength(0)
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('builds a bare element with no attributes', () => {
    expect(h('span').outerHTML).toBe('<span></span>')
  })
})

describe('p, symbol and term', () => {
  it('p is a paragraph with a class and its children', () => {
    expect(p('note', 'a', h('strong', {}, 'b')).outerHTML).toBe('<p class="note">a<strong>b</strong></p>')
  })

  it('symbol hides the emoji from screen readers', () => {
    expect(symbol('🧎').outerHTML).toBe('<span class="symbol" aria-hidden="true">🧎</span>')
  })

  it('term is the emoji, a space, and the name in bold', () => {
    const [lead, name] = term('💍', 'Ring')
    expect(lead).toBe('💍 ')
    expect((name as HTMLElement).outerHTML).toBe('<strong>Ring</strong>')
  })
})

describe('panel, show and refuse', () => {
  it('panel is #panel', () => {
    expect(panel()).toBe(document.getElementById('panel'))
  })

  it('show replaces everything in the panel', () => {
    panel().append(p('old', 'old'))
    show(p('lead', 'new'), 'text')
    expect(panel().innerHTML).toBe('<p class="lead">new</p>text')
  })

  it('refuse leaves one refusal line and nothing else', () => {
    show(p('lead', 'a'), statusBox())
    refuse('No.')
    expect(panel().innerHTML).toBe('<p class="thorn">No.</p>')
  })
})

describe('byId', () => {
  it('returns the element when it has the type asked for', () => {
    show(h('button', { id: 'go' }))
    expect(byId('go', HTMLButtonElement)).toBe(document.getElementById('go'))
  })

  it('returns null for another type or a missing id', () => {
    show(h('div', { id: 'go' }))
    expect(byId('go', HTMLButtonElement)).toBeNull()
    expect(byId('missing', HTMLElement)).toBeNull()
  })
})

describe('targetOf', () => {
  it('returns the element an event was dispatched on', () => {
    const el = h('span')
    document.body.append(el)
    let seen: Element | null = null
    el.addEventListener('click', (e) => (seen = targetOf(e)))
    el.click()
    expect(seen).toBe(el)
  })

  it('returns null when the target is not an element', () => {
    const text = document.createTextNode('t')
    document.body.append(text)
    let fromText: Element | null | undefined
    text.addEventListener('x', (e) => (fromText = targetOf(e)))
    text.dispatchEvent(new Event('x'))
    expect(fromText).toBeNull()

    let fromDocument: Element | null | undefined
    document.addEventListener('y', (e) => (fromDocument = targetOf(e)), { once: true })
    document.dispatchEvent(new Event('y'))
    expect(fromDocument).toBeNull()
  })
})

describe('setStatus and statusBox', () => {
  it('statusBox is the polite live region setStatus writes to', () => {
    expect(statusBox().outerHTML).toBe('<div class="status" id="status" aria-live="polite"></div>')
  })

  it('replaces the status and leaves the rest of the panel alone', () => {
    const field = h('input', { id: 'f' }) as HTMLInputElement
    show(field, statusBox())
    field.value = 'typed'
    setStatus(p('thorn', 'one'))
    setStatus(p('thorn', 'two'))
    expect(document.getElementById('status')!.innerHTML).toBe('<p class="thorn">two</p>')
    expect(byId('f', HTMLInputElement)?.value).toBe('typed')
  })

  it('clears with no arguments', () => {
    show(statusBox())
    setStatus('x')
    setStatus()
    expect(document.getElementById('status')!.childNodes).toHaveLength(0)
  })

  it('does nothing on a screen without a status', () => {
    show(p('lead', 'a'))
    expect(() => setStatus('x')).not.toThrow()
    expect(panel().textContent).toBe('a')
  })
})

describe('inputRow', () => {
  it('is a labelled text field that a browser does not correct or fill', () => {
    const row = inputRow('owner', 'The address', 'Insert…')
    expect(row.className).toBe('entry')
    const label = row.querySelector('label')!
    expect(label.className).toBe('sr')
    expect(label.getAttribute('for')).toBe('owner')
    expect(label.textContent).toBe('The address')
    const input = row.querySelector('input')!
    expect(input.id).toBe('owner')
    expect(input.className).toBe('quill')
    expect(input.getAttribute('type')).toBe('text')
    expect(input.getAttribute('spellcheck')).toBe('false')
    expect(input.getAttribute('autocomplete')).toBe('off')
    expect(input.getAttribute('autocapitalize')).toBe('off')
    expect(input.getAttribute('placeholder')).toBe('Insert…')
  })

  it('carries a value only when one is given', () => {
    expect(inputRow('a', 'l', 'p').querySelector('input')!.hasAttribute('value')).toBe(false)
    expect(inputRow('a', 'l', 'p', '').querySelector('input')!.hasAttribute('value')).toBe(false)
    expect(inputRow('a', 'l', 'p', '0xabc').querySelector('input')!.value).toBe('0xabc')
  })
})

describe('refuseField', () => {
  it('marks the field, then unmarks it after 800 ms', () => {
    vi.useFakeTimers()
    const field = h('input')
    refuseField(field)
    expect(field.classList.contains('pricked')).toBe(true)
    vi.advanceTimersByTime(799)
    expect(field.classList.contains('pricked')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(field.classList.contains('pricked')).toBe(false)
  })

  it('removes the mark before adding it again, so the animation restarts', () => {
    const field = h('input', { class: 'pricked' })
    const removed: boolean[] = []
    const remove = field.classList.remove.bind(field.classList)
    vi.spyOn(field.classList, 'remove').mockImplementation((...names) => {
      remove(...names)
      removed.push(field.classList.contains('pricked'))
    })
    refuseField(field)
    expect(removed[0]).toBe(false)
    expect(field.classList.contains('pricked')).toBe(true)
  })

  it('marks the field invalid for a screen reader until the next keystroke', () => {
    const field = h('input')
    refuseField(field)
    expect(field.getAttribute('aria-invalid')).toBe('true')
    field.dispatchEvent(new Event('input'))
    expect(field.hasAttribute('aria-invalid')).toBe(false)
  })
})

describe('bindField', () => {
  function screen(disabled = false) {
    show(inputRow('f', 'l', 'p'), h('button', { id: 'b', type: 'button' }), statusBox())
    const button = byId('b', HTMLButtonElement)!
    button.disabled = disabled
    const clicks = vi.fn()
    button.addEventListener('click', clicks)
    bindField('f', 'b')
    return { field: byId('f', HTMLInputElement)!, clicks }
  }

  const press = (el: HTMLElement, key: string) => {
    const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
    el.dispatchEvent(e)
    return e
  }

  it('clears the status as the user types', () => {
    const { field } = screen()
    setStatus(p('thorn', 'No.'))
    field.dispatchEvent(new Event('input'))
    expect(document.getElementById('status')!.childNodes).toHaveLength(0)
  })

  it('presses the button on Enter, and keeps Enter from doing anything else', () => {
    const { field, clicks } = screen()
    const e = press(field, 'Enter')
    expect(clicks).toHaveBeenCalledOnce()
    expect(e.defaultPrevented).toBe(true)
  })

  it('does not press a disabled button', () => {
    const { field, clicks } = screen(true)
    press(field, 'Enter')
    expect(clicks).not.toHaveBeenCalled()
  })

  it('ignores every other key', () => {
    const { field, clicks } = screen()
    const e = press(field, 'a')
    expect(clicks).not.toHaveBeenCalled()
    expect(e.defaultPrevented).toBe(false)
  })

  it('does nothing when the field or the button is missing', () => {
    show(inputRow('f', 'l', 'p'))
    expect(() => bindField('missing', 'b')).not.toThrow()
    bindField('f', 'missing')
    expect(() => press(byId('f', HTMLInputElement)!, 'Enter')).not.toThrow()
  })
})
