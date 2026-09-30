export type BeadColor = { code: string; name: string; hex: string; rgb: [number, number, number] }
export type Pattern = {
  version: 1
  name: string
  width: number
  height: number
  cells: (string | null)[][]
}
export type Tool = 'paint' | 'erase' | 'pick' | 'fill'
export type ColorCount = BeadColor & { count: number; purchase: number }
export function copyPattern(p: Pattern): Pattern {
  return { ...p, cells: p.cells.map((row) => [...row]) }
}
export function countColors(p: Pattern | null, colors: BeadColor[], spare: number): ColorCount[] {
  if (!p) return []
  const counts = new Map<string, number>()
  p.cells.flat().forEach((c) => {
    if (c) counts.set(c, (counts.get(c) || 0) + 1)
  })
  return colors
    .filter((c) => counts.has(c.code))
    .map((c) => ({
      ...c,
      count: counts.get(c.code)!,
      purchase: Math.ceil(counts.get(c.code)! * (1 + spare / 100)),
    }))
    .sort((a, b) => b.count - a.count || parseInt(a.code.slice(1)) - parseInt(b.code.slice(1)))
}
export function validateProject(data: unknown, colors: BeadColor[]): Pattern {
  if (!data || typeof data !== 'object') throw new Error('图纸文件格式不正确')
  const p = data as Pattern
  const known = new Set(colors.map((c) => c.code))
  if (
    p.version !== 1 ||
    typeof p.name !== 'string' ||
    p.name.length > 80 ||
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.width > 200 ||
    p.height < 1 ||
    p.height > 200 ||
    !Array.isArray(p.cells) ||
    p.cells.length !== p.height ||
    p.cells.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== p.width ||
        row.some((c) => c !== null && (typeof c !== 'string' || !known.has(c)))
    )
  )
    throw new Error('图纸尺寸、版本或 Perler 色号无效')
  return p
}
