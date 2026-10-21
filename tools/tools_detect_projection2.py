#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
确定底图 map_base.png 用的是什么投影。

思路：
  1. 检测 alpha 通道的连通域，分离出台湾、海南等岛屿（它们的经纬是已知的）
  2. 比较不同投影下中国 bbox 的长宽比 vs 底图主大陆 bbox 的长宽比
  3. 用岛屿质心 + 主大陆极值点做控制点最小二乘拟合仿射，看残差
"""
import os, json
import numpy as np
from PIL import Image
from collections import deque

ROOT = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
A = os.path.join(ROOT, 'assets')

# ---------------- 投影函数 ----------------
def prj_rect(lon, lat):
    return lon, -lat

def prj_albers(lon, lat, lon0=105.0, lat0=36.0, p1=25.0, p2=47.0):
    """Albers 等积圆锥投影（米）"""
    import math
    R = 6371000.0
    f = math.radians
    m = f((p1 + p2) / 2.0)
    n = (math.sin(f(p1)) + math.sin(f(p2))) / 2.0
    C = math.cos(f(p1))**2 + 2 * n * math.sin(f(p1))
    rho0 = R * math.sqrt(C - 2 * n * math.sin(f(lat0))) / n
    def rho(la):
        v = C - 2 * n * math.sin(f(la))
        return R * math.sqrt(v) / n
    t = n * f(lon - lon0)
    x = rho(lat) * math.sin(t)
    y = rho0 - rho(lat) * math.cos(t)
    return x, y

def prj_lambert(lon, lat, lon0=105.0, lat0=36.0):
    """Lambert 等角圆锥（与天地图/多数中国地图一致）"""
    import math
    R = 6371000.0
    f = math.radians
    p1, p2 = 25.0, 47.0
    m = f((p1 + p2) / 2.0)
    n = math.log(math.cos(f(p1)) / math.cos(f(p2))) / math.log(
        math.tan(math.pi/4 + f(p2)/2) / math.tan(math.pi/4 + f(p1)/2))
    F = math.cos(f(p1)) * math.tan(math.pi/4 + f(p1)/2)**n / n
    rho0 = R * F / (math.tan(math.pi/4 + f(lat0)/2)**n)
    def rho(la):
        return R * F / (math.tan(math.pi/4 + f(la)/2)**n)
    t = n * f(lon - lon0)
    return rho(lat) * math.sin(t), rho0 - rho(lat) * math.cos(t)

PROJS = {'rect': prj_rect, 'albers': prj_albers, 'lambert': prj_lambert}

# 中国大致范围（用于检验长宽比）
LONS = np.array([73.5, 73.5, 135.0, 135.0, 80.0, 120.0])
LATS = np.array([39.5, 53.5, 53.5, 18.0, 45.0, 30.0])


def components(mask, min_px=300):
    H, W = mask.shape
    lab = np.zeros((H, W), np.int32)
    cur = 0; out = []
    ys, xs = np.where(mask)
    for sy, sx in zip(ys, xs):
        if lab[sy, sx]:
            continue
        cur += 1
        q = deque([(sy, sx)]); lab[sy, sx] = cur; pix = []
        while q:
            y, x = q.popleft(); pix.append((y, x))
            for dy, dx in ((1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)):
                ny, nx = y+dy, x+dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = cur; q.append((ny, nx))
        if len(pix) >= min_px:
            pa = np.array(pix)
            out.append(dict(id=cur, n=len(pix),
                            x0=int(pa[:,1].min()), x1=int(pa[:,1].max()),
                            y0=int(pa[:,0].min()), y1=int(pa[:,0].max()),
                            cx=float(pa[:,1].mean()), cy=float(pa[:,0].mean())))
    return lab, out


def main():
    im = Image.open(os.path.join(A, 'map_base.png')).convert('RGBA')
    alpha = np.asarray(im)[:, :, 3] > 127
    H, W = alpha.shape
    print(f'底图 {W} x {H}')

    lab, comps = components(alpha, min_px=800)
    comps.sort(key=lambda c: -c['n'])
    print(f'\n连通域（>=800px）共 {len(comps)} 个，前 12 大:')
    for c in comps[:12]:
        print(f"  #{c['id']:3d} n={c['n']:7d} bbox x[{c['x0']:4d},{c['x1']:4d}] "
              f"y[{c['y0']:4d},{c['y1']:4d}] w={c['x1']-c['x0']:4d} h={c['y1']-c['y0']:4d} "
              f"cen=({c['cx']:.0f},{c['cy']:.0f})")

    main_c = comps[0]
    print(f"\n主大陆 bbox: x[{main_c['x0']},{main_c['x1']}] y[{main_c['y0']},{main_c['y1']}] "
          f"宽高比 = {(main_c['x1']-main_c['x0'])/(main_c['y1']-main_c['y0']):.4f}")

    print('\n各投影下中国范围的长宽比:')
    for name, fn in PROJS.items():
        xs = []; ys = []
        for lo, la in zip(LONS, LATS):
            x, y = fn(lo, la); xs.append(x); ys.append(y)
        ar = (max(xs)-min(xs)) / (max(ys)-min(ys))
        print(f'  {name:8s} 宽高比 = {ar:.4f}')

    # 岛屿质心（经纬已知）
    ISL = {
        '台湾':   (121.0, 23.75),
        '海南':   (109.75, 19.20),
    }
    print('\n候选岛屿匹配（质心附近搜索）:')
    ctrl = []
    for nm, (lo, la) in ISL.items():
        best = None
        for c in comps[1:8]:
            if c['n'] < 1500:
                continue
            # 台湾：图像右下、海南：图像偏南中央 -> 用相对位置粗筛
            d = None
            if nm == '台湾' and c['cx'] > main_c['cx'] and c['cy'] > main_c['cy']:
                d = 1
            if nm == '海南' and abs(c['cx']-main_c['cx']) < 260 and c['cy'] > main_c['cy']-40:
                d = 1
            if d:
                best = c
                break
        if best:
            print(f"  {nm} -> #{best['id']} n={best['n']} cen=({best['cx']:.1f},{best['cy']:.1f}) "
                  f"经纬({lo},{la})")
            ctrl.append((nm, best['cx'], best['cy'], lo, la))

    # 用 2 个岛屿 + bbox 约束拟仿射（lon = a0+a1 x + a2 y）
    if len(ctrl) >= 3:
        X = np.array([[1, c[1], c[2]] for c in ctrl])
        lo = np.array([c[3] for c in ctrl]); la = np.array([c[4] for c in ctrl])
        coef, *_ = np.linalg.lstsq(X, lo, rcond=None)
        print('\n由岛屿拟合的 lon 仿射:', np.round(coef, 6))

    # 保存标注图
    vis = np.asarray(im.convert('RGB')).copy()
    for c in comps[:12]:
        cv = [(255,0,0),(0,128,255),(255,0,255),(0,255,0),(255,128,0),(0,255,255)][c['id'] % 6]
        vis[c['y0']:c['y1']+1, c['x0']:c['x1']+1] = (
            vis[c['y0']:c['y1']+1, c['x0']:c['x1']+1]*0.75 + np.array(cv)*0.25).astype(np.uint8)
        ImageDraw = __import__('PIL.ImageDraw', fromlist=['ImageDraw']).Draw(Image.fromarray(vis))
    from PIL import ImageDraw
    d = ImageDraw.Draw(Image.fromarray(vis))
    for i, c in enumerate(comps[:12]):
        col = [(255,0,0),(0,128,255),(255,0,255),(0,255,0),(255,128,0),(0,255,255)][i % 6]
        d.rectangle([c['x0'], c['y0'], c['x1'], c['y1']], outline=col, width=3)
        d.text((c['x0']+3, c['y0']+3), f"{i}#{c['id']} n={c['n']}", fill=col)
    Image.fromarray(vis).save(os.path.join(A, '_comps.png'))
    print('\n已输出 _comps.png')

    with open(os.path.join(A, '_comps.json'), 'w', encoding='utf-8') as f:
        json.dump(comps[:20], f, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()