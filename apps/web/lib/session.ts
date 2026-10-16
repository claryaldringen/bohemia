import 'server-only';
import { headers } from 'next/headers';
import { getAuth } from './auth';

export async function getSession(): Promise<
  Awaited<ReturnType<ReturnType<typeof getAuth>['api']['getSession']>>
> {
  // headers() napřed: při buildu tím Next pozná dynamickou stránku dřív, než by se
  // getAuth() pokusilo připojit k databázi.
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}
