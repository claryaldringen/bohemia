import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Zatím se e-maily jen vypisují do terminálu – skutečné odesílání přijde s nasazením.
 * S MAIL_OUTBOX_DIR se navíc ukládají do outbox.jsonl, odkud je čtou e2e testy.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.MAIL_OUTBOX_DIR) {
    throw new Error('Odesílání e-mailů zatím není nastavené.');
  }
  console.log(`\n✉️  E-mail pro ${mail.to}: ${mail.subject}\n${mail.text}\n`);

  const outboxDir = process.env.MAIL_OUTBOX_DIR;
  if (outboxDir) {
    await mkdir(outboxDir, { recursive: true });
    await appendFile(path.join(outboxDir, 'outbox.jsonl'), JSON.stringify(mail) + '\n');
  }
}

export function verificationMail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Bohemia – potvrď svůj e-mail',
    text: `Pro dokončení registrace do hry Bohemia otevři tento odkaz:\n${url}\n\nPokud registrace nebyla od tebe, e-mail ignoruj.`,
  };
}

export function resetPasswordMail(to: string, url: string): Mail {
  return {
    to,
    subject: 'Bohemia – nastavení nového hesla',
    text: `Nové heslo si nastavíš na tomto odkazu (platí hodinu):\n${url}\n\nPokud žádost nebyla od tebe, e-mail ignoruj – heslo zůstane beze změny.`,
  };
}
