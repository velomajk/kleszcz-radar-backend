import type { Config } from "../config.js";

export interface EmailSender { sendVerification(email: string, verificationUrl: string): Promise<void> }

export const createEmailSender = (config: Config): EmailSender => ({
  async sendVerification(email, verificationUrl) {
    if (config.EMAIL_PROVIDER === "console") {
      console.info(JSON.stringify({ event: "development_verification_email", email, verificationUrl }));
      return;
    }
    if (!config.RESEND_API_KEY) throw new Error("RESEND_API_KEY is required for the Resend provider");
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [email],
        subject: "Potwierdź zgłoszenie — Radar Kleszczy",
        html: `<p>Kliknij link, aby potwierdzić anonimowe zgłoszenie:</p><p><a href="${verificationUrl}">Potwierdź zgłoszenie</a></p><p>Link wkrótce wygaśnie. Nie będziemy wysyłać przypomnień.</p>`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
  },
});
