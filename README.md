# CityGS Remote Render MVP

## Spark Docker 交付版

本仓库当前可作为 **CityGS SparkJS 浏览器端 3DGS 查看器** 的 Docker 交付包。

已验证链路：

- Mac 本地下载 Hugging Face 模型资产。
- 构建 `linux/amd64` Docker 镜像。
- 导出离线包 `citygs-spark-amd64-docker-images.tar.gz`。
- 使用 `docker compose` 启动。
- 浏览器访问 `http://localhost:5173/?spark=1`，模型可正常加载。

模型资产不放在 GitHub 仓库中，统一放在 Hugging Face：

```text
https://huggingface.co/datasets/DGTXxx/citygs-spark-assets
```

Mac 本地构建说明：

```text
docs/mac-spark-docker-build.md
```

离线交付说明：

```text
docs/spark-docker-handoff.md
```

快速构建：

```bash
python3 -m pip install -U huggingface_hub hf_transfer
HF_HUB_ENABLE_HF_TRANSFER=1 hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public

NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
./scripts/export-spark-docker.sh

docker compose -f docker-compose.spark.yml up -d
```

访问：

```text
http://localhost:5173/?spark=1
```

---

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
├── examples/        # 可单独复用的实验方法和演示组件
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

### Docker 部署

如果只部署网页、signaling 和 Node.js worker，可以使用 Docker Compose：

```bash
docker compose --profile citygs up -d --build
```

该方式默认要求 CityGaussian render server 仍运行在宿主机
`9100/9101/9102` 端口，worker 容器通过 `host.docker.internal` 调用它们。
上次加的浏览器端 SparkJS / 3DGS 预览也包含在同一个前端镜像里，入口是
`http://服务器IP:5173/?spark=1`，模型资源通过 `frontend/public/models`
挂载到容器的 `/usr/share/nginx/html/models`。
无 GPU 渲染服务时，可用 mock worker 验证网页和信令链路：

```bash
docker compose --profile mock up -d --build
```

详细说明见：

```text
docs/docker-deployment.md
```

如果重点是上次加的 SparkJS / 浏览器端 3DGS 方法，并且希望模型也在
Docker 里一起迁移，使用 Spark 专用 compose：

```bash
docker compose -f docker-compose.spark.yml up -d --build
```

访问：

```text
http://服务器IP:5173/?spark=1
```

这条路线会构建两个镜像：

```text
citygs-spark-frontend:amd64
citygs-spark-models:amd64
```

可以用 `docker save | gzip` 压成一个离线包，但不要直接提交到 GitHub
普通仓库；更推荐推到 GHCR，或者小体积演示包放 GitHub Release。
参照 `campus-photo-collector` 的离线迁移方式，可直接运行：

```bash
./scripts/export-spark-docker.sh
```

详细交付说明见：

```text
docs/spark-docker-handoff.md
docs/mac-spark-docker-build.md
```

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
