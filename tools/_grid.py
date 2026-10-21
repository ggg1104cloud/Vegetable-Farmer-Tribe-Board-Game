"""
量出 board_full.png 上 32 个赛道格的精确矩形（用白网格线定位），
写进 src/cellPositions.js 的 CELL_RECTS（归一化 0-1）。
"""
import json, os, re
import numpy as np
from PIL import Image

ROOT = r"C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village"
im = np.array(Image.open(os.path.join(ROOT, "assets", "board_full.png")).convert("RGB")).astype(int)
H, W, _ = im.shape
print("board", W, "x", H)

def white_lines(vals, thr=228, minlen=2):
    """返回亮度 > thr 的连续段中点"""
    m = (vals > thr).astype(int)
    out, s = [], None
    for i, v in enumerate(m):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= minlen:
                out.append((s + i - 1) / 2)
            s = None
    if s is not None and len(m) - s >= minlen:
        out.append((s + len(m) - 1) / 2)
    return out

# 底行内部横切（避开内容，多行取交集）
def collect(axis, fixed_range, is_row):
    """axis: 'row' 表示取若干 y 求 x 边界"""
    votes = {}
    for f in fixed_range:
        vals = im[f].mean(axis=1) if is_row else im[:, f].mean(axis=1)
        for v in white_lines(vals):
            k = round(v / 3)
            votes[k] = votes.get(k, 0) + 1
    # 出现次数够多的才算真网格线
    thr = max(2, len(fixed_range) // 3)
    return sorted(v * 3 for v, c in votes.items() if c >= thr)

print("\n底行 x 边界（多条横切投票）:")
xs_bottom = collect('x', [1230, 1260, 1300, 1420, 1450], True)
print([round(v) for v in xs_bottom])

print("\n顶行 x 边界:")
xs_top = collect('x', [40, 70, 100, 230, 260], True)
print([round(v) for v in xs_top])

print("\n左列 y 边界:")
ys_left = collect('y', [40, 90, 150, 200, 250], False)
print([round(v) for v in ys_left])

print("\n右列 y 边界:")
ys_right = collect('y', [1720, 1780, 1830, 1890, 1930], False)
print([round(v) for v in ys_right])
