# CityGS Remote Render MVP

面向 **CityGS / MatrixCity / 3D Gaussian Splatting** 的远程实时服务端渲染 MVP。

本项目验证的核心目标是：

> 用户在浏览器中控制相机视角，A6000 GPU 服务器加载已训练好的 CityGS / CityGaussian 模型，根据用户视角实时渲染，并把画面返回网页显示。

当前版本已经跑通真实服务端渲染闭环，并提供两种可演示画面返回方式：

- `Latest PNG`：请求最新渲染帧。
- `MJPEG Stream`：连续图像流，作为当前阶段可演示的视频流替代方案。

`WebRTC Video` 已接入原型入口，但浏览器稳定播放仍在开发中。最终目标是通过 WebRTC + NVENC 返回低延迟视频流。

---

## 当前链路

```text
Browser / React Frontend
  -> WebSocket signaling
  -> Node.js CityGS worker
  -> Python render_server
  -> CityGaussian CUDA rasterizer
  -> PNG / MJPEG / WebRTC prototype
  -> Browser display
```

浏览器负责：

- 显示渲染画面。
- 捕获鼠标拖动、滚轮、WASD/QE 等相机控制。
- 发送 `CameraPose` / `camera.control` 控制消息。
- 选择模型档位、分辨率、质量和显示模式。

A6000 服务器负责：

- 加载 CityGS / CityGaussian 模型。
- 接收相机参数。
- 调用 CUDA rasterizer 渲染当前视角。
- 通过图片帧、MJPEG 或 WebRTC 原型返回画面。

---

## 当前已实现

- React + TypeScript 前端页面。
- WebSocket signaling 服务。
- mock worker，用于协议和页面流程调试。
- CityGS worker，用于真实服务端渲染。
- 常驻 Python `render_server.py` 调用链路。
- 前端 orbit camera 控制。
- 鼠标拖动改变 yaw / pitch。
- 滚轮改变 radius。
- worker 将前端 camera pose 转换为 CityGaussian 相机参数。
- A6000 上真实 CUDA 渲染。
- `Latest PNG` 画面返回。
- `MJPEG Stream` 连续图像流返回。
- coarse / full / lod 三种模型档位。
- 分辨率、FPS、质量档位配置。
- Cloudflare Tunnel 临时公网预览。
- WebRTC 原型入口。
- TypeScript typecheck / build 通过。

---

## 当前真实渲染模型

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

- 日常演示优先使用 `coarse`。
- 高质量展示可切换 `full`。
- 质量档位 / LOD 演示可切换 `lod`。

---

## 项目结构

```text
citygs-remote-render-mvp/
├── frontend/        # React + TypeScript 前端
├── signaling/       # WebSocket 信令服务
├── worker/          # mock worker + CityGS worker
├── shared/          # 前后端共享协议类型
├── scripts/         # 启动脚本
├── docs/            # 架构和接入说明
└── README.md
```

关键文件：

```text
frontend/src/main.tsx             # 前端界面、相机控制、显示模式
frontend/src/signalingClient.ts    # signaling client
signaling/src/server.ts            # WebSocket signaling 服务
worker/src/mock-worker.ts          # mock worker
worker/src/citygs-worker.ts        # 调用真实 CityGS render_server 的 worker
shared/src/index.ts                # 协议定义
```

A6000 服务器上的 CityGaussian 关键文件：

```text
/root/ftl/CityGaussian/render_server.py
/root/ftl/CityGaussian/render_one_frame.py
/root/ftl/CityGaussian/render_webrtc_server.py
/root/ftl/CityGaussian/viewer.py
```

---

## 启动方式

以下命令默认在 A6000 服务器上执行。

### 1. 启动 render server

快速演示模型：

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-render-coarse.sh
```

高质量完整模型：

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-render-full.sh
```

LOD 模型：

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-render-lod.sh
```

同时启动 coarse / full / lod：

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

### 2. 启动 signaling

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-signaling.sh
```

默认监听：

```text
ws://127.0.0.1:8788
```

### 3. 启动 CityGS worker

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

### 4. 启动 frontend

```bash
cd /root/Projects/citygs-remote-render-mvp
./scripts/start-frontend.sh
```

默认监听：

```text
http://127.0.0.1:5173
```

---

## 公网预览

当前可以用 Cloudflare Tunnel 临时预览。

### frontend

```bash
cloudflared tunnel --url http://127.0.0.1:5173
```

### signaling

```bash
cloudflared tunnel --url http://127.0.0.1:8788
```

### frame server

```bash
cloudflared tunnel --url http://127.0.0.1:8789
```

前端页面支持通过 URL 参数传入当前临时地址：

```text
https://<frontend>.trycloudflare.com/?signalingUrl=wss://<signaling>.trycloudflare.com&frameBaseUrl=https://<frame>.trycloudflare.com
```

页面里也可以手动填写：

```text
Signaling URL  -> wss://<signaling-tunnel>.trycloudflare.com
Frame base URL -> https://<frame-tunnel>.trycloudflare.com
```

---

## 当前限制

当前项目是 MVP 演示系统，还不是生产部署。

主要限制：

1. **MJPEG 不是最终视频流方案**
   - 当前 `MJPEG Stream` 可演示连续画面。
   - 但本质仍是连续图片，带宽和延迟不如 WebRTC。

2. **WebRTC 仍是原型**
   - 前端已有 `WebRTC Video` 入口。
   - 服务端已有 `render_webrtc_server.py` 启动脚本。
   - 浏览器稳定播放、ICE/网络兼容、编码链路仍需继续调试。

3. **Cloudflare quick tunnel 是临时地址**
   - 每次重启 tunnel 可能变化。
   - 最终需要固定域名、HTTPS 和正式反向代理 / 命名隧道。

4. **当前面向单用户演示**
   - 还没有多用户调度。
   - 还没有 GPU 资源隔离。
   - 还没有访问控制。

5. **还没有 NVENC 编码链路**
   - 当前还没有接入 H.264 / H.265 硬件编码。
   - WebRTC 最终应结合 NVENC 提升延迟和带宽表现。

---

## 后续路线

### Phase 1：稳定当前 demo

```text
Browser camera control
-> signaling
-> CityGS worker
-> render_server
-> Latest PNG / MJPEG Stream
```

目标：

- 稳定 MJPEG 演示。
- 优化相机控制手感。
- 固化 coarse / full / lod 切换。
- 整理一键启动脚本。

### Phase 2：正式 WebRTC 视频流

目标链路：

```text
CityGaussian CUDA render
-> GPU frame buffer
-> NVENC H.264 / H.265 encode
-> WebRTC video track
-> Browser video element
```

控制通道：

```text
Browser camera input
-> signaling / WebRTC DataChannel
-> GPU render worker
```

### Phase 3：工程化部署

目标：

- 固定域名。
- HTTPS。
- 常驻服务。
- 崩溃自动拉起。
- 基础鉴权。
- GPU 使用监控。
- 简单并发限制。

---

## 一句话总结

> 本项目实现了一个 CityGS 远程服务端渲染 MVP：用户在浏览器端操作相机，A6000 GPU 服务器加载 CityGaussian 模型并进行 CUDA 渲染，将结果通过 PNG / MJPEG / WebRTC 原型返回网页。当前可演示链路为 Latest PNG 和 MJPEG Stream，后续将升级为基于 NVENC 和 WebRTC 的低延迟视频流系统。
