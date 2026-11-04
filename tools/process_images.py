"""Turn raw Gemini images (assets_src/raw) into game assets (public/assets).

Run: python tools/process_images.py
 - scenes  -> public/assets/scenes/<name>.jpg (1600x900), thumbs/<name>.jpg (256 square), stickers/<name>.jpg (512x288)
 - sprites -> public/assets/sprites/<name>.png (chroma key removed, trimmed, max 512)
 - pip     -> public/assets/sprites/pip_<pose>.png (full 1024 frame kept so poses line up, downscaled to 512)
 - bg      -> public/assets/bg/<name>.jpg (1920x1080)
"""
import glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
RAW = os.path.join(ROOT, "assets_src", "raw")
PUB = os.path.join(ROOT, "public", "assets")


def out(*parts):
    p = os.path.join(PUB, *parts)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    return p


def key_out(path):
    """Remove a flat chroma background (green or magenta). Returns RGBA uint8 array."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    key = np.median(border, axis=0)
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green_key = key[1] > key[0] and key[1] > key[2]
    if green_key:
        spill = g - np.maximum(r, b)          # how much greener than the other channels
    else:
        spill = np.minimum(r, b) - g          # how much more magenta than green
    dist = np.linalg.norm(rgb - key, axis=-1)
    # Background = strongly key-coloured AND close to the key colour.
    a = np.clip((170 - spill) / 90, 0, 1) * np.clip((dist - 60) / 90, 0, 1)
    a = np.maximum(a, np.clip((dist - 150) / 60, 0, 1))
    # Only background connected to the border is removed (keeps enclosed key-ish colours in the subject).
    bg = a < 0.5
    lab, _ = ndimage.label(bg)
    border_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border_labels))
    # Enclosed pockets that are unmistakably key colour (e.g. between tentacles) go too.
    pockets = (a < 0.08) & ~outside
    pockets = ndimage.binary_opening(pockets, iterations=2)
    outside |= ndimage.binary_dilation(pockets, iterations=1) & (a < 0.5)
    a = np.where(outside, a, np.maximum(a, 1.0))
    # Drop tiny specks.
    solid = a > 0.5
    lab, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= max(60, sizes.max() * 0.002)])
        a = np.where(keep | ~solid, a, 0)
        # soft pixels next to removed specks
        a = np.where(ndimage.binary_dilation(keep, iterations=3) | (a > 0.5), a, 0)
    # Despill near the edge only.
    edge = ndimage.binary_dilation(a < 0.98, iterations=4)
    if green_key:
        lim = np.maximum(r, b)
        g2 = np.where(edge & (g > lim), lim, g)
        rgb[..., 1] = g2
    else:
        m = g + 20
        rgb[..., 0] = np.where(edge & (r > m) & (b > m), np.minimum(r, np.maximum(m, (r + g) / 2)), r)
        rgb[..., 2] = np.where(edge & (r > m) & (b > m), np.minimum(b, np.maximum(m, (b + g) / 2)), b)
    # Slight edge softening.
    a = ndimage.gaussian_filter(a, 0.6)
    a[a < 0.03] = 0
    rgba = np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8)
    return rgba


def trim(rgba, pad=8):
    ys, xs = np.where(rgba[..., 3] > 8)
    y0, y1, x0, x1 = max(0, ys.min() - pad), min(rgba.shape[0], ys.max() + pad), max(0, xs.min() - pad), min(rgba.shape[1], xs.max() + pad)
    return rgba[y0:y1, x0:x1]


def save_png(rgba, path, max_side=512):
    im = Image.fromarray(rgba, "RGBA")
    s = max_side / max(im.size)
    if s < 1:
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    im.save(path, optimize=True)
    return im.size


def main():
    for f in sorted(glob.glob(os.path.join(RAW, "scene_*.jpg"))):
        name = os.path.basename(f)[6:-4]
        im = Image.open(f).convert("RGB")
        im.resize((1600, 900), Image.LANCZOS).save(out("scenes", name + ".jpg"), quality=86)
        im.resize((512, 288), Image.LANCZOS).save(out("stickers", name + ".jpg"), quality=86)
        w, h = im.size
        s = int(h * 0.62)
        box = ((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2)
        im.crop(box).resize((256, 256), Image.LANCZOS).save(out("thumbs", name + ".jpg"), quality=88)
    sizes = {}
    for f in sorted(glob.glob(os.path.join(RAW, "sprite_*.jpg"))):
        name = os.path.basename(f)[7:-4]
        sizes[name] = save_png(trim(key_out(f)), out("sprites", name + ".png"))
    pip = {}
    for f in sorted(glob.glob(os.path.join(RAW, "pip_*.jpg"))):
        name = os.path.basename(f)[:-4]
        rgba = key_out(f)
        sizes[name] = save_png(rgba, out("sprites", name + ".png"))
        al = rgba[..., 3] > 128
        ys, xs = np.where(al)
        h, w = al.shape
        # Normalised (0..1, y down) body metrics so every pose can be drawn at the same size and foot line.
        pip[name[4:]] = {"size": round(float(np.sqrt(al.sum())) / w, 4), "bottom": round(ys.max() / h, 4),
                         "cx": round(float(np.median(xs)) / w, 4)}
    import json
    json.dump(pip, open(out("sprites", "pip.json"), "w"), indent=1)
    for name, src in {"title": "bg_title", "map": "bg_map5", "book": "bg_book", "party": "bg_party", "clouds": "tex_clouds"}.items():
        p = os.path.join(RAW, src + ".jpg")
        if os.path.exists(p):
            size = (1600, 900) if name == "clouds" else (1920, 1080)
            Image.open(p).convert("RGB").resize(size, Image.LANCZOS).save(out("bg", name + ".jpg"), quality=86)
    for k, v in sizes.items():
        print(f"{k:16s} {v}")


if __name__ == "__main__":
    main()
