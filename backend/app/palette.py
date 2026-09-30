"""A single authoritative palette loaded once, independent of HTTP and rendering."""
import json
from pathlib import Path

PALETTE = json.loads((Path(__file__).parent / 'data' / 'perler117.json').read_text(encoding='utf-8'))
COLORS = PALETTE['colors']
BY_CODE = {color['code']: color for color in COLORS}
