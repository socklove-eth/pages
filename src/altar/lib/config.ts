import type { Address } from 'viem'

/** Inlined from .env at build time; scripts/env.mjs validates it. */
declare const __CONFIG__: { name: string; label: string; registry: Address; resolver: Address; multiSend: Address; safe: Address }

export const ENS_NAME = __CONFIG__.name
export const ENS_LABEL = __CONFIG__.label
export const ENS_REGISTRY_WITH_FALLBACK = __CONFIG__.registry
export const ENS_PUBLIC_RESOLVER = __CONFIG__.resolver
export const SAFE_MULTI_SEND_CALL_ONLY = __CONFIG__.multiSend
export const SAFE = __CONFIG__.safe
