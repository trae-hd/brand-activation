interface PasswordResetEmailArgs {
  setPasswordUrl: string;
}

export function passwordResetEmailTemplate({ setPasswordUrl }: PasswordResetEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: "Reset your MrQ Live password",
    html: `
      <div style="font-family: -apple-system, sans-serif; font-size: 16px; color: #111;">
        <p>We received a request to reset the password for your MrQ Live account.</p>
        <p>Click the link below to set a new password:</p>
        <p>
          <a href="${escapeHtml(setPasswordUrl)}" style="color: #0070f3;">Reset your password</a>
        </p>
        <p style="color: #888; font-size: 12px;">This link expires in one hour. If you didn't request a password reset, you can ignore this email — your password won't change.</p>
      </div>
    `.trim(),
    text: `We received a request to reset the password for your MrQ Live account.\n\nReset your password here:\n${setPasswordUrl}\n\nThis link expires in one hour. If you didn't request a password reset, you can ignore this email — your password won't change.`,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
