'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import {
  X,
  Shield,
  CheckCircle2,
  Landmark,
  Loader2,
  ExternalLink,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Lock,
  ShieldCheck,
  ArrowRight,
  ShieldAlert,
  Clock,
} from 'lucide-react';

interface DuplicateAccount {
  name?: string;
  mask?: string;
  type?: string;
  subtype?: string;
}

interface DuplicateInfo {
  message: string;
  institutionName?: string;
  duplicateAccounts: DuplicateAccount[];
}

interface ChurnLimitInfo {
  message: string;
  institutionName?: string;
  retryAfterHours?: number;
}

interface UpdateItemInfo {
  id: string;
  institutionName: string;
}

interface PlaidConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
  onViewAccounts?: () => void;
  userId?: string;
  updateItem?: UpdateItemInfo | null;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const PlaidConnectModal: React.FC<PlaidConnectModalProps> = ({
  isOpen,
  onClose,
  onConnected,
  onViewAccounts,
  userId: propUserId,
  updateItem,
}) => {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string>(propUserId || '');
  const [isLoadingToken, setIsLoadingToken] = useState<boolean>(false);
  const [isExchanging, setIsExchanging] = useState<boolean>(false);
  const [exchangeSuccess, setExchangeSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateInfo | null>(null);
  const [churnInfo, setChurnInfo] = useState<ChurnLimitInfo | null>(null);

  useEffect(() => {
    if (propUserId) {
      setUserId(propUserId);
    }
  }, [propUserId]);

  const getHeaders = () => {
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('lunaria_token')
        : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  // Fetch real link token from backend
  const fetchLinkToken = useCallback(async () => {
    try {
      setIsLoadingToken(true);
      setErrorMsg(null);
      const effectiveUserId = propUserId || userId || undefined;
      const url = updateItem
        ? `${API_BASE}/plaid/create-update-link-token/${encodeURIComponent(updateItem.id)}`
        : `${API_BASE}/plaid/create-link-token`;

      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ userId: effectiveUserId }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.linkToken) {
        setLinkToken(data.linkToken);
        if (data.userId) setUserId(data.userId);
      } else {
        throw new Error('No link token in server response');
      }
    } catch (err: any) {
      console.error('Failed to create Plaid link token:', err);
      setErrorMsg(
        err.message ||
          'Failed to connect to backend API on http://localhost:3001. Ensure backend is running.',
      );
    } finally {
      setIsLoadingToken(false);
    }
  }, [propUserId, userId, updateItem]);

  useEffect(() => {
    if (isOpen && !linkToken && !isLoadingToken && !errorMsg) {
      fetchLinkToken();
    }
    if (!isOpen) {
      setExchangeSuccess(false);
      setErrorMsg(null);
      setDuplicateInfo(null);
      setChurnInfo(null);
      setLinkToken(null);
    }
  }, [isOpen, linkToken, isLoadingToken, errorMsg, fetchLinkToken]);

  // Plaid onSuccess callback
  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: any) => {
      // In update mode, publicToken exchange is not needed; re-auth happened on Plaid's end
      if (updateItem) {
        try {
          setIsExchanging(true);
          setErrorMsg(null);
          const res = await fetch(
            `${API_BASE}/plaid/update-mode-success/${encodeURIComponent(updateItem.id)}`,
            {
              method: 'POST',
              headers: getHeaders(),
              credentials: 'include',
              body: JSON.stringify({
                userId: propUserId || userId || undefined,
              }),
            },
          );

          if (!res.ok) {
            throw new Error('Failed to finalize re-authentication on server');
          }

          setExchangeSuccess(true);
          setIsExchanging(false);
          if (onConnected) {
            onConnected();
          }
          setTimeout(() => {
            onClose();
          }, 1800);
        } catch (err: any) {
          console.error('Error in Plaid update mode success callback:', err);
          setErrorMsg(err.message || 'Failed to finish bank update');
          setIsExchanging(false);
        }
        return;
      }

      if (!publicToken) return;
      try {
        setIsExchanging(true);
        setErrorMsg(null);
        setDuplicateInfo(null);

        const res = await fetch(`${API_BASE}/plaid/exchange-public-token`, {
          method: 'POST',
          headers: getHeaders(),
          credentials: 'include',
          body: JSON.stringify({
            userId: propUserId || userId || undefined,
            publicToken,
            metadata: {
              institutionId: metadata.institution?.institution_id || 'bank',
              institutionName: metadata.institution?.name || 'Bank',
              accounts: (metadata.accounts || []).map((acc: any) => ({
                id: acc.id,
                name: acc.name,
                mask: acc.mask,
                type: acc.type,
                subtype: acc.subtype,
              })),
            },
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          if (
            (res.status === 403 || res.status === 400 || res.status === 409) &&
            errData?.code === 'INSTITUTION_CHURN_LIMIT_EXCEEDED'
          ) {
            setChurnInfo({
              message:
                errData.message ||
                'This bank has been unlinked and re-added 3 times in the last 24 hours.',
              institutionName:
                errData.institutionName ||
                metadata.institution?.name ||
                'this bank',
              retryAfterHours: errData.retryAfterHours || 24,
            });
            setIsExchanging(false);
            return;
          }

          if (
            res.status === 409 &&
            (errData?.code === 'DUPLICATE_ITEM' || errData?.duplicateAccounts)
          ) {
            setDuplicateInfo({
              message:
                errData.message ||
                'This financial institution or account is already linked.',
              institutionName:
                errData.institutionName ||
                metadata.institution?.name ||
                'Financial Institution',
              duplicateAccounts: errData.duplicateAccounts || [],
            });
            setIsExchanging(false);
            return;
          }
          throw new Error(
            errData?.message || 'Failed to exchange token on backend',
          );
        }

        const data = await res.json();
        setExchangeSuccess(true);
        setIsExchanging(false);

        // Notify parent dashboard to reload transactions & accounts
        if (onConnected) {
          onConnected();
        }

        setTimeout(() => {
          onClose();
        }, 1600);
      } catch (err: any) {
        console.error('Error exchanging public token:', err);
        setErrorMsg(err.message || 'Failed to sync account');
        setIsExchanging(false);
      }
    },
    [userId, propUserId, onConnected, onClose],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (error, metadata) => {
      if (error) {
        console.warn('Plaid Link exited with error:', error);
      }
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-[#10141f] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-sm p-1.5">
              <img src="/logo.png" alt="Lunaria" className="w-full h-full object-contain" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {updateItem ? 'Update Bank Connection' : 'Connect Financial Account'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {updateItem
                  ? `Update Mode • ${updateItem.institutionName}`
                  : 'Official Plaid Link Integration'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Banner */}
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/40 px-5 sm:px-6 py-2.5 sm:py-3 flex items-center gap-2.5 text-xs text-indigo-700 dark:text-indigo-300 shrink-0">
          <Shield className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
          <span>
            {updateItem
              ? 'Plaid Update Mode: Re-authenticates existing Item without duplicate fees.'
              : 'AES-256 encrypted tokens. Raw credentials are never stored.'}
          </span>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {churnInfo ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                  <ShieldAlert className="w-5 h-5 flex-shrink-0" />
                  <span>24-Hour Connection Limit Reached</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  You have removed and re-added{' '}
                  <strong className="text-slate-900 dark:text-white font-medium">
                    {churnInfo.institutionName}
                  </strong>{' '}
                  3 times in the last 24 hours. To protect against excessive connection charges and account churn, re-connecting this bank is paused for 24 hours.
                </p>
                <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-black/40 border border-amber-500/20 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="text-amber-600 dark:text-amber-300 font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span>24-Hour Cooldown Active</span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">
                    Tip: If your bank connection expires or your password changes, you do not need to unlink your bank. Simply use <span className="text-slate-900 dark:text-white font-medium">Fix / Reconnect</span> in Connected Institutions to update credentials safely.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-sm cursor-pointer"
              >
                Understood
              </button>
            </div>
          ) : duplicateInfo ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 space-y-3">
                <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 font-semibold text-sm">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>Account Already Linked</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  You have already connected{' '}
                  <strong className="text-slate-900 dark:text-white font-medium">
                    {duplicateInfo.institutionName}
                  </strong>{' '}
                  to your Lunaria profile. To protect balance accuracy and prevent duplicate records, Lunaria prevented this duplicate connection.
                </p>

                {duplicateInfo.duplicateAccounts.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-amber-500/20">
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400/90">
                      Existing Linked Accounts:
                    </span>
                    <div className="space-y-1">
                      {duplicateInfo.duplicateAccounts.map((acc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-amber-50/60 dark:bg-black/30 border border-amber-500/20 text-slate-700 dark:text-slate-200"
                        >
                          <span className="font-medium truncate mr-2">
                            {acc.name || 'Bank Account'}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {acc.mask && (
                              <span className="font-mono text-[11px] text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded">
                                •••• {acc.mask}
                              </span>
                            )}
                            {(acc.subtype || acc.type) && (
                              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                {acc.subtype || acc.type}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  onClick={() => {
                    if (onViewAccounts) {
                      onViewAccounts();
                    } else {
                      onClose();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-semibold text-xs text-white bg-purple-600 hover:bg-purple-500 transition-colors shadow-lg shadow-purple-500/20 cursor-pointer"
                >
                  <span>View Linked Accounts</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setDuplicateInfo(null);
                    fetchLinkToken();
                  }}
                  className="px-4 py-2.5 rounded-xl font-medium text-xs text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Link Another
                </button>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-600 dark:text-rose-300 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold mb-1">Connection Error</div>
                <div>{errorMsg}</div>
                <button
                  onClick={fetchLinkToken}
                  className="mt-2 text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          ) : exchangeSuccess ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-900 dark:text-white">
                {updateItem ? 'Connection Restored!' : 'Bank Account Connected!'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                {updateItem
                  ? `Your live connection to ${updateItem.institutionName} has been re-authenticated without creating duplicate items.`
                  : 'Your live account details and transactions have been encrypted and synced into your database.'}
              </p>
            </div>
          ) : isExchanging ? (
            <div className="py-8 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-500 dark:text-indigo-400 animate-spin mx-auto" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {updateItem ? 'Restoring Connection...' : 'Syncing Bank Data...'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {updateItem
                  ? `Verifying credentials and syncing transactions for ${updateItem.institutionName}.`
                  : 'Exchanging public token and caching live transactions into PostgreSQL.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs space-y-2.5">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-semibold">
                  <Lock className="w-4 h-4" />
                  <span>
                    {updateItem
                      ? `Re-authenticate ${updateItem.institutionName}`
                      : 'Encrypted Bank Connection'}
                  </span>
                </div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {updateItem
                    ? `Click below to launch Plaid Update Mode. You will safely verify credentials or complete two-factor authentication with ${updateItem.institutionName}. This updates your existing connection without creating duplicate items or adding extra billing fees.`
                    : 'Click the button below to launch Plaid\'s encrypted bank link. You can select your financial institution (Chase, Bank of America, Fidelity, etc.) to securely connect your accounts.'}
                </p>
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800/80 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>End-to-end encrypted • Read-only access • Credentials never stored</span>
                </div>
              </div>

              <button
                disabled={!ready || isLoadingToken}
                onClick={() => open()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 shadow-lg shadow-purple-500/25 transition-all disabled:opacity-50 active:scale-98 cursor-pointer"
              >

                {isLoadingToken ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing Plaid Link...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>
                      {updateItem
                        ? `Re-authenticate with ${updateItem.institutionName}`
                        : 'Launch Plaid Link'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Target: {API_BASE.replace('/api', '')}</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors font-medium cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
