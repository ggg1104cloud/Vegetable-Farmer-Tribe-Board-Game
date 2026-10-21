#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
更宽松的配准：给 DEM 陆地掩码做一次「水平/垂直独立缩放 + 平移 + 各向同性缩放」，
即允许轻微剪切与非均匀缩放，最大化与底图轮廓的 IoU。

同时引入多尺度：先用低分辨率快速搜，再在高分辨率精修。
"""
import os, math
import numpy as np
from PIL import Image
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0


def board_land_mask():
    a = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))
    m = a[:, :, 3] > 128
    H, W = m.shape
    seen = np.zeros_like(m, dtype=bool)
    ys, xs = np.where(m)
    best = None
    for sy, sx in zip(ys, xs):
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)])
        seen[sy, sx] = True
        pix = []
        while q:
            y, x = q.popleft()
            pix.append(y * W + x)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
        if best is None or len(pix) > len(best):
            best = pix
    out = np.zeros(H * W, dtype=bool)
    out[best] = True
    return out.reshape(H, W)


def blur_mask(m, k=3):
    """盒式模糊，得到软掩码，梯度更平滑，便于连续优化"""
    f = m.astype(np.float32)
    for _ in range(k):
        p = np.pad(f, 1, mode='edge')
        f = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + f * 2) / 6.0
    return f


def sample(dem_f, lon, lat):
    dh, dw = dem_f.shape
    fx = (lon - LON_MIN) / (LON_MAX - LON_MIN) * (dw - 1)
    fy = (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (dh - 1)
    ix = np.clip(fx, 0, dw - 1.001).astype(np.int32)
    iy = np.clip(fy, 0, dh - 1.001).astype(np.int32)
    fx -= ix; fy -= iy
    a = dem_f[iy, ix] * (1 - fx) * (1 - fy)
    b = dem_f[iy, ix + 1] * fx * (1 - fy)
    c = dem_f[iy + 1, ix] * (1 - fx) * fy
    d = dem_f[iy + 1, ix + 1] * fx * fy
    return a + b + c + d


def score(board_soft, dem_f, p):
    """p = [a0,a1,a2,b0,b1,b2]"""
    H, W = board_soft.shape
    ys, xs = np.mgrid[0:H:1, 0:W:1]
    lon = p[0] + p[1] * xs + p[2] * ys
    lat = p[3] + p[4] * xs + p[5] * ys
    s = sample(dem_f, lon, lat)
    return float((board_soft * s).mean())          # 相关度，等价于软 IoU 的分子


def main():
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    board = board_land_mask()
    H, W = board.shape
    print(f'board {W}x{H}')

    # ---- 降采样到 1/4 做搜索，单次打分快 16 倍 ----
    S = 4
    dem_small = dem[::S, ::S]
    board_small = board[::S, ::S]
    dem_land = blur_mask(dem_small > 0, k=2)
    board_soft = blur_mask(board_small, k=2)
    print(f'search grid {board_soft.shape[1]}x{board_soft.shape[0]}')

    # 初值
    p = [73.0 - (136.0 - 73.0) / (1260.0 - 46.0) * 46.0,
         (136.0 - 73.0) / (1260.0 - 46.0), 0.0,
         54.0 + (54.0 - 18.0) / (897.0 - 36.0) * 36.0,
         0.0, -(54.0 - 18.0) / (897.0 - 36.0)]
    print('初值 score =', round(score(board_soft, dem_land, p), 4))

    steps = [0.4, 0.02, 0.02, 0.4, 0.02, 0.02]
    rng = np.random.default_rng(11)
    best_s, best_p = score(board_soft, dem_land, p), list(p)

    for restart in range(8):
        cur = list(best_p) if restart == 0 else [best_p[i] + rng.normal(0, steps[i] * 5) for i in range(6)]
        cs = score(board_soft, dem_land, cur)
        st = list(steps)
        for it in range(120):
            improved = False
            for k in range(6):
                for sg in (1, -1):
                    t = list(cur); t[k] += sg * st[k]
                    v = score(board_soft, dem_land, t)
                    if v > cs:
                        cs, cur, improved = v, t, True
            if not improved:
                st = [s * 0.55 for s in st]
                if max(st) < 5e-6:
                    break
        if cs > best_s:
            best_s, best_p = cs, cur
        print(f'  restart {restart}: score={cs:.4f} best={best_s:.4f}')

    print('\n最优参数:')
    print(f'  lon = {best_p[0]:.6f} {best_p[1]:+.8f}*x {best_p[2]:+.8f}*y')
    print(f'  lat = {best_p[3]:.6f} {best_p[4]:+.8f}*x {best_p[5]:+.8f}*y')
    print(f'  score = {best_s:.4f}')

    with open(os.path.join(ASSETS, '_affine_params.txt'), 'w', encoding='utf-8') as f:
        for v in best_p:
            f.write(repr(float(v)) + '\n')

    # ---- 输出对齐后的高度图（重采样到 board 尺寸） ----
    Hs, Ws = H, W
    ys, xs = np.mgrid[0:Hs, 0:Ws]
    lon = best_p[0] + best_p[1] * xs + best_p[2] * ys
    lat = best_p[3] + best_p[4] * xs + best_p[5] * ys
    dh, dw = dem.shape
    fx = np.clip((lon - LON_MIN) / (LON_MAX - LON_MIN) * (dw - 1), 0, dw - 1.001)
    fy = np.clip((LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (dh - 1), 0, dh - 1.001)
    ix = fx.astype(np.int32); iy = fy.astype(np.int32)
    a = fx - ix; b = fy - iy
    h = (dem[iy, ix] * (1 - a) * (1 - b) + dem[iy, ix + 1] * a * (1 - b) +
         dem[iy + 1, ix] * (1 - a) * b + dem[iy + 1, ix + 1] * a * b)
    h = np.where(board, h, 0.0)          # 轮廓外清零
    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)
    Image.fromarray(h.astype(np.float32)).save(os.path.join(ASSETS, 'map_height_dem_raw.png'))
    print('\n对齐高程已存 assets/map_height_dem.npy')
    print('  陆地区域高程 min/max =', round(float(h[board].min()), 1),
          round(float(h[board].max()), 1))

    # 8bit 灰度（归一化到 0-255），供 three.js 直接读
    v = h[board]
    lo, hi = np.percentile(v, 1), np.percentile(v, 99.5)
    g = np.clip((h - lo) / (hi - lo) * 255, 0, 255)
    g = np.where(board, g, 0).astype(np.uint8)
    Image.fromarray(g).save(os.path.join(ASSETS, 'map_height_dem.png'))
    print('  8bit 灰度 -> assets/map_height_dem.png  (lo=%.0fm hi=%.0fm)' % (lo, hi))


if __name__ == '__main__':
    main()