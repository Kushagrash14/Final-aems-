// =============================================================================
// AEMS v2 — Enterprise SMTP Mailer Service (Microsoft Office 365)
// =============================================================================

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/lib/env';

// Lazy-initialized Nodemailer transporter
let transporterInstance: Transporter | null = null;

export function getSmtpTransporter(): Transporter {
  if (transporterInstance) {
    return transporterInstance;
  }

  const host = env.smtpHost || process.env.SMTP_HOST || 'smtp.office365.com';
  const port = Number(env.smtpPort || process.env.SMTP_PORT || 587);
  const user = env.smtpEmail || process.env.SMTP_EMAIL || 'verify.software2040@pgel.in';
  const pass = env.smtpPassword || process.env.SMTP_PASSWORD || '';

  transporterInstance = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // false for 587 (STARTTLS)
    auth: {
      user,
      pass,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
  });

  return transporterInstance;
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email using configured Office 365 SMTP
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from,
}: SendMailOptions): Promise<SendMailResult> {
  const fromAddress = from || env.otpFromEmail || process.env.OTP_FROM_EMAIL || 'verify.software2040@pgel.in';
  const senderFormatted = `"PG Electroplast AEMS" <${fromAddress}>`;

  try {
    const transporter = getSmtpTransporter();

    const info = await transporter.sendMail({
      from: senderFormatted,
      to,
      subject,
      text: text || html.replace(/<[^>]*>?/gm, ''),
      html,
    });

    console.log(`\x1b[32m[AEMS SMTP SUCCESS]\x1b[0m Email sent to ${to}. MessageId: ${info.messageId}`);
    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown SMTP error';
    console.error(`\x1b[31m[AEMS SMTP ERROR]\x1b[0m Failed to send email to ${to}:`, errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Send branded OTP verification email to user
 */
export async function sendOtpEmail(toEmail: string, otpCode: string): Promise<SendMailResult> {
  const subject = `[AEMS] Your Verification Code: ${otpCode}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AEMS Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f1f5f9; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 16px rgba(0,0,0,0.06);">
          <!-- Header Bar -->
          <tr>
            <td style="background-color: #0f172a; padding: 24px 32px; text-align: center; border-bottom: 3px solid #2563eb;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">PG ELECTROPLAST LIMITED</h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Asset Entry Management System (AEMS v2)</p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 36px 32px;">
              <h2 style="margin: 0 0 12px 0; color: #1e293b; font-size: 18px; font-weight: 700;">Account Authentication</h2>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                You have requested a secure One-Time Password (OTP) to authenticate into the <strong>Asset Entry Management System</strong>.
              </p>

              <!-- OTP Code Display Card -->
              <div style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="display: block; font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Your One-Time Password</span>
                <span style="display: inline-block; font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #2563eb; background-color: #ffffff; padding: 8px 24px; border-radius: 8px; border: 1px solid #e2e8f0;">
                  ${otpCode}
                </span>
                <span style="display: block; font-size: 12px; font-weight: 600; color: #dc2626; margin-top: 12px;">
                  ⏱️ Valid for the next 10 minutes only
                </span>
              </div>

              <!-- Security Information -->
              <p style="margin: 0 0 16px 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                • Do not share this OTP with anyone, including IT Support.<br>
                • If you did not initiate this login request, please inform your plant IT administrator immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px; font-weight: 500;">
                © 2026 PG Electroplast Ltd. All rights reserved.<br>
                This is an automated notification from <a href="mailto:verify.software2040@pgel.in" style="color: #2563eb; text-decoration: none;">verify.software2040@pgel.in</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
PG ELECTROPLAST LIMITED — AEMS v2
==================================
Account Authentication Code

Your One-Time Password (OTP) is: ${otpCode}

This code is valid for 10 minutes.
Do not share this code with anyone.

If you did not request this OTP, please contact your IT administrator immediately.

© 2026 PG Electroplast Ltd.
verify.software2040@pgel.in
  `.trim();

  return sendEmail({
    to: toEmail,
    subject,
    html,
    text,
  });
}

/**
 * Verify SMTP connection and credentials
 */
export async function verifySmtp(): Promise<{ connected: boolean; error?: string }> {
  try {
    const transporter = getSmtpTransporter();
    await transporter.verify();
    return { connected: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown SMTP verification error';
    return { connected: false, error: errorMsg };
  }
}
