import type { FormEventHandler, InputHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router';

/** Brand-purple page with the logo and a white form card (login, register, password pages). */
export function AuthCard({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit?: FormEventHandler;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand px-4 py-8 text-white">
      <Link to="/" className="text-4xl font-black tracking-tight">
        Le Bon Quizz
      </Link>
      <form
        onSubmit={onSubmit ?? ((e) => e.preventDefault())}
        noValidate
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 text-gray-900 shadow-xl"
      >
        <h1 className="text-2xl font-black">{title}</h1>
        {children}
      </form>
    </main>
  );
}

export function TextField({
  label,
  error,
  hint,
  ...input
}: {
  label: string;
  error?: string;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-gray-600">{label}</span>
      <input
        {...input}
        aria-invalid={!!error}
        className={`rounded-lg border-2 px-3 py-2 outline-none focus:border-brand ${error ? 'border-answer-red' : 'border-gray-300'}`}
      />
      {error ? (
        <span className="text-sm font-semibold text-answer-red">{error}</span>
      ) : (
        hint && <span className="text-xs text-gray-500">{hint}</span>
      )}
    </label>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-answer-red"
    >
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-lg bg-green-50 px-3 py-2 font-semibold text-answer-green">
      {children}
    </p>
  );
}

export const submitBtn =
  'rounded-lg bg-brand py-3 text-lg font-bold text-white disabled:opacity-50';
