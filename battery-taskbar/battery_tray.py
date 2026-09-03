"""Battery percentage in the Windows taskbar tray icon.

Draws the current battery percentage directly onto the tray icon, as large
as it can legibly go, and refreshes it periodically.
"""

import threading
import time

import psutil
import pystray
from PIL import Image, ImageDraw, ImageFont

UPDATE_INTERVAL_SECONDS = 30
ICON_SIZE = 64

_FONT_CANDIDATES = ("seguisb.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans.ttf")
_OUTLINE_OFFSETS = ((-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, 1), (-1, 1), (1, -1))


def _load_font(size):
    for name in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _fit_font(draw, text, max_size, box):
    for size in range(max_size, 3, -1):
        font = _load_font(size)
        bbox = draw.textbbox((0, 0), text, font=font)
        if (bbox[2] - bbox[0]) <= box and (bbox[3] - bbox[1]) <= box:
            return font, bbox
    font = _load_font(4)
    return font, draw.textbbox((0, 0), text, font=font)


def _text_color(percent, plugged):
    if percent is None:
        return (200, 200, 200, 255)
    if plugged:
        return (90, 210, 130, 255)
    if percent <= 15:
        return (235, 70, 70, 255)
    if percent <= 35:
        return (245, 175, 45, 255)
    return (255, 255, 255, 255)


def make_icon_image(percent, plugged):
    size = ICON_SIZE
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    text = f"{percent}%" if percent is not None else "--"
    font, bbox = _fit_font(draw, text, size, int(size * 0.96))

    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - w) / 2 - bbox[0]
    y = (size - h) / 2 - bbox[1]

    for dx, dy in _OUTLINE_OFFSETS:
        draw.text((x + dx, y + dy), text, font=font, fill=(0, 0, 0, 255))
    draw.text((x, y), text, font=font, fill=_text_color(percent, plugged))

    return img


def read_battery():
    battery = psutil.sensors_battery()
    if battery is None:
        return None, False
    return round(battery.percent), battery.power_plugged


def _status_text():
    percent, plugged = read_battery()
    if percent is None:
        return "No battery detected"
    return f"{percent}% - {'Charging' if plugged else 'On battery'}"


def build_menu(icon):
    return pystray.Menu(
        pystray.MenuItem(lambda item: _status_text(), None, enabled=False),
        pystray.MenuItem("Quit", lambda: icon.stop()),
    )


def update_loop(icon):
    while True:
        percent, plugged = read_battery()
        icon.icon = make_icon_image(percent, plugged)
        icon.title = _status_text()
        time.sleep(UPDATE_INTERVAL_SECONDS)


def main():
    percent, plugged = read_battery()
    icon = pystray.Icon("battery-taskbar", make_icon_image(percent, plugged), _status_text())
    icon.menu = build_menu(icon)

    thread = threading.Thread(target=update_loop, args=(icon,), daemon=True)
    icon.run(setup=lambda i: thread.start())


if __name__ == "__main__":
    main()
