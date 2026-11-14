'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@clerk/nextjs';
import HomeCheckoutButton from '@/components/home/HomeCheckoutButton';
import HomeSignInButton from '@/components/home/HomeSignInButton';
import HomeSignUpButton from '@/components/home/HomeSignUpButton';

export default function HomeAuthWidgets() {
  const [mounted, setMounted] = useState(false);

  const { isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  // The sign-in / sign-up row keeps its height reserved for guests so the hero
  // does not shift when the buttons mount. Signed-in visitors get neither
  // button, so the reserved band is collapsed once that is known.
  useEffect(() => {
    // Every match, because a streamed copy of the page can linger in a hidden container.
    document.querySelectorAll('#home-auth-actions').forEach((row) => {
      row.classList.toggle('hidden', Boolean(isLoaded && isSignedIn));
    });
  }, [isLoaded, isSignedIn]);

  if (!mounted) return null;

  const signInSlot = document.getElementById('home-signin-slot');
  const signUpSlot = document.getElementById('home-signup-slot');
  const checkoutSlot = document.getElementById('home-checkout-slot');

  if (!signInSlot && !signUpSlot && !checkoutSlot) return null;

  return (
    <>
      {signInSlot ? createPortal(<HomeSignInButton />, signInSlot) : null}
      {signUpSlot ? createPortal(<HomeSignUpButton />, signUpSlot) : null}
      {checkoutSlot ? createPortal(<HomeCheckoutButton />, checkoutSlot) : null}
    </>
  );
}
