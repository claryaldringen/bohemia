import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect } from '@playwright/test';
import { MAIL_OUTBOX_DIR } from '../playwright.config';

interface Mail {
  to: string;
  subject: string;
  text: string;
}

async function readOutbox(): Promise<Mail[]> {
  try {
    const content = await readFile(path.join(MAIL_OUTBOX_DIR, 'outbox.jsonl'), 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Mail);
  } catch {
    return [];
  }
}

/** Počká na poslední e-mail pro adresu s daným předmětem a vrátí odkaz z něj. */
export async function linkFromLastMail(to: string, subject: RegExp): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const mail = (await readOutbox())
        .filter((m) => m.to === to && subject.test(m.subject))
        .at(-1);
      link = mail?.text.match(/https?:\/\/\S+/)?.[0];
      return link;
    })
    .toBeTruthy();
  return link!;
}
