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
        {/* Shield background - brighter blue to match the image */}
        <path
          d="M50 5 L90 20 L90 50 C90 75 70 95 50 95 C30 95 10 75 10 50 L10 20 L50 5Z"
          fill="#007BFF"
        />
        
        {/* Shield border - white to match the image */}
        <path
          d="M50 5 L90 20 L90 50 C90 75 70 95 50 95 C30 95 10 75 10 50 L10 20 L50 5Z"
          stroke="white"
          strokeWidth="3"
          fill="none"
        />
        
        {/* Single infinity symbol path - larger size */}
        <path
          d="M30,50 C30,40 34,35 42,35 C50,35 52,42 50,50 C48,58 50,65 58,65 C66,65 70,58 70,50 C70,42 66,35 58,35 C50,35 48,42 50,50 C52,58 50,65 42,65 C34,65 30,60 30,50"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </div>
  );
}