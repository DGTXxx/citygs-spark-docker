# CityGS Remote Render MVP

一个面向 **CityGS / MatrixCity / 3D Gaussian Splatting** 的远程实时服务端渲染 MVP。

本项目验证的核心目标是：

> 用户在浏览器中控制相机视角，远程 A6000 GPU 服务器加载已训练好的 CityGS 模型，根据用户视角实时渲染，并把结果返回网页显示。

当前版本还不是最终 WebRTC 视频流系统，而是一个更容易调试的第一阶段闭环：

```text
Web 前端相机控制
  → WebSocket signaling
  → Node.js CityGS worker
  → 常驻 Python render_server
  → CityGaussian CUDA rasterizer
  → PNG frame
  → 前端刷新显示
```

---

## 1. 系统架构

```text
Browser / React Frontend
  ├─ 显示 CityGS 渲染图
  ├─ 捕获鼠标拖动、滚轮、WASD/QE
  └─ 发送 CameraPose / camera.control
          ↓ WebSocket
Signaling Service
  ├─ 创建 session
  ├─ 分配 worker
  └─ 转发 client ↔ worker 消息
          ↓ WebSocket
CityGS Worker (Node.js)
  ├─ 接收 camera.control
  ├─ 将 orbit camera pose 转成 CityGaussian R/T/FoVx/FoVy
  ├─ 调用常驻 render_server HTTP API
  ├─ 暴露 /frame.png 图片服务
  └─ 回传 render stats + imageUrl
          ↓ HTTP POST
CityGaussian Render Server (Python)
  ├─ 启动时加载 point_cloud.ply 一次
  ├─ 构造 ViewerCam
  ├─ 调用 diff_gaussian_rasterization CUDA 光栅化器
  └─ 输出 PNG frame
          ↓
A6000 GPU / CUDA Rendering
```

---

## 2. 当前实现状态

### 已完成

- React + TypeScript 前端页面
- WebSocket signaling 服务
- mock worker
- CityGS worker
- 常驻 Python `render_server.py`
- 前端 orbit camera 控制
- 鼠标拖动改变 yaw / pitch
- 滚轮改变 radius
- worker 将前端 camera pose 转为 CityGaussian 相机参数
- CityGaussian 真实 CUDA 渲染
- PNG frame 返回网页显示
- Cloudflare Tunnel 公网预览支持
- TypeScript typecheck / build 通过

### 当前真实渲染模型

调试模型：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_coarse
```

完整模型候选：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_c36
```

对应完整点云：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_c36/point_cloud/iteration_30000/point_cloud.ply
```

### 当前性能参考

在 A6000 服务器上，`mc_aerial_coarse` 单帧渲染约：

```text
renderMs ≈ 130–180 ms
end-to-end latency ≈ 250–300 ms
GPU memory ≈ 4–5 GB
```

---

## 3. 项目结构

```text
citygs-remote-render-mvp/
├── frontend/        # React + TypeScript 前端
├── signaling/       # WebSocket 信令服务
├── worker/          # mock worker + CityGS worker
├── shared/          # 前后端共享协议类型
├── docs/            # 架构、接入、说明
└── README.md
```

关键文件：

```text
frontend/src/main.tsx             # 前端界面和 orbit camera 控制
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
/root/ftl/CityGaussian/viewer.py
```

---

## 4. 如何启动

以下命令默认在 A6000 服务器上执行。

### 4.1 启动 CityGaussian render server

```bash
cd /root/ftl/CityGaussian
conda run -n citygs python render_server.py \
  --model output_v1/mc_aerial_coarse \
  --host 127.0.0.1 \
  --port 9100
```

### 4.2 启动 signaling

```bash
cd /root/Projects/citygs-remote-render-mvp
npm run dev:signaling
```

默认监听：

```text
ws://127.0.0.1:8788
```

### 4.3 启动 CityGS worker

```bash
cd /root/Projects/citygs-remote-render-mvp
npm --workspace @citygs/worker run dev:citygs
```

默认行为：

- 连接 `ws://localhost:8788`
- 调用 `http://127.0.0.1:9100/render`
- 暴露 PNG：`http://127.0.0.1:8789/frame.png`

可选环境变量：

```bash
SIGNALING_URL=ws://localhost:8788
CITYGS_RENDER_SERVER_URL=http://127.0.0.1:9100/render
CITYGS_FRAME_SERVER_PORT=8789
CITYGS_PUBLIC_FRAME_BASE_URL=http://127.0.0.1:8789
CITYGS_MIN_RENDER_INTERVAL_MS=500
```

### 4.4 启动 frontend

```bash
cd /root/Projects/citygs-remote-render-mvp
npm run dev:frontend
```

默认监听：

```text
http://127.0.0.1:5173
```

---

## 5. 公网预览方式

当前可以用 Cloudflare Tunnel 暴露三个服务。

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

然后在前端页面填写：

```text
Signaling URL:
wss://<signaling-tunnel>.trycloudflare.com

Frame base URL:
https://<frame-tunnel>.trycloudflare.com
```

点击：

1. `Connect signaling`
2. `Start session`
3. 鼠标拖动 / 滚轮缩放

即可看到 A6000 服务器渲染的 CityGS PNG 图像刷新。

---

## 6. 当前限制

当前 MVP 是“可交互 PNG 刷新”版本，不是最终生产系统。

主要限制：

1. **不是 WebRTC 视频流**
   - 当前通过 PNG 文件刷新显示。
   - 延迟和流畅度不如视频流。

2. **相机控制是最小 orbit camera**
   - 已能拖动改变视角。
   - 但还不是完整 viewer 级别的自由漫游。

3. **Cloudflare trycloudflare 地址是临时地址**
   - 每次重启 tunnel 可能变化。
   - 后续需要正式域名或固定 tunnel。

4. **当前只适合单用户 MVP 演示**
   - 没有多用户调度。
   - 没有 session 资源隔离。

5. **还没有 NVENC 编码**
   - 当前没有 H.264 / AV1 硬件编码。

6. **还没有权限系统**
   - 公网预览地址应只用于临时测试。
   - 不建议长期公开暴露。

---

## 7. 后续 WebRTC 计划

最终目标是把当前 PNG 刷新链路升级为真正的低延迟远程渲染系统。

### Phase 1：当前已完成

```text
Browser camera control
→ signaling
→ CityGS worker
→ render_server
→ PNG frame preview
```

作用：

- 验证前端控制链路
- 验证 A6000 真实 CityGS 渲染链路
- 验证服务器端渲染结果能返回网页

### Phase 2：改成连续图像流

可选方案：

- MJPEG stream
- WebSocket binary image frames
- HTTP frame polling 优化

目标：

```text
比 PNG 文件刷新更流畅，但仍保持实现简单。
```

### Phase 3：接入 NVENC + WebRTC

目标链路：

```text
CityGaussian CUDA render
→ GPU frame buffer
→ NVENC H.264 / AV1 encode
→ WebRTC video track
→ Browser video element
```

控制通道：

```text
Browser camera input
→ WebRTC DataChannel
→ GPU worker
```

优势：

- 更低延迟
- 更高帧率
- 更适合公网访问
- 更接近云游戏 / Pixel Streaming 架构

### Phase 4：工程化部署

后续可加入：

- 固定域名 + HTTPS
- 鉴权
- TURN fallback
- 多模型选择
- 多用户 session
- GPU 资源监控
- 完整 `mc_aerial_c36` 模型演示
- Kubernetes / 调度系统

---

## 8. 用一句话总结

> 本项目实现了一个 CityGS 远程服务端渲染 MVP：用户在浏览器端操作相机，远程 A6000 GPU 服务器加载 CityGaussian 模型并进行 CUDA 渲染，将渲染结果返回网页显示。当前版本已完成真实渲染闭环，后续将进一步升级为基于 NVENC 和 WebRTC 的低延迟视频流传输系统。
