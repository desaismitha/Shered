import React from 'react';

export function TrustLoopzLogo({ className = "h-8 w-8 mr-2" }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Shield background */}
        <path
          d="M50 5 L95 20 L95 50 C95 75 75 95 50 95 C25 95 5 75 5 50 L5 20 L50 5Z"
          fill="#0066FF"
        />
        
        {/* Infinity symbol */}
        <path
          d="M35 50 C35 42 42 35 50 35 C58 35 65 42 65 50 C65 58 58 65 50 65 C42 65 35 58 35 50 Z"
          stroke="white"
          strokeWidth="6"
          fill="none"
        />
        
        {/* Left loop of infinity */}
        <path
          d="M20 50 C20 42 27 35 35 35 C43 35 50 42 50 50 C50 58 43 65 35 65 C27 65 20 58 20 50 Z"
          stroke="white"
          strokeWidth="6"
          fill="none"
        />
        
        {/* Right loop of infinity */}
        <path
          d="M50 50 C50 42 57 35 65 35 C73 35 80 42 80 50 C80 58 73 65 65 65 C57 65 50 58 50 50 Z"
          stroke="white"
          strokeWidth="6"
          fill="none"
        />
      </svg>
    </div>
  );
}