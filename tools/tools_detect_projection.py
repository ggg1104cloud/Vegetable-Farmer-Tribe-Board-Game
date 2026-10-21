# -*- coding: utf-8 -*-
"""
从 board 的中国轮廓图里定位若干已知地标的像素坐标，
用来反推底图用的地理投影（经纬度 -> 像素的映射）。

思路：找几个形状好认、位置好判的陆块/海湾：
  - 台湾岛      独立岛，东南
  - 海南岛      独立岛，正南偏西
  - 崇明/长江口  太湖与长江入海口
  - 渤海湾      北部海湾
  - 北部边界线  漠河附近（最北）
  - 帕米尔/西端 最西
"""
import numpy as np, os
from PIL import Image
from collections import deque

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
a = np.asarray(Image.open(os.path.join(ROOT, 'assets', 'map_base.png')).convert('RGBA'))
land = a[:, :, 3] > 128
H, W = land.shape
print('size', W, 'x', H)

# ---------- 1. 连通域，找独立的岛 ----------
seen = np.zeros_like(land, dtype=bool)
comps = []
for sy in range(H):
    for sx in range(W):
        if land[sy, sx] and not seen[sy, sx]:
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            pix = []
            while q:
                y, x = q.popleft()
                pix.append((y, x))
                for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny, nx = y+dy, x+dx
                    if 0 <= ny < H and 0 <= nx < W and land[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(pix) >= 200:
                ys = [p[0] for p in pix]; xs = [p[1] for p in pix]
                comps.append({
                    'n': len(pix),
                    'x0': min(xs), 'x1': max(xs),
                    'y0': min(ys), 'y1': max(ys),
                    'cx': (min(xs)+max(xs))/2, 'cy': (min(ys)+max(ys))/2,
                })

comps.sort(key=lambda c: -c['n'])
print(f'\n连通域总数(>=200px): {len(comps)}')
print('最大的 8 个（主大陆 + 大岛）：')
for c in comps[:8]:
    print(f"  n={c['n']:7d}  x[{c['x0']:4d},{c['x1']:4d}] y[{c['y0']:4d},{c['y1']:4d}]"
          f"  w={c['x1']-c['x0']:4d} h={c['y1']-c['y0']:4d}  center=({c['cx']:.0f},{c['cy']:.0f})")

print('\n右侧/下部独立的岛（候选台湾、海南、南沙）：')
for c in comps[1:]:
    w = c['x1']-c['x0']; h = c['y1']-c['y0']
    if c['n'] < 400 and c['cx'] > W*0.45 and c['cy'] > H*0.45:
        ar = w/max(1,h)
        print(f"  n={c['n']:6d} x[{c['x0']:4d},{c['x1']:4d}] y[{c['y0']:4d},{c['y1']:4d}]"
              f" w={w:4d} h={h:4d} ar={ar:.2f} center=({c['cx']:.0f},{c['cy']:.0f})")

# ---------- 2. 逐行最左/最右/最上/最下边界 ----------
rows = land.sum(axis=1)
top_row = int(np.argmax(rows > 0))
bottom_row = int(H - 1 - np.argmax(rows[::-1] > 0))
print(f'\n最北行 y={top_row},最南行 y={bottom_row}')
cols = land.sum(axis=0)
left_col = int(np.argmax(cols > 0))
right_col = int(W - 1 - np.argmax(cols[::-1] > 0))
print(f'最西列 x={left_col}, 最东列 x={right_col}')