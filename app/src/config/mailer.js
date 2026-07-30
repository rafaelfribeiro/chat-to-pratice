import nodemailer from 'nodemailer'
import dotenv from 'dotenv'

dotenv.config()

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
})

export const sendReactivationEmail = async (to, token) => {
  const url = `${process.env.APP_URL}/auth/reactivate?token=${token}`
  await transporter.sendMail({
    from: process.env.MAIL_USER,
    to,
    subject: 'Reative sua conta',
    html: `
      <h2>Sua conta foi desativada</h2>
      <p>Após 5 tentativas de login incorretas, sua conta foi desativada.</p>
      <p>Clique no botão abaixo para reativar:</p>
      <a href="${url}" style="
        display: inline-block;
        padding: 12px 24px;
        background: #4F46E5;
        color: white;
        text-decoration: none;
        border-radius: 6px;
      ">Reativar minha conta</a>
      <p>O link expira em 24 horas.</p>
    `
  })
}