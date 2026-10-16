import Link from 'next/link';
import type { ReactElement } from 'react';
import { AuthCard } from '@/components/auth/AuthCard';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage(): ReactElement {
  return (
    <AuthCard
      title="Zapomenuté heslo"
      footer={
        <p>
          <Link href="/login" className="underline">
            Zpět na přihlášení
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
