from io import BytesIO
import warnings
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from ..models import Pattern
from ..palette import COLORS, BY_CODE
from .color_math import closest_indices

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_SOURCE_PIXELS = 20_000_000
Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS

class ConversionError(ValueError):
    pass

def convert_image(data: bytes, width: int, resample: str = 'nearest',
                  alpha_threshold: int = 128, max_colors: int = 117,
                  allowed_codes: list[str] | None = None, name: str = 'My pattern') -> Pattern:
    """Decode -> orient -> resize -> alpha mask -> Lab mapping -> optional color budget."""
    if len(data) > MAX_FILE_BYTES:
        raise ConversionError('图片不能超过 10 MB')
    if allowed_codes is not None and (not allowed_codes or any(c not in BY_CODE for c in allowed_codes)):
        raise ConversionError('请至少选择一种有效的 Perler 色号')
    palette = [BY_CODE[c] for c in dict.fromkeys(allowed_codes)] if allowed_codes is not None else COLORS
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in {'PNG', 'JPEG', 'WEBP'}:
                    raise ConversionError('支持 PNG、JPEG 和 WebP 静态图片')
                if getattr(source, 'n_frames', 1) != 1:
                    raise ConversionError('请上传静态图片，动画文件暂不支持')
                if source.width * source.height > MAX_SOURCE_PIXELS:
                    raise ConversionError('原图不能超过 2000 万像素')
                image = ImageOps.exif_transpose(source).convert('RGBA')
    except ConversionError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ConversionError('图片损坏、格式不支持或尺寸过大') from exc
    height = max(1, round(image.height * width / image.width))
    if height > 200:
        raise ConversionError('按比例生成的高度超过 200 格，请减小图纸宽度')
    # Resize RGB and alpha together: Pillow handles RGBA premultiplication for BOX.
    method = Image.Resampling.NEAREST if resample == 'nearest' else Image.Resampling.BOX
    rgba = np.asarray(image.resize((width, height), method)).copy()
    valid = rgba[..., 3] >= alpha_threshold
    # Partial transparency is composited on white; fully/mostly transparent pixels stay empty.
    alpha = rgba[..., 3:4] / 255.0
    rgb = np.rint(rgba[..., :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    palette_rgb = np.array([c['rgb'] for c in palette])
    indices = closest_indices(rgb, palette_rgb).reshape(height, width)
    used, counts = np.unique(indices[valid], return_counts=True)
    if len(used) > max_colors:
        # Deterministic practical budget: keep the most frequent initially mapped bead colors.
        ranked = sorted(zip(used.tolist(), counts.tolist()), key=lambda x: (-x[1], x[0]))
        palette = [palette[i] for i, _ in ranked[:max_colors]]
        indices = closest_indices(rgb, np.array([c['rgb'] for c in palette])).reshape(height, width)
    cells = [[palette[int(indices[y, x])]['code'] if valid[y, x] else None
              for x in range(width)] for y in range(height)]
    return Pattern(name=name[:80], width=width, height=height, cells=cells)
