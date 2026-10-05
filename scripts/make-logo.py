"""Recorta el avatar (Mii) de Lamont: fondo transparente y solo la cabeza.
Uso: python3 scripts/make-logo.py avatar.png [corte_y]
Genera public/assets/img/logo.png, logo.webp y favicon.png
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

src = sys.argv[1]
cut = int(sys.argv[2]) if len(sys.argv) > 2 else None
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.float32)
v = a.max(axis=2)
sat = a.max(axis=2) - a.min(axis=2)

# fondo = gris liso conectado con el borde (el pelo es más oscuro que el fondo)
cand = (v >= 38) & (sat < 26)
lab, _ = ndi.label(cand)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))); border.discard(0)
bg = np.isin(lab, list(border))
alpha = np.where(bg, 0.0, 1.0).astype(np.float32)

# la camisa roja y lo que quede debajo del corte no forman parte de la cara
red = (a[..., 0] > 120) & (a[..., 1] < 40) & (a[..., 2] < 40)
red[:250] = False
ys = np.where(red.any(axis=1))[0]
cut_y = cut if cut else int(ys.min())
alpha[cut_y:] = 0

# componente más grande + borde limpio (color del interior, alfa suavizado)
solid = alpha > 0.5
lab2, n2 = ndi.label(solid)
sizes = ndi.sum(solid, lab2, range(1, n2 + 1))
core = lab2 == (1 + int(np.argmax(sizes)))
core = ndi.binary_fill_holes(core)
core = ndi.binary_erosion(core, iterations=1)
_, (iy, ix) = ndi.distance_transform_edt(~core, return_indices=True)
rgb = a[iy, ix]
alpha = ndi.gaussian_filter(core.astype(np.float32), 0.9)
alpha = np.clip((alpha - 0.1) / 0.8, 0, 1)
rgba = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), "RGBA")
rgba = rgba.crop(rgba.getchannel("A").point(lambda x: 255 if x > 20 else 0).getbbox())

pad = 10
out = Image.new("RGBA", (rgba.width + pad * 2, rgba.height + pad * 2), (0, 0, 0, 0))
out.alpha_composite(rgba, (pad, pad))
scale = 320 / out.height
out = out.resize((round(out.width * scale), 320), Image.LANCZOS)
d = "public/assets/img/"
out.save(d + "logo.png"); out.save(d + "logo.webp", "WEBP", quality=92, method=6, exact=True)
side = max(out.size)
fav = Image.new("RGBA", (side, side), (0, 0, 0, 0)); fav.alpha_composite(out, ((side - out.width) // 2, (side - out.height) // 2))
fav.resize((64, 64), Image.LANCZOS).save(d + "favicon.png")
print("logo", out.size, "corte_y", cut_y)
# vista previa sobre blanco y azul marino
prev = Image.new("RGBA", (out.width * 2 + 60, out.height + 40), (255, 255, 255, 255))
ImageDraw = __import__("PIL.ImageDraw", fromlist=["ImageDraw"])
ImageDraw.Draw(prev).rectangle((out.width + 30, 0, prev.width, prev.height), fill=(10, 26, 63, 255))
prev.alpha_composite(out, (15, 20)); prev.alpha_composite(out, (out.width + 45, 20))
prev.convert("RGB").save("/tmp/logo-preview.png")
