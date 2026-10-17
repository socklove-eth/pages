import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest'
import { copyAttrs, copyFallback, installCopy } from './copy.ts'
import { h } from './dom.ts'

const writeText = vi.fn<(value: string) => Promise<void>>()
const execCommand = vi.fn<(command: string) => boolean>()

/** Lets the clipboard promise and the handler after it run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** A copy target as the page draws it: inside a .copy block, with its fallback note. */
function target(value = '0xabc'): HTMLElement {
  const el = h('div', copyAttrs(value, 'Copy the hash', 'inscription'), h('span', {}, value))
  document.getElementById('panel')!.append(h('div', { class: 'copy' }, el, copyFallback()))
  return el
}

const press = (el: Element, key: string) => {
  const e = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true })
  el.dispatchEvent(e)
  return e
}

const live = () => document.getElementById('live')
const fallbackNote = () => document.querySelector<HTMLElement>('[data-copy-fallback]')!

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
  // Listeners are delegated to the document, so one install serves every test.
  installCopy()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  writeText.mockReset().mockResolvedValue(undefined)
  execCommand.mockReset().mockReturnValue(false)
  document.body.replaceChildren(h('div', { id: 'panel' }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('copyAttrs', () => {
  it('makes an element a labelled, focusable copy button for its value', () => {
    expect(copyAttrs('0xabc', 'Copy the hash', 'inscription')).toEqual({
      class: 'inscription', 'data-copy': '0xabc', role: 'button', tabindex: '0', title: 'Copy', 'aria-label': 'Copy the hash',
    })
  })
})

describe('copyFallback', () => {
  it('is a hidden note, shown only when copying fails', () => {
    const note = copyFallback()
    expect(note.outerHTML).toBe('<p class="small" data-copy-fallback="" hidden="">Select it and copy.</p>')
  })
})

describe('installCopy', () => {
  it('copies the value on a click, marks the target and announces it', async () => {
    const el = target('0xfeed')
    el.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('0xfeed')
    expect(el.classList.contains('sealed')).toBe(true)
    expect(live()?.textContent).toBe('Copied')
    expect(live()?.className).toBe('sr')
    expect(live()?.getAttribute('aria-live')).toBe('polite')
    expect(fallbackNote().hidden).toBe(true)
  })

  it('copies from a click on anything inside the target', async () => {
    const el = target('0xfeed')
    el.querySelector('span')!.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith('0xfeed')
  })

  it('leaves the text as it is, so nothing shifts', async () => {
    const el = target('0xfeed')
    el.click()
    await settle()
    expect(el.textContent).toBe('0xfeed')
  })

  it('clears the mark after 1.4 s', async () => {
    const el = target()
    el.click()
    await settle()
    vi.advanceTimersByTime(1399)
    expect(el.classList.contains('sealed')).toBe(true)
    vi.advanceTimersByTime(1)
    expect(el.classList.contains('sealed')).toBe(false)
  })

  it('restarts the mark on a newer copy rather than letting the older one clear it', async () => {
    const el = target()
    el.click()
    await settle()
    vi.advanceTimersByTime(1000)
    el.click()
    await settle()
    vi.advanceTimersByTime(1000)
    expect(el.classList.contains('sealed')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(el.classList.contains('sealed')).toBe(false)
  })

  it('copies on Enter and Space, and keeps the key from scrolling or submitting', async () => {
    const el = target()
    for (const key of ['Enter', ' ']) {
      const e = press(el, key)
      expect(e.defaultPrevented).toBe(true)
    }
    await settle()
    expect(writeText).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys, and keys outside a target', async () => {
    const el = target()
    const other = h('input')
    document.body.append(other)
    expect(press(el, 'a').defaultPrevented).toBe(false)
    expect(press(other, 'Enter').defaultPrevented).toBe(false)
    await settle()
    expect(writeText).not.toHaveBeenCalled()
  })

  it('ignores a click outside a target, or on one with an empty value', async () => {
    document.body.append(h('button', { id: 'plain' }))
    document.getElementById('plain')!.click()
    target('').click()
    await settle()
    expect(writeText).not.toHaveBeenCalled()
    expect(live()).toBeNull()
  })

  it('falls back to execCommand where the clipboard API is refused', async () => {
    writeText.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
    let copied: string | undefined
    execCommand.mockImplementation((command) => {
      copied = document.querySelector('textarea')?.value
      return command === 'copy'
    })
    const el = target('0xfeed')
    el.click()
    await settle()
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe('0xfeed')
    expect(document.querySelector('textarea')).toBeNull()
    expect(el.classList.contains('sealed')).toBe(true)
    expect(live()?.textContent).toBe('Copied')
  })

  it('shows the fallback note and asks the user to copy by hand when both ways fail', async () => {
    writeText.mockRejectedValue(new Error('refused'))
    const el = target()
    el.click()
    await settle()
    expect(el.classList.contains('sealed')).toBe(false)
    expect(fallbackNote().hidden).toBe(false)
    expect(live()?.textContent).toBe('Select it and copy.')
  })

  it('treats an execCommand that throws as a failure', async () => {
    writeText.mockRejectedValue(new Error('refused'))
    execCommand.mockImplementation(() => {
      throw new Error('unsupported')
    })
    const el = target()
    el.click()
    await settle()
    expect(el.classList.contains('sealed')).toBe(false)
    expect(fallbackNote().hidden).toBe(false)
  })

  it('still announces a failure for a target with no fallback note', async () => {
    writeText.mockRejectedValue(new Error('refused'))
    document.body.append(h('span', copyAttrs('host', 'Copy the RPC endpoint', 'inscription'), 'host'))
    document.querySelector<HTMLElement>('span[data-copy]')!.click()
    await settle()
    expect(live()?.textContent).toBe('Select it and copy.')
  })

  it('keeps one announcer outside the panel, so a redraw does not cut it off', async () => {
    target().click()
    await settle()
    document.getElementById('panel')!.replaceChildren()
    target().click()
    await settle()
    expect(document.querySelectorAll('#live')).toHaveLength(1)
    expect(live()?.parentElement).toBe(document.body)
  })
})
