'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Trash2,
  KeyRound,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Target,
  ReceiptText,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  activeTool?: string | null;
}

interface AiCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userCurrency?: string;
}

const STARTER_PROMPTS = [
  {
    icon: TrendingUp,
    label: 'Net worth & asset breakdown',
    prompt: 'What is my current net worth and account breakdown?',
  },
  {
    icon: Target,
    label: 'Budget status this month',
    prompt: 'How am I doing on my budget this month? Show remaining amounts.',
  },
  {
    icon: ReceiptText,
    label: 'Top expenses last 30 days',
    prompt: 'What are my top 5 largest expenses from the past 30 days?',
  },
  {
    icon: Sparkles,
    label: 'Financial health check',
    prompt: 'Analyze my recent spending patterns and suggest 2-3 areas to optimize.',
  },
];

export const AiCopilotDrawer: React.FC<AiCopilotDrawerProps> = ({
  isOpen,
  onClose,
  userCurrency = 'USD',
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [modelName, setModelName] = useState<string>('gemini-2.5-flash');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check if Gemini API key is configured on mount / open
  const checkStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/ai/status`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setIsConfigured(data.configured);
        if (data.model) setModelName(data.model);
      }
    } catch {
      setIsConfigured(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Load chat history from sessionStorage for persistence across drawer toggles
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('lunaria_copilot_chat');
      if (saved) {
        setMessages(JSON.parse(saved));
      }
    } catch { }
  }, []);

  // Save chat to sessionStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        sessionStorage.setItem('lunaria_copilot_chat', JSON.stringify(messages));
      } catch { }
    }
  }, [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeTool, isLoading]);

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleClearHistory = () => {
    setMessages([]);
    try {
      sessionStorage.removeItem('lunaria_copilot_chat');
    } catch { }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const messageContent = (textToSend || input).trim();
    if (!messageContent || isLoading) return;

    setInput('');
    const userMsgId = 'msg-' + Date.now();
    const assistantMsgId = 'msg-' + (Date.now() + 1);

    const newMessages: Message[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        text: messageContent,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ];

    setMessages(newMessages);
    setIsLoading(true);
    setActiveTool(null);

    // Placeholder for assistant response
    const assistantMessage: Message = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setMessages([...newMessages, assistantMessage]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      // Build conversation history for API
      const historyPayload = messages.slice(-10).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('lunaria_token')
          : null;

      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          message: messageContent,
          history: historyPayload,
        }),
      });

      if (!res.ok) {
        let errMessage = 'Failed to connect to Lunaria Copilot.';
        try {
          const errData = await res.json();
          if (errData.message) errMessage = errData.message;
        } catch { }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `⚠️ **Error:** ${errMessage}` }
              : m,
          ),
        );
        setIsLoading(false);
        return;
      }

      // Stream Server-Sent Events (SSE)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let streamedText = '';

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const event = JSON.parse(trimmed.slice(6));

                if (event.type === 'tool_start') {
                  setActiveTool(event.message || `Running ${event.tool}...`);
                } else if (event.type === 'tool_end') {
                  setActiveTool(null);
                  if (typeof window !== 'undefined') {
                    if (event.tool === 'set_monthly_budget' || event.tool === 'update_budget_target') {
                      window.dispatchEvent(new CustomEvent('lunaria:budget_updated'));
                    } else if (event.tool === 'categorize_transaction') {
                      window.dispatchEvent(new CustomEvent('lunaria:transactions_updated'));
                    }
                  }
                } else if (event.type === 'chunk' && event.text) {
                  setActiveTool(null);
                  streamedText += event.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, text: streamedText } : m,
                    ),
                  );
                } else if (event.type === 'error') {
                  setActiveTool(null);
                  streamedText += `\n\n⚠️ *${event.message}*`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, text: streamedText } : m,
                    ),
                  );
                }
              } catch { }
            }
          }
        }
      }

      if (!streamedText.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId && !m.text.trim()
              ? { ...m, text: 'Done! Let me know if you need any further details.' }
              : m,
          ),
        );
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
              ...m,
              text: `⚠️ **Connection Error:** ${err?.message || 'Could not reach server.'
                }`,
            }
            : m,
        ),
      );
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setActiveTool(null);
    }
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <div className="relative w-full max-w-xl h-full bg-white dark:bg-[#0c0f17] border-l border-slate-200/80 dark:border-slate-800/80 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-500/25 relative group">
              <Sparkles className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  Lunaria Copilot
                </h2>
                <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                  {modelName}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span
                  className={`w-2 h-2 rounded-full ${isConfigured
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-amber-500'
                    }`}
                />
                <span>
                  {isConfigured ? 'Ready & connected' : 'API Key needed'}
                </span>
                <span className="mx-1">•</span>
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>Zero Casual Access</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearHistory}
                title="Clear conversation"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title="Close (ESC)"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* API Key Missing Notice */}
        {isConfigured === false && (
          <div className="mx-5 mt-4 p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500 shrink-0 mt-0.5">
                <KeyRound className="w-4 h-4" />
              </div>
              <div className="flex-1 text-xs">
                <h4 className="font-semibold text-slate-900 dark:text-white mb-1">
                  Gemini API Key Required
                </h4>
                <p className="text-slate-600 dark:text-slate-400 mb-2 leading-relaxed">
                  To activate your AI Financial Copilot, add your Google Gemini
                  key to your root <code className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-[11px]">.env</code> file:
                </p>
                <div className="p-2 rounded bg-slate-900 text-slate-200 font-mono text-[11px] select-all mb-2.5">
                  GEMINI_API_KEY=your_key_here
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-purple-600 dark:text-purple-400 hover:underline"
                  >
                    <span>Get a free key from Google AI Studio</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={checkStatus}
                    className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Check again</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col justify-center items-center text-center px-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4 shadow-xl shadow-purple-500/10">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">
                Your Personal Financial Intelligence
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
                Ask about account balances, spending trends, monthly budgets, or
                have me recategorize transactions on the fly.
              </p>

              <div className="w-full space-y-2 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                  Suggested Questions
                </span>
                {STARTER_PROMPTS.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(item.prompt)}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 hover:border-purple-500/40 hover:bg-purple-500/5 dark:hover:bg-purple-500/5 transition-all text-xs font-medium text-slate-700 dark:text-slate-300 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  {!isUser && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-purple-500/20 text-xs">
                      <Sparkles className="w-4 h-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${isUser
                        ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/15'
                        : 'bg-slate-50 dark:bg-[#131722] border border-slate-200/80 dark:border-slate-800/80 text-slate-900 dark:text-slate-100'
                      }`}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{m.text}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-li:my-0.5 prose-table:my-2">
                        {m.text ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {m.text}
                          </ReactMarkdown>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-400 py-1">
                            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
                            <span className="text-xs">Thinking...</span>
                          </div>
                        )}
                      </div>
                    )}
                    <span
                      className={`block text-[10px] mt-1.5 ${isUser
                          ? 'text-purple-200 text-right'
                          : 'text-slate-400 text-left'
                        }`}
                    >
                      {m.timestamp}
                    </span>
                  </div>
                </div>
              );
            })
          )}

          {/* Active Tool Execution Indicator */}
          {activeTool && (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-medium animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{activeTool}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/40 backdrop-blur-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-end gap-2 bg-white dark:bg-[#0c0f17] border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-sm focus-within:border-purple-500/60 focus-within:ring-2 focus-within:ring-purple-500/15 transition-all"
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDownInput}
              placeholder="Ask Lunaria about your finances or budgets..."
              className="flex-1 max-h-32 min-h-[36px] bg-transparent resize-none border-0 px-2 py-1.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="w-9 h-9 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-500/25 transition-all shrink-0"
              title="Send (Enter)"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 px-1 text-[11px] text-slate-400">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span className="font-mono">⌘K</span>
          </div>
        </div>
      </div>
    </div>
  );
};
