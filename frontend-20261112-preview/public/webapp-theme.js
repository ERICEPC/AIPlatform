/* Published chat visual adapter. No network interception or chat state changes. */
(() => {
  function parseStructured(text) {
    try {
      const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, '$1'));
      if (!value || typeof value.summary !== 'string' || !Array.isArray(value.suggestions)
        || Object.keys(value).some(key => !['summary', 'suggestions'].includes(key))) return null;
      if (value.suggestions.some(s => !s || Array.isArray(s) || typeof s !== 'object'
        || Object.entries(s).some(([key, value]) => !['title', 'evidence', 'action'].includes(key) || typeof value !== 'string'))) return null;
      return value;
    } catch { return null; }
  }
  if (typeof module !== 'undefined') module.exports = { parseStructured };
  if (typeof document === 'undefined') return;
  if (!/^\/(agent|chat|chatbot)\//.test(location.pathname)) return;
  document.documentElement.classList.add('rx-webapp');
  let pending = false;
  function decorate() {
    pending = false;
    const root = document.querySelector('[data-testid="chat-root"]');
    if (!root) return;
    const panel = root.closest('.bg-chatbot-bg')?.parentElement;
    const shell = panel?.parentElement?.parentElement;
    shell?.classList.add('rx-chat-shell');
    panel?.classList.add('rx-chat-panel');
    const sidebar = shell?.firstElementChild;
    if (sidebar && sidebar !== panel?.parentElement) sidebar.classList.add('rx-chat-sidebar');
    const icon = sidebar?.querySelector('img.size-full') || panel?.querySelector('img.size-full');
    const src = icon?.getAttribute('src');
    if (src) {
      const url = new URL(src, location.origin);
      if (['http:', 'https:'].includes(url.protocol)) {
        const value = `url(${JSON.stringify(url.href)})`;
        if (document.documentElement.style.getPropertyValue('--rx-agent-avatar') !== value)
          document.documentElement.style.setProperty('--rx-agent-avatar', value);
      }
    }
    document.querySelectorAll('[data-testid="chat-answer-container"]').forEach(answer => {
      const avatar = answer.previousElementSibling;
      if (avatar) {
        avatar.classList.add('rx-answer-avatar');
        avatar.setAttribute('role', 'img');
        avatar.setAttribute('aria-label', 'Agent');
      }
      let header = answer.querySelector(':scope > .rx-message-heading');
      if (!header) {
        header = document.createElement('div'); header.className = 'rx-message-heading';
        answer.prepend(header);
      }
      const name = document.title.replace(/\s*-\s*Raccoon X.*$/, '') || '助手';
      const latency = answer.querySelector('[data-testid="more-latency"]')?.textContent?.trim();
      const heading = name + (latency ? `  ·  ${latency}` : '');
      if (header.textContent !== heading) header.textContent = heading;
      answer.querySelectorAll('[data-testid="markdown-body"]').forEach(markdown => {
        const raw = markdown.textContent || '';
        const value = parseStructured(raw);
        let view = markdown.nextElementSibling;
        if (!view?.classList.contains('rx-structured-reply')) view = null;
        if (!value) {
          markdown.classList.remove('rx-structured-source');
          view?.remove();
          return;
        }
        if (view?.dataset.source === raw) return;
        if (!view) { view = document.createElement('section'); view.className = 'rx-structured-reply'; markdown.after(view); }
        view.dataset.source = raw;
        view.replaceChildren();
        const addText = (parent, tag, text, className = '') => {
          const el = document.createElement(tag); el.className = className; el.textContent = text; parent.append(el); return el;
        };
        addText(view, 'p', value.summary, 'rx-summary');
        if (value.suggestions.length) {
          const cards = addText(view, 'div', '', 'rx-suggestions');
          value.suggestions.forEach((suggestion, index) => {
            const card = addText(cards, 'article', '', 'rx-suggestion');
            addText(card, 'h3', `${String(index + 1).padStart(2, '0')}  ${suggestion.title || '建议'}`);
            if (suggestion.evidence) addText(card, 'p', `依据：${suggestion.evidence}`, 'rx-evidence');
            if (suggestion.action) addText(card, 'p', suggestion.action, 'rx-action');
          });
        }
        const source = addText(view, 'details', '', 'rx-source-details');
        addText(source, 'summary', '查看原始数据'); addText(source, 'pre', raw);
        markdown.classList.add('rx-structured-source');
      });
      answer.querySelectorAll('a[href]').forEach(link => {
        // Only decorate existing downloadable links; never invent file metadata.
        if (/\.(pptx?|docx?|xlsx?|pdf|zip|csv|md)(?:[?#]|$)/i.test(link.getAttribute('href') || '') || link.hasAttribute('download'))
          link.classList.add('rx-file-download');
      });
    });
  }
  const observer = new MutationObserver(() => {
    if (!pending) { pending = true; requestAnimationFrame(decorate); }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  decorate();
})();
