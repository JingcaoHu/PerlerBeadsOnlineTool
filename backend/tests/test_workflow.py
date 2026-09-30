import json
from io import BytesIO
from pathlib import Path
import numpy as np
import pdfplumber
import pytest
from fastapi.testclient import TestClient
from PIL import Image
from app.main import app
from app.palette import COLORS, BY_CODE, PALETTE
from app.models import Pattern, ExportRequest
from app.services.color_math import rgb_to_lab, closest_indices
from app.services.conversion import convert_image, ConversionError
from app.services.exports import pdf_bytes
from app.services.materials import materials

client = TestClient(app)

def image_bytes(pixels, size, fmt='PNG'):
    image = Image.new('RGBA', size)
    image.putdata(pixels)
    output = BytesIO()
    if fmt == 'JPEG':
        image = image.convert('RGB')
    image.save(output, format=fmt)
    return output.getvalue()

def pattern(cells):
    return Pattern(width=len(cells[0]), height=len(cells), cells=cells)

def test_original_palette_is_complete_and_reproducible():
    assert len(COLORS) == len(BY_CODE) == 117
    assert BY_CODE['P01']['rgb'] == [241, 241, 241]
    assert BY_CODE['P961']['name'] == 'Cherry'
    import hashlib
    source = Path(__file__).parents[2] / 'reference/Perler-Color-Chart.pdf'
    assert hashlib.sha256(source.read_bytes()).hexdigest() == PALETTE['source_sha256']
    assert all(c['name'] and '\ufffd' not in c['name'] for c in COLORS)

def test_lab_reference_and_exact_palette_swatch_matching():
    assert np.allclose(rgb_to_lab(np.array([[255,255,255]])), [[100,0,0]], atol=.02)
    rgb = np.array([c['rgb'] for c in COLORS])
    indices = closest_indices(rgb, rgb)
    assert np.array_equal(rgb[indices], rgb)  # Identical RGB aliases are allowed.

def test_transparency_is_empty_and_white_is_a_real_bead():
    data = image_bytes([(241,241,241,255), (0,0,0,0), (12,34,56,127), (241,241,241,128)], (4,1))
    p = convert_image(data, 4)
    assert p.cells[0][:3] == ['P01', None, None]
    assert p.cells[0][3] is not None

def test_nearest_preserves_pixel_edges_and_aspect_ratio():
    rgb = BY_CODE['P05']['rgb']
    data = image_bytes([(*rgb,255),(0,0,0,0)], (2,1))
    p = convert_image(data,8)
    assert (p.width,p.height)==(8,4)
    assert all(row==['P05']*4+[None]*4 for row in p.cells)

def test_color_budget_and_owned_palette():
    data = image_bytes([(*BY_CODE[c]['rgb'],255) for c in ['P01','P05','P09','P10']],(4,1))
    p = convert_image(data,8,max_colors=2)
    assert len({c for row in p.cells for c in row})<=2
    p = convert_image(data,8,allowed_codes=['P18','P01'])
    assert {c for row in p.cells for c in row} <= {'P18','P01'}
    with pytest.raises(ConversionError):convert_image(data,8,allowed_codes=[])

def test_reject_tall_pattern_and_malformed_images():
    with pytest.raises(ConversionError):convert_image(b'not an image',29)
    data=image_bytes([(0,0,0,255)]*300,(1,300))
    with pytest.raises(ConversionError):convert_image(data,8)

def test_exif_orientation_is_applied():
    im=Image.new('RGB',(12,6),'white');exif=Image.Exif();exif[274]=6
    buf=BytesIO();im.save(buf,'JPEG',exif=exif)
    result=convert_image(buf.getvalue(),8)
    assert (result.width,result.height)==(8,16)

def test_materials_ignore_empty_pegs_and_round_spares_per_color():
    p=pattern([['P01',None,'P05'],['P05','P05',None]])
    rows=materials(p,10)
    assert [(r['code'],r['count'],r['purchase_count']) for r in rows]==[('P05',3,4),('P01',1,2)]

def test_http_conversion_and_each_edited_export():
    assert client.get('/api/health').json()['palette_count']==117
    assert len(client.get('/api/palette').json()['colors'])==117
    data=image_bytes([(*BY_CODE['P05']['rgb'],255)]*4,(2,2))
    converted=client.post('/api/convert',files={'image':('test.png',data,'image/png')},data={'width':8})
    assert converted.status_code==200
    p=converted.json();p['cells'][0][0]='P10';p['cells'][0][1]=None
    body={'pattern':p,'spare_percent':10}
    csv=client.post('/api/export/csv',json=body)
    assert csv.status_code==200
    text=csv.content.decode('utf-8-sig')
    assert 'P10,Dark Green' in text and ',62,69' in text
    png=client.post('/api/export/png',json=body)
    assert png.status_code==200
    assert Image.open(BytesIO(png.content)).format=='PNG'
    pdf=client.post('/api/export/pdf',json=body)
    assert pdf.status_code==200 and pdf.content.startswith(b'%PDF')
    with pdfplumber.open(BytesIO(pdf.content)) as doc:
        assert len(doc.pages)==3
        content='\n'.join(page.extract_text() or '' for page in doc.pages)
        assert 'P10' in content and 'P05' in content and '63 beads' in content

def test_validation_at_http_boundary():
    invalid={'pattern':{'version':1,'width':2,'height':1,'cells':[['P01']]}}
    assert client.post('/api/export/pdf',json=invalid).status_code==422
    invalid['pattern']['cells']=[['P01','P999']]
    assert client.post('/api/export/pdf',json=invalid).status_code==422
    invalid['pattern']['cells']=[['P01',None]]
    invalid['bead_mm']=0
    assert client.post('/api/export/pdf',json=invalid).status_code==422
    assert client.post('/api/convert',files={'image':('bad.png',b'bad','image/png')},data={'width':29}).status_code==400
    assert client.post('/api/convert',files={'image':('bad.png',b'bad','image/png')},data={'width':201}).status_code==422
    assert client.post('/api/convert',files={'image':('bad.png',b'bad','image/png')},data={'allowed_codes':'{}'}).status_code==422

@pytest.mark.parametrize('mode,expected', [('readable',6),('actual',3)])
def test_print_tiling_and_absolute_coordinates(mode,expected):
    p=pattern([['P18']*30 for _ in range(30)])
    with pdfplumber.open(BytesIO(pdf_bytes(ExportRequest(pattern=p,mode=mode)))) as pdf:
        assert len(pdf.pages)==expected
        text='\n'.join(page.extract_text() or '' for page in pdf.pages)
        assert '50 mm print calibration' in text
        if mode=='readable':
            assert 'Columns 30-30' in text and 'Rows 30-30' in text
        else:assert 'Cell: 2.6 mm' in text

def test_full117_legend_and_empty_pattern_render_without_dropped_codes():
    p=pattern([[c['code'] for c in COLORS[y*13:(y+1)*13]] for y in range(9)])
    with pdfplumber.open(BytesIO(pdf_bytes(ExportRequest(pattern=p)))) as pdf:
        legend='\n'.join(page.extract_text() or '' for page in pdf.pages[1:5])
        assert all(c['code'] in legend for c in COLORS)
    empty=pattern([[None,None]])
    with pdfplumber.open(BytesIO(pdf_bytes(ExportRequest(pattern=empty)))) as pdf:
        assert 'no beads' in pdf.pages[1].extract_text()

def test_reject_large_body_before_image_decode():
    response=client.post('/api/convert',files={'image':('large.png',b'X'*(11*1024*1024),'image/png')})
    assert response.status_code==413
