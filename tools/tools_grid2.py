#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
在底图上叠加**精确的经纬网格**并把网格交点直接标上经纬度数值，
这样地标像素坐标可以照着网格线读出来，不必目测。

网格由当前仿射参数生成，参数由 tools_dem_align2.py 优化得到。
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')

# tools_dem_align2.py 输出的最优仿射（度/像素）
A0, A1 = 70.8709, 0.04887784
B0, B1 = 54.8768, -0.04340240


def px2lon(x):
    return A0 + A1*x


def px2lat(y):
    return B0 + B1*y


def lon2px(lon):
    return (lon - A0)/A1


def lat2px(lat):
    return (lat - B0)/B1


img = Image.open(os.path.join(A, 'map_base.png')).convert('RGBA')
W, H = img.size
ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
try:
    font = ImageFont.truetype('consola.ttf', 15)
except Exception:
    font = ImageFont.load_default()

# 纬线（横）
for lat in range(20, 56, 2):
    y = lat2px(lat)
    if not (0 <= y < H):
        continue
    major = (lat % 10 == 0)
    col = (0, 110, 255, 210) if major else (120, 190, 255, 110)
    d.line([(0, y), (W, y)], fill=col, width=2 if major else 1)
    for lon in range(75, 136, 10):
        x = lon2px(lon)
        if 0 <= x < W:
            d.text((x+4, y+2), f'{lat}N', fill=(0, 80, 255, 255), font=font)
            d.line([(x, y-6), (x, y+6)], fill=(0, 80, 255, 255), width=2)

# 经线（纵）
for lon in range(75, 136, 5):
    x = lon2px(lon)
    if not (0 <= x < W):
        continue
    major = (lon % 10 == 0)
    col = (255, 0, 255, 210) if major else (255, 150, 255, 110)
    d.line([(x, 0), (x, H)], fill=col, width=2 if major else 1)
    for lat in range(20, 56, 10):
        y = lat2px(lat)
        if 0 <= y < H:
            d.text((x+3, y+3), f'{lon}E', fill=(190, 0, 190, 255), font=font)

out = Image.alpha_composite(img, ov).convert('RGB')
p = os.path.join(A, '_lonlat_grid.png')
out.save(p)
print('->', p)
print('\n常用控制点像素（可直接抄去做校验）:')
for nm, lon, lat in [('帕米尔西端', 73.8, 39.5), ('抚远东端', 134.0, 48.3),
                     ('漠河北端', 122.5, 53.3), ('秦岭', 108.5, 34.0),
                     ('松嫩平原', 125.0, 45.5), ('滇南', 101.0, 23.5),
                     ('长江下游', 116.5, 30.5), ('四川盆地', 104.5, 30.5),
                     ('华北北缘', 115.0, 42.0), ('藏北', 90.0, 32.5),
                     ('塔里木', 82.5, 39.5), ('柴达木', 95.5, 37.0),
                     ('青藏核心', 88.0, 33.0), ('珠峰', 86.9, 28.0),
                     ('华北平原', 115.0, 36.5), ('长江中下游', 112.0, 30.5),
                     ('东北平原', 125.0, 45.0), ('云贵高原', 104.0, 25.0),
                     ('准噶尔', 87.0, 45.0), ('黄土高原', 109.0, 36.5)]:
    print(f'  {nm:<10} lon={lon:6.1f} lat={lat:5.1f}  ->  px=({lon2px(lon):6.0f}, {lat2px(lat):5.0f})')