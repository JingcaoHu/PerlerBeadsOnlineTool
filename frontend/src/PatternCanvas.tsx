import { useEffect, useRef } from 'react'
import type { BeadColor, Pattern, Tool } from './types'
import { copyPattern } from './types'
const CELL = 24
export default function PatternCanvas({
  pattern,
  colors,
  tool,
  selected,
  view,
  grid,
  codes,
  board,
  zoom,
  highlight,
  onCommit,
  onHover,
}: {
  pattern: Pattern
  colors: BeadColor[]
  tool: Tool
  selected: string
  view: 'beads' | 'chart'
  grid: boolean
  codes: boolean
  board: boolean
  zoom: number
  highlight: string | null
  onCommit: (p: Pattern) => void
  onHover: (text: string) => void
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const draft = useRef<Pattern | null>(null)
  const last = useRef<[number, number] | null>(null)
  const active = useRef(false)
  const byCode = new Map(colors.map((c) => [c.code, c]))
  function render(p: Pattern) {
    const c = canvas.current,
      ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#fbfcfa'
    ctx.fillRect(0, 0, c.width, c.height)
    p.cells.forEach((row, y) =>
      row.forEach((code, x) => {
        const color = code ? byCode.get(code) : undefined
        const px = x * CELL,
          py = y * CELL
        ctx.globalAlpha = highlight && code !== highlight && code ? 0.2 : 1
        if (view === 'beads') {
          if (color) {
            ctx.fillStyle = color.hex
            ctx.beginPath()
            ctx.arc(px + 12, py + 12, 10.5, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = 'rgba(33,48,40,.10)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = '#fafbf8'
            ctx.beginPath()
            ctx.arc(px + 12, py + 12, 3.2, 0, Math.PI * 2)
            ctx.fill()
          } else {
            ctx.fillStyle = '#dce4dc'
            ctx.beginPath()
            ctx.arc(px + 12, py + 12, 1.2, 0, Math.PI * 2)
            ctx.fill()
          }
        } else {
          if (color) {
            ctx.fillStyle = color.hex
            ctx.fillRect(px, py, CELL, CELL)
          } else {
            ctx.fillStyle = (x + y) % 2 ? '#f0f3ee' : '#fafbf8'
            ctx.fillRect(px, py, CELL, CELL)
          }
          if (code && color && codes) {
            ctx.fillStyle =
              color.rgb[0] * 0.2126 + color.rgb[1] * 0.7152 + color.rgb[2] * 0.0722 > 140
                ? '#14291e'
                : '#ffffff'
            ctx.font = 'bold 7px Arial,sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(code, px + 12, py + 12)
          }
        }
        ctx.globalAlpha = 1
      })
    )
    if (grid || board) {
      ctx.lineWidth = 0.5
      ctx.strokeStyle = 'rgba(75,103,85,.22)'
      for (let x = 0; x <= p.width; x++) {
        if (grid || (board && x % 29 === 0)) {
          ctx.lineWidth = board && x % 29 === 0 ? 2 : 0.5
          ctx.beginPath()
          ctx.moveTo(x * CELL, 0.5)
          ctx.lineTo(x * CELL, p.height * CELL)
          ctx.stroke()
        }
      }
      for (let y = 0; y <= p.height; y++) {
        if (grid || (board && y % 29 === 0)) {
          ctx.lineWidth = board && y % 29 === 0 ? 2 : 0.5
          ctx.beginPath()
          ctx.moveTo(0.5, y * CELL)
          ctx.lineTo(p.width * CELL, y * CELL)
          ctx.stroke()
        }
      }
    }
  }
  useEffect(() => {
    render(pattern)
  }, [pattern, colors, view, grid, codes, board, highlight]) // Canvas drawing follows complete editor state.
  useEffect(() => {
    draft.current = null
    active.current = false
    last.current = null
  }, [pattern])
  function position(event: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect()
    return [
      Math.floor(((event.clientX - rect.left) / rect.width) * pattern.width),
      Math.floor(((event.clientY - rect.top) / rect.height) * pattern.height),
    ]
  }
  function inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < pattern.width && y < pattern.height
  }
  function drawLine(p: Pattern, from: [number, number], to: [number, number]) {
    let [x, y] = from
    const [x1, y1] = to,
      dx = Math.abs(x1 - x),
      dy = -Math.abs(y1 - y),
      sx = x < x1 ? 1 : -1,
      sy = y < y1 ? 1 : -1
    let err = dx + dy
    for (;;) {
      if (inside(x, y)) p.cells[y][x] = tool === 'erase' ? null : selected
      if (x === x1 && y === y1) break
      const e = 2 * err
      if (e >= dy) {
        err += dy
        x += sx
      }
      if (e <= dx) {
        err += dx
        y += sy
      }
    }
  }
  function fill(p: Pattern, x: number, y: number) {
    const from = p.cells[y][x]
    if (from === selected) return
    const stack: [[number, number]] | [number, number][] = [[x, y]]
    p.cells[y][x] = selected
    while (stack.length) {
      const [cx, cy] = stack.pop()!
      for (const [nx, ny] of [
        [cx - 1, cy],
        [cx + 1, cy],
        [cx, cy - 1],
        [cx, cy + 1],
      ])
        if (inside(nx, ny) && p.cells[ny][nx] === from) {
          p.cells[ny][nx] = selected
          stack.push([nx, ny])
        }
    }
  }
  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    const [x, y] = position(event)
    if (!inside(x, y)) return
    if (tool === 'pick') {
      const code = pattern.cells[y][x]
      onHover(`PICK:${code || ''}`)
      return
    }
    const p = copyPattern(pattern)
    if (tool === 'fill') {
      fill(p, x, y)
      onCommit(p)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    active.current = true
    draft.current = p
    last.current = [x, y]
    drawLine(p, [x, y], [x, y])
    render(p)
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const [x, y] = position(event)
    if (inside(x, y)) {
      const code = pattern.cells[y][x]
      onHover(`列 ${x + 1} · 行 ${y + 1} · ${code ? `${code} ${byCode.get(code)?.name}` : '空格'}`)
    }
    if (active.current && draft.current && last.current) {
      const target: [number, number] = [
        Math.max(0, Math.min(pattern.width - 1, x)),
        Math.max(0, Math.min(pattern.height - 1, y)),
      ]
      drawLine(draft.current, last.current, target)
      last.current = target
      render(draft.current)
    }
  }
  function end() {
    if (active.current && draft.current) {
      const p = draft.current
      active.current = false
      draft.current = null
      last.current = null
      onCommit(p)
    }
  }
  return (
    <canvas
      ref={canvas}
      width={pattern.width * CELL}
      height={pattern.height * CELL}
      style={{
        width: pattern.width * CELL * zoom,
        height: pattern.height * CELL * zoom,
        cursor: tool === 'pick' ? 'copy' : 'crosshair',
      }}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      aria-label={`${pattern.width}列${pattern.height}行拼豆图纸；可使用右侧单格编辑辅助操作`}
      data-testid="pattern-canvas"
    />
  )
}
