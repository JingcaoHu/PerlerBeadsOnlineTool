# API 与数据契约

API 默认地址 `http://127.0.0.1:8000`。Swagger `/docs`、OpenAPI `/openapi.json`。无需鉴权，面向本机开发；公开部署需自行配置访问控制和代理限流。

## 端点

| 方法 / 路径 | 输入 | 输出 |
| --- | --- | --- |
| GET `/api/health` | 无 | 服务状态与色盘数量 |
| GET `/api/palette` | 无 | 色盘来源、提取方法、117 个 code/name/hex/rgb/source_page |
| POST `/api/convert` | multipart 图片和参数 | Pattern JSON |
| POST `/api/export/pdf` | ExportRequest JSON | `application/pdf`，含下载文件名 |
| POST `/api/export/png` | ExportRequest JSON | `image/png`，含下载文件名 |
| POST `/api/export/csv` | ExportRequest JSON | 带 UTF-8 BOM 的 CSV，便于 Excel 打开 |

## 生成参数

| 字段 | 类型 / 默认值 | 定义 |
| --- | --- | --- |
| image | 上传文件，必填 | PNG/JPEG/WebP 静态图；最大 10 MB、2000 万像素 |
| width | int，29 为前端默认，48 为 API 默认 | 8–200；高度按比例计算，最大 200 |
| resample | `nearest` / `box`，默认 nearest | 清晰像素边缘 / 区域平均色 |
| alpha_threshold | int，128 | 1–255；透明值小于门槛时该格为 null |
| max_colors | int，117 | 1–117；自动转换最终使用的色号上限 |
| allowed_codes | JSON 字符串，可省略 | 非空有效色号数组；最多 117 项；省略则全部色盘 |

```bash
curl -X POST http://127.0.0.1:8000/api/convert \
  -F 'image=@examples/demo-cat.png' \
  -F 'width=29' \
  -F 'resample=nearest' \
  -F 'max_colors=16' \
  -F 'allowed_codes=["P01","P18","P33","P10"]'
```

## Pattern

```json
{
  "version": 1,
  "name": "示例图纸",
  "width": 3,
  "height": 2,
  "cells": [["P01", null, "P05"], ["P18", "P33", "P10"]]
}
```

- `cells[y][x]`，行优先，数组下标从 0 开始；可见图纸坐标从 1 开始。
- `null` 是空钉位；`P01` 是白豆。
- 矩阵必须精确匹配 width/height，均为 1–200；单图不超过 40000 格。
- 色号必须属于当前附件色盘。不会接受任意 HEX 作为实体色号。
- name 最多 80 字符，PDF 元数据与 JSON 可以保存中文。

## ExportRequest

```json
{
  "pattern": {"version": 1, "name": "示例", "width": 2, "height": 1, "cells": [["P01", "P18"]]},
  "mode": "readable",
  "bead_mm": 2.6,
  "show_codes": true,
  "monochrome": false,
  "spare_percent": 10
}
```

| 字段 | 定义 |
| --- | --- |
| mode | `readable`：6 mm 格、29 格分块；`actual`：按 bead_mm 输出，每页最多 58 格且自动适配纸宽 |
| bead_mm | 2–10 mm，实际指**底板钉距**；默认 2.6；用于实际打印和成品尺寸估计 |
| show_codes | PDF/PNG 是否在格子里写完整 P 色号 |
| monochrome | 图纸格子白底黑字；备料色块仍显示参考色以便对照 |
| spare_percent | 0–50，备用量；每色 `ceil(count × (1 + spare_percent/100))` |

CSV 只使用 pattern 与 spare_percent，其他字段不改变用量。后端从矩阵重新计算用量，不信任前端自报数量。

## 错误

| 状态码 | 条件 |
| --- | --- |
| 400 | 文件损坏/不支持/动画、比例高度超限、无有效选色 |
| 413 | 请求体过大；保留约 256 KB 的 multipart 封装余量 |
| 422 | 参数类型/范围错误、未知色号、矩阵维度错误、色号列表格式错误 |

所有前端请求采用统一错误处理，显示可理解的提示；失败保留已有图纸。上传和导出不创建长期存储的文件。
