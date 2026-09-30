# 豆格 · Perler Studio

将 PNG / JPG / WebP 图片转换为 Perler 拼豆图纸，编辑后下载带网格、完整色号、行列坐标与备料清单的 PDF 或 PNG。

**React + TypeScript + Vite / Python + FastAPI + Pillow + NumPy + ReportLab。无需账号、数据库或 API Key。**

## 1. 环境要求

- 推荐 Python **3.12**，Node.js **22 LTS**，npm 10 或以上。Vite 要求 Node.js 20.19+ 或 22.12+。
- 首次安装依赖需要联网。安装完成后，转换、编辑、导出不依赖第三方在线服务。
- 建议使用近期 Chrome、Edge、Firefox 或 Safari。
- 解压 ZIP 后进入 `perler-studio` 根目录。下面的命令均从这里开始。

## 2. 本地启动：两个终端

### 终端 A：后端（macOS / Linux）

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
../.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Windows PowerShell：无需激活脚本，也无需修改执行策略。

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

检查后端：[健康状态](http://127.0.0.1:8000/api/health)，应返回 `"status":"ok"` 与 `"palette_count":117`。
交互式 API 文档：[Swagger](http://127.0.0.1:8000/docs)。

### 终端 B：前端（所有平台）

```bash
cd frontend
npm ci
npm run dev
```

打开 **[http://127.0.0.1:5173](http://127.0.0.1:5173)**。初始的小猫示例由真实后端转换，可直接编辑，也可上传自己的图片。

前端开发服务器将 `/api` 请求代理至 `127.0.0.1:8000`。这两个进程需要同时运行。

### 可选：更改端口

后端换端口时，复制 `frontend/.env.example` 为 `frontend/.env`，修改 `API_TARGET` 后重启 Vite。`VITE_API_BASE_URL` 适用于单独部署的 API；若跨域使用，需要通过 `CORS_ORIGINS` 配置准确的前端 Origin，多个地址用逗号分隔。

## 3. 使用流程

1. **上传图片**：点击或拖入 PNG / JPEG / WebP，最大 10 MB、2000 万原始像素。动画文件不支持。
2. **选择宽度**：29 格、58 格或自定义 8–200 格；滑动条与数值输入同步。高度保持原图比例，不能超过 200 格。
3. **设置匹配**：像素图采用最近邻；照片可用区域平均色。可限制最多 8 / 16 / 24 / 48 色，或使用完整 117 色；展开高级设置可限制为已有色号并调整透明门槛。
4. **生成与编辑**：画笔、擦除、取色、相连区域填充；水平/垂直镜像、旋转；批量替换或擦除某色；撤销/重做。生成参数变化后点击“生成图纸”才会重新转换。
5. **核对用量**：清单实时更新，点色号高亮位置；设置备用豆比例，CSV、PDF 的购买建议随之更新。
6. **保存与导出**：PDF 为总览 + 完整清单 + 分块图纸；PNG 为完整网格与图例。JSON 保存编辑矩阵，重新导入后继续编辑。

快捷键：`B` 画笔、`E` 擦除、`I` 取色、`F` 填充；`Ctrl/⌘ Z` 撤销，`Ctrl/⌘ Shift Z` 或 `Ctrl/⌘ Y` 重做。在输入框中不触发工具快捷键。Canvas 拖动一次对应一次撤销；触屏同样支持。无法精确点击时，可展开“按坐标修改单格”。

## 4. PDF 与尺寸说明

- **照图拼豆（默认）**：每格放大至 6 mm，完整 P 色号可读，按 29×29 格分块。用于照图计数，不是底板下方的等比例模板。
- **按底板钉距输出**：每格按用户填写的 2–10 mm 钉距输出。打印时选 **100% / 实际大小**，关闭“适合页面”，用尺子核对每页 **50 mm 标尺**。
- 实际尺寸以**底板钉距**为准，不由豆子直径直接推算。默认 2.6 mm 是用户项目的起始设置，并非对所有 Perler 底板的尺寸保证。
- 坐标从左上角的列 1、行 1 开始。PDF 每块标注绝对行列范围；粗网格线标示 29 格参考边界。
- 空格代表“不放豆”，白色 P01 是有实体豆的格子。PNG 是计数图纸，不定义物理打印比例。
- PDF 页面使用英文固定模板和附件原有英文豆色名称，嵌入随项目附带的 DejaVu Sans 字体，避免中文字体缺失产生乱码；网页和文档为中文。自定义图纸名保存在 JSON 和 PDF 元数据中。

## 5. 117 色来源与算法

`reference/Perler-Color-Chart.pdf` 是用户提供的附件原文件。`backend/app/data/perler117.json` 的 RGB 直接读取 PDF 的**矢量色块填充值**，不是截图取色或推测。117 个唯一色号、名称、页号和原 PDF SHA-256 均可追溯。

生成流程：EXIF 纠正 → RGBA 解码 → 等比例重采样 → 透明门槛判定 → 半透明有效像素与白底合成 → sRGB 转 CIELAB（D65）→ Delta E 76 最近邻 → 可选颜色数量限制 → 色号矩阵。

颜色数量限制采用确定性策略：先匹配所有允许色，再保留出现次数最多的 N 个色号，并重新映射。它用于降低备料复杂度，不保证在固定 N 色下达到全局最优误差。色盘限制只作用于重新生成；用户仍可在编辑时手动选取完整 117 色。

屏幕 RGB 是附件色块的近似参考；夜光、珠光、金属等特殊效果及批次差异不能用单一 RGB 准确呈现。本工具不宣称附件是品牌官方色彩测量数据。

可复现提取（从根目录运行；仅开发工具需要 pdfplumber）：

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python tools/extract_palette.py
```

Windows 将 `.venv/bin/python` 换成 `.\.venv\Scripts\python.exe`。提取脚本验证恰好 117 个唯一色号，失败即停止，不会悄悄补色。

## 6. 项目结构与复用

| 路径 | 职责 |
| --- | --- |
| `frontend/src/App.tsx` | 转换流程、编辑历史、工具与导出交互 |
| `frontend/src/PatternCanvas.tsx` | Canvas 渲染、连续画笔、区域填充、Pointer Events |
| `frontend/src/types.ts` | 数据契约、用量计算、JSON 导入验证 |
| `frontend/src/api.ts` | 错误处理、网络请求与下载 |
| `backend/app/main.py` | 薄 HTTP 接口层；OpenAPI 参数说明 |
| `backend/app/models.py` | Pydantic 图纸与导出参数验证 |
| `backend/app/limits.py` | 请求体大小约束 |
| `backend/app/services/color_math.py` | 可单独复用的 Lab 颜色计算与分块匹配 |
| `backend/app/services/conversion.py` | 图片解码与色号矩阵生成 |
| `backend/app/services/materials.py` | 后端用量统计、备用豆与 CSV |
| `backend/app/services/exports.py` | 与 HTTP 无关的 ReportLab / Pillow 图纸渲染 |
| `tools/extract_palette.py` | 从附件复现色盘 |
| `docs/DESIGN.md` | 用户需求出发点、逐项功能定义、交互与设计方案 |
| `docs/API.md` | API 调用示例和数据契约 |
| `docs/VALIDATION.md` | 实际验证结果及覆盖范围 |
| `examples/` | 原始示例图片及可查看的 PDF、PNG、JSON |

后端函数不依赖数据库、会话或全局用户状态；可以在其他 Python 项目中直接调用 `convert_image()`、`materials()`、`pdf_bytes()`、`png_bytes()`。API 返回标准矩阵，前端编辑不需要频繁请求后端。下载把**当前编辑后的矩阵**交给后端，不会重新处理原始图片。

## 7. 运行检查

后端（根目录装开发依赖，然后进入 `backend`）：

```bash
.venv/bin/python -m pip install -r backend/requirements-dev.txt
cd backend
../.venv/bin/python -m pytest -q
```

前端生产构建：

```bash
cd frontend
npm run build
```

浏览器端到端测试：从 `frontend` 运行下面的命令。测试会自动启动前后端，也会复用第 2 节已运行的服务：

```bash
npx playwright install chromium
npm run test:e2e
```

Linux 如提示系统依赖缺失，可按 Playwright 的提示安装浏览器依赖。测试默认连接本地 5173；可通过 `E2E_BASE_URL` 更改。只安装项目依赖和运行服务即可正常使用，Playwright 仅测试时需要。

## 8. 状态与边界

- 后端不保存原图、图纸、用户账户或业务记录；响应由内存生成。FastAPI 的 multipart 解析可能使用临时文件，结束请求时关闭清理，不是持久保存。
- 前端仅保留当前页面的状态。刷新/关闭会丢失未保存的编辑；请先保存 JSON。没有自动保存、数据库或 localStorage 记录。
- 单张最大 200×200 格；撤销历史最多 50 次。大图使用 Canvas；色号文字在缩小时可能较小，放大后查看，或导出默认 PDF。默认视图自动适应画布尺寸。
- 暂不包括智能抠图、图像内容识别、商业库存/价格查询、自动优化连通性、熨烫参数或作品熨烫安全保证。
- 生产部署时将 `frontend/dist` 由静态服务器提供，并把 `/api` 反向代理给 FastAPI。`npm run preview` 仅预览构建；若单独使用该预览，需要在构建前设置 `VITE_API_BASE_URL`。本交付面向本地运行，没有在线托管服务。

## 9. 常见问题

| 现象 | 处理 |
| --- | --- |
| 页面提示无法连接服务 | 确认终端 A 仍在运行，访问 `/api/health`；检查 `API_TARGET` 与端口 |
| 端口已被占用 | 停止旧进程或换端口，并同步代理配置 |
| 图片生成高度超过 200 格 | 减小图纸宽度；工具保持比例，不会强行拉伸原图 |
| 备料清单颜色太多 | 将“最多使用几种豆色”调小后重新生成，或批量换色 |
| 字体显示太小 | 工作台点“放大”，切到色号图纸；打印使用“照图拼豆”模式 |
| 透明背景变白 | 只有低于透明门槛的格子留空；半透明有效像素会与白底合成 |
| 镜像后 PDF 不一致 | 导出读取当前矩阵，镜像已包含在图纸里；无需再勾选一次镜像 |
| 导入 JSON 后不能重新生成 | JSON 保存的是编辑矩阵，不包含原图片；先重新上传原图 |

参考实现文档：[FastAPI 文件上传](https://fastapi.tiangolo.com/tutorial/request-files/)、[表单与文件](https://fastapi.tiangolo.com/tutorial/request-forms-and-files/)、[Pillow Image](https://pillow.readthedocs.io/en/stable/reference/Image.html)、[ReportLab](https://docs.reportlab.com/)。
