import type { Mail } from './mailer.js';

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** `<web origin>/reset-password?token=…` (origin without a trailing slash). */
export function resetLink(webOrigin: string, token: string): string {
  return `${webOrigin.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

/** The "Mot de passe oublié" e-mail (French, app colors). */
export function passwordResetMail(to: string, name: string, link: string): Mail {
  const text = [
    `Bonjour ${name},`,
    '',
    'Vous avez demandé à changer le mot de passe de votre compte Le Bon Quizz.',
    'Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure, une seule fois) :',
    '',
    link,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.",
    '',
    "L'équipe Le Bon Quizz",
  ].join('\n');
  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden">
    <div style="background:#46178f;color:#ffffff;padding:20px 24px;font-size:24px;font-weight:900">Le Bon Quizz</div>
    <div style="padding:24px;font-size:16px;line-height:1.5">
      <p>Bonjour ${escapeHtml(name)},</p>
      <p>Vous avez demandé à changer le mot de passe de votre compte Le Bon Quizz.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${escapeHtml(link)}" style="background:#26890c;color:#ffffff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:10px;display:inline-block">Choisir un nouveau mot de passe</a>
      </p>
      <p style="font-size:14px;color:#4b5563">Ce lien est valable 1 heure et ne fonctionne qu'une fois. Si le bouton ne marche pas, copiez cette adresse dans votre navigateur :<br><a href="${escapeHtml(link)}" style="color:#46178f;word-break:break-all">${escapeHtml(link)}</a></p>
      <p style="font-size:14px;color:#4b5563">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe ne change pas.</p>
    </div>
  </div>
</body>
</html>`;
  return { to, subject: 'Le Bon Quizz : choisir un nouveau mot de passe', text, html };
}
