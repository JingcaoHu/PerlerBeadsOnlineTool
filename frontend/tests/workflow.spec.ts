import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Pattern } from '../src/types'
const fixture: Pattern = {
  version: 1,
  name: '矩形测试',
  width: 4,
  height: 3,
  cells: [
    ['P01', null, 'P18', 'P05'],
    ['P01', null, 'P18', 'P05'],
    [null, null, 'P18', null],
  ],
}
async function ready(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('pattern-canvas')).toBeVisible()
  await expect(page.getByRole('button', { name: '生成图纸', exact: true })).toBeEnabled()
}
async function importPattern(page: Page, p: Pattern = fixture) {
  await page
    .getByLabel('导入 JSON 图纸', { exact: true })
    .setInputFiles({
      name: 'test.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(p)),
    })
  if (await page.getByRole('dialog').isVisible()) {
    await page.getByRole('button', { name: '继续替换', exact: true }).click()
  }
  await expect(page.getByTestId('pattern-canvas')).toHaveAttribute('width', String(p.width * 24))
}
async function saved(page: Page): Promise<Pattern> {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存 JSON', exact: true }).click()
  const file = await event
  return JSON.parse(await readFile((await file.path())!, 'utf8'))
}
async function chooseColor(page: Page, code: string) {
  await page.getByLabel('搜索豆色').fill(code)
  await page.getByRole('button', { name: new RegExp(`^选择 ${code} `) }).click()
}
async function atCell(page: Page, x: number, y: number) {
  const p = await saved(page)
  await page.getByTestId('pattern-canvas').scrollIntoViewIfNeeded()
  const b = await page.getByTestId('pattern-canvas').boundingBox()
  if (!b) throw new Error('Canvas missing')
  return { x: b.x + ((x + 0.5) * b.width) / p.width, y: b.y + ((y + 0.5) * b.height) / p.height }
}

test('real demo, complete palette and desktop layout', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await ready(page)
  const p = await saved(page)
  expect(p.width).toBe(29)
  expect(p.height).toBe(29)
  expect(p.cells.flat().filter(Boolean)).toHaveLength(323)
  expect(await page.getByRole('button', { name: /^选择 P/ }).count()).toBe(117)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: '../docs/ui-desktop.png', fullPage: true })
  expect(errors).toEqual([])
})

test('continuous painting is one undo operation, with redo and erasing', async ({ page }) => {
  await ready(page)
  await importPattern(page)
  await chooseColor(page, 'P05')
  const from = await atCell(page, 0, 0),
    to = await atCell(page, 3, 0)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 10 })
  await page.mouse.up()
  expect((await saved(page)).cells[0]).toEqual(['P05', 'P05', 'P05', 'P05'])
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  expect((await saved(page)).cells).toEqual(fixture.cells)
  await page.getByRole('button', { name: '重做', exact: true }).click()
  expect((await saved(page)).cells[0]).toEqual(['P05', 'P05', 'P05', 'P05'])
  await page.getByRole('button', { name: '擦除', exact: true }).click()
  await page.mouse.click(from.x, from.y)
  expect((await saved(page)).cells[0][0]).toBeNull()
})

test('connected fill, bulk replacement, erase and CSV quantities agree', async ({ page }) => {
  await ready(page)
  await importPattern(page)
  await chooseColor(page, 'P05')
  await page.getByRole('button', { name: '填充', exact: true }).click()
  const pos = await atCell(page, 0, 0)
  await page.mouse.click(pos.x, pos.y)
  expect((await saved(page)).cells).toEqual([
    ['P05', null, 'P18', 'P05'],
    ['P05', null, 'P18', 'P05'],
    [null, null, 'P18', null],
  ])
  await chooseColor(page, 'P10')
  await page.locator('#replace-from').selectOption('P18')
  await page.getByRole('button', { name: '替换全部', exact: true }).click()
  expect((await saved(page)).cells.flat().filter((c) => c === 'P10')).toHaveLength(3)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 CSV', exact: true }).click()
  const csv = await readFile((await (await event).path())!, 'utf8')
  expect(csv).toContain('P10,Dark Green,#')
  expect(csv).toContain(',3,4')
  await page.locator('#replace-from').selectOption('P10')
  await page.getByRole('button', { name: '擦除该色的全部豆格', exact: true }).click()
  expect((await saved(page)).cells.flat().filter((c) => c === 'P10')).toHaveLength(0)
})

test('rectangular transforms preserve beads and correct matrix order', async ({ page }) => {
  await ready(page)
  await importPattern(page)
  await page.getByRole('button', { name: '水平镜像', exact: true }).click()
  expect((await saved(page)).cells).toEqual(fixture.cells.map((row) => [...row].reverse()))
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('button', { name: '垂直镜像', exact: true }).click()
  expect((await saved(page)).cells).toEqual([...fixture.cells].reverse())
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('button', { name: '顺时针旋转', exact: true }).click()
  const p = await saved(page)
  expect([p.width, p.height]).toEqual([3, 4])
  expect(p.cells).toEqual([
    [null, 'P01', 'P01'],
    [null, null, null],
    ['P18', 'P18', 'P18'],
    [null, 'P05', 'P05'],
  ])
})

test('real upload, grain size and restricted owned colors', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: /58 格/ }).click()
  await page.locator('#color-limit').selectOption('8')
  await page
    .getByLabel('上传像素图片', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../../examples/demo-cat.png', import.meta.url)))
  await expect(page.getByTestId('pattern-canvas')).toHaveAttribute('width', '1392')
  let p = await saved(page)
  expect(p.height).toBe(58)
  expect(new Set(p.cells.flat().filter(Boolean)).size).toBeLessThanOrEqual(8)
  await page.getByText('透明区域与现有豆色', { exact: true }).click()
  await page.getByLabel('仅使用我选中的色号').check()
  await page.getByRole('button', { name: '清空', exact: true }).click()
  await expect(page.getByRole('button', { name: '生成图纸', exact: true })).toBeDisabled()
  await page.locator('.available-list').getByText('P01', { exact: true }).click()
  await page.locator('.available-list').getByText('P18', { exact: true }).click()
  await page.getByRole('button', { name: '生成图纸', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('图纸已生成')
  p = await saved(page)
  expect([...new Set(p.cells.flat().filter(Boolean))].sort()).toEqual(['P01', 'P18'])
})

test('export PDF and PNG contain the current edits, and modal is keyboard accessible', async ({
  page,
}) => {
  await ready(page)
  await importPattern(page)
  await chooseColor(page, 'P10')
  await page.getByText('按坐标修改单格', { exact: true }).click()
  await page.getByRole('button', { name: '涂上当前色', exact: true }).click()
  await page.getByRole('button', { name: '下载图纸', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const response = page.waitForRequest((r) => r.url().endsWith('/api/export/pdf'))
  const event = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下载 PDF 图纸', exact: true }).click()
  expect((await response).postDataJSON().pattern.cells[0][0]).toBe('P10')
  const data = await readFile((await (await event).path())!)
  expect(data.subarray(0, 4).toString()).toBe('%PDF')
  const pngEvent = page.waitForEvent('download')
  await dialog.getByRole('button', { name: '下载 PNG 图纸', exact: true }).click()
  const png = await readFile((await (await pngEvent).path())!)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  await dialog.getByRole('button', { name: '关闭对话框', exact: true }).press('Escape')
  await expect(dialog).toBeHidden()
})

test('invalid import and failed conversion preserve existing edits', async ({ page }) => {
  await ready(page)
  await importPattern(page)
  await chooseColor(page, 'P10')
  await page.getByText('按坐标修改单格', { exact: true }).click()
  await page.getByRole('button', { name: '涂上当前色', exact: true }).click()
  const before = await saved(page)
  await page
    .getByLabel('导入 JSON 图纸', { exact: true })
    .setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        '{"version":1,"width":2,"height":1,"name":"bad","cells":[["P999",null]]}'
      ),
    })
  await expect(page.getByRole('alert')).toContainText('无效')
  expect((await saved(page)).cells).toEqual(before.cells)
  await page.route('**/api/convert', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: '{"detail":"测试转换失败"}',
    })
  )
  await page
    .getByLabel('上传像素图片', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../../examples/demo-cat.png', import.meta.url)))
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: '关闭对话框', exact: true }).click()
  expect((await saved(page)).cells).toEqual(before.cells)
  await page
    .getByLabel('上传像素图片', { exact: true })
    .setInputFiles(fileURLToPath(new URL('../../examples/demo-cat.png', import.meta.url)))
  await page.getByRole('button', { name: '继续替换', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('测试转换失败')
  expect((await saved(page)).cells).toEqual(before.cells)
})

test('mobile, tablet and narrow desktop avoid page overflow and controls overlap', async ({
  page,
}) => {
  await ready(page)
  for (const width of [390, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => document.fonts.ready)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `overflow at ${width}`
    ).toBe(true)
    const overlap = await page.locator('.toolbar button').evaluateAll((els) => {
      const r = els.map((el) => el.getBoundingClientRect())
      return r.some((a, i) =>
        r.some(
          (b, j) =>
            i < j &&
            Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
            Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
        )
      )
    })
    expect(overlap).toBe(false)
    if (width === 390) await page.screenshot({ path: '../docs/ui-mobile.png', fullPage: true })
  }
})

test('touch paint works and source color can be picked', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:5173',
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await ready(page)
  await importPattern(page)
  await chooseColor(page, 'P10')
  const pos = await atCell(page, 0, 0)
  await page.touchscreen.tap(pos.x, pos.y)
  expect((await saved(page)).cells[0][0]).toBe('P10')
  await page.getByRole('button', { name: '取色', exact: true }).click()
  const other = await atCell(page, 3, 0)
  await page.touchscreen.tap(other.x, other.y)
  await expect(page.getByRole('button', { name: '画笔', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.selected-color b')).toHaveText('P05')
  await context.close()
})

test('custom numeric fields allow normal typing without jumping to minimum values', async ({
  page,
}) => {
  await ready(page)
  const width = page.locator('#pattern-width')
  await width.fill('')
  await width.pressSequentially('48')
  await expect(width).toHaveValue('48')
  await expect(page.getByLabel('调整图纸宽度')).toHaveValue('48')
  const pitch = page.locator('#pitch')
  await pitch.fill('')
  await pitch.pressSequentially('2.6')
  await expect(pitch).toHaveValue('2.6')
  await pitch.press('Tab')
  await expect(pitch).toHaveValue('2.6')
  await page.getByRole('button', { name: '生成图纸', exact: true }).click()
  await expect(page.getByTestId('pattern-canvas')).toHaveAttribute('width', '1152')
  expect((await saved(page)).height).toBe(48)
})

test('maximum 200 by 200 pattern remains visible on mobile with automatic fit', async ({
  page,
}) => {
  await ready(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const large: Pattern = {
    version: 1,
    name: '最大图纸',
    width: 200,
    height: 200,
    cells: Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => 'P05')),
  }
  await importPattern(page, large)
  await expect(page.getByTestId('bead-count')).toContainText('40,000')
  await expect
    .poll(async () =>
      page.getByTestId('pattern-canvas').evaluate((el) => el.getBoundingClientRect().width)
    )
    .toBeLessThan(310)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
