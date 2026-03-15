'use client';

import type { ReactNode } from 'react';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';

interface ClerkSignInTriggerProps {
  children: ReactNode;
  className: string;
  fallbackRedirectUrl?: string;
  signedInClassName?: string;
}

export default function ClerkSignInTrigger({
  children,
  className,
  fallbackRedirectUrl = '/workspace',
  signedInClassName = 'inline-flex items-center',
}: ClerkSignInTriggerProps) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal" fallbackRedirectUrl={fallbackRedirectUrl}>
          <button type="button" className={className}>
            {children}
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <div className={signedInClassName}>
          <UserButton />
        </div>
      </Show>
    </>
  );
}
