import os
import numpy as np
from PIL import Image
from collections import deque

b = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
a = np.array(Image.open(os.path.join(b, 'assets', 'board_full.png')).convert('RGB')).astype(int)
H, W, _ = a.shape
R, G, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]

def near(c, tol):
    return (abs(R - c[0]) < tol) & (abs(G - c[1]) < tol) & (abs(B - c[2]) < tol)

# 三个卡背的底色（从原图取样后再定；先用近似值）
tests = {
    'green(改良)': (near((104, 130, 100), 34), 250, 900, 280, 520),
    'blue(气象)':  (near((58, 112, 168), 40), 250, 900, 280, 520),
    'brown(信息)': (near((166, 124, 78), 38), 250, 950, 280, 1000),
}

for name, (mask, y0, y1, x0, x1) in tests.items():
    m = np.zeros_like(mask); m[y0:y1, x0:x1] = True
    m &= mask
    ys, xs = np.where(m)
    if len(ys) < 200:
        print(name, '极少像素', len(ys)); continue
    # 分位数抗噪
    print('%-12s x %4d..%4d  y %4d..%4d  n=%d' % (
        name, int(np.percentile(xs, 1)), int(np.percentile(xs, 99)),
        int(np.percentile(ys, 1)), int(np.percentile(ys, 99)), len(ys)))

# 白卡本体（含卡背内圈）
white = (R > 240) & (G > 240) & (B > 236)
for name, (y0, y1, x0, x1) in {
    'white(改良)': (280, 500, 300, 620),
    'white(气象)': (300, 490, 800, 1100),
    'white(信息)': (650, 930, 1400, 1700),
}.items():
    m = np.zeros_like(white); m[y0:y1, x0:x1] = True
    m &= white
    ys, xs = np.where(m)
    print('%-12s x %4d..%4d  y %4d..%4d' % (name,
        int(np.percentile(xs, 1)), int(np.percentile(xs, 99)),
        int(np.percentile(ys, 1)), int(np.percentile(ys, 99))))
