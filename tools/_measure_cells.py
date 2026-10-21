"""
量出 board_full.png 上 32 个赛道格的精确矩形。
思路：格子底色是一种特定的暖黄色，按该色做连通域，取外接矩形，
再和 cellPositions.js 的中心点做最近邻匹配。
输出：assets/cells/_rects.json
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = r"C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village"
im = np.array(Image.open(os.path.join(ROOT, "assets", "board_full.png")).convert("RGB")).astype(int)
H, W, _ = im.shape
print("board", W, "x", H)

# 从 cellPositions.js 取中心点
import re
js = open(os.path.join(ROOT, "src", "cellPositions.js"), encoding="utf-8").read()
m = re.search(r"CELL_POS\s*=\s*(\[\[.*?\]\])", js, re.S)
POS = json.loads(m.group(1))
print("centers", len(POS))

# 采样中心点的颜色
samples = []
for nx, ny in POS:
    x, y = int(nx * W), int(ny * H)
    samples.append(im[y, x])
samples = np.array(samples)
med = np.median(samples, axis=0)
print("中心色中位数", med)

# 底色掩膜：接近暖黄
R, G, B = im[:, :, 0], im[:, :, 1], im[:, :, 2]
mask = (R > 235) & (G > 210) & (G < 245) & (B > 160) & (B < 225) & ((R - B) > 25)
print("掩膜像素", int(mask.sum()))

lab, n = ndimage.label(mask)
print("连通域", n)

# 只保留够大的域
objs = ndimage.find_objects(lab)
boxes = []
for i, sl in enumerate(objs, start=1):
    if sl is None:
        continue
    y0, y1 = sl[0].start, sl[0].stop
    x0, x1 = sl[1].start, sl[1].stop
    area = int((lab[sl] == i).sum())
    w, h = x1 - x0, y1 - y0
    if area < 4000 or w < 60 or h < 60:
        continue
    boxes.append((x0, y0, x1, y1, area))

print("候选域", len(boxes))

# 匹配：每个 POS 找中心落入的域
rects = {}
unmatched = []
for idx, (nx, ny) in enumerate(POS):
    cx, cy = nx * W, ny * H
    hit = None
    for (x0, y0, x1, y1, area) in boxes:
        if x0 <= cx <= x1 and y0 <= cy <= y1:
            # 取面积最小的命中（避免命中大合并域）
            if hit is None or area < hit[4]:
                hit = (x0, y0, x1, y1, area)
    if hit:
        rects[idx] = dict(x0=hit[0], y0=hit[1], x1=hit[2], y1=hit[3])
    else:
        unmatched.append(idx)

print("命中", len(rects), "未命中", unmatched)

# 统计尺寸
ws = [v["x1"] - v["x0"] for v in rects.values()]
hs = [v["y1"] - v["y0"] for v in rects.values()]
print("宽 min/max/中位", min(ws), max(ws), int(np.median(ws)))
print("高 min/max/中位", min(hs), max(hs), int(np.median(hs)))

for i in sorted(rects):
    r = rects[i]
    print(f"  {i:2d} x{r['x0']:5d}-{r['x1']:5d} y{r['y0']:5d}-{r['y1']:5d} "
          f"({r['x1']-r['x0']}x{r['y1']-r['y0']})")

out = os.path.join(ROOT, "assets", "cells", "_rects.json")
json.dump({"W": W, "H": H, "rects": rects}, open(out, "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("saved", out)
