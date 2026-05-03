interface InviteEmailArgs {
  name: string;
  setPasswordUrl: string;
  issuerName: string;
}

export function inviteEmailTemplate({ name, setPasswordUrl, issuerName }: InviteEmailArgs): {
  subject: string;
  html: string;
  text: string;
} {
  return {
    subject: "You've been invited to MrQ Live",
    html: `
      <div style="font-family: -apple-system, sans-serif; font-size: 16px; color: #111;">
        <p>Hi ${escapeHtml(name)},</p>
        <p>${escapeHtml(issuerName)} has invited you to join MrQ Live as an administrator.</p>
        <p>Click the link below to set your password and activate your account:</p>
        <p>
          <a href="${escapeHtml(setPasswordUrl)}" style="color: #0070f3;">Set your password</a>
        </p>
        <p style="color: #888; font-size: 12px;">This link expires in one hour. If you weren't expecting this invitation, you can ignore this email.</p>
      </div>
    `.trim(),
    text: `Hi ${name},\n\n${issuerName} has invited you to join MrQ Live as an administrator.\n\nSet your password here:\n${setPasswordUrl}\n\nThis link expires in one hour. If you weren't expecting this invitation, you can ignore this email.`,
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
