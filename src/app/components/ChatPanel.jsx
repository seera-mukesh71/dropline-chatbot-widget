"use client";

import { useState, useEffect, useRef } from "react";
import { SUGGESTED_QUESTIONS } from "../data/questions";

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Tell the host page (parent window) to hide the iframe
  function closeChat() {
    window.parent.postMessage({ type: "dropline-chat-close" }, "*");
  }

  async function askQuestion(question) {
    if (!question.trim() || loading) return;

    setMessages((prev) => [...prev, { role: "user", text: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // IMPORTANT: only the question is sent. No user data, ever.
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const text = data.answer || data.error || "Something went wrong.";
      setMessages((prev) => [...prev, { role: "bot", text }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "Network error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chatPanel">
      <div className="chatHeader">
        <span className="chatTitle">Help &amp; Support</span>
        <button className="chatClose" onClick={closeChat} aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="chatBody">
        {messages.length === 0 && (
          <>
            <p className="chatGreeting">
              Hi! Ask me about our policies, rules, and product. Tap a question
              or type your own.
            </p>
            <div className="chips">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  className="chip"
                  onClick={() => askQuestion(q)}
                  disabled={loading}
                  suppressHydrationWarning
                >
                  {q}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "msg user" : "msg bot"}>
            {m.text}
          </div>
        ))}
        {loading && <div className="msg bot">Thinking…</div>}
        <div ref={bottomRef} />
      </div>

      <div className="chatInputRow">
        <input
          className="input"
          value={input}
          maxLength={500}
          placeholder="Type your question…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") askQuestion(input);
          }}
          disabled={loading}
          suppressHydrationWarning
        />
        <button
          className="sendBtn"
          onClick={() => askQuestion(input)}
          disabled={loading}
          suppressHydrationWarning
        >
          Send
        </button>
      </div>
    </div>
  );
}
