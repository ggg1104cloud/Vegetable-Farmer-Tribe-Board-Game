#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
生成真实的中国地形高度图（灰度 PNG），替换原先"从颜色猜出来"的假高度。

数据源：AWS Terrain Tiles（Mapzen / Mapbox 开放数据，免登录）
    https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
编码：terrarium = height_m + 32768 编码进 RGB
    R = floor(h) / 256 ,G = floor(h) % 256 , B = round((h - floor(h)) * 256)
    解码： h = R * 256 + G + B / 256 - 32768

输出：
    assets/dem_china_raw.png   —— 中国范围内的高程灰度图（Web Mercator 拼接）
    assets/map_height_dem.png  —— 裁剪到图板中国轮廓范围内、归一化后的高度图
    src/terrainData_dem.js     —— 对应的经纬度映射信息+ 掩码

用法：
    python tools_make_dem_heightmap.py --zoom 6
"""
import argparse, io, math, os, sys, time, urllib.request
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
SRC = os.path.join(ROOT, 'src')
TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
CACHE = os.path.join(HERE, '_tile_cache')

# 中国范围（含南沙群岛）
LON_MIN, LON_MAX = 71.0, 140.0
LAT_MIN, LAT_MAX = 2.0, 55.0


def lonlat2tile(lat, lon, z):
    n = 2.0 ** z
    xt = (lon + 180.0) / 360.0 * n
    lat_r = math.radians(lat)
    yt = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return xt, yt


def fetch_tile(z, x, y, retries=4):
    os.makedirs(CACHE, exist_ok=True)
    fn = os.path.join(CACHE, f'{z}_{x}_{y}.png')
    if os.path.exists(fn) and os.path.getsize(fn) > 100:
        return Image.open(fn).convert('RGB')
    url = TILES.format(z=z, x=x, y=y)
    last = None
    for k in range(retries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            im = Image.open(io.BytesIO(data)).convert('RGB')
            im.save(fn)
            return im
        except Exception as e:
            last = e
            time.sleep(0.8 * (k + 1))
    print(f'  ! tile {z}/{x}/{y} failed: {last}', file=sys.stderr)
    return None


def decode_terrarium(im):
    a = np.asarray(im).astype(np.float64)
    return (a[:, :, 0] * 256 + a[:, :, 1] + a[:, :, 2] / 256) - 32768.0


def build_raw(zoom):
    """按 Web Mercator 拼出整个中国范围的原始高程（单位：米）"""
    x0f, y0f = lonlat2tile(LAT_MAX, LON_MIN, zoom)   # 左上
    x1f, y1f = lonlat2tile(LAT_MIN, LON_MAX, zoom)   # 右下
    x0, y0 = int(math.floor(x0f)), int(math.floor(y0f))
    x1, y1 = int(math.floor(x1f)), int(math.floor(y1f))
    nx, ny = x1 - x0 + 1, y1 - y0 + 1
    print(f'zoom {zoom}: {nx} x {ny} = {nx*ny} tiles -> {nx*256} x {ny*256} px')

    grid = np.full((ny * 256, nx * 256), np.nan, dtype=np.float32)
    done = 0
    for j in range(ny):
        for i in range(nx):
            im = fetch_tile(zoom, x0 + i, y0 + j)
            done += 1
            if done % 10 == 0:
                print(f'  ... {done}/{nx*ny}')
            if im is None:
                continue
            h = decode_terrarium(im)
            grid[j*256:(j+1)*256, i*256:(i+1)*256] = h
    return grid, (x0, y0, zoom)


def mercator_row(lat, zoom):
    """给定纬度，返回其在拼接图中的像素行（v向上为北，故行号需翻转）"""
    n = 2.0 ** zoom
    lat_r = math.radians(lat)
    yt = (1.0 - math.asinh(math.tan(lat_r)) / math.pi) / 2.0 * n
    return yt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--zoom', type=int, default=6)
    args = ap.parse_args()

    grid, (tx0, ty0, z) = build_raw(args.zoom)

    # 补 NaN（瓦片缺失）用最近有效值
    if np.isnan(grid).any():
        print('filling NaN ...')
        m = np.isnan(grid)
        if m.all():
            raise SystemExit('全部瓦片失败')
        idx = np.flatnonzero(~m.ravel())
        grid_flat = grid.ravel()
        grid_flat[m.ravel()] = grid_flat[idx].mean()
        grid = grid_flat.reshape(grid.shape)

    os.makedirs(ASSETS, exist_ok=True)
    raw_path = os.path.join(ASSETS, 'dem_china_raw.png')
    Image.fromarray(grid.astype(np.int32), mode='I;16').save(raw_path)
    print('raw elevation ->', raw_path, grid.shape,
          f'min={grid.min():.0f}m max={grid.max():.0f}m')

    # 同时存一份16bit 的 npy 供后续精确重采样
    np.save(os.path.join(ASSETS, 'dem_china_raw.npy'), grid)

    print('\n下一步：用 tools_dem_to_board.py 把 DEM 按经纬度对齐到图板轮廓')
    return grid, (tx0, ty0, z)


if __name__ == '__main__':
    main()