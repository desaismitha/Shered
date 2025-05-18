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
          d="M50 5 L90 22 C93 23 95 26 95 29 L95 50 C95 76 75 95 50 95 C25 95 5 76 5 50 L5 29 C5 26 7 23 10 22 L50 5Z"
          fill="#0066FF"
        />
        
        {/* Infinity symbol */}
        <path
          d="M30,50 A15,15 0 1,0 50,40 A15,15 0 1,1 70,50 A15,15 0 1,0 50,60 A15,15 0 1,1 30,50"
          stroke="white"
          strokeWidth="5"
          fill="none"
        />
      </svg>
    </div>
  );
}