import { redirect } from 'next/navigation';

/** Root URL: redirect to 수전해 동향 (intel news tab). */
export default function RootPage() {
  redirect('/intel?tab=news');
}
