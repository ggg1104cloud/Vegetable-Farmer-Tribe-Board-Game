#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
自动配准：把真实 DEM（terrarium 瓦片）配准到 PDF 底图的地图轮廓上。

思路
----
底图是手绘风格的中国地图，没有标注经纬线，没法手工读控制点。
但两边都有"陆地轮廓"，于是把问题变成**二值配准**：

    像素 (x,y) -> 经纬度 (lon, lat) 的仿射变换
        lon = a0 + a1*x + a2*y
        lat = b0 + b1*x + b2*y

中国跨度约 lat 18~54°，在此区间内等距圆柱 / Mercator / Albers 的差异
已被仿射变换吸收，6 个参数足够。

目标：最大化两幅陆地掩码的 IoU（交并比）。
做法：坐标下降 + 随机重启，纯 numpy，无scipy 依赖。
"""
import argparse, math, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')


# ---------------------------------------------------------------- 掩码
def board_land_mask():
    """底图的陆地掩码：只保留最大连通域，剔除装饰物/说明框/箭头框"""
    a = np.asarray(Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA'))
    m = a[:, :, 3] > 128
    # 只保留最大连通域（4 邻接，迭代式膨胀受限，用简单 BFS）
    from collections import deque
    H, W = m.shape
    best = None
    seen = np.zeros_like(m, dtype=bool)
    ys, xs = np.where(m)
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


def dem_land_mask(dem, thresh=0):
    return dem > thresh


# ---------------------------------------------------------------- 变换
def warp_mask_to_board(dem_land, board_shape, params):
    """把 DEM 陆地掩码按仿射变换重采样到 board 尺寸，返回板面掩码"""
    H, W = board_shape
    a0, a1, a2, b0, b1, b2 = params
    ys, xs = np.mgrid[0:H, 0:W]
    lon = a0 + a1 * xs + a2 * ys
    lat = b0 + b1 * xs + b2 * ys

    # board 像素 -> 经纬度 -> dem 像素
    dh, dw = dem_land.shape
    lon0, lon1 = DEM_LON_RANGE
    lat0, lat1 = DEM_LAT_RANGE      # lat1 > lat0，行号向下递减
    fx = (lon - lon0) / (lon1 - lon0) * (dw - 1)
    fy = (lat1 - lat) / (lat1 - lat0) * (dh - 1)
    ix = np.clip(np.round(fx).astype(np.int32), 0, dw - 1)
    iy = np.clip(np.round(fy).astype(np.int32), 0, dh - 1)
    return dem_land[iy, ix]


def iou(board_mask, dem_land):
    warped = warp_mask_to_board(dem_land, board_mask.shape, PARAMS)
    inter = np.logical_and(board_mask, warped).sum()
    union = np.logical_or(board_mask, warped).sum()
    return inter / union if union else 0.0


# ---------------------------------------------------------------- 搜索
def coordinate_descent(board_mask, dem_land, params, steps, rounds=6):
    best = iou_of(board_mask, dem_land, params)
    for r in range(rounds):
        improved = False
        for k in range(6):
            for sgn in (+1, -1):
                trial = list(params)
                trial[k] += sgn * steps[k]
                v = iou_of(board_mask, dem_land, trial)
                if v > best:
                    best, params, improved = v, trial, True
        if not improved:
            steps = [s * 0.5 for s in steps]
            if max(steps) < 1e-9:
                break
    return params, best


def iou_of(board_mask, dem_land, params):
    global PARAMS
    PARAMS = params
    return iou(board_mask, dem_land)


# ---------------------------------------------------------------- 主流程
DEM_LON_RANGE = (0, 1)
DEM_LAT_RANGE = (0, 1)
PARAMS = None


def main():
    global DEM_LON_RANGE, DEM_LAT_RANGE

    ap = argparse.ArgumentParser()
    ap.add_argument('--dem', default='dem_china_raw.npy')
    args = ap.parse_args()

    dem = np.load(os.path.join(ASSETS, args.dem)).astype(np.float32)
    dh, dw = dem.shape

    # DEM 覆盖的经纬度范围（与 tools_make_dem_heightmap.py 的常量一致）
    LON_MIN, LON_MAX = 71.0, 140.0
    LAT_MIN, LAT_MAX = 2.0, 55.0
    DEM_LON_RANGE = (LON_MIN, LON_MAX)
    DEM_LAT_RANGE = (LAT_MIN, LAT_MAX)

    board = board_land_mask()
    H, W = board.shape
    print(f'board {W}x{H}  land={board.sum()}  dem {dw}x{dh}')

    # DEM 陆地掩码：海平面以上，>0m
    dl = dem > 0
    print('dem land ratio', round(float(dl.mean()), 3))

    # 初值：中国大致范围 lon 73~136 / lat 18~54铺满 board
    # board 上陆地 x∈[46,1260] y∈[36,897]，按比例把中国范围套进去
    p = [
        LON_MIN + (LON_MAX - LON_MIN) * 0.0,          # a0 占位，下面重设
        (136.0 - 73.0) / (1260.0 - 46.0),             # a1 dlon/dx
        0.0,                                          # a2
        LAT_MAX,                                      # b0 (y=0 -> lat_max)
        0.0,                                          # b1
        -(54.0 - 18.0) / (897.0 - 36.0),              # b2 dlat/dy
    ]
    # 让 x=46 -> lon 73, y=36 -> lat 54
    p[0] = 73.0 - p[1] * 46.0
    p[3] = 54.0 - p[4] * 46.0 - p[5] * 36.0

    print('\n初值 IoU =', round(iou_of(board, dl, p), 4))
    steps = [0.5, 0.02, 0.02, 0.5, 0.02, 0.02]
    p, best = coordinate_descent(board, dl, p, steps, rounds=14)
    print('坐标下降后 IoU =', round(best, 4))

    # 随机重启
    rng = np.random.default_rng(7)
    for t in range(6):
        q = [p[i] + rng.normal(0, steps[i] * 6) for i in range(6)]
        q, v = coordinate_descent(board, dl, q, steps, rounds=10)
        if v > best:
            p, best = q, v
            print(f'  restart {t}: IoU -> {best:.4f}')

    print('\n最优仿射参数:')
    print(f'  lon = {p[0]:.5f} {p[1]:+.7f}*x {p[2]:+.7f}*y')
    print(f'  lat = {p[3]:.5f} {p[4]:+.7f}*x {p[5]:+.7f}*y')
    print(f'  最终 IoU = {best:.4f}')

    np.save(os.path.join(ASSETS, '_affine_params.npy'), np.array(p))
    with open(os.path.join(ASSETS, '_affine_params.txt'), 'w', encoding='utf-8') as f:
        f.write(f'{p[0]!r}\n{p[1]!r}\n{p[2]!r}\n{p[3]!r}\n{p[4]!r}\n{p[5]!r}\n')
    print('参数已存 assets/_affine_params.txt')
    return p, best


if __name__ == '__main__':
    main()