"""Extract original vector swatch RGB, code and name; never sample screenshot pixels."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import pdfplumber


def extract(source: Path) -> dict:
    colors = []
    with pdfplumber.open(source) as pdf:
        for page_index, page in enumerate(pdf.pages):
            words = page.extract_words()
            for word in words:
                if not re.fullmatch(r'P\d{2,3}', word['text']):
                    continue
                candidates = [r for r in page.rects if abs(r['width'] - 30) < 0.2
                              and abs(r['height'] - 22) < 0.2
                              and 0 < word['x0'] - r['x1'] < 20
                              and r['top'] <= word['top'] <= r['bottom']]
                if len(candidates) != 1:
                    raise ValueError(f"Swatch missing/ambiguous: {word['text']}")
                swatch = candidates[0]
                rgb = [round(v * 255) for v in swatch['non_stroking_color']]
                name = page.crop((word['x0'], swatch['top'] + 12,
                                  min(word['x0'] + 130, page.width), swatch['bottom'] + 6)).extract_text()
                colors.append({'code': word['text'], 'name': name, 'rgb': rgb,
                               'hex': '#' + ''.join(f'{v:02X}' for v in rgb),
                               'source_page': page_index + 1})
    colors.sort(key=lambda c: int(c['code'][1:]))
    if len(colors) != 117 or len({c['code'] for c in colors}) != 117:
        raise ValueError('Expected exactly 117 unique Perler codes')
    return {'brand': 'Perler', 'count': 117, 'source': 'reference/Perler-Color-Chart.pdf',
            'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'method': 'Original PDF vector fill RGB; names and codes from PDF text',
            'notice': 'Screen reference only; special-effect beads cannot be represented by flat RGB.',
            'colors': colors}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path('reference/Perler-Color-Chart.pdf'))
    parser.add_argument('--output', type=Path, default=Path('backend/app/data/perler117.json'))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(extract(args.source), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Extracted 117 original swatches to {args.output}')
