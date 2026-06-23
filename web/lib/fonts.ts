import localFont from 'next/font/local';
import { Geist } from 'next/font/google';

export const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

export const thmanyahSans = localFont({
  src: [
    {
      path: '../public/fonts/thmanyahsans/thmanyahsans-Light.woff2',
      weight: '300',
      style: 'normal',
    },
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
    {
      path: '../public/fonts/thmanyahsans/thmanyahsans-Black.woff2',
      weight: '900',
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
      path: '../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Light.woff2',
      weight: '300',
      style: 'normal',
    },
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
    {
      path: '../public/fonts/thmanyahserifdisplay/thmanyahserifdisplay-Black.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-thmanyah-serif-display',
  fallback: ['Georgia', 'serif'],
  display: 'swap',
  preload: false,
});

export const thmanyahSerifText = localFont({
  src: [
    {
      path: '../public/fonts/thmanyahseriftext/thmanyahseriftext-Light.woff2',
      weight: '300',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahseriftext/thmanyahseriftext-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahseriftext/thmanyahseriftext-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahseriftext/thmanyahseriftext-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../public/fonts/thmanyahseriftext/thmanyahseriftext-Black.woff2',
      weight: '900',
      style: 'normal',
    },
  ],
  variable: '--font-thmanyah-serif-text',
  fallback: ['Georgia', 'serif'],
  display: 'swap',
  preload: false,
});
