import React from 'react';

export function TrustLoopzLogo({ className = "h-8 w-8 mr-2" }: { className?: string }) {
  return (
    <div className={`bg-blue-500 ${className} flex items-center justify-center rounded-md`}>
      <span className="text-white text-lg font-bold">T</span>
    </div>
  );
}