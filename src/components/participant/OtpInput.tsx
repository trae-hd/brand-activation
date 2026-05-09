"use client";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function OtpInput({ value, onChange, disabled }: Props) {
  // Strip non-digits and trim to 6 chars before bubbling up. Handles paste
  // from email clients that formatted the code with spaces or punctuation
  // (e.g. "482 619", "482-619", "OTP: 482619 — expires…"). The OTP email
  // itself now renders without a space, but defending here keeps the input
  // robust regardless of source.
  const handleChange = (next: string) => {
    onChange(next.replace(/\D/g, "").slice(0, 6));
  };

  return (
    <InputOTP
      maxLength={6}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      autoComplete="one-time-code"
      inputMode="numeric"
      pattern={REGEXP_ONLY_DIGITS}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
