import React from "react";

const SidebarBtn = ({
  icon,
  itemId = "",
  label,
  desc,
  onClick,
  color,
  bg,
  active = false,
  compact = false,
  onHoverChange,
  category = "",
  primary = false,
  menuTrigger = false,
}) => {
  const IconComponent = icon;
  const iconNudgeXMap = {
    workflow_bundle: 0,
  };
  const iconNudgeX = iconNudgeXMap[itemId] ?? 0;
  return (
    <button
      onClick={(event) => onClick?.(event)}
      onMouseEnter={(event) => onHoverChange?.(true, event.currentTarget)}
      onMouseLeave={() => onHoverChange?.(false)}
      aria-label={label}
      data-sidebar-workflow-trigger={menuTrigger ? "true" : undefined}
      className={`group relative flex items-center justify-center rounded-full border text-left transition-all duration-200 ${
        primary
          ? `h-10 w-10 border-[rgba(169,211,126,0.75)] bg-[#A9D37E] text-slate-900 shadow-[0_8px_18px_rgba(126,184,74,0.16)] ${
              active ? "ring-1 ring-[#DCEBC8]" : "hover:brightness-[0.985]"
            }`
          : `${compact ? "h-8 w-8" : "h-10 w-10"} border-transparent ${
              active
                ? "bg-[#EEF1F4] text-slate-700"
                : "bg-transparent text-[#6B7280] hover:bg-[#EAECEF] hover:text-slate-800 active:bg-[#E1E5E9]"
            }`
      }`}
    >
      <span className="flex h-6 w-6 items-center justify-center">
        {IconComponent
          ? React.createElement(IconComponent, {
              className: primary ? "h-[18px] w-[18px]" : "h-[18px] w-[18px]",
              strokeWidth: 2.2,
              style: iconNudgeX ? { transform: `translateX(${iconNudgeX}px)` } : undefined,
            })
          : null}
      </span>
    </button>
  );
};

export default SidebarBtn;
