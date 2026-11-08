import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { locales, hasLocale, getDirection } from "@/lib/i18n/settings";
import { getDictionary } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Footer } from "@/components/Footer";
import { geistSans, thmanyahSans, thmanyahSerifDisplay } from "@/lib/fonts";
import "@/app/globals.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isAr = lang === "ar";
  return {
    title: isAr
      ? "نتيجة — أرشيف نتائج الامتحانات الوطنية"
      : "Netija — Archive des résultats des examens nationaux",
    description: isAr
      ? "أرشيف نتائج الامتحانات الوطنية الموريتانية — من 2015 إلى 2025. الباكالوريا ومسابقة ختم دروس الإعدادية."
      : "Archive des résultats des examens nationaux mauritaniens — de 2015 à 2025. Baccalauréat et Brevet (BEPC).",
    alternates: {
      languages: {
        ar: "/ar",
        fr: "/fr",
      },
    },
  };
}

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) notFound();

  const dir = getDirection(lang);
  const dictionary = await getDictionary(lang);

  return (
    <html
      lang={lang}
      dir={dir}
      className={[
        geistSans.variable,
        thmanyahSans.variable,
        thmanyahSerifDisplay.variable,
      ].join(" ")}
    >
      <body className="min-h-screen flex flex-col antialiased">
        <I18nProvider locale={lang} resources={dictionary}>
          <header className="h-(--nav-height) flex items-center">
            <div className="mx-auto flex w-full max-w-140 items-center justify-between px-6">
              <Link
                href={`/${lang}`}
                className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors duration-short"
              >
                <Image
                  src="/logo-2.png"
                  alt=""
                  width={45}
                  height={28}
                  priority
                  className="h-7 w-auto"
                />
                Netija
              </Link>
              <LanguageSwitcher currentLocale={lang} />
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <Footer lang={lang} />
        </I18nProvider>
      </body>
    </html>
  );
}
