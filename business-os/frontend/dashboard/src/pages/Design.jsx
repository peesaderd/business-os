import React from 'react';

export default function Design() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="os-window-header">
        <span className="os-window-dot red" />
        <span className="os-window-dot yellow" />
        <span className="os-window-dot green" />
        <span className="text-sm font-medium ml-2">Open Design AI</span>
      </div>
      <iframe
        src="http://89.167.82.205:7456/"
        className="w-full h-[calc(100%-41px)] rounded-b-xl"
        title="Open Design"
        sandbox="allow-scripts allow-same-origin allow-forms"
      />
    </div>
  );
}
