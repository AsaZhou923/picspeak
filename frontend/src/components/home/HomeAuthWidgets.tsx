'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import HomeCheckoutButton from '@/components/home/HomeCheckoutButton';
import HomeSignInButton from '@/components/home/HomeSignInButton';
import HomeSignUpButton from '@/components/home/HomeSignUpButton';

export default function HomeAuthWidgets() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
