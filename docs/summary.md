# CityGS 远程实时服务端渲染 MVP 说明

## 项目目标

本项目面向 CityGS / MatrixCity / 3D Gaussian Splatting 的远程实时浏览需求，目标是构建一个服务端渲染系统：

- 用户通过网页查看城市级 3DGS 场景；
- 用户在网页中拖动鼠标、滚动滚轮控制视角；
- A6000 GPU 服务器负责加载 CityGaussian 模型并执行 CUDA 渲染；
- 渲染结果返回浏览器显示；
- 后续升级为 NVENC + WebRTC 的低延迟视频流。

当前阶段不做用户上传图片和在线训练。模型由服务器提前离线训练好，系统聚焦于 **server-side rendering**。

---

## 当前系统链路

```text
浏览器前端
  -> camera.control
WebSocket signaling
  -> session assignment / message routing
CityGS Node worker
  -> HTTP POST /render
Python render_server
  -> CityGaussian + diff_gaussian_rasterization
A6000 CUDA 渲染
  -> PNG / MJPEG / WebRTC prototype
前端网页显示
```

当前可演示的画面返回方式：

- `Latest PNG`：显示最新一帧渲染结果；
- `MJPEG Stream`：连续图像流，作为当前可演示的视频流替代方案；
- `WebRTC Video`：已接入原型入口，浏览器稳定播放仍需继续调试。

---

## 当前实现进展

已经完成：

1. React + TypeScript 前端页面；
2. WebSocket signaling；
3. mock worker；
4. CityGS worker；
5. 常驻 Python `render_server.py`；
6. 前端 orbit camera；
7. worker 相机参数转换；
8. A6000 服务器端真实 CUDA 渲染；
9. `Latest PNG` 图像返回；
10. `MJPEG Stream` 连续图像流；
11. coarse / full / lod 三种模型档位；
12. 分辨率、FPS、质量档位配置；
13. Cloudflare Tunnel 临时公网预览；
14. WebRTC 原型入口。

当前可以实现：

```text
网页拖动视角 -> A6000 服务器渲染 -> 网页显示新视角画面
```

---

## 当前模型与环境

服务器：

```text
GPU: NVIDIA RTX A6000 48GB
Renderer: CityGaussian + diff_gaussian_rasterization
```

快速演示模型：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_coarse
```

高质量完整模型：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_c36
```

LOD 配置：

```text
/root/ftl/CityGaussian/config/mc_aerial_c36_lod_output_v1.yaml
```

当前建议：

- 日常演示使用 `coarse`；
- 高质量展示切换 `full`；
- 质量档位 / LOD 演示切换 `lod`。

---

## 启动方式

### render server

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-render-coarse.sh
./scripts/start-render-full.sh
./scripts/start-render-lod.sh
```

同时启动三个模型档位：

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-render-all.sh
```

默认端口：

```text
coarse -> http://127.0.0.1:9100/render
full   -> http://127.0.0.1:9101/render
lod    -> http://127.0.0.1:9102/render
```

### signaling

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-signaling.sh
```

### CityGS worker

```bash
cd /root/Projects/citygs-remote-render-mvp
SIGNALING_URL=ws://127.0.0.1:8788 \
CITYGS_RENDER_SERVER_URL_COARSE=http://127.0.0.1:9100/render \
CITYGS_RENDER_SERVER_URL_FULL=http://127.0.0.1:9101/render \
CITYGS_RENDER_SERVER_URL_LOD=http://127.0.0.1:9102/render \
npm --workspace @citygs/worker run dev:citygs
```

worker 默认提供：

```text
Latest PNG   -> http://127.0.0.1:8789/frame.png
MJPEG Stream -> http://127.0.0.1:8789/stream.mjpg
```

### frontend

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-frontend.sh
```

---

## 公网预览

当前可以用 Cloudflare Tunnel 临时预览：

```bash
cloudflared tunnel --url http://127.0.0.1:5173
cloudflared tunnel --url http://127.0.0.1:8788
cloudflared tunnel --url http://127.0.0.1:8789
```

前端页面支持通过 URL 参数传入当前临时地址：

```text
https://<frontend>.trycloudflare.com/?signalingUrl=wss://<signaling>.trycloudflare.com&frameBaseUrl=https://<frame>.trycloudflare.com
```

---

## 当前限制

1. `MJPEG Stream` 可演示连续画面，但本质仍是连续图片，不是最终低延迟视频流。
2. `WebRTC Video` 已接入原型入口，但浏览器稳定播放仍需继续调试。
3. Cloudflare quick tunnel 地址是临时地址，不适合长期展示。
4. 当前主要支持单用户 MVP 演示，没有多用户调度。
5. 还没有 NVENC H.264 / H.265 编码链路。
6. 还没有正式鉴权，不应长期公开暴露。

---

## 后续计划

### 阶段一：稳定当前 demo

- 稳定 `Latest PNG` 和 `MJPEG Stream`；
- 优化相机控制；
- 固化 coarse / full / lod 模型切换；
- 整理一键启动脚本和日志。

### 阶段二：WebRTC + NVENC

目标链路：

```text
CUDA render frame
-> NVENC H.264 / H.265 encode
-> WebRTC video track
-> browser video element
```

### 阶段三：工程化部署

- 固定域名；
- HTTPS；
- 常驻服务；
- 崩溃自动拉起；
- 基础鉴权；
- GPU 使用监控；
- 简单并发限制。

---

## 总结

当前系统已经完成从浏览器交互到远程 A6000 服务器真实 CityGaussian 渲染的完整闭环。当前可演示链路为 `Latest PNG` 和 `MJPEG Stream`，后续工作将集中在 WebRTC/NVENC 接入、固定域名部署和服务常驻化。
