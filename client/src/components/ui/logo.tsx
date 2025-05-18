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
        {/* Shield background with rounded corners */}
        <path
          d="M50 5 L90 22 C93 23 95 26 95 29 L95 50 C95 76 75 95 50 95 C25 95 5 76 5 50 L5 29 C5 26 7 23 10 22 L50 5Z"
          fill="#0066FF"
          stroke="#0055DD"
          strokeWidth="1"
        />
        
        {/* Simple infinity symbol */}
        <path
          d="M35,50 C35,42 41,35 50,35 C59,35 59,45 65,45 C71,45 77,40 77,50 C77,60 71,65 65,65 C59,65 59,55 50,55 C41,55 35,58 35,50 Z"
          stroke="white"
          strokeWidth="7"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}