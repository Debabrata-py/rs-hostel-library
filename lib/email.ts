import nodemailer from "nodemailer";

const host = "smtp.gmail.com";
const port = 587;

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const password = process.env.GMAIL_APP_PASSWORD;

  if (!user || !password) {
    throw new Error("Gmail SMTP credentials are not configured.");
  }

  return nodemailer.createTransport({
    host,
    port,
secure: false,
requireTLS: true,
    auth: {
      user,
      pass: password,
    },
  });
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
}: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const user = process.env.GMAIL_USER;

  if (!user) {
    throw new Error("GMAIL_USER is not configured.");
  }

  const transporter = getTransporter();

  return transporter.sendMail({
    from: {
      name: "RS Hostel Library",
      address: user,
    },
    to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
}
