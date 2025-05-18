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
        
        {/* Infinity symbol - positioned more to the left */}
        <path
          d="M30,50 C30,42 37,38 45,38 C53,38 57,46 57,50 C57,54 61,62 69,62 C77,62 80,54 80,50 C80,46 77,38 69,38 C61,38 57,46 57,50 C57,54 53,62 45,62 C37,62 30,58 30,50Z"
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