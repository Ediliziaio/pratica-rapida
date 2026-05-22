#!/usr/bin/env python3
"""Optimize static images: favicon, logos"""

from PIL import Image
import os

PUBLIC_DIR = "/Users/florinandriciuc/edilizia.io/pratica-rapida/public"

def optimize_favicon():
    favicon_path = os.path.join(PUBLIC_DIR, "favicon.png")
    if os.path.exists(favicon_path):
        img = Image.open(favicon_path)
        img_small = img.resize((32, 32), Image.Resampling.LANCZOS)
        img_small.save(favicon_path, "PNG", optimize=True)
        size = os.path.getsize(favicon_path) / 1024
        print(f"✓ Favicon: {size:.1f}KB")

def optimize_logo():
    logo_path = os.path.join(PUBLIC_DIR, "pratica-rapida-logo.png")
    if os.path.exists(logo_path):
        img = Image.open(logo_path)
        new_width = 1500
        new_height = int(new_width * 247 / 1966)
        img_opt = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        img_opt.save(logo_path, "PNG", optimize=True)
        size = os.path.getsize(logo_path) / 1024
        print(f"✓ Logo (light): {size:.1f}KB")

def optimize_logo_white():
    logo_white = os.path.join(PUBLIC_DIR, "pratica-rapida-logo-white.png")
    if os.path.exists(logo_white):
        img = Image.open(logo_white)
        new_width = 1500
        new_height = int(new_width * 247 / 1966)
        img_opt = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        img_opt.save(logo_white, "PNG", optimize=True)
        size = os.path.getsize(logo_white) / 1024
        print(f"✓ Logo (white): {size:.1f}KB")

if __name__ == "__main__":
    print("=== IMAGE OPTIMIZATION ===\n")
    optimize_favicon()
    optimize_logo()
    optimize_logo_white()
