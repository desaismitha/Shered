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
        
        {/* Infinity symbol - more centered and smaller */}
        <path
          d="M35,50 C35,42 42,38 50,38 C58,38 62,46 62,50 C62,54 66,62 74,62 C82,62 85,54 85,50 C85,46 82,38 74,38 C66,38 62,46 62,50 C62,54 58,62 50,62 C42,62 35,58 35,50Z"
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