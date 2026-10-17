import type { Server } from 'node:http'

export declare function serve(dir: string, port: number, options?: { host?: string }): Server
