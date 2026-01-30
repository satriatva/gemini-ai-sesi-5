// public/script.js
(() => {
  "use strict";

  const form = document.getElementById("chat-form");
  const input = document.getElementById("user-input"); // textarea
  const chatBox = document.getElementById("chat-box");
  const sendBtn = document.getElementById("send-btn");
  const themeToggle = document.getElementById("theme-toggle");
  const themeIcon = document.getElementById("theme-icon");

  // Must match backend mapping: conversation items are { role, text }
  const conversation = [];

  if (!form || !input || !chatBox) {
    console.error("Missing DOM elements.");
    return;
  }

  // ===== Theme handling =====
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (themeIcon) themeIcon.textContent = theme === "dark" ? "☾" : "☀";
  }

  const savedTheme = localStorage.getItem("theme");
  const initialTheme = savedTheme || "dark";
  applyTheme(initialTheme);

  themeToggle?.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
  });

  // ===== Utilities =====
  function nowTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // Render: paragraphs, UL/OL, inline bold, inline code
  // Also fixes "1. 1. 1." by stripping original numbering -> <ol> auto numbers properly.
  function formatTextToHtml(text) {
    const safe = escapeHtml(text);

    let t = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");

    const lines = t.split(/\r?\n/);

    let html = "";
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl) { html += "</ul>"; inUl = false; }
      if (inOl) { html += "</ol>"; inOl = false; }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) {
        closeLists();
        html += "<p></p>";
        continue;
      }

      // "- item"
      if (/^\-\s+/.test(trimmed)) {
        if (inOl) { html += "</ol>"; inOl = false; }
        if (!inUl) { html += "<ul>"; inUl = true; }
        html += `<li>${trimmed.replace(/^\-\s+/, "")}</li>`;
        continue;
      }

      // "1. item" or "1) item"
      if (/^\d+[\.\)]\s+/.test(trimmed)) {
        if (inUl) { html += "</ul>"; inUl = false; }
        if (!inOl) { html += "<ol>"; inOl = true; }
        html += `<li>${trimmed.replace(/^\d+[\.\)]\s+/, "")}</li>`;
        continue;
      }

      closeLists();
      html += `<p>${trimmed}</p>`;
    }

    closeLists();
    html = html.replace(/(<p><\/p>){2,}/g, "<p></p>");
    return html;
  }

  function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  function setBusy(isBusy) {
    input.disabled = isBusy;
    if (sendBtn) sendBtn.disabled = isBusy;
  }

  // Autosize textarea (like ChatGPT)
  function autosizeTextarea() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  input.addEventListener("input", autosizeTextarea);

  // Shift+Enter new line; Enter sends
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch {
        return false;
      }
    }
  }

  function addMessage({ sender, text, typing = false, rawTextForCopy = "" }) {
    const row = document.createElement("div");
    row.className = "msg-row";

    const msg = document.createElement("div");
    msg.className = `msg ${sender}`;

    const avatar = document.createElement("div");
    avatar.className = `avatar ${sender}`;
    avatar.textContent = sender === "user" ? "You" : "AI";

    const wrap = document.createElement("div");
    wrap.className = "bubble-wrap";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (typing) {
      bubble.innerHTML = `<span class="dots"><span></span><span></span><span></span></span>`;
    } else {
      bubble.innerHTML = formatTextToHtml(text);
    }

    const metaRow = document.createElement("div");
    metaRow.className = "meta-row";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = nowTime();

    metaRow.appendChild(meta);

    // Copy button only for bot messages (not typing)
    let copyBtn = null;
    if (sender !== "user" && !typing) {
      copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        copyBtn.disabled = true;
        const ok = await copyToClipboard(rawTextForCopy || text || "");
        copyBtn.textContent = ok ? "Copied" : "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.disabled = false;
        }, 1200);
      });
      metaRow.appendChild(copyBtn);
    }

    wrap.appendChild(bubble);
    wrap.appendChild(metaRow);

    msg.appendChild(avatar);
    msg.appendChild(wrap);

    row.appendChild(msg);
    chatBox.appendChild(row);
    scrollToBottom();

    return { bubble, metaRow, setCopyText: (t) => (rawTextForCopy = t), addCopyIfMissing: () => {
      if (sender === "user") return;
      if (copyBtn) return;

      copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "copy-btn";
      copyBtn.textContent = "Copy";
      copyBtn.addEventListener("click", async () => {
        copyBtn.disabled = true;
        const ok = await copyToClipboard(rawTextForCopy || text || "");
        copyBtn.textContent = ok ? "Copied" : "Failed";
        setTimeout(() => {
          copyBtn.textContent = "Copy";
          copyBtn.disabled = false;
        }, 1200);
      });
      metaRow.appendChild(copyBtn);
    }};
  }

  async function postChat(payload, signal) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ conversation: payload }),
      signal,
    });

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      throw new Error(data?.error || `HTTP ${res.status} ${res.statusText}`);
    }
    return data;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const userText = input.value.trim();
    if (!userText) return;

    // UI: show user
    addMessage({ sender: "user", text: userText });

    // Payload: must be { role, text } for your backend
    conversation.push({ role: "user", text: userText });

    input.value = "";
    autosizeTextarea();
    setBusy(true);

    // UI: typing bot
    const typingMsg = addMessage({ sender: "bot", text: "", typing: true });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // Safety filter to avoid Gemini 400 due to empty text
      const safePayload = conversation.filter(
        (m) =>
          (m.role === "user" || m.role === "model") &&
          typeof m.text === "string" &&
          m.text.trim().length > 0
      );

      const data = await postChat(safePayload, controller.signal);
      const reply = typeof data?.result === "string" ? data.result.trim() : "";

      if (!reply) {
        typingMsg.bubble.textContent = "Sorry, no response received.";
        return;
      }

      // Replace typing with final bot answer
      typingMsg.bubble.innerHTML = formatTextToHtml(reply);

      // Add copy button now that it's not typing anymore
      typingMsg.setCopyText(reply);
      typingMsg.addCopyIfMissing();

      // Save response for multi-turn context
      conversation.push({ role: "model", text: reply });
    } catch (err) {
      console.error("Chat request failed:", err);
      typingMsg.bubble.textContent = "Failed to get response from server.";
    } finally {
      clearTimeout(timeoutId);
      setBusy(false);
      input.focus();
      scrollToBottom();
    }
  });

  // Welcome message
  const welcome = "Halo! Tulis pertanyaanmu. Aku akan menjawab dalam Bahasa Indonesia.";
  const w = addMessage({ sender: "bot", text: welcome, rawTextForCopy: welcome });
  w.addCopyIfMissing();
})();
