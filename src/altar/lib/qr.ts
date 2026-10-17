import { encodeQR } from 'qr'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** One unit square per dark module, border included. */
export function qrPath(text: string): { size: number; d: string } {
  const modules = encodeQR(text, 'raw', { ecc: 'medium', border: 1 })
  let d = ''
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1Z`
    }),
  )
  return { size: modules.length, d }
}

/** Built as elements, never parsed from markup. Transparent: the page's CSS frame supplies the white quiet zone. */
export function qrSvg(text: string): SVGSVGElement {
  const { size, d } = qrPath(text)
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`)
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', d)
  svg.append(path)
  return svg
}
