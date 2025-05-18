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
        
        {/* Improved infinity symbol - more elegant */}
        <path
          d="M34 50 C34 43 40 38 47 38 C54 38 57 43 60 48 C63 53 66 58 73 58 C80 58 86 53 86 46 C86 39 80 34 73 34 C66 34 63 39 60 44 C57 49 54 54 47 54 C40 54 34 49 34 42"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}