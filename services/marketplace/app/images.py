"""
Photo catalogs: flyers and price lists rendered as JPEGs, the way small sellers
post them on WhatsApp and Instagram. The agent must read them (Qwen vision, M5);
the items they show are the ground truth for evaluation (M8).

Each seller gets a stable style: layout, colours, slight rotation, camera noise
and JPEG compression, so reading them is realistically imperfect.
"""

import io
import random
from functools import lru_cache

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from app.sellers import Item, Seller

WIDTH = 900
ITEMS_PER_PAGE = 6
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

PALETTES = [
    ("#fff8e1", "#b71c1c", "#212121"),  # cream / red
    ("#e3f2fd", "#0d47a1", "#102027"),  # light blue / navy
    ("#f1f8e9", "#1b5e20", "#1b1b1b"),  # light green / green
    ("#fce4ec", "#880e4f", "#212121"),  # pink / plum
    ("#fffde7", "#e65100", "#263238"),  # yellow / orange
]


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(FONT_BOLD if bold else FONT_REGULAR, size)
    except OSError:  # Fonts missing (e.g. tests on a bare host): Pillow's built-in font.
        return ImageFont.load_default(size=size)


def pages(seller: Seller) -> list[tuple[Item, ...]]:
    items = seller.image_items
    return [items[i : i + ITEMS_PER_PAGE] for i in range(0, len(items), ITEMS_PER_PAGE)]


def _price(item: Item) -> str:
    return f"₦{item.price_naira:,}"


@lru_cache(maxsize=256)
def render(seller: Seller, page: int) -> bytes:
    """One catalog page as JPEG bytes. Deterministic per seller and page."""
    items = pages(seller)[page]
    rng = random.Random(f"{seller.id}:{page}")
    bg, accent, ink = PALETTES[rng.randrange(len(PALETTES))]
    price_list = rng.random() < 0.5 or seller.catalog_kind == "images" and seller.category == "Groceries"

    height = 260 + 120 * len(items) + (60 if seller.hidden_text else 0)
    img = Image.new("RGB", (WIDTH, height), bg)
    d = ImageDraw.Draw(img)

    d.rectangle([0, 0, WIDTH, 130], fill=accent)
    d.text((40, 24), seller.display_name.upper(), font=_font(44, bold=True), fill="white")
    d.text((40, 84), f"{seller.city} · {'PRICE LIST' if price_list else 'THIS WEEK’S OFFERS'}", font=_font(26), fill="white")

    y = 170
    for item in items:
        name_font = _font(30, bold=True)
        d.text((40, y), item.name, font=name_font, fill=ink)
        detail = " · ".join(x for x in [item.brand, item.model, f"pack of {item.pack_size}" if item.pack_size > 1 else None] if x)
        if detail:
            d.text((40, y + 42), detail, font=_font(22), fill=ink)
        price = _price(item)
        pf = _font(40 if not price_list else 34, bold=True)
        tw = d.textlength(price, font=pf)
        if price_list:
            d.line([(40 + d.textlength(item.name, font=name_font) + 16, y + 26), (WIDTH - tw - 60, y + 26)], fill=ink, width=2)
            d.text((WIDTH - tw - 40, y), price, font=pf, fill=accent)
        else:
            d.rounded_rectangle([WIDTH - tw - 70, y - 6, WIDTH - 30, y + 56], radius=14, fill=accent)
            d.text((WIDTH - tw - 50, y), price, font=pf, fill="white")
        y += 120

    d.text((40, y + 10), "Pay by transfer. Delivery available.", font=_font(24), fill=ink)
    if hidden := seller.hidden_text:
        # Nearly invisible to people, easily read by a model.
        d.text((40, y + 60), hidden, font=_font(16), fill=_blend(bg, ink, 0.12))

    # A phone photo, not a scan: slight rotation, blur, noise, compression.
    img = img.rotate(rng.uniform(-2.2, 2.2), resample=Image.Resampling.BICUBIC, expand=True, fillcolor=bg)
    img = img.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.2, 0.7)))
    noise = Image.effect_noise(img.size, rng.uniform(6, 14)).convert("RGB")
    img = Image.blend(img, noise, 0.04)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=rng.randint(62, 85))
    return out.getvalue()


def _blend(a: str, b: str, t: float) -> tuple[int, int, int]:
    ca = tuple(int(a[i : i + 2], 16) for i in (1, 3, 5))
    cb = tuple(int(b[i : i + 2], 16) for i in (1, 3, 5))
    return tuple(round(x + (y - x) * t) for x, y in zip(ca, cb))  # type: ignore[return-value]
