import { redirect } from 'next/navigation';

export default async function AdminShellRoot({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(`/admin/${lang}/imports`);
}
