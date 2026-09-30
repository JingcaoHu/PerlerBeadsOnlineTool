import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  Download,
  Eraser,
  FileJson,
  FlipHorizontal2,
  FlipVertical2,
  Grid2X2,
  ImagePlus,
  Layers,
  LoaderCircle,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Redo2,
  RotateCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { BeadColor, Pattern, Tool } from './types'
import { copyPattern, countColors, validateProject } from './types'
import { download, request, saveProject } from './api'
import PatternCanvas from './PatternCanvas'

type Modal = 'export' | 'help' | null
export default function App() {
  const [colors, setColors] = useState<BeadColor[]>([]),
    [pattern, setPattern] = useState<Pattern | null>(null)
  const [file, setFile] = useState<File | null>(null),
    [sourceUrl, setSourceUrl] = useState(''),
    [example, setExample] = useState(true)
  const [width, setWidth] = useState(29),
    [widthDraft, setWidthDraft] = useState('29'),
    [resample, setResample] = useState<'nearest' | 'box'>('nearest'),
    [maxColors, setMaxColors] = useState(117),
    [alpha, setAlpha] = useState(128)
  const [restricted, setRestricted] = useState(false),
    [available, setAvailable] = useState<string[]>([])
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [retry, setRetry] = useState(0)
  const [tool, setTool] = useState<Tool>('paint'),
    [selected, setSelected] = useState('P33'),
    [search, setSearch] = useState('')
  const [view, setView] = useState<'beads' | 'chart'>('beads'),
    [grid, setGrid] = useState(false),
    [codes, setCodes] = useState(true),
    [board, setBoard] = useState(false),
    [zoom, setZoom] = useState(0.72),
    [autoFit, setAutoFit] = useState(true),
    [highlight, setHighlight] = useState<string | null>(null)
  const [past, setPast] = useState<Pattern[]>([]),
    [future, setFuture] = useState<Pattern[]>([]),
    [edited, setEdited] = useState(false)
  const [hover, setHover] = useState('移动到图纸上查看行列与色号'),
    [replaceFrom, setReplaceFrom] = useState('P18')
  const [pitch, setPitch] = useState(2.6),
    [pitchDraft, setPitchDraft] = useState('2.6'),
    [spare, setSpare] = useState(10),
    [cellX, setCellX] = useState(1),
    [cellY, setCellY] = useState(1)
  const [modal, setModal] = useState<Modal>(null),
    [confirm, setConfirm] = useState<{ message: string; action: () => void } | null>(null)
  const [exportMode, setExportMode] = useState<'readable' | 'actual'>('readable'),
    [exportCodes, setExportCodes] = useState(true),
    [monochrome, setMonochrome] = useState(false),
    [exportBusy, setExportBusy] = useState('')
  const upload = useRef<HTMLInputElement>(null),
    projectUpload = useRef<HTMLInputElement>(null),
    canvasArea = useRef<HTMLDivElement>(null),
    controller = useRef<AbortController | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const counts = countColors(pattern, colors, spare),
    total = counts.reduce((s, c) => s + c.count, 0),
    selectedColor = colors.find((c) => c.code === selected)
  const filtered = colors.filter((c) =>
    (c.code + ' ' + c.name).toLowerCase().includes(search.toLowerCase())
  )
  const widthValid =
    Number.isInteger(Number(widthDraft)) && Number(widthDraft) >= 8 && Number(widthDraft) <= 200
  const usedFrom = counts.some((c) => c.code === replaceFrom) ? replaceFrom : counts[0]?.code || ''

  useEffect(() => {
    let disposed = false
    const abort = new AbortController()
    controller.current = abort
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        const response = await request('/api/palette', { signal: abort.signal }),
          palette = await response.json()
        if (disposed) return
        setColors(palette.colors)
        setAvailable(palette.colors.map((c: BeadColor) => c.code))
        const demo = await fetch('/demo-cat.png', { signal: abort.signal }),
          blob = await demo.blob(),
          f = new File([blob], '小猫与叶子.png', { type: 'image/png' })
        const data = new FormData()
        data.append('image', f)
        data.append('width', '29')
        const result = await request('/api/convert', {
            method: 'POST',
            body: data,
            signal: abort.signal,
          }),
          p = await result.json()
        if (!disposed) {
          setFile(f)
          setSourceUrl(URL.createObjectURL(f))
          setPattern(p)
          setNotice('示例已准备好。上传你的图片，或直接试着编辑。')
        }
      } catch (e) {
        if (!disposed && (e as Error).name !== 'AbortError') setError((e as Error).message)
      } finally {
        if (!disposed) setLoading(false)
      }
    })()
    return () => {
      disposed = true
      abort.abort()
    }
  }, [retry])
  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    },
    [sourceUrl]
  )
  useEffect(
    () => () => {
      controller.current?.abort()
    },
    []
  )

  function updateWidth(value: number) {
    setWidth(value)
    setWidthDraft(String(value))
  }
  function updatePitch(value: number) {
    setPitch(value)
    setPitchDraft(String(value))
  }
  function commit(next: Pattern) {
    if (!pattern || JSON.stringify(pattern.cells) === JSON.stringify(next.cells)) return
    setPast([...past, pattern].slice(-50))
    setFuture([])
    setPattern(next)
    setEdited(true)
    setHighlight(null)
  }
  function undo() {
    if (!past.length || !pattern) return
    setFuture([pattern, ...future])
    setPattern(past[past.length - 1])
    setPast(past.slice(0, -1))
    setEdited(true)
    setHighlight(null)
  }
  function redo() {
    if (!future.length || !pattern) return
    setPast([...past, pattern].slice(-50))
    setPattern(future[0])
    setFuture(future.slice(1))
    setEdited(true)
    setHighlight(null)
  }
  function protectedAction(action: () => void) {
    if (edited)
      setConfirm({ message: '这会替换当前图纸。请先下载 JSON 保存编辑，或继续替换。', action })
    else action()
  }
  async function generate(f = file) {
    if (!f) return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    setBusy(true)
    setError('')
    setNotice('')
    setHighlight(null)
    const data = new FormData()
    data.append('image', f)
    data.append('width', String(width))
    data.append('resample', resample)
    data.append('alpha_threshold', String(alpha))
    data.append('max_colors', String(maxColors))
    if (restricted) data.append('allowed_codes', JSON.stringify(available))
    try {
      const response = await request('/api/convert', {
        method: 'POST',
        body: data,
        signal: abort.signal,
      })
      const next = await response.json()
      setPattern(next)
      setPast([])
      setFuture([])
      setEdited(false)
      setAutoFit(true)
      setNotice('图纸已生成，可以开始编辑或下载。')
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      if (!abort.signal.aborted) setBusy(false)
    }
  }
  function chooseFile(f?: File) {
    if (!f || loading || busy) return
    if (f.size > 10 * 1024 * 1024) {
      setError('图片不能超过 10 MB')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      setError('请上传 PNG、JPEG 或 WebP 图片')
      return
    }
    protectedAction(() => {
      setFile(f)
      setSourceUrl(URL.createObjectURL(f))
      setExample(false)
      void generate(f)
    })
  }
  async function importProject(f?: File) {
    if (!f) return
    if (f.size > 2 * 1024 * 1024) {
      setError('JSON 图纸文件不能超过 2 MB')
      return
    }
    try {
      const p = validateProject(JSON.parse(await f.text()), colors)
      protectedAction(() => {
        controller.current?.abort()
        setPattern(p)
        setPast([])
        setFuture([])
        setEdited(false)
        setFile(null)
        setSourceUrl('')
        setExample(false)
        setBusy(false)
        setAutoFit(true)
        setHighlight(null)
        setNotice('已恢复 JSON 图纸。重新生成需要上传原图。')
        setError('')
      })
    } catch (e) {
      setError((e as Error).message)
    }
  }
  function transform(kind: 'horizontal' | 'vertical' | 'rotate') {
    if (!pattern) return
    const p = copyPattern(pattern)
    if (kind === 'horizontal') p.cells = p.cells.map((row) => row.reverse())
    else if (kind === 'vertical') p.cells.reverse()
    else {
      p.cells = Array.from({ length: p.width }, (_, y) =>
        Array.from({ length: p.height }, (_, x) => pattern.cells[pattern.height - 1 - x][y])
      )
      ;[p.width, p.height] = [p.height, p.width]
    }
    commit(p)
  }
  function bulk(remove = false) {
    if (!pattern || !usedFrom) return
    const p = copyPattern(pattern)
    p.cells = p.cells.map((row) =>
      row.map((c) => (c === usedFrom ? (remove ? null : selected) : c))
    )
    commit(p)
    setNotice(
      remove
        ? `已擦除 ${usedFrom} 的全部豆格，可撤销。`
        : `已将 ${usedFrom} 全部替换为 ${selected}，可撤销。`
    )
  }
  function editCell(remove = false) {
    if (!pattern) return
    if (cellX < 1 || cellX > pattern.width || cellY < 1 || cellY > pattern.height) {
      setError('行列坐标超出图纸范围')
      return
    }
    const p = copyPattern(pattern)
    p.cells[cellY - 1][cellX - 1] = remove ? null : selected
    commit(p)
  }
  function fit() {
    setAutoFit(true)
    if (!pattern || !canvasArea.current) return
    const padding = window.innerWidth <= 720 ? 52 : 76
    setZoom(
      Math.max(
        0.05,
        Math.min(
          2,
          (canvasArea.current.clientWidth - padding) / (pattern.width * 24),
          (canvasArea.current.clientHeight - padding) / (pattern.height * 24)
        )
      )
    )
  }
  useEffect(() => {
    const el = canvasArea.current
    if (!el || !pattern || !autoFit) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(el)
    fit()
    return () => observer.disconnect()
  }, [pattern?.width, pattern?.height, autoFit])
  function onHover(text: string) {
    if (text.startsWith('PICK:')) {
      const code = text.slice(5)
      if (code) {
        setSelected(code)
        setTool('paint')
        setNotice(`已取色 ${code}`)
      } else setNotice('这个位置为空格，请从色盘选择豆色。')
    } else setHover(text)
  }
  async function exportFile(format: 'pdf' | 'png' | 'csv') {
    if (!pattern || exportBusy) return
    setExportBusy(format)
    setError('')
    try {
      const response = await request(`/api/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pattern,
          mode: exportMode,
          bead_mm: pitch,
          show_codes: exportCodes,
          monochrome,
          spare_percent: spare,
        }),
      })
      download(await response.blob(), `perler-pattern.${format}`)
      setNotice(`${format.toUpperCase()} 已生成并开始下载。`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setExportBusy('')
    }
  }
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches('input,select,textarea') || modal || confirm) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (!busy && !loading) {
          if (e.shiftKey) redo()
          else undo()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (!busy && !loading) redo()
        return
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const tools: Record<string, Tool> = { b: 'paint', e: 'erase', i: 'pick', f: 'fill' }
        if (tools[e.key.toLowerCase()]) setTool(tools[e.key.toLowerCase()])
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [pattern, past, future, modal, confirm, busy, loading])
  useEffect(() => {
    if (!modal && !confirm) return
    const previous = document.activeElement as HTMLElement | null
    const el = dialogRef.current,
      focusables = () =>
        el?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]'
        )
    focusables()?.[0]?.focus()
    function trap(e: KeyboardEvent) {
      if (e.key === 'Escape' && !exportBusy) {
        setModal(null)
        setConfirm(null)
      }
      if (e.key === 'Tab') {
        const nodes = focusables()
        if (!nodes?.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', trap)
    return () => {
      document.removeEventListener('keydown', trap)
      previous?.focus()
    }
  }, [modal, confirm, exportBusy])

  return (
    <div className="app">
      <header className="site-header">
        <a className="brand" href="/" aria-label="豆格首页">
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>
              豆格<span className="brand-en">Perler Studio</span>
            </strong>
            <small>一张图片，一格一豆。</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="privacy">
            <ShieldCheck size={15} /> 无需登录 · 图片不留存
          </span>
          <button className="button subtle" onClick={() => setModal('help')}>
            使用指南
          </button>
          <button
            className="button primary"
            disabled={!pattern || busy || loading}
            onClick={() => setModal('export')}
          >
            <Download size={17} />
            下载图纸
          </button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <span className="eyebrow">
              <span /> YOUR LITTLE PIXEL WORKSHOP
            </span>
            <h1>把喜欢的像素，拼成作品。</h1>
            <p>上传图片，匹配 Perler 实体色号，再做一点自己的调整。</p>
          </div>
          <span className="palette-badge">
            <Layers size={17} />
            <b>117</b> 色 Perler 色盘
          </span>
        </div>
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <div>
              {!pattern && (
                <button className="button small" onClick={() => setRetry(retry + 1)}>
                  重试连接
                </button>
              )}
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            <Check size={15} />
            <span>{notice}</span>
            <button className="icon-button" aria-label="关闭状态提示" onClick={() => setNotice('')}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="workspace">
          <aside className="left-panel">
            <section className="card settings-card">
              <div className="section-title">
                <span className="step">01</span>
                <h2>准备图纸</h2>
                <Settings2 size={16} />
              </div>
              <input
                ref={upload}
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="上传像素图片"
                disabled={busy || loading}
                onChange={(e) => {
                  chooseFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <button
                className={`upload-area ${sourceUrl ? 'has-image' : ''}`}
                disabled={busy || loading}
                onClick={() => upload.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  chooseFile(e.dataTransfer.files[0])
                }}
              >
                {sourceUrl ? (
                  <>
                    <img src={sourceUrl} alt="上传原图预览" />
                    <span>
                      <b>{example ? '试试这张示例' : file?.name}</b>
                      <small>
                        <Upload size={12} /> 点击或拖入更换图片
                      </small>
                    </span>
                  </>
                ) : (
                  <>
                    <ImagePlus size={26} />
                    <b>上传你的像素图片</b>
                    <small>点击选择，或把图片拖到这里</small>
                  </>
                )}
              </button>
              <p className="caption">PNG / JPG / WebP · 最大 10 MB</p>
              <fieldset disabled={busy || loading} className="settings-fields">
                <label className="field-title" htmlFor="pattern-width">
                  图纸宽度 <span>每格对应一颗豆</span>
                </label>
                <div className="width-presets">
                  <button
                    type="button"
                    className={width === 29 ? 'active' : ''}
                    onClick={() => updateWidth(29)}
                  >
                    <b>29 格</b>
                    <small>小幅 · 一块板宽</small>
                  </button>
                  <button
                    type="button"
                    className={width === 58 ? 'active' : ''}
                    onClick={() => updateWidth(58)}
                  >
                    <b>58 格</b>
                    <small>细节 · 两块板宽</small>
                  </button>
                </div>
                <div className="input-unit">
                  <label htmlFor="pattern-width">自定义</label>
                  <input
                    id="pattern-width"
                    type="number"
                    min="8"
                    max="200"
                    value={widthDraft}
                    onChange={(e) => {
                      const raw = e.target.value
                      setWidthDraft(raw)
                      const n = Number(raw)
                      if (Number.isInteger(n) && n >= 8 && n <= 200) setWidth(n)
                    }}
                    onBlur={() =>
                      updateWidth(Math.max(8, Math.min(200, Math.round(Number(widthDraft) || 29))))
                    }
                  />
                  <span>格</span>
                </div>
                <input
                  aria-label="调整图纸宽度"
                  type="range"
                  min="8"
                  max="200"
                  value={width}
                  onChange={(e) => updateWidth(Number(e.target.value))}
                />
                <div className="range-label">
                  <span>8 格</span>
                  <span>保留原图比例</span>
                  <span>200 格</span>
                </div>
                <div className="field">
                  <label htmlFor="resample">图片处理</label>
                  <select
                    id="resample"
                    value={resample}
                    onChange={(e) => setResample(e.target.value as 'nearest' | 'box')}
                  >
                    <option value="nearest">像素图 · 保留清晰边缘</option>
                    <option value="box">照片 · 区域平均色</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="color-limit">最多使用几种豆色？</label>
                  <select
                    id="color-limit"
                    value={maxColors}
                    onChange={(e) => setMaxColors(Number(e.target.value))}
                  >
                    {[8, 16, 24, 48, 117].map((n) => (
                      <option key={n} value={n}>
                        {n === 117 ? '全部 117 色' : `最多 ${n} 色 · 减少备料`}
                      </option>
                    ))}
                  </select>
                </div>
                <details className="advanced">
                  <summary>
                    透明区域与现有豆色 <ChevronDown size={14} />
                  </summary>
                  <label className="field-title" htmlFor="alpha">
                    透明度门槛 <b>{alpha}</b>
                  </label>
                  <input
                    id="alpha"
                    type="range"
                    min="1"
                    max="255"
                    value={alpha}
                    onChange={(e) => setAlpha(Number(e.target.value))}
                  />
                  <p className="caption">低于门槛的像素留空，不填白豆。</p>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={restricted}
                      onChange={(e) => setRestricted(e.target.checked)}
                    />
                    仅使用我选中的色号
                  </label>
                  {restricted && (
                    <>
                      <div className="availability-actions">
                        <span>已选 {available.length} / 117</span>
                        <button
                          type="button"
                          onClick={() => setAvailable(colors.map((c) => c.code))}
                        >
                          全选
                        </button>
                        <button type="button" onClick={() => setAvailable([])}>
                          清空
                        </button>
                      </div>
                      <div className="available-list">
                        {colors.map((c) => (
                          <label key={c.code} title={c.name}>
                            <input
                              type="checkbox"
                              checked={available.includes(c.code)}
                              onChange={(e) =>
                                setAvailable(
                                  e.target.checked
                                    ? [...available, c.code]
                                    : available.filter((code) => code !== c.code)
                                )
                              }
                            />
                            <i style={{ background: c.hex }} />
                            {c.code}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </details>
                <button
                  className="button primary full generate"
                  disabled={!file || !widthValid || (restricted && available.length === 0)}
                  onClick={() => protectedAction(() => void generate())}
                >
                  {busy ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{' '}
                  {busy ? '正在生成…' : '生成图纸'}
                  <ArrowRight size={16} />
                </button>
                <p className="caption centered">调整设置后点击生成；会替换当前图纸。</p>
              </fieldset>
            </section>
            <section className="card compact-card">
              <h3>
                <FileJson size={16} /> 保存你的编辑
              </h3>
              <p>下载 JSON，下次导入即可继续，不需要账号。</p>
              <div className="two-buttons">
                <button
                  className="button small"
                  disabled={!pattern || busy}
                  onClick={() => pattern && saveProject(pattern)}
                >
                  <ArrowDownToLine size={14} />
                  保存 JSON
                </button>
                <button
                  className="button small"
                  disabled={!colors.length || busy || loading}
                  onClick={() => projectUpload.current?.click()}
                >
                  <Upload size={14} />
                  导入 JSON
                </button>
              </div>
              <input
                className="sr-only"
                ref={projectUpload}
                type="file"
                aria-label="导入 JSON 图纸"
                accept=".json,application/json"
                onChange={(e) => {
                  void importProject(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </section>
            <p className="source-note">
              色盘来自所附 Perler Color Chart。
              <br />
              屏幕色与实体豆存在差异，请以实物为准。
            </p>
          </aside>
          <section className="center-panel">
            <div className="stats">
              <div>
                <span>图纸尺寸</span>
                <strong>
                  {pattern ? `${pattern.width} × ${pattern.height}` : '—'}
                  <small>格</small>
                </strong>
              </div>
              <div>
                <span>豆子总数</span>
                <strong data-testid="bead-count">
                  {total.toLocaleString()}
                  <small>颗</small>
                </strong>
              </div>
              <div>
                <span>使用颜色</span>
                <strong>
                  {counts.length}
                  <small>种</small>
                </strong>
              </div>
              <div>
                <span>预计成品</span>
                <strong>
                  {pattern
                    ? `${((pattern.width * pitch) / 10).toFixed(1)} × ${((pattern.height * pitch) / 10).toFixed(1)}`
                    : '—'}
                  <small>cm</small>
                </strong>
              </div>
            </div>
            <section className="card editor-card">
              <div className="editor-heading">
                <div>
                  <span className="step">02</span>
                  <h2>图纸工作台</h2>
                  {example && <span className="tag">示例</span>}
                  {edited && <span className="tag amber">已编辑</span>}
                </div>
                <div className="view-tabs">
                  <button
                    className={view === 'beads' ? 'active' : ''}
                    onClick={() => setView('beads')}
                  >
                    拼豆预览
                  </button>
                  <button
                    className={view === 'chart' ? 'active' : ''}
                    onClick={() => setView('chart')}
                  >
                    色号图纸
                  </button>
                </div>
              </div>
              <div className="toolbar">
                <div className="tool-group">
                  {(
                    [
                      { id: 'paint', label: '画笔', key: 'B', icon: Paintbrush },
                      { id: 'erase', label: '擦除', key: 'E', icon: Eraser },
                      { id: 'pick', label: '取色', key: 'I', icon: Pipette },
                      { id: 'fill', label: '填充', key: 'F', icon: PaintBucket },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      className={`tool-button ${tool === t.id ? 'active' : ''}`}
                      title={`${t.label} (${t.key})`}
                      aria-label={t.label}
                      aria-pressed={tool === t.id}
                      disabled={!pattern || busy || loading}
                      onClick={() => setTool(t.id)}
                    >
                      <t.icon size={17} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
                <div className="tool-divider" />
                <div className="tool-group">
                  <button
                    className="icon-button"
                    title="撤销 Ctrl/⌘ Z"
                    aria-label="撤销"
                    disabled={!past.length || busy}
                    onClick={undo}
                  >
                    <Undo2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    title="重做 Ctrl/⌘ Shift Z"
                    aria-label="重做"
                    disabled={!future.length || busy}
                    onClick={redo}
                  >
                    <Redo2 size={17} />
                  </button>
                </div>
                <div className="tool-group transforms">
                  <button
                    className="icon-button"
                    aria-label="水平镜像"
                    title="水平镜像"
                    disabled={!pattern || busy}
                    onClick={() => transform('horizontal')}
                  >
                    <FlipHorizontal2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="垂直镜像"
                    title="垂直镜像"
                    disabled={!pattern || busy}
                    onClick={() => transform('vertical')}
                  >
                    <FlipVertical2 size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="顺时针旋转"
                    title="顺时针旋转 90°"
                    disabled={!pattern || busy}
                    onClick={() => transform('rotate')}
                  >
                    <RotateCw size={17} />
                  </button>
                </div>
              </div>
              <div ref={canvasArea} className={`canvas-wrap ${busy ? 'processing' : ''}`}>
                <div className="canvas-stage">
                  {pattern ? (
                    <PatternCanvas
                      pattern={pattern}
                      colors={colors}
                      tool={tool}
                      selected={selected}
                      view={view}
                      grid={grid}
                      codes={codes}
                      board={board}
                      zoom={zoom}
                      highlight={highlight}
                      onCommit={commit}
                      onHover={onHover}
                    />
                  ) : (
                    <div className="canvas-empty">
                      {loading ? (
                        <LoaderCircle size={34} className="spin" />
                      ) : (
                        <ImagePlus size={34} />
                      )}
                      <h3>{loading ? '正在准备色盘与示例' : '你的作品会出现在这里'}</h3>
                      <p>
                        {loading
                          ? '稍等片刻，就可以开始编辑'
                          : '上传图片并生成，或导入已保存的 JSON 图纸。'}
                      </p>
                    </div>
                  )}
                </div>
                {busy && (
                  <div className="processing-overlay">
                    <LoaderCircle size={26} className="spin" />
                    <b>正在匹配豆色…</b>
                  </div>
                )}
              </div>
              <div className="canvas-options">
                <div className="display-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={grid}
                      onChange={(e) => setGrid(e.target.checked)}
                    />
                    网格
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={codes}
                      disabled={view === 'beads'}
                      onChange={(e) => setCodes(e.target.checked)}
                    />
                    色号
                  </label>
                  <label title="每 29 格一条粗线，仅作为参考">
                    <input
                      type="checkbox"
                      checked={board}
                      onChange={(e) => setBoard(e.target.checked)}
                    />
                    29 格分块
                  </label>
                </div>
                <div className="zoom-controls">
                  <button
                    className="icon-button"
                    aria-label="缩小"
                    disabled={zoom <= 0.05}
                    onClick={() => {
                      setAutoFit(false)
                      setZoom(Math.max(0.05, zoom - 0.15))
                    }}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span>{Math.round(zoom * 100)}%</span>
                  <button
                    className="icon-button"
                    aria-label="放大"
                    disabled={zoom >= 2}
                    onClick={() => {
                      setAutoFit(false)
                      setZoom(Math.min(2, zoom + 0.15))
                    }}
                  >
                    <ZoomIn size={15} />
                  </button>
                  <button className="fit-button" onClick={fit} disabled={!pattern}>
                    适应
                  </button>
                </div>
              </div>
              <div className="canvas-status">
                <span>
                  <MousePointer2 size={12} />
                  {hover}
                </span>
                {highlight ? (
                  <button onClick={() => setHighlight(null)}>取消 {highlight} 高亮</button>
                ) : (
                  <span>拖动绘制 · 一次操作可撤销</span>
                )}
              </div>
            </section>
            <section className="card materials-card">
              <div className="materials-heading">
                <div>
                  <span className="step">03</span>
                  <h2>备料清单</h2>
                  <span className="caption">点击色号，在图纸中定位</span>
                </div>
                <button
                  className="button small"
                  disabled={!pattern || !!exportBusy}
                  onClick={() => void exportFile('csv')}
                >
                  <Download size={14} />
                  {exportBusy === 'csv' ? '导出中…' : '导出 CSV'}
                </button>
              </div>
              <div className="materials-table">
                <table>
                  <thead>
                    <tr>
                      <th>实体色号</th>
                      <th>豆色名称</th>
                      <th>所需颗数</th>
                      <th>含 {spare}% 备用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {counts.map((c) => (
                      <tr key={c.code} className={highlight === c.code ? 'highlighted' : ''}>
                        <td>
                          <button
                            className="material-code"
                            onClick={() => setHighlight(highlight === c.code ? null : c.code)}
                          >
                            <i style={{ background: c.hex }} />
                            {c.code}
                          </button>
                        </td>
                        <td>{c.name}</td>
                        <td>{c.count.toLocaleString()}</td>
                        <td>{c.purchase.toLocaleString()}</td>
                      </tr>
                    ))}
                    {!counts.length && (
                      <tr>
                        <td colSpan={4} className="empty-table">
                          暂无豆子。空格不会计入用量。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="materials-footer">
                <label htmlFor="spare">
                  备用豆比例{' '}
                  <select
                    id="spare"
                    value={spare}
                    onChange={(e) => setSpare(Number(e.target.value))}
                  >
                    {[0, 5, 10, 15, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}%
                      </option>
                    ))}
                  </select>
                </label>
                <span>每种颜色分别向上取整，便于购买。</span>
              </div>
            </section>
          </section>
          <aside className="right-panel">
            <section className="card palette-card">
              <div className="section-title">
                <h2>选一颗豆色</h2>
                <span className="tag">117 色</span>
              </div>
              <div className="selected-color">
                <span className="big-swatch" style={{ background: selectedColor?.hex }} />
                <div>
                  <b>{selected}</b>
                  <span>{selectedColor?.name || '加载色盘中'}</span>
                  <small>{selectedColor?.hex}</small>
                </div>
                <span className="selected-check">
                  <Check size={15} />
                </span>
              </div>
              <div className="search-box">
                <Search size={15} />
                <input
                  aria-label="搜索豆色"
                  placeholder="搜索色号或英文名称"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <button
                    className="icon-button"
                    aria-label="清空搜索"
                    onClick={() => setSearch('')}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="palette-grid">
                {filtered.map((c) => (
                  <button
                    className={selected === c.code ? 'selected' : ''}
                    key={c.code}
                    title={`${c.code} ${c.name} ${c.hex}`}
                    aria-label={`选择 ${c.code} ${c.name}`}
                    aria-pressed={selected === c.code}
                    disabled={loading}
                    onClick={() => {
                      setSelected(c.code)
                      setHighlight(null)
                    }}
                  >
                    <i style={{ background: c.hex }} />
                    <span>{c.code}</span>
                  </button>
                ))}
                {!filtered.length && <p className="no-results">没有找到豆色。</p>}
              </div>
              <p className="caption palette-help">
                选择豆色，再用画笔点击或拖动图纸。
                <br />
                填充会替换相连区域；取色会读取当前豆色。
              </p>
            </section>
            <section className="card compact-card">
              <h3>大面积换色</h3>
              <p>把图纸中的某个色号，全部换成当前选色。</p>
              <label className="field-title" htmlFor="replace-from">
                要替换的色号
              </label>
              <select
                id="replace-from"
                value={usedFrom}
                disabled={!counts.length || busy}
                onChange={(e) => setReplaceFrom(e.target.value)}
              >
                {counts.length ? (
                  counts.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.name} ({c.count})
                    </option>
                  ))
                ) : (
                  <option value="">暂无使用色号</option>
                )}
              </select>
              <div className="replacement-preview">
                <span>{usedFrom || '—'}</span>
                <ArrowRight size={15} />
                <b>
                  <i style={{ background: selectedColor?.hex }} />
                  {selected}
                </b>
              </div>
              <button
                className="button full"
                disabled={!usedFrom || usedFrom === selected || busy}
                onClick={() => bulk()}
              >
                <CheckCheck size={15} />
                替换全部
              </button>
              <button
                className="text-button"
                disabled={!usedFrom || busy}
                onClick={() => bulk(true)}
              >
                <Eraser size={13} />
                擦除该色的全部豆格
              </button>
            </section>
            <section className="card compact-card">
              <h3>
                <Grid2X2 size={16} /> 尺寸与单格编辑
              </h3>
              <label className="field-title" htmlFor="pitch">
                底板钉距 <span>决定实际尺寸</span>
              </label>
              <div className="input-unit">
                <input
                  id="pitch"
                  type="number"
                  min="2"
                  max="10"
                  step="0.1"
                  value={pitchDraft}
                  onChange={(e) => {
                    const raw = e.target.value
                    setPitchDraft(raw)
                    const n = Number(raw)
                    if (n >= 2 && n <= 10) setPitch(n)
                  }}
                  onBlur={() =>
                    updatePitch(
                      Math.max(2, Math.min(10, Math.round((Number(pitchDraft) || 2.6) * 10) / 10))
                    )
                  }
                />
                <span>mm</span>
              </div>
              <div className="pitch-presets">
                <button className={pitch === 2.6 ? 'active' : ''} onClick={() => updatePitch(2.6)}>
                  2.6 mm
                </button>
                <button className={pitch === 5 ? 'active' : ''} onClick={() => updatePitch(5)}>
                  5 mm
                </button>
              </div>
              <p className="caption">请核对自己的底板钉距，豆子直径不等于钉距。</p>
              <details className="advanced cell-editor">
                <summary>
                  按坐标修改单格 <ChevronDown size={14} />
                </summary>
                <div className="coordinate-inputs">
                  <label>
                    列
                    <input
                      aria-label="编辑列坐标"
                      type="number"
                      min="1"
                      max={pattern?.width || 200}
                      value={cellX}
                      onChange={(e) => setCellX(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    行
                    <input
                      aria-label="编辑行坐标"
                      type="number"
                      min="1"
                      max={pattern?.height || 200}
                      value={cellY}
                      onChange={(e) => setCellY(Number(e.target.value))}
                    />
                  </label>
                </div>
                <div className="two-buttons">
                  <button
                    className="button small"
                    disabled={!pattern || busy}
                    onClick={() => editCell()}
                  >
                    涂上当前色
                  </button>
                  <button
                    className="button small"
                    disabled={!pattern || busy}
                    onClick={() => editCell(true)}
                  >
                    擦除该格
                  </button>
                </div>
              </details>
            </section>
          </aside>
        </div>
        <footer>
          <span>
            <span className="mini-mark" /> 豆格 · 把耐心留给每一格。
          </span>
          <span>117 色参考 · 空格不放豆 · 下载后即可打印</span>
        </footer>
      </main>
      {(modal || confirm) && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !exportBusy) {
              setModal(null)
              setConfirm(null)
            }
          }}
        >
          <div
            className={`modal ${modal === 'help' ? 'help-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            ref={dialogRef}
          >
            <div className="modal-heading">
              <h2 id="dialog-title">
                {confirm
                  ? '替换当前图纸？'
                  : modal === 'export'
                    ? '带着图纸，开始拼豆。'
                    : '从图片到作品'}
              </h2>
              <button
                className="icon-button"
                aria-label="关闭对话框"
                disabled={!!exportBusy}
                onClick={() => {
                  setModal(null)
                  setConfirm(null)
                }}
              >
                <X size={20} />
              </button>
            </div>
            {confirm ? (
              <>
                <p>{confirm.message}</p>
                <div className="confirm-actions">
                  <button className="button" onClick={() => pattern && saveProject(pattern)}>
                    先保存 JSON
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      const action = confirm.action
                      setConfirm(null)
                      action()
                    }}
                  >
                    继续替换
                  </button>
                </div>
              </>
            ) : modal === 'help' ? (
              <div className="help-content">
                <ol>
                  <li>
                    <b>准备图片与尺寸</b>
                    <p>
                      像素图选“保留清晰边缘”；照片选“区域平均色”。29、58
                      格是快捷宽度，高度按比例计算。
                    </p>
                  </li>
                  <li>
                    <b>生成并微调</b>
                    <p>
                      画笔 B、擦除 E、取色 I、填充 F。点击并拖动连续修改，使用 Ctrl/⌘ Z
                      撤销。右侧也可以按坐标修改。
                    </p>
                  </li>
                  <li>
                    <b>备料与下载</b>
                    <p>
                      清单会实时更新。PDF 含总览、用量清单及分块图纸；PNG
                      适合屏幕查看。含透明区域的空格不放豆。
                    </p>
                  </li>
                </ol>
                <div className="help-note">
                  镜像用于反面制作；29
                  格分块仅是参考。实际尺寸打印请选择正确钉距，在打印对话框中选择 100%，并核对 50 mm
                  标尺。
                </div>
                <p className="caption">
                  图片仅用于当前请求的临时处理，请求结束后清理，不保存业务记录。刷新页面会丢失编辑，请保存
                  JSON。珠光、夜光、金属等特殊效果无法用屏幕 RGB 准确呈现。
                </p>
              </div>
            ) : (
              <>
                <p className="modal-description">
                  PDF 含总览、备料清单，以及带行列坐标的分页图纸。
                </p>
                {error && (
                  <div className="alert error" role="alert">
                    {error}
                  </div>
                )}
                <div className="export-modes">
                  <label className={exportMode === 'readable' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="export-mode"
                      checked={exportMode === 'readable'}
                      onChange={() => setExportMode('readable')}
                    />
                    <span>
                      <b>
                        照图拼豆 <span className="tag">推荐</span>
                      </b>
                      <small>每格 6 mm，色号清晰 · 按 29 格分块</small>
                    </span>
                  </label>
                  <label className={exportMode === 'actual' ? 'active' : ''}>
                    <input
                      type="radio"
                      name="export-mode"
                      checked={exportMode === 'actual'}
                      onChange={() => setExportMode('actual')}
                    />
                    <span>
                      <b>按底板钉距输出</b>
                      <small>每格 {pitch} mm · 打印时选择 100% 实际大小</small>
                    </span>
                  </label>
                </div>
                <div className="export-checkboxes">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={exportCodes}
                      onChange={(e) => setExportCodes(e.target.checked)}
                    />
                    标注完整色号
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={monochrome}
                      onChange={(e) => setMonochrome(e.target.checked)}
                    />
                    黑白省墨图纸
                  </label>
                </div>
                {exportMode === 'actual' && (
                  <p className="export-note">
                    打印后用尺子核对 50 mm 标尺；小钉距下色号较小，可另导出“照图拼豆”版本。
                  </p>
                )}
                <div className="export-summary">
                  <span>
                    {pattern?.width} × {pattern?.height} 格 · {total.toLocaleString()} 颗豆
                  </span>
                  <span>
                    {counts.length} 色 · 备用 {spare}%
                  </span>
                </div>
                <div className="export-buttons">
                  <button
                    className="button primary"
                    disabled={!!exportBusy}
                    onClick={() => void exportFile('pdf')}
                  >
                    {exportBusy === 'pdf' ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Download size={17} />
                    )}
                    下载 PDF 图纸
                  </button>
                  <button
                    className="button"
                    disabled={!!exportBusy}
                    onClick={() => void exportFile('png')}
                  >
                    {exportBusy === 'png' ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <ImagePlus size={17} />
                    )}
                    下载 PNG 图纸
                  </button>
                </div>
                <p className="caption centered">
                  PNG 为带图例的完整图纸，按格计数使用，不作为等比例打印模板。
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
