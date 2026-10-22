import { describe, expect, it, vi } from 'vitest';
import { createLogMailer, createSmtpMailer, mailerFromEnv, type MailTransport } from './mailer.js';
import { passwordResetMail, resetLink } from './passwordReset.js';

describe('password reset e-mail', () => {
  it('builds the link from the web origin', () => {
    expect(resetLink('https://quiz.example.fr/', 'a+b')).toBe(
      'https://quiz.example.fr/reset-password?token=a%2Bb',
    );
  });

  it('is in French and carries the link in both parts', () => {
    const link = resetLink('https://quiz.example.fr', 'tok123');
    const mail = passwordResetMail('a@b.fr', 'Léa <3', link);
    expect(mail.to).toBe('a@b.fr');
    expect(mail.subject).toBe('Le Bon Quizz : choisir un nouveau mot de passe');
    expect(mail.text).toContain('Bonjour Léa <3,');
    expect(mail.text).toContain('valable 1 heure');
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toContain('Léa &lt;3');
    expect(mail.html).toContain('Choisir un nouveau mot de passe');
  });
});

describe('mailers', () => {
  const mail = { to: 'a@b.fr', subject: 'S', text: 'T', html: '<p>T</p>' };

  it('SMTP mailer sends through the transport with the sender', async () => {
    const transport: MailTransport = { sendMail: vi.fn(async () => ({})) };
    await createSmtpMailer(transport, 'Le Bon Quizz <noreply@x.fr>').send(mail);
    expect(transport.sendMail).toHaveBeenCalledWith({
      ...mail,
      from: 'Le Bon Quizz <noreply@x.fr>',
    });
  });

  it('log mailer writes the mail (and its link) to the log', async () => {
    const log = { warn: vi.fn() };
    await createLogMailer(log).send(mail);
    expect(log.warn).toHaveBeenCalledWith(
      { to: 'a@b.fr', subject: 'S', text: 'T' },
      expect.stringContaining('SMTP_URL not set'),
    );
  });

  it('warns at startup in production without SMTP_URL, not in dev', () => {
    const log = { warn: vi.fn() };
    mailerFromEnv({ NODE_ENV: 'production' }, log);
    expect(log.warn).toHaveBeenCalledTimes(1);
    log.warn.mockClear();
    mailerFromEnv({}, log); // dev: Mailpit
    mailerFromEnv({ NODE_ENV: 'production', SMTP_URL: 'smtp://localhost:2525' }, log);
    expect(log.warn).not.toHaveBeenCalled();
  });
});
