#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
用**明确的地标锚点**做配准，而不是盲目的IoU 搜索。

手绘地图盲搜会陷入退化解（参数翻转），因为IoU 对"上下颠倒的中国"也可能不低。
这里改用物理约束：西北->东南的单调性 + 若干可辨认地标的粗略像素读数，
先手工定一个合理初值，再只在很小的邻域内做无剪切（a2=b1=0）的精修。

输出对齐到 board 尺寸的真实高程场。
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

# DEM 覆盖范围（与 tools_make_dem_heightmap.py 一致）
LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0


def warp(dem, p, out_shape):
    """无剪切仿射：lon=a0+a1x, lat=b0+b1y（a1>0, b1<0）"""
    H, W = out_shape
    a0, a1, b0, b1 = p
    ys, xs = np.mgrid[0:H, 0:W]
    lon = a0 + a1 * xs
    lat = b0 + b1 * ys
    dh, dw = dem.shape
    fx = np.clip((lon - LON_MIN) / (LON_MAX - LON_MIN) * (dw - 1), 0, dw - 1.001)
    fy = np.clip((LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * (dh - 1), 0, dh - 1.001)
    ix = fx.astype(np.int32); iy = fy.astype(np.int32)
    a = fx - ix; b = fy - iy
    out = (dem[iy, ix] * (1 - a) * (1 - b) + dem[iy, ix + 1] * a * (1 - b) +
           dem[iy + 1, ix] * (1 - a) * b + dem[iy + 1, ix + 1] * a * b)
    return out


def blur_mask(m, k=2):
    f = m.astype(np.float32)
    for _ in range(k):
        p = np.pad(f, 1, mode='edge')
        f = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:] + f * 2) / 6.0
    return f


def main():
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    board = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))[:, :, 3] > 128
    H, W = board.shape
    print(f'board {W}x{H}')

    # 从 tools_detect_projection.py 已知：主大陆连通域 x[46,1260] y[36,897]
    # 手工读图得到的锚点（像素, 经纬度）：
    #   西端帕米尔   x≈46,  y≈360   lon 73.5, lat 39.5
    #   北端漠河     x≈900, y≈36lon 122.0, lat 53.5
    #   东端抚远     x≈1260,y≈300   lon 134.3, lat 48.4
    #   南端曾母暗沙 x≈900, y≈897   lon 112.3, lat 4.2
    # 用最小二乘从这 4 组点解出 (a0,a1,b0,b1)
    A = []
    L = []
    for (x, y, lon, lat) in [(46, 360, 73.5, 39.5),
                             (900, 36, 122.0, 53.5),
                             (1260, 300, 134.3, 48.4),
                             (900, 897, 112.3, 4.2)]:
        A.append([1, x]); L.append(lon)
        A.append([0, y]); L.append(lat)
    # 分离求解两个方向
    a1 = (np.array([l for l, (c0, cx) in zip(L[0::2], [(A[i][0], A[i][1]) for i in range(0, len(A), 2)])]) * 0)
    # 直接分别最小二乘
    Ax = np.array([[1, 46.0], [1, 900.0], [1, 1260.0]])
    bx = np.array([73.5, 122.0, 134.3])
    a0, a1 = np.linalg.lstsq(Ax, bx, rcond=None)[0]
    Ay = np.array([[1, 360.0], [1, 36.0], [1, 300.0], [1, 897.0]])
    by = np.array([39.5, 53.5, 48.4, 4.2])
    b0, b1 = np.linalg.lstsq(Ay, by, rcond=None)[0]
    p = [a0, a1, b0, b1]
    print(f'\n锚点初值: lon = {a0:.4f} + {a1:.7f}*x   lat = {b0:.4f} + {b1:.7f}*y')

    # ---- 只在初值附近做小范围精修，最大化软 IoU ----
    dem_land = blur_mask(warp(dem, p, board.shape) > 0, k=3)
    board_soft = blur_mask(board, k=3)

    def sc(q):
        return float((board_soft * blur_mask(warp(dem, q, board.shape) > 0, k=3)).mean())

    best = sc(p)
    print('初值 score =', round(best, 4))
    step = [0.6, 0.006, 0.6, 0.006]
    for it in range(200):
        improved = False
        for k in range(4):
            for sg in (1, -1):
                t = list(p); t[k] += sg * step[k]
                v = sc(t)
                if v > best:
                    best, p, improved = v, t, True
        if not improved:
            step = [s * 0.55 for s in step]
            if max(abs(step[0]), abs(step[2])) < 1e-4:
                break
    print(f'精修后 score = {best:.4f}')
    print(f'  lon = {p[0]:.4f} + {p[1]:.8f}*x')
    print(f'  lat = {p[2]:.4f} + {p[3]:.8f}*y')

    h = warp(dem, p, board.shape)
    h = np.where(board, h, 0.0)
    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)

    v = h[board]
    lo, hi = np.percentile(v, 1), np.percentile(v, 99.5)
    g = np.clip((h - lo) / (hi - lo) * 255, 0, 255)
    g = np.where(board, g, 0).astype(np.uint8)
    Image.fromarray(g).save(os.path.join(ASSETS, 'map_height_dem.png'))
    print('\n输出:')
    print('  assets/map_height_dem.npy  真实高程(m) %s' % (h.shape,))
    print('  assets/map_height_dem.png  8bit 灰度%s' % (g.shape,))
    print('  陆地区域高程 min/max = %.0f / %.0f m' % (v.min(), v.max()))
    with open(os.path.join(ASSETS, '_affine_params.txt'), 'w', encoding='utf-8') as f:
        f.write(repr(float(p[0])) + '\n' + repr(float(p[1])) + '\n'
                + repr(float(p[2])) + '\n' + repr(float(p[3])) + '\n')

    # ---- 生成叠加对照图，人眼验收 ----
    base = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.array(base).copy()
    # 用高度图着色叠在底图上（半透明）
    col = np.stack([hv, hv, hv], axis=-1).astype(np.float32)
    ov[:, :, :3] = (ov[:, :, :3] * 0.45 + col * 0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))
    print('  assets/_dem_overlay_check.png  叠加对照图')


if __name__ == '__main__':
    main()