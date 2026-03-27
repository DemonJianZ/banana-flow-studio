#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# clip 1 (HOOK_001) missing primary_asset, skipped
# clip 2 (VIEW_001) missing primary_asset, skipped
# clip 3 (STEPS_001) missing primary_asset, skipped
# clip 4 (STEPS_002) missing primary_asset, skipped
# clip 5 (STEPS_003) missing primary_asset, skipped
# clip 6 (PRODUCT_001) missing primary_asset, skipped
# clip 7 (CTA_001) missing primary_asset, skipped

if [ ! -s "concat_list.txt" ]; then
  echo "No valid segments to concat."
  exit 1
fi

# concat 优先 copy；失败时 fallback 重新编码
if ffmpeg -y -f concat -safe 0 -i concat_list.txt -c copy output.mp4; then
  echo "concat copy success: output.mp4"
else
  ffmpeg -y -f concat -safe 0 -i concat_list.txt -c:v libx264 -preset veryfast -crf 23 -r 30 -pix_fmt yuv420p -an output.mp4
fi

echo "done: output.mp4"
