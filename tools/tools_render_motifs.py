# -*- coding: utf-8 -*-
"""
把 src/motifs.js 里的 4 个 SVG 标识离线渲染成 PNG，供 Three.js 贴图使用。

为什么需要这一步：
  运行时把 SVG 当位图用（Image→canvas→CanvasTexture）在浏览器里不可靠 ——
  data: URI 的解码是异步的，而 CanvasTexture 会在下一帧被采样，
  结果整张贴图全透明（表现为「旗标整块消失」）。离线渲染成 PNG 就没这问题。

做法：用 node 取出 motifs.js 里的 SVG 字符串，生成一个临时 HTML，
     再用无头 Edge 截图，输出到 assets/ui/motif_[A-D].png
"""
import os, re, sys, json, subprocess, time
sys.stdout.reconfigure(encoding='utf-8')

BASE = r'C:\Users\lzh14\OneDrive\桌面\菜农部落课程包最终版\cn-village'
NODE = r'C:\Users\lzh14\.workbuddy\binaries\node\versions\22.22.2-3\node.exe'
EDGE = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
OUT = os.path.join(BASE, 'assets', 'ui')
SIZE = 256


def extract_svgs():
    os.makedirs(os.path.join(BASE, 'tools'), exist_ok=True)
    """从 motifs.js 里抽出 4 个 SVG 字符串（复用 node 保证解析正确）"""
    script = f'''
import {{ TRIBES }} from "file:///{BASE.replace(os.sep, "/")}/src/motifs.js";
import fs from "fs";
const out = {{}};
for (const t of TRIBES) out[t.id] = t.svg;
fs.writeFileSync("{BASE.replace(os.sep, "/")}/tools/_svgs.json", JSON.stringify(out));
console.log("wrote", Object.keys(out).join(","));
'''
    tmp = os.path.join(BASE, 'tools', '_extract.mjs')
    open(tmp, 'w', encoding='utf-8').write(script)
    r = subprocess.run([NODE, tmp], capture_output=True, timeout=90)
    print(r.stdout.decode('utf-8', 'ignore').strip())
    if r.returncode != 0:
        print(r.stderr.decode('utf-8', 'ignore')[:500])
        raise SystemExit(1)
    return json.load(open(os.path.join(BASE, 'tools', '_svgs.json'), encoding='utf-8'))


def main():
    os.makedirs(OUT, exist_ok=True)
    svgs = extract_svgs()
    print('取到标识:', list(svgs.keys()))

    # 生成一个把 4 个 SVG 并排画的页面，一次截图拿到全部
    cells = []
    for tid, svg in svgs.items():
        cells.append(
            f'<figure><div class="box">{svg}</div>'
            f'<figcaption>{tid}</figcaption></figure>')
    html = f'''<!DOCTYPE html><meta charset="utf-8">
<style>
  html,body{{margin:0;background:transparent}}
  .wrap{{display:grid;grid-template-columns:repeat(4,{SIZE}px);gap:0}}
  figure{{margin:0;width:{SIZE}px;height:{SIZE}px;overflow:hidden;
          display:grid;place-items:center;background:transparent}}
  .box{{width:{SIZE}px;height:{SIZE}px;display:grid;place-items:center}}
  .box svg{{width:{SIZE}px;height:{SIZE}px}}
  figcaption{{display:none}}
</style>
<div class="wrap">{''.join(cells)}</div>'''
    page = os.path.join(BASE, '_motif_render.html')
    open(page, 'w', encoding='utf-8').write(html)

    shot = os.path.join(BASE, 'tools', '_motif_strip.png')
    if os.path.exists(shot):
        os.remove(shot)
    cmd = [EDGE, '--headless=new', '--no-sandbox', '--hide-scrollbars',
           '--default-background-color=00000000',
           f'--window-size={SIZE * 4},{SIZE}',
           '--virtual-time-budget=4000',
           f'--screenshot={shot}',
           'file:///' + page.replace(os.sep, '/')]
    r = subprocess.run(cmd, capture_output=True, timeout=120)
    print('截图完成', os.path.getsize(shot) if os.path.exists(shot) else 0)

    # 切成 4 张
    from PIL import Image
    im = Image.open(shot).convert('RGBA')
    print('条图尺寸', im.size)
    ids = list(svgs.keys())
    for i, tid in enumerate(ids):
        cell = im.crop((i * SIZE, 0, (i + 1) * SIZE, SIZE))
        # 检查非透明像素
        px = cell.getdata()
        n = sum(1 for p in px if p[3] > 12)
        p = os.path.join(OUT, f'motif_{tid}.png')
        cell.save(p)
        print(f'  motif_{tid}.png  非透明 {n}/{SIZE*SIZE}  {os.path.getsize(p):,}B')

    os.remove(page)
    try:
        os.remove(os.path.join(BASE, 'tools', '_svgs.json'))
        os.remove(os.path.join(BASE, 'tools', '_extract.mjs'))
    except OSError:
        pass
    print('\n完成 ->', OUT)


if __name__ == '__main__':
    main()