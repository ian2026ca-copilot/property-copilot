"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  text: string;
}

const MOCK_RESPONSES = [
  "Based on current occupancy (93%), your portfolio is performing above the 85% market benchmark. Consider raising rents by 3–5% on renewal for units in the Downtown market.",
  "Unit 102 HVAC replacement is overdue. Scheduling now could prevent a $4,200 emergency repair. I recommend dispatching a vendor this week.",
  "2 leases expire within 90 days. Starting renewal conversations 60 days out increases renewal rate by 18% on average.",
  "Your highest-risk tenant is in Unit 305 — 2 late payments in the last 6 months. Consider a proactive check-in before their lease renewal.",
];

let mockIdx = 0;

export default function AIDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi! I'm your Property Copilot. Ask me about vacancy, rent trends, maintenance, or tenant risk." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", text: userMsg }]);
    setLoading(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: MOCK_RESPONSES[mockIdx % MOCK_RESPONSES.length] }]);
      mockIdx++;
      setLoading(false);
    }, 900);
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
            <p className="text-white/50 text-[10px] uppercase tracking-wider">Copilot</p>
            <h2 className="text-white text-sm font-semibold">AI Property Assistant</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-black text-white rounded-br-sm"
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-xl rounded-bl-sm px-3 py-2 text-sm text-slate-400">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about rent, vacancy, risk…"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-black"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-3 py-2 bg-black text-white text-sm rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </aside>
    </>
  );
}
