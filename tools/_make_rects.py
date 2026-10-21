"""
由实测网格线算出 32 个赛道格的归一化矩形，追加到 src/cellPositions.js。
尺寸依据：board_full.png = 1963 x 1482
"""
import json, os

ROOT = r"C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village"
W, H = 1963, 1482

# 实测网格线（像素）
XB = [6, 300, 470, 641, 812, 983, 1154, 1324, 1495, 1663, 1953]
YB = [9, 276, 432, 585, 741, 897, 1050, 1206, 1473]

rects = {}

# 底边 0-9（右 -> 左）
for i in range(10):
    x0, x1 = XB[9 - i], XB[10 - i]
    rects[i] = (x0, YB[7], x1, YB[8])

# 右边 10-15（下 -> 上）
for k in range(6):
    i = 10 + k
    y1, y0 = YB[7 - k], YB[6 - k]
    rects[i] = (XB[9], y0, XB[10], y1)

# 顶边 16-25（左 -> 右）
for i in range(10):
    rects[16 + i] = (XB[i], YB[0], XB[i + 1], YB[1])

# 左边 26-31（上 -> 下）
for k in range(6):
    rects[26 + k] = (XB[0], YB[1 + k], XB[1], YB[2 + k])

# 归一化
norm = {}
for i in range(32):
    x0, y0, x1, y1 = rects[i]
    norm[i] = [round(x0 / W, 5), round(y0 / H, 5), round(x1 / W, 5), round(y1 / H, 5)]

lines = []
for i in range(32):
    a = norm[i]
    lines.append(f"  [{a[0]}, {a[1]}, {a[2]}, {a[3]}]")

js_rects = "[\n" + ",\n".join(lines) + "\n]"

p = os.path.join(ROOT, "src", "cellPositions.js")
src = open(p, encoding="utf-8").read()

block = f"""
// 赛道格外接矩形（归一化 [x0,y0,x1,y1]），由 tools/_grid.py 从
// board_full.png 的白网格线实测得到。国风格子贴片按它精确定位。
export const CELL_RECTS = {js_rects};
"""

# 若已有就替换，否则追加
import re
if "CELL_RECTS" in src:
    src = re.sub(r"\n// 赛道格外接矩形[\s\S]*?export const CELL_RECTS = \[[\s\S]*?\];\n",
                 block, src)
else:
    src = src.rstrip() + "\n" + block

open(p, "w", encoding="utf-8").write(src)
print("updated", p)

# 打印自检
for i in range(32):
    a = norm[i]
    w = (a[2] - a[0]) * W
    h = (a[3] - a[1]) * H
    print(f"  {i:2d}  {a}  {w:.0f}x{h:.0f}")
