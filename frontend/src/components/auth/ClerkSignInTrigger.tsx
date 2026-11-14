'use client';

import type { ReactNode } from 'react';
import { Show, SignInButton, UserButton } from '@clerk/nextjs';

interface ClerkSignInTriggerProps {
  children: ReactNode;
  className: string;
  fallbackRedirectUrl?: string;
  signedInClassName?: string;
  /** Render nothing once signed in, for surfaces where the header already owns the account menu. */
  hideWhenSignedIn?: boolean;
}

export default function ClerkSignInTrigger({
  children,
  className,
  fallbackRedirectUrl = '/workspace',
  signedInClassName = 'inline-flex items-center',
  hideWhenSignedIn = false,
}: ClerkSignInTriggerProps) {
  return (
    <>
      <Show when="signed-out">
        <SignInButton mode="modal" fallbackRedirectUrl={fallbackRedirectUrl} signUpFallbackRedirectUrl={fallbackRedirectUrl}>
          <button type="button" className={className}>
            {children}
          </button>
        </SignInButton>
      </Show>
      {hideWhenSignedIn ? null : (
        <Show when="signed-in">
          <div className={signedInClassName}>
            <UserButton />
          </div>
        </Show>
      )}
    </>
  );
}
