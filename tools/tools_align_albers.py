#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
中国地形 DEM 与图板配准（Albers 等积圆锥投影）

问题：底图是手绘中国地图，没经纬线标注，无法靠读图得到精确控制点；
     而纯仿射/纯IoU 盲搜会陷入退化解（形状对上了但经纬度全错）。

方案：
  1. 用标准 Albers 投影把 DEM 重采样成一张"平面高程栅格"（中国范围）
  2. 手工指定若干控制点(底图像素 <-> 已知经纬度)，解平面->像素的 6 参数线性变换
  3. 对每个 board 像素反解平面坐标，双线性采样平面栅格
  4. 用多个已知地标的高程值做数值验收（这一步能真正抓住配准错误）
"""
import os, math, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

# DEM 覆盖的经纬度范围（须与 tools_make_dem_heightmap.py 一致）
LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0

# ---------- Albers ----------
LON_0 = 105.0
LAT_1, LAT_2 = 25.0, 47.0
LAT_0 = 36.0
E2 = 0.00669438
_n = 0.5 * (1 + math.sqrt(1 - E2))
_C = math.cos(math.radians(LAT_1)) ** 2 + 2 * _n * math.sin(math.radians(LAT_1)) \
     * math.cos(math.radians(LAT_1)) / math.tan(math.radians(LAT_2))
_rho0 = _C / (math.tan(math.radians(LAT_0)) *
              math.sqrt(1 - E2 * math.sin(math.radians(LAT_0)) ** 2))


def albers_array(lon_deg, lat_deg):
    """经纬度数组 -> Albers 平面坐标（x 东为正，y 北为正）"""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    s = np.sin(lat)
    rho = _C / (np.tan(lat) * np.sqrt(np.clip(1 - E2 * s * s, 1e-12, None)))
    theta = lon - math.radians(LON_0)
    return rho * np.sin(theta), _rho0 - rho * np.cos(theta)


def albers(lat, lon):
    x, y = albers_array(np.array([lon]), np.array([lat]))
    return float(x[0]), float(y[0])


# ---------- 控制点 ----------
# (底图像素x, 像素y, 经度, 纬度, 说明)
CONTROL = [
    (50,   352,  73.5,  39.5, '帕米尔高原西端'),
    (1240, 296,  134.3, 48.4, '黑龙江抚远（东端）'),
    (905,  42,   122.5, 53.3, '漠河北端'),
    (640,  455,  108.5, 34.0, '秦岭'),
    (960,  212,  125.0, 45.5, '松嫩平原'),
    (500,  618,  101.0, 23.5, '滇南'),
]


def build_plane_raster():
    """把 DEM 按 Albers 投到平面栅格，返回 (plane_h, X0, Y0, px_per_unit)"""
    dem = np.load(os.path.join(ASSETS, 'dem_china_raw.npy')).astype(np.float32)
    dh, dw = dem.shape
    lons = LON_MIN + (LON_MAX - LON_MIN) * np.arange(dw) / (dw - 1)
    lats = LAT_MAX - (LAT_MAX - LAT_MIN) * np.arange(dh) / (dh - 1)
    LON, LAT = np.meshgrid(lons, lats)
    X, Y = albers_array(LON, LAT)

    # 平面栅格范围（只取有陆地的部分，留边）
    land = dem > 0
    m = 3.0
    X0 = float(X[land].min()) - m
    X1 = float(X[land].max()) + m
    Y0 = float(Y[land].min()) - m
    Y1 = float(Y[land].max()) + m
    PW, PH = 2400, 2200
    ux = (X1 - X0) / PW
    uy = (Y1 - Y0) / PH

    ix = np.clip(((X - X0) / ux).astype(np.int32), 0, PW - 1)
    iy = np.clip(((Y - Y0) / uy).astype(np.int32), 0, PH - 1)
    plane = np.full((PH, PW), np.nan, dtype=np.float32)
    # 用最大值填补重叠格（山脊优先）
    order = np.argsort(-dem.ravel())
    di = iy.ravel()[order]; pi = ix.ravel()[order]
    dv = dem.ravel()[order]
    plane[di, pi] = dv
    if np.isnan(plane).any():
        m2 = np.isnan(plane)
        plane[m2] = 0.0
    print(f'plane raster {PW}x{PH}  ux={ux:.6f} uy={uy:.6f}')
    return plane, X0, Y0, ux, uy


def fit_transform():
    """解plane(X,Y) -> board(x,y) 的 6 参数线性变换"""
    txy = np.array([albers(la, lo) for (_x, _y, lo, la, _n) in CONTROL])
    P = np.array([c[0] for c in CONTROL], float)
    Q = np.array([c[1] for c in CONTROL], float)
    A = np.zeros((2 * len(CONTROL), 6))
    b = np.zeros(2 * len(CONTROL))
    for i in range(len(CONTROL)):
        X, Y = txy[i]
        A[2*i]   = [X, Y, 1, 0, 0, 0]; b[2*i]   = P[i]
        A[2*i+1] = [0, 0, 0, X, Y, 1]; b[2*i+1] = Q[i]
    sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    pred = np.stack([sol[0]*txy[:,0] + sol[1]*txy[:,1] + sol[2],
                     sol[3]*txy[:,0] + sol[4]*txy[:,1] + sol[5]], axis=1)
    err = np.linalg.norm(pred - np.stack([P, Q], axis=1), axis=1)
    for (cx, cy, lo, la, name), e in zip(CONTROL, err):
        print(f'  {name:<16} 残差 {e:6.1f} px')
    print(f'  RMS = {np.sqrt((err**2).mean()):.1f} px')
    return sol


def sample_plane(plane, X0, Y0, ux, uy, Xq, Yq):
    fx = (Xq - X0) / ux
    fy = (Yq - Y0) / uy
    PH, PW = plane.shape
    fx = np.clip(fx, 0, PW - 1.001)
    fy = np.clip(fy, 0, PH - 1.001)
    i0 = fx.astype(np.int32); j0 = fy.astype(np.int32)
    a = fx - i0; b = fy - j0
    return (plane[j0, i0]*(1-a)*(1-b) + plane[j0, i0+1]*a*(1-b) +
            plane[j0+1, i0]*(1-a)*b + plane[j0+1, i0+1]*a*b)


def main():
    board_img = Image.open(os.path.join(ASSETS, 'map_base.png')).convert('RGBA')
    board = np.asarray(board_img)[:, :, 3] > 128
    H, W = board.shape
    print(f'board {W}x{H}')

    plane, X0, Y0, ux, uy = build_plane_raster()
    c = fit_transform()
    print('\nplane->board:')
    print(f'  x = {c[0]:.6f}*X {c[1]:+.6f}*Y {c[2]:+.4f}')
    print(f'  y = {c[3]:.6f}*X {c[4]:+.6f}*Y {c[5]:+.4f}')

    # 反解 board->plane
    M = np.array([[c[0], c[1]], [c[3], c[4]]])
    t = np.array([c[2], c[5]])
    det = np.linalg.det(M)
    print(f'  变换矩阵行列式 = {det:.6f} (>0 表示未翻转)')
    Minv = np.linalg.inv(M)

    ys, xs = np.mgrid[0:H, 0:W]
    flat = np.stack([xs.ravel().astype(float), ys.ravel().astype(float)]) - t[:, None]
    Xq, Yq = (Minv @ flat)
    h = sample_plane(plane, X0, Y0, ux, uy, Xq, Yq).reshape(H, W)
    h = np.where(board, h, 0.0)

    land = h[board]
    print(f'\n陆地区域高程 min/max/mean = {land.min():.0f} / {land.max():.0f} / {land.mean():.0f} m')
    print(f'  高于3000m 占比 {(land>3000).mean()*100:.2f}%  (真实中国约 2~3%)')

    np.save(os.path.join(ASSETS, 'map_height_dem.npy'), h)
    lo, hi = np.percentile(land, 1), np.percentile(land, 99.7)
    g = np.clip((h - lo) / max(1e-6, hi - lo) * 255, 0, 255)
    Image.fromarray(np.where(board, g, 0).astype(np.uint8)).save(
        os.path.join(ASSETS, 'map_height_dem.png'))

    # 叠加对照图
    hv = np.asarray(Image.open(os.path.join(ASSETS, 'map_height_dem.png')))
    ov = np.asarray(board_img).copy()
    col = np.stack([hv]*3, axis=-1).astype(np.float32)
    ov[:, :, :3] = (ov[:, :, :3]*0.45 + col*0.55).astype(np.uint8)
    Image.fromarray(ov).save(os.path.join(ASSETS, '_dem_overlay_check.png'))

    # 控制点标记图
    mk = board_img.copy()
    d = ImageDraw.Draw(mk)
    for (cx, cy, lo_, la_, name) in CONTROL:
        d.ellipse([cx-7, cy-7, cx+7, cy+7], outline=(255, 0, 255, 255), width=3)
        d.line([(cx-14, cy), (cx+14, cy)], fill=(255, 0, 255, 255), width=1)
        d.line([(cx, cy-14), (cx, cy+14)], fill=(255, 0, 255, 255), width=1)
        d.text((cx+10, cy-8), f'{lo_},{la_}', fill=(255, 0, 255, 255))
    mk.save(os.path.join(ASSETS, '_control_points.png'))
    print('\n输出 assets/map_height_dem.png / _dem_overlay_check.png / _control_points.png')


if __name__ == '__main__':
    main()