import { cn } from "@/lib/utils";
import * as React from "react";

// We are using a custom implementation of OTP input because the input-otp package 
// has typing issues. This implementation provides the same functionality.

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  disabled?: boolean;
}

export function OTPInput({
  value,
  onChange,
  length = 6,
  disabled = false,
}: OTPInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, digit: string) => {
    if (digit.length > 1) return; // Only accept single characters
    if (!/^\d*$/.test(digit)) return; // Only accept digits

    const newValue = value.split('');
    newValue[index] = digit;
    onChange(newValue.join(''));

    // Auto-focus next input if there's a digit entered
    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      // If current input is empty and backspace is pressed, focus previous input
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      // Move focus to previous input on left arrow
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      // Move focus to next input on right arrow
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text/plain').trim();
    if (!/^\d*$/.test(pastedData)) return; // Only accept digits

    // Take only the first `length` characters if pasted text is longer
    const validPastedData = pastedData.substring(0, length);
    onChange(validPastedData.padEnd(value.length, value.substring(validPastedData.length)));

    // Focus the input after the last pasted character or the last input
    const focusIndex = Math.min(validPastedData.length, length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  React.useEffect(() => {
    // Initialize refs array
    inputRefs.current = inputRefs.current.slice(0, length);
  }, [length]);

  return (
    <div className="flex items-center gap-2">
      {Array.from({ length }).map((_, index) => (
        <input
          key={index}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={value[index] || ''}
          ref={(el) => (inputRefs.current[index] = el)}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          disabled={disabled}
          className={cn(
            "w-10 h-12 text-center text-lg border rounded-md focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/50",
            disabled && "bg-muted cursor-not-allowed opacity-50"
          )}
          aria-label={`Digit ${index + 1}`}
        />
      ))}
    </div>
  );
}
