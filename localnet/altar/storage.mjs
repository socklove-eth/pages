/** Storage the browser blocks. */
import { RPC, OWNER_A, OWNER_B, STRANGER } from '../stage.mjs'
import { check, until } from '../check.mjs'
import {
  URL_BASE, BAKED_ORIGIN, open, doc, text, status, says, typeAndAsk,
} from './harness.mjs'

export async function blockedStorage() {
  console.log('\nStorage the browser blocks')
  const route = { [BAKED_ORIGIN]: RPC }
  const blocked = open(URL_BASE, OWNER_A, {}, { rpc: null, route, blockStorage: true })
  await says(blocked, 'Ask her to marry you', 60000)
  typeAndAsk(blocked, OWNER_B.address)
  check('the ask still reaches the Handoff', await says(blocked, 'will you marry me'), text(blocked))

  const typed = open(URL_BASE, OWNER_A, {}, { rpc: null, blockStorage: true })
  await says(typed, 'Enter your own RPC endpoint:', 60000)
  doc(typed).getElementById('rpc').value = RPC
  doc(typed).getElementById('retry').click()
  check('an endpoint typed into Connect is used', await says(typed, 'Ask her to marry you', 30000), text(typed))

  const picking = open(URL_BASE, null, {}, {
    rpc: null, route, blockStorage: true,
    announce: [{ rdns: 'io.one', name: 'One', account: OWNER_A }, { rdns: 'io.two', name: 'Two', account: STRANGER }],
  })
  await says(picking, 'Ask her to marry you', 60000)
  typeAndAsk(picking, OWNER_B.address)
  await until(() => status(picking).includes('Which wallet?'))
  doc(picking).querySelector('[data-wallet="io.one"]')?.click()
  check('a wallet picked from several is used', await says(picking, 'will you marry me'), text(picking))
}
