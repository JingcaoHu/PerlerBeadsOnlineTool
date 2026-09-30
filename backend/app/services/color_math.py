"""Vectorized sRGB -> CIELAB (D65) and perceptual Delta E 76 distance."""
import numpy as np

def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    rgb = np.asarray(rgb, dtype=np.float64) / 255.0
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    xyz = linear @ np.array([[.4124564, .3575761, .1804375],
                             [.2126729, .7151522, .0721750],
                             [.0193339, .1191920, .9503041]]).T
    xyz /= np.array([.95047, 1.0, 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])], axis=-1)

def closest_indices(rgb: np.ndarray, palette_rgb: np.ndarray) -> np.ndarray:
    """Chunk allocation: at most 2048 x 117 x 3 distances, including 200x200 art."""
    samples = rgb_to_lab(rgb.reshape(-1, 3))
    candidates = rgb_to_lab(palette_rgb)
    result = np.empty(len(samples), dtype=np.int32)
    for start in range(0, len(samples), 2048):
        diff = samples[start:start + 2048, None, :] - candidates[None, :, :]
        result[start:start + 2048] = np.argmin(np.sum(diff * diff, axis=-1), axis=1)
    return result
