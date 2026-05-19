import React, { useState } from "react";
import { FileWarning } from "lucide-react";

const VideoPlayer = ({ src, className, controls = false, autoPlay = true, ...props }) => {
  const [error, setError] = useState(false);
  if (error)
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-100 text-slate-500 ${className}`}>
        <FileWarning className="w-6 h-6 mb-1 text-rose-500" />
        <span className="text-[10px]">视频加载失败</span>
      </div>
    );
  return (
    <video
      src={src}
      className={className}
      controls={controls}
      autoPlay={autoPlay}
      loop
      muted
      playsInline
      crossOrigin="anonymous"
      onError={() => setError(true)}
      {...props}
    />
  );
};

export default VideoPlayer;
