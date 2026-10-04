import type { EngineInterface, Register } from 'claude-code'

import type { ContextInfo, ContextSegment, Limit } from '../types'

// $.state.get/set は atom() の戻り値ではなく { plugin, key } の参照を受け取る
const limits = { plugin: 'usage-band', key: 'limits' } as const
const context = { plugin: 'usage-band', key: 'context' } as const

const WINDOW_MS: Record<string, number> = {
  five_hour: 5 * 3600_000,
  seven_day: 7 * 24 * 3600_000,
}
const LABEL: Record<string, string> = { five_hour: '5h', seven_day: '週' }
const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土']
// mod の実行環境のタイムゾーンは当てにできないので、日本時間で固定する
const JST_MS = 9 * 3600_000
// 経過率がこれ未満のうちはペースを出さない（枠の開始直後は数値が暴れる）
const MIN_ELAPSED = 5

// ダークテーマ専用の配色
const COLOR = {
  bar: '#7d8590',
  track: '#33332f',
  marker: '#d6d4cc',
  text: '#d6d4cc',
  sub: '#8b8a84',
  faint: '#6f6e69',
  teal: '#3fb68b',
  yellow: '#e3b341',
  orange: '#f0883e',
  red: '#f85149',
}

const usageColor = (p: number) =>
  p >= 90 ? COLOR.red : p >= 80 ? COLOR.yellow : p >= 70 ? COLOR.teal : undefined

const paceColor = (p: number) =>
  p >= 200 ? COLOR.red : p >= 150 ? COLOR.orange : p >= 120 ? COLOR.yellow : p >= 100 ? COLOR.teal : undefined

type Row = {
  label: string
  used: number
  elapsed?: number // 時間の経過率 0〜100
  pace?: number // 使用率 ÷ 経過率 × 100
  reset?: string
}

const formatReset = (kind: string, resetsAt: number) => {
  const d = new Date(resetsAt + JST_MS)
  const hm = `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  return kind === 'seven_day' ? `${WEEKDAY[d.getUTCDay()]}${hm}` : hm
}

const toRow = (limit: Limit, now: number): Row => {
  const label = LABEL[limit.kind] ?? limit.kind
  const used = Math.round(limit.percentUsed)
  const span = WINDOW_MS[limit.kind]
  const resetsAt = limit.resetsAt ? Date.parse(limit.resetsAt) : NaN
  if (!span || Number.isNaN(resetsAt)) {
    return { label, used }
  }
  const elapsed = Math.min(100, Math.max(0, (1 - (resetsAt - now) / span) * 100))
  const pace = elapsed < MIN_ELAPSED ? undefined : Math.round((used / elapsed) * 100)
  return { label, used, elapsed, pace, reset: formatReset(limit.kind, resetsAt) }
}

const paceText = (row: Row) =>
  row.elapsed === undefined ? '' : row.pace === undefined ? '×—' : `×${(row.pace / 100).toFixed(1)}`

// 1枠ぶんの横幅と、その中の各要素の位置（px）。見出しは上段、バーと数値は下段
const SEG = { bar: 0, barWidth: 96, used: 104, pace: 144, reset: 178, width: 220 }
const GAP = 16
const HEIGHT = 30
// 縦の位置はコンテキスト枠（CTX）と揃える: 見出しの基線 12、バーの中心 24
const ROW = { label: 12, text: 28, barY: 21, barHeight: 6, markerY: 18, markerHeight: 12 }

const segmentSvg = (row: Row, x: number) => {
  const barX = x + SEG.bar
  const fill = (Math.min(100, Math.max(0, row.used)) / 100) * SEG.barWidth
  const parts = [
    `<text x="${x}" y="${ROW.label}" fill="${COLOR.sub}" font-size="12">${row.label}</text>`,
    `<rect x="${barX}" y="${ROW.barY}" width="${SEG.barWidth}" height="${ROW.barHeight}" rx="3" fill="${COLOR.track}"/>`,
    `<rect x="${barX}" y="${ROW.barY}" width="${fill.toFixed(1)}" height="${ROW.barHeight}" rx="3" fill="${usageColor(row.used) ?? COLOR.bar}"/>`,
  ]
  if (row.elapsed !== undefined) {
    const mx = barX + (row.elapsed / 100) * SEG.barWidth
    parts.push(`<rect x="${(mx - 1).toFixed(1)}" y="${ROW.markerY}" width="2" height="${ROW.markerHeight}" rx="1" fill="${COLOR.marker}"/>`)
  }
  parts.push(
    `<text x="${x + SEG.used}" y="${ROW.text}" fill="${usageColor(row.used) ?? COLOR.text}" font-size="13" font-weight="500">${row.used}%</text>`,
    `<text x="${x + SEG.pace}" y="${ROW.text}" fill="${(row.pace !== undefined && paceColor(row.pace)) || COLOR.sub}" font-size="12">${paceText(row)}</text>`,
  )
  if (row.reset) {
    parts.push(`<text x="${x + SEG.reset}" y="${ROW.text}" fill="${COLOR.faint}" font-size="11">${row.reset}</text>`)
  }
  return parts.join('')
}

const bandSvg = (rows: Row[]) => {
  const width = rows.length * SEG.width + (rows.length - 1) * GAP
  const body = rows.map((row, i) => segmentSvg(row, i * (SEG.width + GAP))).join('')
  return {
    width,
    source:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" ` +
      `font-family="'Segoe UI','Yu Gothic UI',system-ui,sans-serif">${body}</svg>`,
  }
}

// デスクトップのコンテキスト表示は内訳の種類ごとに色を決めているので、名前で合わせる（スクショから採色）
const DESKTOP_COLOR: Record<string, string> = {
  Messages: '#4a8fe7',
  'System tools': '#e5683f',
  'MCP tools': '#2fa37a',
  Skills: '#d69a1c',
}
const GRAY = '#9a9a9a'

const formatTokens = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`

const contextLabel = (c: ContextInfo) =>
  c.tokens === undefined
    ? `— / ${formatTokens(c.window)}`
    : `${formatTokens(c.tokens)} / ${formatTokens(c.window)} (${c.percent ?? Math.round((c.tokens / c.window) * 100)}%)`

// 右側のコンテキスト枠: 上段に見出しと数値、下段に分類ごとに色分けしたバー
const CTX = { width: 250, height: 30, barY: 22, barHeight: 4 }

const contextSvg = (c: ContextInfo) => {
  const { width, height, barY, barHeight } = CTX
  const filled = c.tokens === undefined ? 0 : (Math.min(c.tokens, c.window) / c.window) * width
  const sum = c.segments.reduce((s, seg) => s + seg.tokens, 0)
  const segments: ContextSegment[] = sum > 0 ? c.segments : [{ color: '', tokens: 1 }]
  const total = sum > 0 ? sum : 1
  let x = 0
  const bars = segments.map(seg => {
    const w = (seg.tokens / total) * filled
    const rect = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barHeight}" fill="${seg.color || COLOR.bar}"/>`
    x += w
    return rect
  })
  const body = [
    `<text x="0" y="12" fill="${COLOR.sub}" font-size="12">コンテキストウィンドウ</text>`,
    `<text x="${width}" y="12" fill="${COLOR.sub}" font-size="12" text-anchor="end">${contextLabel(c)}</text>`,
    `<clipPath id="ctx"><rect x="0" y="${barY}" width="${width}" height="${barHeight}" rx="2"/></clipPath>`,
    `<g clip-path="url(#ctx)"><rect x="0" y="${barY}" width="${width}" height="${barHeight}" fill="${COLOR.track}"/>${bars.join('')}</g>`,
  ].join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `font-family="'Segoe UI','Yu Gothic UI',system-ui,sans-serif">${body}</svg>`
  )
}

// SVG を描けない面（ターミナル）と読み上げ用の文面
const bandText = (rows: Row[]) =>
  rows
    .map(row => [row.label, `${row.used}%`, paceText(row), row.reset].filter(Boolean).join(' '))
    .join('  ·  ')

// 内訳は API を呼ばない概算（summary）で取る。取れなければ色分けなしのバーにする
const readContext = async ($: EngineInterface): Promise<ContextInfo> => {
  const { context: usage } = await $.session.usage({ breakdown: 'summary' })
  const segments = (usage.breakdown?.categories ?? [])
    .filter(cat => cat.kind === 'used' && cat.tokens > 0)
    .map(cat => ({ color: DESKTOP_COLOR[cat.name] ?? GRAY, tokens: cat.tokens }))
  return { tokens: usage.tokens, window: usage.window, percent: usage.percent, segments }
}

export const register: Register = on => {
  // 内訳の取り直しは使用量が動いたときだけ
  let lastTokens: number | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const { rateLimits } = await $.session.usage()
    await $.state.set(limits, rateLimits)
    const ctx = await readContext($)
    lastTokens = ctx.tokens
    await $.state.set(context, ctx)
    return result
  })

  on('session.measure', async ($, e, next) => {
    await $.state.set(limits, e.rateLimits)
    if (e.context.tokens !== lastTokens) {
      lastTokens = e.context.tokens
      await $.state.set(context, await readContext($))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { value: current = [] } = await $.state.get(limits)
    const { value: ctx = null } = await $.state.get(context)
    if (e.props.hasSurvey || (current.length === 0 && !ctx)) {
      return next(e)
    }
    const now = await $.clock.now()
    const rows = current.map(l => toRow(l, now))
    if (e.surface === 'terminal') {
      const { Text } = $.ui.resolve(e)
      const text = [rows.length > 0 && bandText(rows), ctx && `コンテキスト ${contextLabel(ctx)}`].filter(Boolean).join('  ·  ')
      return <Text dimColor>{text}</Text>
    }
    const { Box, Svg } = $.ui.resolve(e)
    const left = rows.length > 0 ? bandSvg(rows) : undefined
    return (
      // 幅が足りないときだけコンテキスト枠を2段目に落とす
      <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between" alignItems="center" columnGap={2} rowGap={1} width="100%">
        {left ? <Svg source={left.source} alt={bandText(rows)} width={left.width} height={HEIGHT} /> : <Box />}
        {ctx && (
          <Svg
            source={contextSvg(ctx)}
            alt={`コンテキストウィンドウ ${contextLabel(ctx)}`}
            width={CTX.width}
            height={CTX.height}
          />
        )}
      </Box>
    )
  })
}
