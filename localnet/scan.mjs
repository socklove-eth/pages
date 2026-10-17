/** Reads the link a QR code carries from its drawn modules, as a camera would. */
import { decodeQR } from 'qr/decode.js'

/** `d` is the QR path's data (one square per dark module), `size` its modules per side. */
export function scan(d, size) {
  const scale = 4
  const margin = 4
  const px = (size + 2 * margin) * scale
  const data = new Uint8Array(px * px * 4).fill(255)
  for (const [, x, y] of d.matchAll(/M(\d+) (\d+)/g)) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const i = (((Number(y) + margin) * scale + dy) * px + (Number(x) + margin) * scale + dx) * 4
        data[i] = data[i + 1] = data[i + 2] = 0
      }
    }
  }
  return decodeQR({ width: px, height: px, data })
}
