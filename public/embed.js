(function () {
  // Don't inject twice if the script is included more than once
  if (window.__droplineChatLoaded) return;
  window.__droplineChatLoaded = true;

  // Detect where this script is served from, so it works locally AND in production
  var thisScript =
    document.currentScript ||
    document.querySelector('script[src*="embed.js"]');
  var origin = thisScript
    ? new URL(thisScript.src).origin
    : window.location.origin;

  // Inject styles for the floating bubble + the iframe panel
  var style = document.createElement("style");
  style.textContent = [
    ".dropline-launcher{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;border:none;background:#f37920;color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:2147483000;}",
    ".dropline-launcher:hover{background:#d9641a;}",
    ".dropline-frame{position:fixed;bottom:96px;right:24px;width:380px;height:600px;max-width:calc(100vw - 32px);max-height:calc(100vh - 110px);border:none;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.2);background:transparent;z-index:2147483000;display:none;}",
    ".dropline-frame.open{display:block;}",
    "@media (max-width:480px){.dropline-frame{bottom:88px;right:16px;left:16px;width:auto;height:calc(100vh - 110px);}}",
  ].join("");
  document.head.appendChild(style);

  // The iframe holds the actual chat panel (loaded from /widget)
  var page = thisScript ? thisScript.getAttribute("data-page") : null;
  var frame = document.createElement("iframe");
  frame.src = origin + "/widget" + (page ? "?page=" + encodeURIComponent(page) : "");
  frame.className = "dropline-frame";
  frame.title = "Help chat";
  frame.allow = "microphone"; // ready for Phase 3 voice input
  document.body.appendChild(frame);

  // The floating launcher bubble
  var chatIcon =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
  var launcher = document.createElement("button");
  launcher.className = "dropline-launcher";
  launcher.setAttribute("aria-label", "Open chat");
  launcher.innerHTML = chatIcon;
  document.body.appendChild(launcher);

  function openChat() {
    frame.classList.add("open");
    launcher.innerHTML = "✕";
    launcher.setAttribute("aria-label", "Close chat");
  }
  function closeChat() {
    frame.classList.remove("open");
    launcher.innerHTML = chatIcon;
    launcher.setAttribute("aria-label", "Open chat");
  }
  launcher.addEventListener("click", function () {
    if (frame.classList.contains("open")) closeChat();
    else openChat();
  });

  // Let the ✕ button inside the panel close the widget.
  // Only accept messages coming from our own chatbot origin.
  window.addEventListener("message", function (e) {
    if (e.origin !== origin) return;
    if (e.data && e.data.type === "dropline-chat-close") closeChat();
  });
})();