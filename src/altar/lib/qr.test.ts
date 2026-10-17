import { encodeQR } from 'qr'
import { decodeQR } from 'qr/decode.js'
import { describe, expect, it } from 'vitest'
import { encodeHandoff } from './handoff.ts'
import { qrPath, qrSvg } from './qr.ts'

/** Rasterises qrPath's squares to RGBA, the input a camera decoder sees, padded to a four-module quiet zone. */
function raster({ size, d }: { size: number; d: string }, scale = 4, pad = 3) {
  const modules = size + 2 * pad
  const dark = new Set([...d.matchAll(/M(\d+) (\d+)h1v1h-1Z/g)].map((m) => `${Number(m[1]) + pad},${Number(m[2]) + pad}`))
  const width = modules * scale
  const data = new Uint8ClampedArray(width * width * 4)
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const v = dark.has(`${Math.floor(x / scale)},${Math.floor(y / scale)}`) ? 0 : 255
      data.set([v, v, v, 255], (y * width + x) * 4)
    }
  }
  return { width, height: width, data }
}

const handoff = encodeHandoff({
  safe: '0x0857293192bF97Ee73bB471c185E1933Fa51E0ca',
  newOwner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  nonce: '6',
  sig: `0x${'ab'.repeat(32)}${'11'.repeat(32)}1b`,
})

describe('qrPath', () => {
  it('draws exactly the dark modules of the code', () => {
    const text = `https://altar.socklove.eth.limo/#${handoff}`
    const { size, d } = qrPath(text)
    const drawn = new Set([...d.matchAll(/M(\d+) (\d+)/g)].map((m) => `${m[1]},${m[2]}`))
    const modules = encodeQR(text, 'raw', { ecc: 'medium', border: 1 })
    const dark = new Set(modules.flatMap((row, y) => row.flatMap((on, x) => (on ? [`${x},${y}`] : []))))
    expect(size).toBe(modules.length)
    expect(drawn).toEqual(dark)
  })

  it('encodes a gateway link so that it decodes back byte for byte', () => {
    const link = `https://altar.socklove.eth.limo/#${handoff}`
    expect(decodeQR(raster(qrPath(link)))).toBe(link)
  })
})

describe('qrSvg', () => {
  it('returns a single svg element with one path and nothing else', () => {
    const svg = qrSvg('https://altar.socklove.eth.limo/')
    expect(svg.tagName).toBe('svg')
    expect(svg.getAttribute('viewBox')).toMatch(/^0 0 \d+ \d+$/)
    expect([...svg.children].map((c) => c.tagName)).toEqual(['path'])
    expect(svg.outerHTML).not.toMatch(/<script|href=|url\(/i)
  })
})
