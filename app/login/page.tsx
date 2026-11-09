import type { Metadata } from "next";
import { LoginError } from "./LoginError";

export const metadata: Metadata = { title: "Sign in — Room Temp" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-16">
      <form
        action="/api/login"
        method="post"
        className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-2xl"
      >
        <img src="/icons/192" alt="" width={64} height={64} className="mx-auto mb-4 rounded-2xl shadow-lg" />
        <h1 className="text-center text-2xl font-semibold tracking-tight">Room Temp</h1>
        <p className="mb-6 mt-1 text-center text-sm text-[var(--ink-3)]">Enter the dashboard password</p>
        <label htmlFor="password" className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--ink-3)]">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-xl border border-[var(--border)] bg-black/30 px-4 py-3 text-base outline-none ring-sky-500/50 focus:ring-2"
        />
        <LoginError />
        <button
          type="submit"
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 py-3 font-semibold text-white shadow-lg transition hover:brightness-110"
        >
          Open dashboard
        </button>
        <a href="/guide" className="mt-4 block text-center text-xs text-[var(--ink-3)] underline">
          User guide
        </a>
      </form>
    </main>
  );
}
