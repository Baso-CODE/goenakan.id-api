import nodemailer from "nodemailer";
import { BASE_DOMAIN } from "../../../lib/config";

export class EmailService {
  private transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fungsi untuk mengirim email verifikasi akun baru
  async sendVerificationEmail(toEmail: string, token: string) {
    const verificationUrl = `${BASE_DOMAIN}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"Support Team" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Verifikasi Alamat Email Anda",
      html: `
        <h2>Selamat Datang!</h2>
        <p>Silakan klik tautan di bawah ini untuk memverifikasi akun Anda:</p>
        <a href="${verificationUrl}" target="_blank" style="padding: 10px 20px; background-color: #C4A48E; color: white; text-decoration: none; border-radius: 5px;">Verifikasi Email Saya</a>
        <p>Tautan ini akan kedaluwarsa dalam 24 jam.</p>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  // ✨ Fungsi baru untuk mengirim email instruksi reset password
  async sendPasswordResetEmail(toEmail: string, resetUrl: string) {
    const mailOptions = {
      from: `"Support Team" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Permintaan Reset Kata Sandi",
      html: `
        <h2>Atur Ulang Kata Sandi Anda</h2>
        <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. Klik tautan di bawah ini untuk melanjutkan:</p>
        <a href="${resetUrl}" target="_blank" style="padding: 10px 20px; background-color: #C4A48E; color: white; text-decoration: none; border-radius: 5px;">Reset Kata Sandi</a>
        <p>Tautan ini hanya berlaku selama 1 jam. Jika Anda tidak merasa melakukan permintaan ini, abaikan saja email ini.</p>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
