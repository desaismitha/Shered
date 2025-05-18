import React from 'react';

export function TrustLoopzLogo({ className = "h-8 w-8 mr-2" }: { className?: string }) {
  return (
    <img 
      src="/images/trustloopz-logo.jpg" 
      alt="TrustLoopz Logo" 
      className={className}
      style={{ objectFit: 'contain' }} 
    />
  );
}