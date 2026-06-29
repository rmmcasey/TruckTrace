import { Resend } from "resend";

function client(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

const FROM = "TruckTrace <noreply@trucktrace.app>";

export async function sendSignupNotificationToAdmin(
  managerEmail: string,
  companyName: string
): Promise<void> {
  const resend = client();
  if (!resend || !process.env.ADMIN_EMAIL) return;

  await resend.emails.send({
    from: FROM,
    to: process.env.ADMIN_EMAIL,
    subject: `New TruckTrace signup — ${companyName}`,
    html: `<p>A new account is pending approval.</p>
<p><strong>Company:</strong> ${companyName}<br>
<strong>Email:</strong> ${managerEmail}</p>
<p>Log in to the admin dashboard to approve or reject.</p>`,
  });
}

export async function sendApprovalEmail(email: string, companyName: string): Promise<void> {
  const resend = client();
  if (!resend) return;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your TruckTrace account has been approved",
    html: `<p>Hi ${companyName},</p>
<p>Your TruckTrace account has been approved. You can now log in at <strong>/manager</strong>.</p>`,
  });
}

export async function sendRejectionEmail(email: string, companyName: string): Promise<void> {
  const resend = client();
  if (!resend) return;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Your TruckTrace account application",
    html: `<p>Hi ${companyName},</p>
<p>Unfortunately your TruckTrace account application was not approved at this time.</p>`,
  });
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const resend = client();
  if (!resend) return;

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: "Reset your TruckTrace password",
    html: `<p>You requested a password reset.</p>
<p><a href="${resetUrl}">Click here to reset your password</a></p>
<p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
