import React from 'react';
import Link from 'next/link';
import {
  Shield,
  ArrowLeft,
  Lock,
  Mail,
  Database,
  Building2,
  Trash2,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy | Lunaria',
  description: 'Learn how Lunaria collects, protects, and handles your financial data and email communications.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#07090e] text-slate-300 antialiased selection:bg-purple-500/20 selection:text-purple-300">
      {/* Background glow effects */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-purple-600/10 rounded-full blur-[140px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[300px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none -z-10" />

      {/* Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07090e]/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Lunaria</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center p-1">
              <img src="/logo.png" alt="Lunaria" className="w-full h-full object-contain" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">Lunaria</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12">
        {/* Header Title */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium">
            <Shield className="w-3.5 h-3.5" />
            <span>Consumer Privacy & Security Standards</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-400">
            Last Updated: September 7, 2026 • Effective Date: September 7, 2026
          </p>
        </div>

        {/* Commitment Banner */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 sm:p-6 backdrop-blur-sm space-y-2">
          <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>Our Privacy Guarantee: We Never Sell Your Data</span>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Lunaria is built to provide private, intelligent financial tracking. We do not sell, rent, monetize, or trade your personal, banking, or transactional data with third-party advertisers, data brokers, or marketing networks. Your financial data is used solely to deliver your personal dashboard, cash flow metrics, and configured alerts.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10 text-sm text-slate-300 leading-relaxed">
          {/* Section 1 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">1.</span> Information We Collect
            </h2>
            <p>
              When you use Lunaria, we collect the following categories of information to provide personal financial intelligence:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Account Credentials & Profile:</strong> Your name, email address, and authentication identifier provided through Google OAuth when you sign in.
              </li>
              <li>
                <strong className="text-slate-200">Connected Financial Data:</strong> When you connect accounts through Plaid, we receive account metadata (institution name, account name, account type, subtype, and masked account number), real-time account balances, and historical transaction records (dates, amounts, merchant names, categories).
              </li>
              <li>
                <strong className="text-slate-200">Investment Portfolio Information:</strong> If you connect an investment account, we receive holding details (securities, tickers, quantities, prices) and trade transaction history.
              </li>
              <li>
                <strong className="text-slate-200">User Preferences:</strong> Category assignments, envelope budget allocations, custom rules, and notification preferences configured by you.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">2.</span> Plaid Financial Integration & Banking Credentials
            </h2>
            <p>
              Lunaria integrates with <strong className="text-white">Plaid Inc. (&ldquo;Plaid&rdquo;)</strong> to securely gather your financial information from your financial institutions.
            </p>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Lock className="w-4 h-4 text-purple-400" />
                <span>Zero Knowledge of Bank Logins</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                When you connect your bank or brokerage, your credentials (usernames, passwords, and multi-factor authentication codes) are entered directly into Plaid&apos;s encrypted interface. Lunaria <strong>never sees, receives, or stores your banking login credentials</strong>. Plaid provides Lunaria with an encrypted access token that grants read-only access to your account data.
              </p>
              <div className="pt-2">
                <a
                  href="https://plaid.com/legal/#end-user-privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                >
                  <span>Read Plaid&apos;s End User Privacy Policy</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">3.</span> Email Communications & Explicit User Consent
            </h2>
            <p>
              We respect your inbox and strictly adhere to CAN-SPAM and privacy consent regulations. We will only send you email communications under the following explicit criteria:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Explicit Consent:</strong> During registration or in your application settings, you have the option to grant or withhold consent to receive notification emails.
              </li>
              <li>
                <strong className="text-slate-200">Types of Emails:</strong> When consent is granted, emails may include transaction threshold alerts (e.g. deposits or expenses exceeding amounts you specify), account disconnection notifications, and budget pacing summaries.
              </li>
              <li>
                <strong className="text-slate-200">Right to Revoke & Unsubscribe:</strong> You can modify or completely revoke your email consent at any time with a single click in <strong className="text-slate-200">Settings &rarr; Notifications</strong>. Additionally, every automated email contains an unsubscribe and preference management link in its footer.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">4.</span> Data Security & Encryption Standards
            </h2>
            <p>
              We enforce multi-layered security protections to safeguard your personal financial data:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Lock className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Application-Layer Encryption (AES-256-GCM)</span>
                </div>
                <p className="text-xs text-slate-400">
                  All sensitive Plaid access tokens and keys are encrypted at-rest using AES-256-GCM with unique cryptographic initialization vectors before storing in PostgreSQL.
                </p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Encrypted Storage at Rest</span>
                </div>
                <p className="text-xs text-slate-400">
                  Consumer transactions, balances, and history are hosted on encrypted persistent disk storage volumes (AES-256) with restricted container network access.
                </p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">5.</span> Data Retention & Your Right to Delete
            </h2>
            <p>
              You maintain complete ownership of your personal financial data. You have the right to inspect, disconnect, or purge your records at any time:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>
                <strong className="text-slate-200">Unlinking Financial Institutions:</strong> You can disconnect any bank or brokerage from the <strong className="text-slate-200">Accounts</strong> view. This immediately deletes the encrypted Plaid access token and revokes access.
              </li>
              <li>
                <strong className="text-slate-200">Account & Data Purge:</strong> In <strong className="text-slate-200">Settings &rarr; System &amp; Privacy</strong>, you can permanently delete your account, which immediately cascades and erases all connected accounts, transactions, holdings, and preferences from our database.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-purple-400">6.</span> Contact & Inquiries
            </h2>
            <p className="text-slate-400">
              If you have any questions or concerns regarding this Privacy Policy or how your data is handled in Lunaria, please reach out to:
            </p>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs space-y-1 text-slate-300">
              <p><strong className="text-white">Lunaria Financial Intelligence (Self-Hosted)</strong></p>
              <p>Deployment Administrator: <span className="text-purple-400">Configured via instance owner</span></p>
              <p>Support & Issues: <span className="text-slate-400">Contact your self-hosted Lunaria administrator</span></p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>&copy; {new Date().getFullYear()} Lunaria. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-slate-300 transition-colors">
              Home
            </Link>
            <Link href="/privacy" className="text-purple-400 font-medium hover:text-purple-300 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
