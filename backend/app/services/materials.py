from collections import Counter
import csv
from io import StringIO
from math import ceil
from ..models import Pattern
from ..palette import BY_CODE

def materials(pattern: Pattern, spare_percent: int = 10) -> list[dict]:
    counts = Counter(c for row in pattern.cells for c in row if c is not None)
    return [{**BY_CODE[code], 'count': count, 'purchase_count': ceil(count * (1 + spare_percent / 100))}
            for code, count in sorted(counts.items(), key=lambda pair: (-pair[1], int(pair[0][1:])))]

def csv_bytes(pattern: Pattern, spare_percent: int) -> bytes:
    output = StringIO(newline='')
    writer = csv.writer(output)
    writer.writerow(['Perler code', 'Color name', 'HEX reference', 'Beads needed', f'With {spare_percent}% spare'])
    for row in materials(pattern, spare_percent):
        writer.writerow([row['code'], row['name'], row['hex'], row['count'], row['purchase_count']])
    return output.getvalue().encode('utf-8-sig')
