#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
按格子底色做连通域分析，一格= 一个连通域，精确得到 43 格的 bbox。

board_full.png 的赛道格底色统一为 rgb(255,226,176)，
相邻格之间有 4~6px 白色分隔线，因此「格底色 + 格内图案」整体
构成一个独立连通域 —— 直接标记即可，无需猜测网格线。

输出：
  assets/cells/cell_00.png ... cell_NN.png   每格正方形贴图
  assets/cells/cells_index.json              序号/bbox/中心/边
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw
from collections import deque

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')
OUT = os.path.join(A, 'cells')
os.makedirs(OUT, exist_ok=True)

TARGET = np.array([255, 226, 176])
TOL = 34# 允许底纹/抗锯齿带来的偏差


def main():
    im = Image.open(os.path.join(A, 'board_full.png')).convert('RGB')
    W, H = im.size
    a = np.asarray(im).astype(np.int16)
    d = np.abs(a - TARGET).max(axis=2)
    mask = d <= TOL

    # 形态学补洞：格内图案（图标/文字）把底色切成很多碎块，
    # 用小核补一遍即可让每格底色连成整体；白线足够宽，核大了会把邻格粘一起。
    def dilate(m, k=3):
        out = m.copy()
        r = k // 2
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
        return out
    def erode(m, k=3):
        out = m.copy()
        r = k // 2
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                out &= np.roll(np.roll(m, dy, 0), dx, 1)
        return out

    solid = erode(dilate(mask, 5), 3)
    solid[:6, :] = solid[-6:, :] = solid[:, :6] = solid[:, -6:] = False
    print(f'底色掩码 {mask.mean()*100:.1f}%  闭运算后 {solid.mean()*100:.1f}%')

    # ---- 连通域 ----
    Hh, Ww = solid.shape
    lab = np.zeros((Hh, Ww), np.int32)
    comps = []
    cur = 0
    ys, xs = np.where(solid)
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]:
            continue
        cur += 1
        q = deque([(sy, sx)])
        lab[sy, sx] = cur
        pix = []
        while q:
            y, x = q.popleft()
            pix.append((y, x))
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < Hh and 0 <= nx < Ww and solid[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur
                    q.append((ny, nx))
        pa = np.array(pix)
        comps.append(dict(id=cur, n=len(pix),
                          x0=int(pa[:,1].min()), x1=int(pa[:,1].max()),
                          y0=int(pa[:,0].min()), y1=int(pa[:,0].max())))
    comps.sort(key=lambda c: -c['n'])
    print(f'连通域 {len(comps)} 个，>=2000px 的 {sum(1 for c in comps if c["n"]>=2000)} 个')

    # 赛道格：面积大 + 位于外圈（贴边）
    cand = [c for c in comps if c['n'] >= 2000]
    # 过滤中间地图区（地图区很大且四边都不贴边）
    def touches_border(c, m=40):
        return (c['x0'] <= m or c['x1'] >= W-1-m or
                c['y0'] <= m or c['y1'] >= H-1-m)
    ring = [c for c in cand if touches_border(c)]
    print(f'外圈候选 {len(ring)} 个')
    for c in sorted(ring, key=lambda c: (c['y0']//200, c['x0']))[:50]:
        print(f"  #{c['id']:3d} n={c['n']:6d} x[{c['x0']:4d},{c['x1']:4d}] "
              f"y[{c['y0']:4d},{c['y1']:4d}] {c['x1']-c['x0']:4d}x{c['y1']-c['y0']:4d}")

    json.dump(ring, open(os.path.join(OUT, '_ring_raw.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()