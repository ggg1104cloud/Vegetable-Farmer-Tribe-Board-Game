#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
在底图上叠加**精确的经纬网格**，供人工读出控制点的准确像素位置。

网格由 Albers 投影直接生成 —— 先用一个粗略的平面->像素变换把网格画上去，
读出控制点后再解精确变换，迭代两轮即可收敛。
"""
import os, math, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

LON_0, LAT_1, LAT_2, LAT_0 = 105.0, 25.0, 47.0, 36.0
E2 = 0.00669438
_n = 0.5*(1+math.sqrt(1-E2))
_C = math.cos(math.radians(LAT_1))**2 + 2*_n*math.sin(math.radians(LAT_1))* \
     math.cos(math.radians(LAT_1))/math.tan(math.radians(LAT_2))
_rho0 = _C/(math.tan(math.radians(LAT_0))*math.sqrt(1-E2*math.sin(math.radians(LAT_0))**2))

def alb(lo, la):
    lat = math.radians(la); s = math.sin(lat)
    rho = _C/(math.tan(lat)*math.sqrt(max(1e-12, 1-E2*s*s)))
    th = math.radians(lo-LON_0)
    return rho*math.sin(th), _rho0-rho*math.cos(th)

def alb_arr(lo, la):
    lo=np.asarray(lo); la=np.asarray(la)
    lat=np.radians(la); s=np.sin(lat)
    rho=_C/(np.tan(lat)*np.sqrt(np.clip(1-E2*s*s,1e-12,None)))
    th=np.radians(lo-LON_0)
    return rho*np.sin(th), _rho0-rho*np.cos(th)

# 粗略变换：目测 4 角点
# board 陆地大致 x[46,1260] y[36,897]
#   (46,36)   ~ lon 73.5, lat 53.3   (西北角外)
#   (1260,36) ~ lon 134.3, lat 53.3
#   (46,897)  ~ lon 73.5, lat 4.2
#   (1260,897)~ lon 134.3, lat 4.2
def fit4():
    src = [(73.5,53.3),(134.3,53.3),(73.5,4.2),(134.3,4.2)]
    dst = [(46,36),(1260,36),(46,897),(1260,897)]
    A=[];b=[]
    for (lo,la),(x,y) in zip(src,dst):
        X,Y = alb(lo,la)
        A.append([X,Y,1,0,0,0]); b.append(x)
        A.append([0,0,0,X,Y,1]); b.append(y)
    sol,*_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
    return sol

def draw(sol, fname, W=1367, H=928):
    img = Image.open(os.path.join(ASSETS,'map_base.png')).convert('RGBA')
    ov = Image.new('RGBA',(W,H),(0,0,0,0))
    d = ImageDraw.Draw(ov)
    def to_px(lo,la):
        X,Y = alb_arr(lo,la)
        return sol[0]*X+sol[1]*Y+sol[2], sol[3]*X+sol[4]*Y+sol[5]
    try:
        font = ImageFont.truetype('arial.ttf', 13)
    except Exception:
        font = ImageFont.load_default()
    # 经线
    for lo in range(70, 146, 5):
        las = np.linspace(2, 56, 300)
        los = np.full_like(las, lo)
        X,Y = alb_arr(los, las)
        px = sol[0]*X+sol[1]*Y+sol[2]; py = sol[3]*X+sol[4]*Y+sol[5]
        pts = [(float(a),float(b)) for a,b in zip(px,py) if -50<a<W+50 and -50<b<H+50]
        if len(pts)>1:
            d.line(pts, fill=(255,0,255,190), width=2)
            d.text(pts[-1], f'{lo}°E', fill=(255,0,255,255), font=font)
    # 纬线
    for la in range(5, 56, 5):
        los = np.linspace(70, 142, 300)
        las = np.full_like(los, la)
        X,Y = alb_arr(los, las)
        px = sol[0]*X+sol[1]*Y+sol[2]; py = sol[3]*X+sol[4]*Y+sol[5]
        pts=[(float(a),float(b)) for a,b in zip(px,py) if -50<a<W+50 and -50<b<H+50]
        if len(pts)>1:
            d.line(pts, fill=(0,120,255,190), width=2)
            d.text(pts[0], f'{la}°N', fill=(0,90,255,255), font=font)
    out = Image.alpha_composite(img, ov).convert('RGB')
    p = os.path.join(ASSETS, fname)
    out.save(p)
    print('->', p)
    return sol

if __name__ == '__main__':
    sol = fit4()
    print('粗略变换:', np.round(sol, 4))
    draw(sol, '_lonlat_grid.png')