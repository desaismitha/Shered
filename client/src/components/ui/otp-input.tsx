import { createReactComponent } from "@/lib/utils";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "input-otp";

// Styles for OTP input
import "input-otp/styles.css";

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
  return (
    <InputOTP
      maxLength={length}
      value={value}
      onChange={onChange}
      disabled={disabled}
      containerClassName="flex items-center gap-2"
      render={({ slots }) => (
        <InputOTPGroup className="flex items-center gap-2">
          {slots.map((slot, index) => (
            <InputOTPSlot
              key={index}
              {...slot}
              className="w-10 h-12 text-center text-lg border rounded-md focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/50"
            />
          ))}
        </InputOTPGroup>
      )}
    />
  );
}
