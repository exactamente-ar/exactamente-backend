import { Resend } from 'resend';
import { env } from '@/env';

const resend = new Resend(env.RESEND_API_KEY);

const FROM = 'Exactamente <noreply@exactamente.com.ar>';

export function sendApprovalEmail(to: string, displayName: string, resourceTitle: string): void {
  resend.emails
    .send({
      from: FROM,
      to,
      subject: '¡Tu recurso fue aprobado!',
      html: `
      <p>Hola ${displayName},</p>
      <p>Tu recurso <strong>${resourceTitle}</strong> fue revisado y aprobado. Ya está disponible para todos los estudiantes.</p>
      <p>¡Gracias por el aporte a la comunidad!</p>
      <p>— El equipo de <a href="${env.APP_URL}">Exactamente</a></p>
    `,
    })
    .catch((err) => {
      console.error('[email] Error al enviar email de aprobación:', err);
    });
}

export function sendBulkApprovalEmail(to: string, displayName: string, titles: string[]): void {
  const list = titles.map((t) => `<li>${t}</li>`).join('');
  const subject =
    titles.length === 1
      ? '¡Tu recurso fue aprobado!'
      : `¡Tus ${titles.length} recursos fueron aprobados!`;
  resend.emails
    .send({
      from: FROM,
      to,
      subject,
      html: `
      <p>Hola ${displayName},</p>
      <p>Los siguientes recursos fueron revisados y aprobados. Ya están disponibles para todos los estudiantes.</p>
      <ul>${list}</ul>
      <p>¡Gracias por el aporte a la comunidad!</p>
      <p>— El equipo de <a href="${env.APP_URL}">Exactamente</a></p>
    `,
    })
    .catch((err) => {
      console.error('[email] Error al enviar email de aprobación masiva:', err);
    });
}
