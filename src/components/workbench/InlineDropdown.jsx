import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { EMPTY_LIST } from "../../constants/workbench.jsx";

const InlineDropdown = ({
  value,
  options = EMPTY_LIST,
  onChange,
  placeholder = "请选择",
  className = "",
  panelClassName = "",
  onMouseDown,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
    };
  }, [open]);

  const normalizedOptions = options.map((item) =>
    typeof item === "object"
      ? {
          value: String(item?.value ?? ""),
          label: String(item?.label ?? item?.value ?? ""),
        }
      : {
          value: String(item ?? ""),
          label: String(item ?? ""),
        },
  );
  const selectedOption =
    normalizedOptions.find((item) => String(item.value) === String(value ?? "")) || null;

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onMouseDown={(event) => {
        event.stopPropagation();
        onMouseDown?.(event);
      }}
    >
      <button
        type="button"
        className={`flex h-10 w-full items-center justify-between rounded-[10px] border border-[#E5E7EB] bg-white px-3 text-[12px] text-slate-700 outline-none transition hover:border-slate-300 ${open ? "border-cyan-300 shadow-[0_0_0_4px_rgba(34,211,238,0.12)]" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className={`truncate ${selectedOption ? "text-slate-700" : "text-slate-400"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div
          className={`absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-[12px] border border-[#E5E7EB] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] animate-in fade-in slide-in-from-top-1 duration-150 ${panelClassName}`}
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {normalizedOptions.map((item) => {
              const isSelected = String(item.value) === String(value ?? "");
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`flex h-9 w-full items-center px-3 text-left text-[12px] transition-colors ${
                    isSelected
                      ? "bg-[rgba(59,130,246,0.10)] text-cyan-700"
                      : "text-slate-700 hover:bg-[#F3F4F6]"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange?.(item.value);
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default InlineDropdown;
