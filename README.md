# CityGS Spark Docker

CityGS / MatrixCity 的浏览器端 3D Gaussian Splatting 查看器，基于
SparkJS 和 Three.js。这个仓库只保留 Spark 查看器和 Docker 交付相关文件，
用于迁移、演示和服务器部署。

模型文件不提交到 GitHub，统一放在 Hugging Face：

```text
https://huggingface.co/datasets/DGTXxx/citygs-spark-assets
```

## 功能

- 浏览器端加载 `.ply` / `.spz` 3DGS 模型。
- 模型档位切换：200k、1000k、3000k、Coarse、LOD 1/2/3、Full。
- 视角预设：城市总览、俯视结构、低空斜看、侧向观察。
- 自定义 `Splat URL` 加载。
- 状态、FPS、splat 数量、模型体积和加载耗时显示。
- Docker 双镜像交付：前端镜像 + 模型资源镜像。
- 支持导出 `linux/amd64` 离线 Docker 包。

## 目录

```text
.
├── docker-compose.spark.yml
├── frontend/
│   ├── Dockerfile.spark
│   ├── nginx.spark.conf
│   ├── public/
│   │   ├── Dockerfile.spark-models
│   │   └── nginx.spark-models.conf
│   └── src/
│       ├── SparkDemo.tsx
│       ├── main.tsx
│       └── styles.css
├── scripts/
│   └── export-spark-docker.sh
└── docs/
    ├── mac-spark-docker-build.md
    └── spark-docker-handoff.md
```

## Mac 本地快速运行

安装 Docker Desktop 后，在项目根目录下载模型：

```bash
python3 -m pip install -U huggingface_hub hf_transfer
HF_HUB_ENABLE_HF_TRANSFER=1 hf download DGTXxx/citygs-spark-assets \
  --repo-type dataset \
  --include "models/*" \
  --local-dir frontend/public
```

确认模型目录存在：

```bash
du -sh frontend/public/models
ls frontend/public/models | head
```

构建 amd64 Docker 离线包：

```bash
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
NGINX_IMAGE=docker.m.daocloud.io/library/nginx:1.27-alpine \
./scripts/export-spark-docker.sh
```

本地启动：

```bash
docker compose -f docker-compose.spark.yml up -d
```

访问：

```text
http://localhost:5173/
```

停止：

```bash
docker compose -f docker-compose.spark.yml down
```

## 离线部署

构建完成后会生成：

```text
citygs-spark-amd64-docker-images.tar.gz
```

把下面两个文件拷到目标服务器：

```text
citygs-spark-amd64-docker-images.tar.gz
docker-compose.spark.yml
```

目标服务器执行：

```bash
docker load -i citygs-spark-amd64-docker-images.tar.gz
docker compose -f docker-compose.spark.yml up -d
```

访问：

```text
http://SERVER_IP:5173/
```

## 文档

- Mac 本地构建：`docs/mac-spark-docker-build.md`
- 离线交付：`docs/spark-docker-handoff.md`

