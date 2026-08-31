"use client";

import { useState, useRef, useEffect } from "react";
import { copilotApi, CopilotMessage, CopilotPendingAction } from "@/lib/api";

export default function AIDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<CopilotMessage[]>([
    { role: "assistant", text: "Hi! I'm your Property Copilot. I can help you create a property, a tenant, or a lease, and send a tenant their portal invite by email or SMS — just tell me what you'd like to start with." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<CopilotPendingAction | null>(null);
  const [createdContext, setCreatedContext] = useState<Record<string, unknown>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingAction]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading || pendingAction) return;
    const userMsg: CopilotMessage = { role: "user", text: input.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const res = await copilotApi.chat(nextMessages, createdContext);
      if (res.reply) setMessages((m) => [...m, { role: "assistant", text: res.reply }]);
      setPendingAction(res.pending_action);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    setConfirming(true); setError("");
    try {
      const res = await copilotApi.execute(pendingAction.action, pendingAction.payload, createdContext);
      const confirmMsg: CopilotMessage = { role: "assistant", text: `✅ ${res.summary}` };
      const nextMessages = [...messages, confirmMsg];
      setMessages(nextMessages);
      setCreatedContext(res.created_context);
      setPendingAction(null);
      setLoading(true);
      const followUp = await copilotApi.chat(nextMessages, res.created_context);
      if (followUp.reply) setMessages((m) => [...m, { role: "assistant", text: followUp.reply }]);
      setPendingAction(followUp.pending_action);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setConfirming(false);
      setLoading(false);
    }
  }

  function handleCancel() {
    setPendingAction(null);
    setMessages((m) => [...m, { role: "assistant", text: "No problem — let me know if you'd like to change anything." }]);
  }

  return (
    <>
      {/* Scrim */}
      {open && <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />}

      {/* Drawer */}
      <aside
        className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-black">
          <div>
            <p className="text-white/50 text-[12px] uppercase tracking-wider">Copilot</p>
            <h2 className="text-white text-sm font-semibold">AI Property Assistant</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-black text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}

          {pendingAction && (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 space-y-2">
              <p className="text-xs font-medium text-violet-900">{pendingAction.summary}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
                >
                  {confirming ? "Creating…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={confirming}
                  className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2 text-sm text-slate-400">
                Thinking…
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={pendingAction ? "Confirm or cancel above first…" : "Ask about rent, vacancy, risk…"}
            disabled={!!pendingAction || loading}
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={loading || !!pendingAction}
            className="px-3 py-2 bg-black text-white text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
}
