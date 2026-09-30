"""Pure in-memory renderers. Shared matrix/materials contract across PDF, PNG and CSV."""
from io import BytesIO
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from math import ceil
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, Color, white, black
from ..models import ExportRequest
from ..palette import BY_CODE
from .materials import materials

FONT_DIR = Path(__file__).parents[1] / 'data' / 'fonts'
pdfmetrics.registerFont(TTFont('StudioSans', str(FONT_DIR / 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('StudioSans-Bold', str(FONT_DIR / 'DejaVuSans-Bold.ttf')))

INK = HexColor('#243A35')
MUTED = HexColor('#65766F')

def dark_text(rgb):
    return sum(v * w for v, w in zip(rgb, (.2126, .7152, .0722))) > 140

def pdf_bytes(request: ExportRequest) -> bytes:
    pattern = request.pattern
    rows = materials(pattern, request.spare_percent)
    cell = (6 if request.mode == 'readable' else request.bead_mm) * mm
    # 29-peg blocks for readable mode; measured mode fits up to 58 pegs per sheet.
    block = 29 if request.mode == 'readable' else min(58, int(174 * mm / cell))
    across, down = ceil(pattern.width / block), ceil(pattern.height / block)
    legend_pages = max(1, ceil(len(rows) / 32))
    total_pages = 1 + legend_pages + across * down
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4, pageCompression=1)
    c.setTitle(pattern.name)  # Unicode metadata; page templates use portable Latin fonts.
    c.setAuthor('Perler Studio')
    page_number = 0

    def start(subtitle):
        nonlocal page_number
        page_number += 1
        c.setFillColor(INK)
        c.setFont('StudioSans-Bold', 20)
        c.drawString(18 * mm, 276 * mm, 'Perler Studio')
        c.setFont('StudioSans', 10)
        c.setFillColor(MUTED)
        c.drawString(18 * mm, 268 * mm, subtitle)
        c.setStrokeColor(HexColor('#DDE5DF'))
        c.line(18 * mm, 262 * mm, 192 * mm, 262 * mm)

    def end():
        c.setFont('StudioSans', 8)
        c.setFillColor(MUTED)
        c.drawString(18 * mm, 13 * mm, 'Perler 117 | Screen swatches are approximate | Empty cell = no bead')
        c.drawRightString(192 * mm, 13 * mm, f'{page_number} / {total_pages}')
        c.showPage()

    def grid(x, top, size, x0, y0, cols, height, codes):
        for ry in range(height):
            for rx in range(cols):
                code = pattern.cells[y0 + ry][x0 + rx]
                px, py = x + rx * size, top - (ry + 1) * size
                if code:
                    color = BY_CODE[code]
                    c.setFillColor(white if request.monochrome else HexColor(color['hex']))
                    c.rect(px, py, size, size, stroke=0, fill=1)
                    if codes:
                        c.setFillColor(black if request.monochrome or dark_text(color['rgb']) else white)
                        c.setFont('StudioSans-Bold', min(6.3, size * .235))
                        c.drawCentredString(px + size / 2, py + size * .40, code)
                else:
                    c.setFillColor(HexColor('#FAFAFA'))
                    c.rect(px, py, size, size, stroke=0, fill=1)
        for i in range(cols + 1):
            major = (x0 + i) % 29 == 0 or i in (0, cols)
            c.setStrokeColor(INK if major else HexColor('#ADBBB4'))
            c.setLineWidth(.8 if major else .25)
            c.line(x + i * size, top, x + i * size, top - height * size)
        for i in range(height + 1):
            major = (y0 + i) % 29 == 0 or i in (0, height)
            c.setStrokeColor(INK if major else HexColor('#ADBBB4'))
            c.setLineWidth(.8 if major else .25)
            c.line(x, top - i * size, x + cols * size, top - i * size)

    total = sum(r['count'] for r in rows)
    start(f'Overview | {pattern.width} x {pattern.height} pegs | {total:,} beads | {len(rows)} colors')
    preview_cell = min(174 * mm / pattern.width, 145 * mm / pattern.height)
    grid(18 * mm + (174 * mm - preview_cell * pattern.width) / 2, 250 * mm,
         preview_cell, 0, 0, pattern.width, pattern.height, False)
    c.setFillColor(INK)
    c.setFont('StudioSans-Bold', 11)
    c.drawString(18 * mm, 88 * mm, 'Before you start')
    c.setFont('StudioSans', 9)
    lines = [f'Estimated size at {request.bead_mm:g} mm peg pitch: '
             f'{pattern.width * request.bead_mm / 10:.1f} x {pattern.height * request.bead_mm / 10:.1f} cm.',
             f'Pattern sheets: {across} across x {down} down. Coordinates start at 1 in the top-left.',
             'Bold grid lines mark every 29 pegs. Match sheet coordinates before joining.',
             'Read the materials list for exact Perler codes and recommended spare beads.',
             'Colored or special-effect beads may look different in real light.',
             'Mirror the edited pattern before exporting if the finished face needs to be reversed.']
    if request.mode == 'actual':
        lines += ['ACTUAL SIZE: Print at 100% / Actual Size. Disable Fit to Page.',
                  'Check the 50 mm ruler. Peg pitch must match your own board.',
                  'Small code labels: use Readable mode for a larger working guide.']
    else:
        lines += ['READABLE MODE: Grid cells are enlarged to 6 mm for code legibility.',
                  'These sheets are a counting guide, not a life-size pegboard overlay.']
    for i, line in enumerate(lines):
        c.drawString(18 * mm, (79 - i * 5) * mm, line)
    end()
    for part in range(legend_pages):
        start(f'Materials | {request.spare_percent}% spare allowance | List {part + 1} / {legend_pages}')
        c.setFont('StudioSans-Bold', 9)
        c.setFillColor(INK)
        for label, x in [('COLOR / CODE', 18), ('NAME', 55), ('BEADS', 145), ('WITH SPARE', 169)]:
            c.drawString(x * mm, 250 * mm, label)
        for i, row in enumerate(rows[part * 32:(part + 1) * 32]):
            y = (240 - i * 6.5) * mm
            c.setFillColor(HexColor(row['hex']))
            c.setStrokeColor(HexColor('#B5C3BB'))
            c.rect(18 * mm, y - 1 * mm, 5 * mm, 4 * mm, stroke=1, fill=1)
            c.setFillColor(INK)
            c.setFont('StudioSans-Bold', 9)
            c.drawString(26 * mm, y, row['code'])
            c.setFont('StudioSans', 9)
            c.drawString(55 * mm, y, row['name'])
            c.drawRightString(155 * mm, y, str(row['count']))
            c.drawRightString(187 * mm, y, str(row['purchase_count']))
        if not rows:
            c.drawString(18 * mm, 238 * mm, 'This pattern has no beads. Every peg is empty.')
        end()
    for by in range(down):
        for bx in range(across):
            x0, y0 = bx * block, by * block
            cols, height = min(block, pattern.width - x0), min(block, pattern.height - y0)
            start(f'Tile {bx + 1},{by + 1} | Columns {x0 + 1}-{x0 + cols} | Rows {y0 + 1}-{y0 + height}')
            x, top = 18 * mm, 242 * mm
            grid(x, top, cell, x0, y0, cols, height, request.show_codes)
            c.setFont('StudioSans', 7)
            c.setFillColor(MUTED)
            for i in range(cols):
                if i == 0 or (x0 + i + 1) % 5 == 0 or i == cols - 1:
                    c.drawCentredString(x + (i + .5) * cell, top + 2.5 * mm, str(x0 + i + 1))
            for i in range(height):
                if i == 0 or (y0 + i + 1) % 5 == 0 or i == height - 1:
                    c.drawRightString(x - 2 * mm, top - (i + .6) * cell, str(y0 + i + 1))
            c.setStrokeColor(INK)
            c.setLineWidth(.8)
            c.line(18 * mm, 36 * mm, 68 * mm, 36 * mm)
            for rx in (18, 68):
                c.line(rx * mm, 34 * mm, rx * mm, 38 * mm)
            c.setFont('StudioSans', 8)
            c.drawString(18 * mm, 29 * mm, '50 mm print calibration - check with a ruler')
            c.drawRightString(192 * mm, 29 * mm,
                              f'Cell: {6 if request.mode == "readable" else request.bead_mm:g} mm')
            end()
    c.save()
    return buffer.getvalue()

def png_bytes(request: ExportRequest) -> bytes:
    pattern, size, margin = request.pattern, 24, 48
    rows = materials(pattern, request.spare_percent)
    width = max(960, pattern.width * size + margin * 2)
    legend_top = pattern.height * size + 155
    height = legend_top + max(1, ceil(len(rows) / 3)) * 28 + 54
    image = Image.new('RGB', (width, height), '#FFFFFF')
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 14)
    label_font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), 8)
    draw.text((margin, 22), 'PERLER STUDIO / BEAD PATTERN', fill='#243A35', font=ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), 23))
    draw.text((margin, 58), f'{pattern.width} x {pattern.height} pegs | {sum(r["count"] for r in rows)} beads | {len(rows)} colors', fill='#65766F', font=font)
    top = 100
    for y, row in enumerate(pattern.cells):
        for x, code in enumerate(row):
            px, py = margin + x * size, top + y * size
            if code:
                color = BY_CODE[code]
                draw.rectangle((px, py, px + size, py + size), fill='#FFFFFF' if request.monochrome else color['hex'])
                if request.show_codes:
                    ink = '#17271F' if request.monochrome or dark_text(color['rgb']) else '#FFFFFF'
                    draw.text((px + size / 2, py + size / 2), code, fill=ink, font=label_font, anchor='mm')
            else:
                draw.rectangle((px, py, px + size, py + size), fill='#F6F7F6')
    for x in range(pattern.width + 1):
        draw.line((margin + x * size, top, margin + x * size, top + pattern.height * size),
                  fill='#65766F' if x % 29 == 0 else '#B7C2BD', width=2 if x % 29 == 0 else 1)
    for y in range(pattern.height + 1):
        draw.line((margin, top + y * size, margin + pattern.width * size, top + y * size),
                  fill='#65766F' if y % 29 == 0 else '#B7C2BD', width=2 if y % 29 == 0 else 1)
    for x in range(pattern.width):
        if x == 0 or (x + 1) % 5 == 0:
            draw.text((margin + (x + .5) * size, top - 14), str(x + 1), font=label_font, fill='#65766F', anchor='mm')
    for y in range(pattern.height):
        if y == 0 or (y + 1) % 5 == 0:
            draw.text((margin - 12, top + (y + .5) * size), str(y + 1), font=label_font, fill='#65766F', anchor='mm')
    for i, row in enumerate(rows):
        x = margin + (i % 3) * ((width - margin * 2) / 3)
        y = legend_top + (i // 3) * 28
        draw.rectangle((x, y, x + 16, y + 16), fill=row['hex'], outline='#A5B6AC')
        draw.text((x + 25, y), f'{row["code"]} {row["name"]} x{row["count"]}', font=font, fill='#243A35')
    draw.text((margin, height - 28), 'Empty cell = no bead. Screen colors are approximate. PNG is a counting guide, not a life-size print.', font=font, fill='#65766F')
    buffer = BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    return buffer.getvalue()
