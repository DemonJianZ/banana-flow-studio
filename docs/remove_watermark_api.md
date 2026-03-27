# Remove Watermark API 对接文档

## 1. 接口信息

- 接口名称: 去水印
- 方法: `POST`
- 路径: `/api/remove_watermark`
- Content-Type: `application/json`
- 鉴权: 后端为可选用户态（`_get_current_user_optional`），是否强制鉴权取决于你们部署网关策略

示例完整地址:

- `http://<server-host>:8083/api/remove_watermark`

## 2. 请求参数

请求体 JSON:

```json
{
  "image": "data:image/png;base64,...",
  "size": "1024x1024",
  "aspect_ratio": "1:1"
}
```

字段说明:

- `image` `string` 必填
  - 仅支持 `Data URL` 格式（例如 `data:image/png;base64,xxxx`）
  - 不能为空
- `size` `string` 可选
  - 输入预处理尺寸，常见值: `1024x1024`、`1K`、`2K`、`4K`
  - 不传则按原图处理
- `aspect_ratio` `string` 可选
  - 输入预处理宽高比，常见值: `1:1`、`16:9`、`9:16`、`4:3`、`3:4`
  - 不传则按原图比例处理

## 3. 成功响应

HTTP `200 OK`

```json
{
  "image": "data:image/png;base64,..."
}
```

字段说明:

- `image` `string`
  - 去水印后的图片，返回 `Data URL` 格式，可直接用于前端 `<img src="...">`

## 4. 错误响应

常见错误码:

- `422 Unprocessable Entity`
  - 请求体字段缺失或类型不合法（例如未传 `image`）
- `500 Internal Server Error`
  - 工作流执行失败、下游 ComfyUI 异常、或后端处理异常

错误体示例:

```json
{
  "detail": "具体错误信息"
}
```

## 5. 调用示例

### 5.1 curl

```bash
curl -X POST "http://<server-host>:8083/api/remove_watermark" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/png;base64,iVBORw0KGgoAAA...",
    "size": "1024x1024",
    "aspect_ratio": "1:1"
  }'
```

### 5.2 JavaScript (fetch)

```javascript
async function removeWatermark(apiBase, imageDataUrl) {
  const resp = await fetch(`${apiBase}/api/remove_watermark`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageDataUrl,
      size: "1024x1024",
      aspect_ratio: "1:1"
    })
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data?.detail || "remove_watermark failed");
  }
  return data.image; // Data URL
}
```

## 6. 对接注意事项

- 服务间调用（后端到后端）不受浏览器 CORS 限制；浏览器直调需要确保调用方域名在 CORS 白名单中。
- 图片建议控制在合理大小，避免请求体过大导致网络超时。
- 接口是同步返回，耗时取决于 ComfyUI 推理速度，调用方应设置足够超时（建议 >= 60s）。
- 返回为 `Data URL`，如果需要文件流或对象存储 URL，请在调用方自行转存。

## 7. 联调检查清单

- 后端监听地址可被调用方机器访问（`0.0.0.0:<PORT>` + 防火墙放行）。
- 调用方传入的是合法 `data:image/...;base64,...`。
- 网关/反向代理未拦截大体积 JSON 请求。
- 若浏览器直调，已配置 CORS 白名单。

