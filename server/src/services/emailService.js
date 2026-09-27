import { env, isTest } from '../config/env.js'

// The ONLY file that knows how email is actually sent - moving providers
// later would only change this file. Brevo's transactional email API is a
// single POST request, so no extra library (e.g. an SDK) is needed; Node's
// built-in fetch is enough.

// In tests, nothing is sent over the network. Every email is captured here
// instead, so a test can check exactly what would have gone out - the
// subject, the recipient, and the reset link inside it.
export const sentEmails = []

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

async function send({ to, subject, html, text }) {
  if (isTest) {
    sentEmails.push({ to, subject, html, text })
    return
  }

  // Deliberately does not throw: a missing key or a provider error must
  // never turn into a 500 for the user. It logs loudly instead, so this is
  // easy to notice in the server's own logs.
  if (!env.BREVO_API_KEY || !env.EMAIL_FROM_ADDRESS) {
    console.error('Email not sent: BREVO_API_KEY / EMAIL_FROM_ADDRESS is not configured.')
    return
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: env.EMAIL_FROM_NAME, email: env.EMAIL_FROM_ADDRESS },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  }).catch((err) => {
    console.error('Brevo request failed:', err.message)
    return null
  })

  if (res && !res.ok) {
    console.error('Brevo send failed:', res.status, await res.text().catch(() => ''))
  }
}

export async function sendPasswordResetEmail(user, resetUrl) {
  const name = escapeHtml(user.displayName)
  await send({
    to: user.email,
    subject: `Reset your ${env.EMAIL_FROM_NAME} password`,
    html: `<p>Hi ${name},</p>
<p>Someone asked to reset the password for your ${env.EMAIL_FROM_NAME} account. Click the
link below to choose a new one. It expires in <strong>1 hour</strong> and works only once.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If this wasn't you, you can safely ignore this email - your password will not change.</p>`,
    text: `Hi ${user.displayName},

Someone asked to reset the password for your ${env.EMAIL_FROM_NAME} account. Open the link
below to choose a new one. It expires in 1 hour and works only once.

${resetUrl}

If this wasn't you, you can safely ignore this email - your password will not change.`,
  })
}
