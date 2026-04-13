import React, { useEffect, useRef } from "react";
import CanvasBlock from "./CanvasBlock";

export default function MessageList({
  turns = [],
  steps = [],
  onRetry,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  return (
    <div className="p-4 md:p-5 space-y-4">
      {turns.map((turn) => (
        <CanvasBlock
          key={turn.id}
          turn={turn}
          steps={steps}
          onRetry={onRetry}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
