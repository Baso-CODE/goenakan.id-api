import fs from "fs/promises";
import handlebars from "handlebars";
import nodemailer, { Transporter } from "nodemailer";
import path from "path";
import { env } from "../../../config";

export class MailService {
  private transporter: Transporter;
  private templatesDir: string;

  constructor() {
    const isTestEnv = process.env.NODE_ENV === "test";

    if (isTestEnv) {
      this.transporter = nodemailer.createTransport({
        host: "localhost",
        port: 1025,
        secure: false,
      });
    } else {
      const config = env();

      this.transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,

        // Port 465 = implicit TLS
        // Port 587 = STARTTLS
        secure: config.SMTP_PORT === 465,
        requireTLS: config.SMTP_PORT === 587,

        auth: {
          user: config.SMTP_USER,
          pass: config.SMTP_PASS,
        },

        connectionTimeout: 15000,
        greetingTimeout: 15000,
        socketTimeout: 30000,
      });
    }

    this.templatesDir = path.resolve(__dirname, "./templates");
  }

  private async renderTemplate(
    templateName: string,
    context: object,
  ): Promise<string> {
    const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);

    // Read the template file
    const templateSource = await fs.readFile(templatePath, "utf-8");

    // Compile the template
    const compiledTemplate = handlebars.compile(templateSource);

    // Return the rendered template
    return compiledTemplate(context);
  }

  public async sendEmail(
    to: string,
    subject: string,
    templateName: string,
    context: object,
  ): Promise<void> {
    try {
      const html = await this.renderTemplate(templateName, context);

      const mailOptions = {
        from: `"Goenakan Indonesia" <${env().SMTP_USER}>`,
        to,
        subject,
        html,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      throw "Error sending email";
    }
  }

  public async sendAdminInvitationEmail(
    to: string,
    data: {
      name: string;
      role: string;
      activationUrl: string;
    },
  ): Promise<void> {
    const escapeHtml = (value: string): string =>
      value.replace(/[&<>"']/g, (char) => {
        const entities: Record<string, string> = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        };

        return entities[char] || char;
      });

    const name = escapeHtml(data.name);
    const email = escapeHtml(to);
    const role = escapeHtml(data.role);
    const activationUrl = escapeHtml(data.activationUrl);

    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Undangan Akun Goenakan Indonesia</title>
</head>

<body style="
  margin:0;
  padding:0;
  background-color:#f3f2ed;
  font-family:Arial,Helvetica,sans-serif;
  color:#242424;
">
  <table role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    style="background-color:#f3f2ed;">
    <tr>
      <td align="center"
        style="padding:40px 16px;">

        <table role="presentation"
          width="560"
          cellpadding="0"
          cellspacing="0"
          style="
            width:100%;
            max-width:560px;
            background-color:#ffffff;
            border:1px solid #e8dfd5;
            border-radius:16px;
            overflow:hidden;
          ">

          <!-- HEADER -->
          <tr>
            <td style="
              padding:34px 36px;
              background-color:#744d39;
            ">
              <p style="
                margin:0 0 9px;
                color:#e9d8c6;
                font-size:10px;
                font-weight:700;
                letter-spacing:2.5px;
                text-transform:uppercase;
              ">
                Official Account Invitation
              </p>

              <h1 style="
                margin:0;
                font-size:27px;
                line-height:1.2;
                font-weight:700;
                color:#ffffff;
                letter-spacing:-0.5px;
              ">
                GOENAKAN
              </h1>

              <p style="
                margin:7px 0 0;
                font-size:12px;
                color:#f1e7dc;
              ">
                INDONESIA
              </p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:38px 36px 30px;">

              <p style="
                margin:0 0 10px;
                color:#9a745a;
                font-size:11px;
                font-weight:700;
                letter-spacing:1.3px;
                text-transform:uppercase;
              ">
                Welcome to Goenakan
              </p>

              <h2 style="
                margin:0 0 18px;
                font-size:25px;
                line-height:1.35;
                font-weight:700;
                color:#242424;
              ">
                Akun Anda telah dibuat.
              </h2>

              <p style="
                margin:0 0 18px;
                font-size:15px;
                line-height:1.8;
                color:#554b44;
              ">
                Halo, <strong style="color:#744d39;">${name}</strong>!
              </p>

              <p style="
                margin:0 0 26px;
                font-size:14px;
                line-height:1.9;
                color:#554b44;
              ">
                Selamat datang di Goenakan Indonesia.
                Super Admin telah membuat akun Anda
                untuk mengakses sistem administrasi
                Goenakan.
              </p>

              <!-- ACCOUNT DETAILS -->
              <table role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                  background-color:#f8f5f1;
                  border:1px solid #e9dfd4;
                  border-radius:10px;
                ">
                <tr>
                  <td style="padding:20px 22px;">

                    <p style="
                      margin:0 0 17px;
                      color:#90715d;
                      font-size:11px;
                      font-weight:700;
                      letter-spacing:1px;
                      text-transform:uppercase;
                    ">
                      Detail Akun Anda
                    </p>

                    <p style="
                      margin:0 0 5px;
                      color:#89786b;
                      font-size:12px;
                    ">
                      Alamat Email
                    </p>

                    <p style="
                      margin:0 0 18px;
                      color:#352b25;
                      font-size:15px;
                      font-weight:600;
                      overflow-wrap:anywhere;
                    ">
                      ${email}
                    </p>

                    <p style="
                      margin:0 0 5px;
                      color:#89786b;
                      font-size:12px;
                    ">
                      Hak Akses / Role
                    </p>

                    <p style="
                      margin:0;
                      color:#744d39;
                      font-size:14px;
                      font-weight:700;
                    ">
                      ${role}
                    </p>

                  </td>
                </tr>
              </table>

              <p style="
                margin:27px 0 0;
                color:#554b44;
                font-size:14px;
                line-height:1.9;
              ">
                Untuk mulai menggunakan akun, silakan
                klik tombol berikut dan buat password
                pribadi Anda.
              </p>

              <!-- BUTTON -->
              <table role="presentation"
                cellpadding="0"
                cellspacing="0"
                width="100%"
                style="margin:26px 0;">
                <tr>
                  <td align="center"
                    bgcolor="#744d39"
                    style="
                      background-color:#744d39;
                      border-radius:9px;
                    ">

                    <a href="${activationUrl}"
                      target="_blank"
                      style="
                        display:block;
                        padding:17px 24px;
                        color:#ffffff;
                        font-size:14px;
                        font-weight:700;
                        text-align:center;
                        text-decoration:none;
                        border-radius:9px;
                      ">
                      Aktivasi Akun Saya
                    </a>

                  </td>
                </tr>
              </table>

              <table role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="
                  background-color:#f8f5f1;
                  border-left:3px solid #b18c70;
                ">
                <tr>
                  <td style="padding:14px 17px;">
                    <p style="
                      margin:0;
                      color:#6d594b;
                      font-size:12px;
                      line-height:1.8;
                    ">
                      <strong>Informasi Keamanan</strong><br>
                      Link aktivasi berlaku selama
                      24 jam dan hanya dapat digunakan
                      satu kali. Jangan bagikan link
                      ini kepada siapa pun.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="
                margin:27px 0 0;
                color:#8c8178;
                font-size:12px;
                line-height:1.9;
              ">
                Apabila Anda tidak merasa menerima
                undangan ini, silakan abaikan email.
                Tidak diperlukan tindakan lebih lanjut.
              </p>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="
              padding:23px 36px;
              background-color:#f8f5f1;
              border-top:1px solid #e9dfd4;
              text-align:center;
            ">
              <p style="
                margin:0 0 6px;
                color:#744d39;
                font-weight:700;
                font-size:13px;
              ">
                Goenakan Indonesia
              </p>

              <p style="
                margin:0;
                color:#95877c;
                font-size:11px;
                line-height:1.7;
              ">
                Email otomatis dari sistem administrasi Goenakan.<br>
                Mohon tidak membalas email ini.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

    await this.transporter.sendMail({
      from: `"Goenakan Indonesia" <${env().SMTP_USER}>`,
      to,
      subject: "Akun Admin Goenakan Anda Sudah Dibuat",
      html,
      text: [
        `Halo ${data.name},`,
        "",
        "Akun Admin Goenakan Anda telah dibuat oleh Super Admin.",
        `Email: ${to}`,
        `Role: ${data.role}`,
        "",
        "Silakan aktivasi akun melalui link berikut:",
        data.activationUrl,
        "",
        "Link berlaku selama 24 jam dan hanya dapat digunakan sekali.",
        "",
        "Goenakan Indonesia",
      ].join("\n"),
    });
  }
}
