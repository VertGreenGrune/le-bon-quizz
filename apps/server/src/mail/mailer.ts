import nodemailer from 'nodemailer';

/** One e-mail, plain text + HTML. */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** What we use from a nodemailer transport (a fake one in tests). */
export interface MailTransport {
  sendMail(message: Mail & { from: string }): Promise<unknown>;
}

/** Subset of the Fastify / pino logger. */
export interface MailLog {
  warn(obj: object, msg: string): void;
}

export const DEFAULT_MAIL_FROM = 'Le Bon Quizz <noreply@lebonquizz.local>';
/** Mailpit from docker-compose.yml (web UI http://localhost:8025): nothing real leaves in dev. */
export const DEV_SMTP_URL = 'smtp://localhost:1025';

export function createSmtpMailer(transport: MailTransport, from = DEFAULT_MAIL_FROM): Mailer {
  return { send: async (mail) => void (await transport.sendMail({ ...mail, from })) };
}

/** No SMTP configured in production: the mail (with its link) goes to the server log instead. */
export function createLogMailer(log: MailLog): Mailer {
  return {
    send: async ({ to, subject, text }) =>
      log.warn({ to, subject, text }, 'SMTP_URL not set: e-mail not sent, logged instead'),
  };
}

/**
 * Mailer configured by the environment: `SMTP_URL` (e.g. `smtps://user:pass@smtp-relay.brevo.com:465`)
 * and `MAIL_FROM`. Without `SMTP_URL`: Mailpit in dev, the log in production (with a warning).
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv, log: MailLog): Mailer {
  const url = env.SMTP_URL || (env.NODE_ENV === 'production' ? undefined : DEV_SMTP_URL);
  if (!url) {
    log.warn(
      {},
      'SMTP_URL not set: password reset e-mails are not sent, their links are written to this log',
    );
    return createLogMailer(log);
  }
  return createSmtpMailer(nodemailer.createTransport(url), env.MAIL_FROM || DEFAULT_MAIL_FROM);
}
