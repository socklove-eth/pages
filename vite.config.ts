import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { pageConfig, rpcUrls } from './scripts/env.mjs'

// One page per run, set by build.mjs. Unminified so users can audit the bytes.
const entry = process.env.PAGE_ENTRY ?? 'src/altar/main.ts'
const out = process.env.PAGE_OUT ?? 'altar.iife.js'

export default defineConfig(({ mode }) => ({
  define: {
    __RPC_URLS__: JSON.stringify(rpcUrls(process.cwd(), mode === 'development')),
    __CONFIG__: JSON.stringify(pageConfig(process.cwd())),
  },
  build: {
    outDir: 'build',
    emptyOutDir: false,
    minify: false,
    rolldownOptions: {
      // viem/chains reaches its Tempo chains, which name a Node builtin; none of it is bundled.
      onLog(level, log, handler) {
        if (log.message.includes('"node:worker_threads" has been externalized')) return
        handler(level, log)
      },
    },
    // Read by build.mjs to embed licence notices.
    license: { fileName: out.replace(/\.iife\.js$/, '.licenses.json') },
    lib: {
      entry: fileURLToPath(new URL(entry, import.meta.url)),
      formats: ['iife'],
      name: 'page',
      fileName: () => out,
    },
  },
}))
