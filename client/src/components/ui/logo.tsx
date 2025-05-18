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
        
        {/* Single infinity symbol path */}
        <path
          d="M35,50 C35,43 38,40 44,40 C50,40 52,45 50,50 C48,55 50,60 56,60 C62,60 65,55 65,50 C65,45 62,40 56,40 C50,40 48,45 50,50 C52,55 50,60 44,60 C38,60 35,57 35,50"
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