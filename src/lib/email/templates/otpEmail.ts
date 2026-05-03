export function otpEmailTemplate(otp: string): { subject: string; html: string; text: string } {
  return {
    subject: `Your MrQ verification code is ${otp}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; font-size: 16px; color: #111;">
        <p>Your verification code:</p>
        <p style="font-size: 32px; letter-spacing: 6px; font-weight: bold;">${otp}</p>
        <p>This code expires in 10 minutes.</p>
        <p style="color: #888; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
      </div>
    `.trim(),
    text: `Your MrQ verification code: ${otp}\nThis code expires in 10 minutes.\nIf you didn't request this, you can ignore this email.`,
  };
}
