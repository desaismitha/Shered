import React from 'react';

export function TrustLoopzLogo({ className = "h-8 w-8 mr-2" }: { className?: string }) {
  return (
    <img 
      src="/images/infinity.svg" 
      alt="TrustLoopz Logo" 
      className={className}
    />
  );
}