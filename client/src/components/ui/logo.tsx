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
        
        {/* Infinity symbol - further increased space in the center */}
        <path
          d="M25,50 C25,42 32,38 40,38 C48,38 48,46 48,50 C48,54 52,62 62,62 C72,62 75,54 75,50 C75,46 72,38 62,38 C52,38 52,46 52,50 C52,54 48,62 40,62 C32,62 25,58 25,50Z"
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