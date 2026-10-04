export type Limit = { kind: string; percentUsed: number; resetsAt?: string }

// 色はデスクトップのコンテキスト表示に合わせた #rrggbb
export type ContextSegment = { color: string; tokens: number }
export type ContextInfo = { tokens?: number; window: number; percent?: number; segments: ContextSegment[] }

declare module 'claude-code' {
  interface PluginState {
    'usage-band': { limits: Limit[]; context: ContextInfo | null }
  }
}
