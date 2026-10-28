import { AuthForm } from "./AuthForm";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <div className="mx-auto max-w-sm px-4 py-16"><h1 className="h-display mb-6 text-3xl">Welcome back.</h1><AuthForm next={next} /></div>;
}
