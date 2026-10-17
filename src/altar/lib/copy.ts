import { p, targetOf } from './dom.ts'

/** execCommand fallback: navigator.clipboard needs a secure context, which plain http off this machine is not. */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    /* fall through */
  }
  try {
    const scratch = document.createElement('textarea')
    scratch.value = value
    scratch.setAttribute('readonly', '')
    scratch.style.position = 'fixed'
    scratch.style.opacity = '0'
    document.body.appendChild(scratch)
    scratch.select()
    const ok = document.execCommand('copy')
    scratch.remove()
    return ok
  } catch {
    return false
  }
}

/** Screen-reader announcement, outside #panel so a redraw does not cut it off. */
function announce(message: string): void {
  let live = document.getElementById('live')
  if (!live) {
    live = document.createElement('p')
    live.id = 'live'
    live.className = 'sr'
    live.setAttribute('aria-live', 'polite')
    document.body.appendChild(live)
  }
  live.textContent = message
}

const copiedTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()

/** Delegated, because every render replaces the panel. */
export function installCopy(): void {
  const fire = (target: HTMLElement | null): void => {
    const value = target?.getAttribute('data-copy')
    if (!target || !value) return
    // No text swap (it would shift layout): a CSS mark shows success, announce() tells screen readers.
    void copyText(value).then((ok) => {
      if (ok) {
        // A newer copy restarts the ✓ rather than having an older one clear it.
        clearTimeout(copiedTimers.get(target))
        target.classList.add('sealed')
        announce('Copied')
        copiedTimers.set(target, setTimeout(() => target.classList.remove('sealed'), 1400))
        return
      }
      const note = target.closest('.copy')?.querySelector<HTMLElement>('[data-copy-fallback]')
      if (note) note.hidden = false
      announce('Select it and copy.')
    })
  }
  document.addEventListener('click', (e) => fire(targetOf(e)?.closest<HTMLElement>('[data-copy]') ?? null))
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const target = targetOf(e)?.closest<HTMLElement>('[data-copy]') ?? null
    if (!target) return
    e.preventDefault()
    fire(target)
  })
}

export const copyAttrs = (value: string, label: string, className: string): Record<string, string> => ({
  class: className, 'data-copy': value, role: 'button', tabindex: '0', title: 'Copy', 'aria-label': label,
})

export function copyFallback(): HTMLElement {
  const note = p('small', 'Select it and copy.')
  note.setAttribute('data-copy-fallback', '')
  note.hidden = true
  return note
}
