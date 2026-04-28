# CityGS 远程实时服务端渲染 MVP 说明

## 1. 项目目标

本项目面向 CityGS / MatrixCity / 3D Gaussian Splatting 的远程实时浏览需求，目标是构建一个服务端渲染系统：

- 用户通过网页查看城市级 3DGS 场景；
- 用户在网页中拖动鼠标、滚动滚轮控制视角；
- 远程 A6000 GPU 服务器负责加载 CityGaussian 模型并执行 CUDA 渲染；
- 渲染结果返回浏览器显示；
- 后续升级为 NVENC + WebRTC 的低延迟视频流。

当前阶段不做用户上传图片和在线训练。模型由服务器提前离线训练好，系统聚焦于 **server-side rendering**。

---

## 2. 系统架构

当前 MVP 架构如下：

```text
浏览器前端
  ↓ camera.control
WebSocket signaling
  ↓
CityGS Node worker
  ↓ HTTP POST /render
Python render_server
  ↓
CityGaussian + diff_gaussian_rasterization
  ↓
A6000 CUDA 渲染
  ↓
PNG frame
  ↓
前端网页显示
```

### 前端

- React + TypeScript + Vite；
- 显示渲染图像；
- 捕获鼠标拖动、滚轮和键盘输入；
- 维护最小 orbit camera；
- 将相机姿态发送到 worker。

### Signaling 服务

- Node.js WebSocket 服务；
- 创建 session；
- 分配 worker；
- 转发 client 与 worker 之间的消息。

### CityGS Worker

- Node.js 进程；
- 接收前端相机参数；
- 将 orbit camera 转为 CityGaussian 需要的 R/T/FoVx/FoVy；
- 调用 Python render_server；
- 提供 `/frame.png` 给前端刷新显示。

### Render Server

- Python 常驻服务；
- 启动时加载 CityGaussian 模型一次；
- 每次收到相机参数后渲染一帧；
- 输出 PNG 图像和渲染耗时。

---

## 3. 当前实现进展

目前已经完成第一版真实渲染闭环。

已完成内容：

1. 前端页面；
2. WebSocket signaling；
3. mock worker；
4. CityGS worker；
5. CityGaussian 单帧渲染脚本；
6. 常驻 Python render_server；
7. 前端 orbit camera；
8. worker 相机参数转换；
9. 服务器端真实 CUDA 渲染；
10. PNG 图像返回网页显示；
11. Cloudflare Tunnel 公网预览。

当前可以实现：

```text
网页拖动视角 → A6000 服务器渲染 → 网页显示新视角图片
```

---

## 4. 当前模型与环境

服务器：

```text
GPU: NVIDIA RTX A6000 48GB
Driver: 535.183.06
PyTorch: 2.0.1 + CUDA 11.8
Renderer: CityGaussian + diff_gaussian_rasterization
```

调试模型：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_coarse
```

高质量完整模型：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_c36
```

当前决策：默认演示使用 coarse，完整模型作为高质量可选展示。

完整点云：

```text
/root/ftl/CityGaussian/output_v1/mc_aerial_c36/point_cloud/iteration_30000/point_cloud.ply
```

完整模型测试结果：

```text
load time ≈ 25.1 s
steady GPU memory ≈ 9.0 GB
after render GPU memory ≈ 13.3 GB
renderMs ≈ 120–220 ms
Cloudflare latency ≈ 130–300 ms
CUDA OOM: no
```

对比 coarse：full 质量更高，但加载时间和显存占用明显更大。因此当前默认保持 coarse，full 用于高质量展示。

---

## 5. 如何启动

### 5.1 render_server

默认 coarse 模型：

```bash
cd /root/ftl/CityGaussian
conda run -n citygs python render_server.py \
  --model output_v1/mc_aerial_coarse \
  --host 127.0.0.1 \
  --port 9100
```

高质量 full 模型：

```bash
cd /root/ftl/CityGaussian
conda run -n citygs python render_server.py \
  --model output_v1/mc_aerial_c36 \
  --host 127.0.0.1 \
  --port 9100
```

### 5.2 signaling

```bash
cd /root/Projects/citygs-remote-render-mvp
npm run dev:signaling
```

### 5.3 CityGS worker

```bash
cd /root/Projects/citygs-remote-render-mvp
npm --workspace @citygs/worker run dev:citygs
```

### 5.4 frontend

```bash
cd /root/Projects/citygs-remote-render-mvp
npm run dev:frontend
```

### 5.5 公网预览

分别暴露：

```bash
cloudflared tunnel --url http://127.0.0.1:5173
cloudflared tunnel --url http://127.0.0.1:8788
cloudflared tunnel --url http://127.0.0.1:8789
```

前端填写：

```text
Signaling URL: wss://<signaling>.trycloudflare.com
Frame base URL: https://<frame>.trycloudflare.com
```

---

## 6. 当前限制

1. 当前还不是 WebRTC 视频流，只是 PNG 刷新。
2. 相机控制是最小 orbit camera，尚未达到完整 viewer 的自由漫游体验。
3. trycloudflare 地址是临时地址，不适合长期展示。
4. 当前主要支持单用户演示，没有多用户调度。
5. 没有 NVENC H.264 / AV1 编码。
6. 没有正式鉴权，不应长期公开暴露。
7. 当前默认使用 coarse 模型；完整 `mc_aerial_c36` 已验证可运行，但加载更慢、显存占用更高。

---

## 7. 后续 WebRTC 计划

### 阶段一：当前 PNG MVP

目标是验证：

- 前端控制链路；
- 服务器真实渲染链路；
- 渲染结果回传网页。

该阶段已经完成。

### 阶段二：连续图像流

在 WebRTC 前，可以先做：

- MJPEG；
- WebSocket binary frames；
- 更高效的图像刷新。

目标是提高交互流畅度。

### 阶段三：WebRTC + NVENC

最终系统应升级为：

```text
CUDA render frame
→ NVENC H.264 / AV1 encode
→ WebRTC video track
→ browser video element
```

相机控制通过：

```text
WebRTC DataChannel
```

优势：

- 低延迟；
- 更高帧率；
- 浏览器原生支持；
- 更接近云游戏/Pixel Streaming 架构。

### 阶段四：生产化

后续可加入：

- 固定域名；
- HTTPS；
- 用户鉴权；
- TURN fallback；
- 多模型选择；
- 多用户 session；
- GPU 监控；
- Kubernetes 调度。

---

## 8. 总结

当前系统已经完成从浏览器交互到远程 A6000 服务器真实 CityGaussian 渲染的完整闭环。虽然当前返回方式仍是 PNG 刷新，但它验证了服务端渲染系统的关键路径：前端相机控制、信令转发、GPU worker、CityGaussian CUDA 渲染和网页显示。后续工作将集中在图像流传输优化、WebRTC/NVENC 接入和完整模型演示。
