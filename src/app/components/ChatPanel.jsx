"use client";

import { useState, useEffect, useRef } from "react";
import { QUESTIONS_BY_PAGE } from "../data/questions";
import { LANGUAGES, SPEECH_CODES } from "../data/languages";

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState("en");
  const [listening, setListening] = useState(false);
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [pageQuestions, setPageQuestions] = useState(QUESTIONS_BY_PAGE.default);
  const [showQuestions, setShowQuestions] = useState(true);
  const voicesRef = useRef([]);
  const recognitionRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  // Read which page's questions to show (host passes ?page=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page");
    setPageQuestions(QUESTIONS_BY_PAGE[page] || QUESTIONS_BY_PAGE.default);
  }, []);

  useEffect(() => {
    const SR =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SR) setSttSupported(true);

    if (typeof window !== "undefined" && window.speechSynthesis) {
      setTtsSupported(true);
      const loadVoices = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function closeChat() {
    stopSpeaking();
    window.parent.postMessage({ type: "dropline-chat-close" }, "*");
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeakingIndex(null);
  }

  function speak(text, index) {
    if (!ttsSupported || !text) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const code = SPEECH_CODES[language] || "en-IN";
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = code;

    const voices = voicesRef.current || [];
    const match =
      voices.find((v) => v.lang === code) ||
      voices.find((v) => v.lang && v.lang.startsWith(language));
    if (match) utt.voice = match;

    utt.onstart = () => setSpeakingIndex(index);
    utt.onend = () => setSpeakingIndex(null);
    utt.onerror = () => setSpeakingIndex(null);

    synth.speak(utt);
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();

    const recognition = new SR();
    recognition.lang = SPEECH_CODES[language] || "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setListening(false);
      if (transcript) askQuestion(transcript, true);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function askQuestion(question, fromVoice = false) {
    if (!question.trim() || loading) return;

    const historyToSend = messages.slice(-6).map((m) => ({
      role: m.role,
      text: m.textEn,
    }));

    setMessages((prev) => [
      ...prev,
      { role: "user", text: question, textEn: question },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, language, history: historyToSend }),
      });
      const data = await res.json();
      const displayText = data.answer || data.error || "Something went wrong.";

      let botIndex = 0;
      setMessages((prev) => {
        const updated = [...prev];
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].role === "user") {
            updated[i] = {
              ...updated[i],
              textEn: data.questionEn || updated[i].text,
            };
            break;
          }
        }
        updated.push({
          role: "bot",
          text: displayText,
          textEn: data.answerEn || displayText,
        });
        botIndex = updated.length - 1;
        return updated;
      });

      if (fromVoice) speak(displayText, botIndex);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Network error. Please try again.",
          textEn: "Network error. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chatPanel">
      <div className="chatHeader">
        <span className="chatTitle">Help &amp; Support</span>
        <div className="chatHeaderRight">
          <select
            className="langSelect"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Choose language"
            suppressHydrationWarning
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button className="chatClose" onClick={closeChat} aria-label="Close chat">
            ✕
          </button>
        </div>
      </div>

      <div className="chatBody">
        {messages.length === 0 && (
          <p className="chatGreeting">
            Hi! Ask me about our policies, rules, and product. Choose your
            language above, then tap a question, type, or use the microphone.
          </p>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="msg user">
              {m.text}
            </div>
          ) : (
            <div key={i} className="msg bot">
              <span className="msgText">{m.text}</span>
              {ttsSupported &&
                (speakingIndex === i ? (
                  <button
                    className="speakBtn speaking"
                    onClick={stopSpeaking}
                    aria-label="Stop speaking"
                    title="Stop"
                  >
                    ⏹
                  </button>
                ) : (
                  <button
                    className="speakBtn"
                    onClick={() => speak(m.text, i)}
                    aria-label="Read answer aloud"
                    title="Read aloud"
                  >
                    🔊
                  </button>
                ))}
            </div>
          )
        )}
        {loading && <div className="msg bot">…</div>}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions — always available, collapsible */}
      <div className="suggestBar">
        <button
          className="suggestToggle"
          onClick={() => setShowQuestions((v) => !v)}
          aria-label="Toggle suggested questions"
        >
          {showQuestions ? "Hide suggestions ▾" : "Show suggestions ▸"}
        </button>
        {showQuestions && (
          <div className="chips">
            {pageQuestions.map((q) => (
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
        )}
      </div>

      <div className="chatInputRow">
        {sttSupported && (
          <button
            className={listening ? "micBtn listening" : "micBtn"}
            onClick={listening ? stopListening : startListening}
            disabled={loading}
            aria-label={listening ? "Stop listening" : "Speak your question"}
            title={listening ? "Listening… tap to stop" : "Speak"}
            suppressHydrationWarning
          >
            🎤
          </button>
        )}
        <input
          className="input"
          value={input}
          maxLength={500}
          placeholder={listening ? "Listening…" : "Type your question…"}
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