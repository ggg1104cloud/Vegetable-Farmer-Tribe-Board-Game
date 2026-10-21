# -*- coding: utf-8 -*-
"""菜农部落 · 开发/教学用 HTTP 服务（带禁用缓存头）。

为什么不用 `python -m http.server`：
  它不带 Cache-Control，浏览器会对 main.js / engine.js 等模块做启发式缓存。
  改完代码刷新页面，浏览器可能仍用旧文件 —— 而且各文件过期时间不同，
  会出现「新 main.js + 旧 engine.js」的混搭（表现为集市日志 −undefined、
  路过他人土地仍收过路费等「改了没生效」的假 bug，2026-10-10 用户实测踩过）。

本服务给每个响应加：
  Cache-Control: no-cache, must-revalidate   ← 每次都向服务器校验新鲜度
  （配合 Last-Modified，未改动的文件仍走 304，不牺牲加载速度）

用法（与 http.server 完全一致）：
  python serve.py 8932
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("[serve] %s\n" % (fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8932
    srv = ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler)
    print(f"[serve] http://127.0.0.1:{port}/index.html  (Cache-Control: no-cache)")
    srv.serve_forever()


if __name__ == '__main__':
    main()
