/**
 * Email utility — powered by Resend.
 * Set RESEND_API_KEY in .env and set a verified FROM_EMAIL (or use Resend's sandbox domain).
 */

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// The address emails are sent from.
// During development you can use Resend's sandbox: onboarding@resend.dev
// In production replace with your verified domain, e.g. security@aegis.app
const FROM_EMAIL = process.env.FROM_EMAIL ?? "onboarding@resend.dev";

/**
 * Send the 24-word seed phrase to the user's email address.
 * Called once, immediately after account creation.
 *
 * The email explains:
 *  - What the words are
 *  - Why they must keep them safe
 *  - How to use them to recover their account
 */
export async function sendSeedPhraseEmail(
  toEmail: string,
  userName: string,
  seedPhrase: string[]
): Promise<void> {
  // Lay out the words in a 4-column grid (6 rows × 4 cols = 24)
  const wordRows: string[][] = [];
  for (let i = 0; i < 24; i += 4) {
    wordRows.push(seedPhrase.slice(i, i + 4));
  }

  const wordTableRows = wordRows
    .map(
      (row, rowIdx) =>
        `<tr>${row
          .map(
            (word, colIdx) =>
              `<td style="padding:8px 12px;border:1px solid #333;font-family:monospace;font-size:15px;color:#e8e8e8;">
                <span style="color:#888;font-size:11px;margin-right:6px;">${rowIdx * 4 + colIdx + 1}.</span>${word}
              </td>`
          )
          .join("")}</tr>`
    )
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#1a1a1e;color:#e8e8e8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#242428;border-radius:12px;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid #333;">
            <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">🔐 Your Aegis Recovery Phrase</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c0c0c0;">
              Hi ${userName},
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c0c0c0;">
              Your Aegis account was created successfully. Below are your <strong style="color:#fff;">24 recovery words</strong>.
              These words are the only way to recover access to your encrypted messages if you ever forget your password.
            </p>

            <!-- Warning box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#3a2a1a;border:1px solid #6b4020;border-radius:8px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0;font-size:14px;color:#f4a261;">
                    ⚠️ <strong>Keep these words private and safe.</strong> Anyone who has them can recover your account.
                    Aegis staff will never ask for them. Write them down and store them somewhere secure.
                  </p>
                </td>
              </tr>
            </table>

            <!-- Word grid -->
            <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
              ${wordTableRows}
            </table>

            <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#888;">
              To use these words: open Aegis → Sign In → <em>Forgot password?</em> → <em>Recover with seed phrase</em>.
              Enter all 24 words in order, choose a new password, and your messages will be restored.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #333;background:#1e1e22;">
            <p style="margin:0;font-size:12px;color:#555;text-align:center;">
              This email was sent automatically. Do not reply. If you didn't create an Aegis account, you can safely ignore this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: "🔐 Your Aegis Recovery Phrase — Save This Email",
    html,
  });

  if (error) {
    // Non-fatal: log and move on. Keys are already stored — user can re-request later.
    console.error("[Email] Failed to send seed phrase email:", error);
    throw new Error(`Email delivery failed: ${error.message}`);
  }
}
