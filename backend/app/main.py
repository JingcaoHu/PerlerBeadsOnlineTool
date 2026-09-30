"""HTTP adapter. Conversion / validation / materials / rendering stay in separate modules."""
import json
import os
from typing import Annotated, Literal
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from .models import ExportRequest
from .limits import BodyLimitMiddleware
from .palette import PALETTE, BY_CODE
from .services.conversion import convert_image, ConversionError, MAX_FILE_BYTES
from .services.exports import pdf_bytes, png_bytes
from .services.materials import csv_bytes

app = FastAPI(title='Perler Studio API', version='1.0.0', description='Stateless Perler image conversion and printable pattern exports')
app.add_middleware(CORSMiddleware,
    allow_origins=os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(','),
    allow_methods=['GET', 'POST'], allow_headers=['Content-Type'], expose_headers=['Content-Disposition'])

app.add_middleware(BodyLimitMiddleware)

@app.get('/api/health', tags=['System'])
def health():
    return {'status': 'ok', 'palette_count': len(BY_CODE)}

@app.get('/api/palette', tags=['Palette'])
def palette():
    """Return all 117 codes and exact PDF swatch RGB; frontend never invents bead colors."""
    return PALETTE

@app.post('/api/convert', tags=['Pattern'])
async def convert(
    image: Annotated[UploadFile, File(description='PNG/JPEG/WebP, <=10 MB, <=20 megapixels')],
    width: Annotated[int, Form(ge=8, le=200, description='Pattern width in pegs; aspect ratio is preserved')] = 48,
    resample: Annotated[Literal['nearest', 'box'], Form(description='nearest for pixel art, box for photo averaging')] = 'nearest',
    alpha_threshold: Annotated[int, Form(ge=1, le=255)] = 128,
    max_colors: Annotated[int, Form(ge=1, le=117)] = 117,
    allowed_codes: Annotated[str | None, Form(description='Optional JSON array of available Perler codes')] = None,
):
    """Only the capped upload and the generated pattern live in request memory; no persistence."""
    try:
        data = await image.read(MAX_FILE_BYTES + 1)
        selected = None
        if allowed_codes is not None:
            try:
                selected = json.loads(allowed_codes)
            except (TypeError, json.JSONDecodeError) as exc:
                raise HTTPException(422, '色号列表必须是 JSON 数组') from exc
            if not isinstance(selected, list) or len(selected) > 117 or any(not isinstance(c, str) for c in selected):
                raise HTTPException(422, '色号列表必须包含 1 至 117 个色号字符串')
        result = await run_in_threadpool(convert_image, data, width, resample, alpha_threshold,
                                        max_colors, selected, (image.filename or 'My pattern').rsplit('.', 1)[0])
        return result
    except ConversionError as exc:
        raise HTTPException(400, str(exc)) from exc
    finally:
        await image.close()

@app.post('/api/export/{format}', tags=['Export'])
async def export(format: Literal['pdf', 'png', 'csv'], request: ExportRequest):
    """Export the edited matrix supplied by the browser; never reconvert the original image."""
    if format == 'pdf':
        data, media = await run_in_threadpool(pdf_bytes, request), 'application/pdf'
    elif format == 'png':
        data, media = await run_in_threadpool(png_bytes, request), 'image/png'
    else:
        data, media = await run_in_threadpool(csv_bytes, request.pattern, request.spare_percent), 'text/csv; charset=utf-8'
    return Response(data, media_type=media, headers={
        'Content-Disposition': f'attachment; filename="perler-pattern.{format}"', 'Cache-Control': 'no-store'})
