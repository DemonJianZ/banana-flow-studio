import base64
import requests
from pathlib import Path


API_URL = "http://192.168.20.30:8083/api/remove_watermark"
INPUT_IMAGE = "/home/ai/zhangjian/ai_studio_mvp/banana-flow-studio-dev/bananaflow/水印.png"
OUTPUT_IMAGE = "output.png"
TIMEOUT = 120


def file_to_data_url(image_path: str) -> str:
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"输入图片不存在: {image_path}")

    suffix = path.suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }
    mime_type = mime_map.get(suffix, "application/octet-stream")

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")

    return f"data:{mime_type};base64,{b64}"


def data_url_to_file(data_url: str, output_path: str) -> None:
    if not data_url.startswith("data:"):
        raise ValueError("返回内容不是合法的 Data URL")

    try:
        header, b64_data = data_url.split(",", 1)
    except ValueError as e:
        raise ValueError("Data URL 格式非法，缺少逗号分隔") from e

    if ";base64" not in header:
        raise ValueError("当前仅支持 base64 格式的 Data URL")

    image_bytes = base64.b64decode(b64_data)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    with open(out, "wb") as f:
        f.write(image_bytes)


def main():
    image_data_url = file_to_data_url(INPUT_IMAGE)

    payload = {
        "image": image_data_url,
        # 按需开启
        # "size": "1024x1024",
        # "aspect_ratio": "1:1",
    }

    resp = requests.post(API_URL, json=payload, timeout=TIMEOUT)

    print(f"HTTP status: {resp.status_code}")

    try:
        resp_data = resp.json()
    except Exception:
        print("响应不是合法 JSON：")
        print(resp.text)
        raise

    if not resp.ok:
        raise RuntimeError(f"接口调用失败: {resp_data}")

    result_image = resp_data.get("image")
    if not result_image:
        raise ValueError(f"响应中缺少 image 字段: {resp_data}")

    data_url_to_file(result_image, OUTPUT_IMAGE)
    print(f"输出图片已保存到: {OUTPUT_IMAGE}")


if __name__ == "__main__":
    main()