# -*- coding: utf-8 -*-
"""
精确检测 board_full.png 上的赛道格中心。
赛道底色实测 rgb(255,226,176)，据此建掩码 ->
找外圈四条带的中心线 -> 沿带扫描连续格段 -> 取段中心 -> 顺时针排序。

输出: cn-village/src/cellPositions.js
"""
import os, sys, json, math
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')

BASE = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
IMG = os.path.join(BASE, 'assets', 'board_full.png')
OUT = os.path.join(BASE, 'src', 'cellPositions.js')

im = Image.open(IMG).convert('RGB')
W, H = im.size
px = im.load()
print('board', W, H)

TARGET = (255, 226, 176)
TOL = 16


def is_cell(x, y):
    r, g, b = px[x, y]
    return (abs(r - TARGET[0]) <= TOL and
            abs(g - TARGET[1]) <= TOL and
            abs(b - TARGET[2]) <= TOL)


def runs(vals, minlen):
    out, st = [], None
    for i, v in enumerate(vals):
        if v and st is None:
            st = i
        elif not v and st is not None:
            if i - st >= minlen:
                out.append((st, i - 1))
            st = None
    if st is not None and len(vals) - st >= minlen:
        out.append((st, len(vals) - 1))
    return out


# ---- 1. 估格边长 ----
lens = []
for fy in (0.04, 0.06, 0.08, 0.92, 0.94, 0.96):
    y = int(H * fy)
    row = [is_cell(x, y) for x in range(W)]
    for a, b in runs(row, 30):
        lens.append(b - a + 1)
if not lens:
    print('!! 未检出赛道格，阈值可能需调整')
    sys.exit(1)
CELL = int(min(lens))
print(f'格边长 ≈ {CELL}px  ({CELL/W:.4f} x {CELL/H:.4f})')

# ---- 2. 找四条带的中心线 ----
def first_row_with(y_from, y_to, y_step, thresh=18):
    rng = range(y_from, y_to, y_step) if y_step > 0 else range(y_from, y_to, y_step)
    for y in rng:
        n = sum(1 for x in range(0, W, 3) if is_cell(x, y))
        if n > thresh:
            return y
    return None

top_y = first_row_with(0, H // 2, 1, 25)
bot_y = first_row_with(H - 1, H // 2, -1, 25)
left_x = first_row_with(0, W // 2, 1, 18) if False else None
# 左右用逐列扫描
def first_col_with(x_from, x_to, x_step, thresh=18):
    rng = range(x_from, x_to, x_step) if x_step > 0 else range(x_from, x_to, x_step)
    for x in rng:
        n = sum(1 for y in range(0, H, 3) if is_cell(x, y))
        if n > thresh:
            return x
    return None

left_x = first_col_with(0, W // 2, 1, 18)
right_x = first_col_with(W - 1, W // 2, -1, 18)

print(f'边界 top_y={top_y}({top_y/H:.4f}) bot_y={bot_y}({bot_y/H:.4f}) '
      f'left_x={left_x}({left_x/W:.4f}) right_x={right_x}({right_x/W:.4f})')
if None in (top_y, bot_y, left_x, right_x):
    print('!! 边界未找全'); sys.exit(1)

# ---- 3. 沿四边扫描格段（分四组保存，避免角上重复）----
raw = []
MINSEG = int(CELL * 0.75)

# 底边（y 最大）：左 -> 右
y = bot_y - CELL // 2
bottom = [((a + b) / 2, y) for a, b in runs([is_cell(x, y) for x in range(W)], MINSEG)]

# 右边（x 最大）：下 -> 上
x = right_x - CELL // 2
right = [(x, (a + b) / 2) for a, b in runs([is_cell(x, y) for y in range(H)], MINSEG)]

# 顶边（y 最小）：右 -> 左
y = top_y + CELL // 2
top = [((a + b) / 2, y) for a, b in runs([is_cell(x, y) for x in range(W)], MINSEG)]

# 左边（x 最小）：上 -> 下
x = left_x + CELL // 2
left = [(x, (a + b) / 2) for a, b in runs([is_cell(x, y) for y in range(H)], MINSEG)]

print(f'\n四边检出: bottom={len(bottom)} right={len(right)} top={len(top)} left={len(left)}')

# ---- 4. 组装环路：起点=右下角，顺时针（视觉）----
# 视觉顺时针：从右下角 -> 沿右边向上 -> 沿顶边向左 -> 沿左边向下 -> 沿底边向右
def corner_trim(lst, at_start, at_end):
    """从两端各去掉可能与相邻边重复的角格"""
    if at_start and len(lst) > 1:
        lst = lst[1:]
    if at_end and len(lst) > 1:
        lst = lst[:-1]
    return lst

# 底边: 从左到右 -> 需要翻转成从右到左；去掉最右(与右边重复)保留最左
b = list(reversed(bottom))            # 右 -> 左
b = corner_trim(b, True, False)       # 去掉最右端
r = list(reversed(right))             # 下 -> 上... right 是从上到下扫的
r = list(reversed(right))             # 下 -> 上
r = corner_trim(r, False, False)
t = top                              # 右 -> 左 已是从右到左
t = corner_trim(t, False, True)       # 去掉最左端（与左边重复）
l = left                             # 上 -> 下 已是从上到下
l = corner_trim(l, False, False)

order = b + r + t + l
# 去掉仍然相邻重复的
pts = []
for p in order:
    if not pts or abs(p[0] - pts[-1][0]) >= CELL * 0.5 or abs(p[1] - pts[-1][1]) >= CELL * 0.5:
        pts.append(p)

print(f'\n组装后赛道格数: {len(pts)}')
for i, (x, y) in enumerate(pts):
    print(f'  {i:2d} ({x/W:.4f},{y/H:.4f})')

js = ('// 自动生成，勿手改 —— python tools_detect_cells.py\n'
      '// board_full.png 上赛道格实测中心（归一化 0-1）\n'
      '// 顺时针，索引 0 = 右下角起点\n'
      'export const CELL_POS = ' +
      json.dumps([[round(x / W, 4), round(y / H, 4)] for x, y in order]) + ';\n\n'
      '// 赛道格边长（归一化）\n'
      'export const CELL_W = ' + str(round(CELL / W, 4)) + ';\n'
      'export const CELL_H = ' + str(round(CELL / H, 4)) + ';\n')

open(OUT, 'w', encoding='utf-8').write(js)
print('\n->', OUT)