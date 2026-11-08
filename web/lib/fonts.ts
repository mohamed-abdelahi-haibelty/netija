import localFont from 'next/font/local';
import { Geist } from 'next/font/google';

export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const thmanyahSans = localFont({
  src: [
    {
      path: '../public/fonts/thmanyahsans/thmanyahsans-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahsans/thmanyahsans-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahsans/thmanyahsans-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-thmanyah-sans',
  fallback: ['Arial', 'sans-serif'],
  display: 'swap',
  preload: false,
});

export const thmanyahSerifDisplay = localFont({
  src: [
    {
      path: '../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-thmanyah-serif-display',
  fallback: ['Georgia', 'serif'],
  display: 'swap',
  preload: false,
});


