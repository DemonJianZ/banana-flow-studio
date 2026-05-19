import React from "react";

const ToolIconBtn = ({ icon, onClick, disabled, active, title }) => {
  const IconComponent = icon;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        disabled
          ? "text-slate-600 cursor-not-allowed"
          : active
          ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {IconComponent ? React.createElement(IconComponent, { className: "w-4 h-4" }) : null}
    </button>
  );
};

export default ToolIconBtn;
