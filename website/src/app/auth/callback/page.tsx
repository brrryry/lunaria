'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert, ArrowLeft, RotateCcw, Lock } from 'lucide-react';
import Link from 'next/link';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);

  useEffect(() => {
    const err = searchParams.get('error');
    const email = searchParams.get('email');

    if (err) {
      setError(err);
      if (email) {
        setUnauthorizedEmail(email);
      }
      return;
    }

    // Clean up any legacy localStorage token
    localStorage.removeItem('lunaria_token');

    // Verify the HttpOnly session cookie set by backend
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${apiUrl}/auth/me`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Authentication session could not be verified.');
        }

        // Synchronize user's explicit email consent choice with backend preferences
        const consent = localStorage.getItem('lunaria_email_consent');
        if (consent !== null) {
          const emailEnabled = consent === 'true';
          await fetch(`${apiUrl}/notifications/preferences`, {
            method: 'PATCH',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ emailEnabled }),
          }).catch(() => {});
        }

        // Transition to main dashboard
        router.replace('/');
      })
      .catch((e: any) => {
        setError(e?.message || 'Authentication failed. Please try signing in again.');
      });
  }, [searchParams, router]);

  // Dedicated Unauthorized / Whitelist Block Modal
  if (error === 'unauthorized_email') {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />

        <div className="bg-[#0e121b]/90 border border-amber-500/30 rounded-2xl p-6 md:p-8 max-w-md w-full text-center relative z-10 backdrop-blur-xl shadow-2xl shadow-black/80">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-amber-600/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold text-white mb-2">Approval Required</h2>
          <p className="text-xs text-slate-300 mb-4 leading-relaxed">
            This private Lunaria instance is restricted to approved accounts. Your Google identity was verified, but your email is not on the access whitelist.
          </p>

          {unauthorizedEmail && (
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-amber-300 mb-6">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>{unauthorizedEmail}</span>
            </div>
          )}

          <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl text-[11px] text-slate-400 text-left mb-6 space-y-1">
            <p className="font-semibold text-slate-300">How to get access:</p>
            <p>1. Contact the developer to be added to the whitelist.</p>
            <p>2. Or sign in using an authorized account.</p>
          </div>

          <div className="flex flex-col gap-2.5">
            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-xs font-semibold py-3 px-4 rounded-xl transition-all shadow-md shadow-purple-500/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Sign In with a Different Account</span>
            </Link>

            <Link
              href="/"
              className="w-full flex items-center justify-center gap-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white text-xs font-medium py-2.5 px-4 rounded-xl border border-slate-700/50 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Login</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Generic Error State
  if (error) {
    return (
      <div className="min-h-screen bg-[#07090e] flex items-center justify-center p-4">
        <div className="bg-[#0e121b] border border-rose-500/20 rounded-2xl p-6 max-w-md w-full text-center">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Authentication Failed</h2>
          <p className="text-xs text-slate-400 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2.5 px-4 rounded-xl transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Login</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] flex flex-col items-center justify-center p-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center p-2.5 mb-4 shadow-xl shadow-purple-500/10 relative group">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-purple-600/20 via-fuchsia-500/15 to-transparent blur-sm pointer-events-none" />
        <img src="/logo.png" alt="Lunaria" className="w-full h-full object-contain relative z-10 animate-pulse" />
      </div>
      <h2 className="text-base font-semibold text-white mb-1">Authenticating with Google...</h2>
      <p className="text-xs text-slate-500">Preparing your personalized financial intelligence dashboard</p>
    </div>
  );

}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#07090e]" />}>
      <CallbackContent />
    </Suspense>
  );
}
