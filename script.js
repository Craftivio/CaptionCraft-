/* ═══════════════════════════════════════════════════════
   CAPTIONCRAFT — script.js  (Premium Upgrade)
   - Tone pill selector
   - Skeleton loader
   - Toast notifications
   - Caption expand/collapse
   - IntersectionObserver scroll reveals
   - FAQ accordion
   - Scrolled navbar class
   - Mobile hamburger menu
   - Mobile sticky generate button
   - Regenerate button
═══════════════════════════════════════════════════════ */

'use strict';

/* ── STATE ── */
let captionStore  = [];
let selectedTone  = 'motivational';
let isGenerating  = false;

/* ── DOM REFS ── */
const nicheInput        = document.getElementById('niche');
const charBadge         = document.getElementById('charCount');
const generateBtn       = document.getElementById('generateBtn');
const generateBtnSticky = document.getElementById('generateBtnSticky');
const btnContent        = document.getElementById('btnContent');
const btnLoader         = document.getElementById('btnLoader');
const outputEmpty       = document.getElementById('outputEmpty');
const outputSkeleton    = document.getElementById('outputSkeleton');
const outputResults     = document.getElementById('outputResults');
const captionsList      = document.getElementById('captionsList');
const copyAllBtn        = document.getElementById('copyAllBtn');
const outputMeta        = document.getElementById('outputMeta');
const regenerateBtn     = document.getElementById('regenerateBtn');
const toneGrid          = document.getElementById('toneGrid');
const toast             = document.getElementById('toast');
const navbar            = document.getElementById('navbar');
const hamburger         = document.getElementById('hamburger');
const mobileNav         = document.getElementById('mobileNav');
const navLinks          = document.getElementById('navLinks');
const faqList           = document.getElementById('faqList');

/* ════════════════════════════════════════════
   NAVBAR — scroll class + hamburger
════════════════════════════════════════════ */
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
  // Hide sticky button when desktop generate button is visible
  if (generateBtn) {
    const rect = generateBtn.getBoundingClientRect();
    const visible = rect.top >= 0 && rect.bottom <= window.innerHeight;
    generateBtnSticky.classList.toggle('hidden', visible);
  }
}, { passive: true });

hamburger.addEventListener('click', () => {
  const open = hamburger.classList.toggle('open');
  hamburger.setAttribute('aria-expanded', String(open));
  mobileNav.classList.toggle('open', open);
  mobileNav.setAttribute('aria-hidden', String(!open));
});

// Close mobile nav when a link is tapped
mobileNav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    mobileNav.classList.remove('open');
    mobileNav.setAttribute('aria-hidden', 'true');
  });
});

/* ════════════════════════════════════════════
   SCROLL REVEAL — IntersectionObserver
════════════════════════════════════════════ */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target); // fire once
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

/* ════════════════════════════════════════════
   CHARACTER COUNTER
════════════════════════════════════════════ */
nicheInput.addEventListener('input', () => {
  const len = nicheInput.value.length;
  charBadge.textContent = len;
  charBadge.classList.toggle('near-limit', len > 120 && len <= 149);
  charBadge.classList.toggle('at-limit',   len >= 150);
});

nicheInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    triggerGenerate();
  }
});

/* ════════════════════════════════════════════
   TONE PILLS
════════════════════════════════════════════ */
toneGrid.querySelectorAll('.tone-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    toneGrid.querySelectorAll('.tone-pill').forEach(p => {
      p.classList.remove('active');
      p.setAttribute('aria-pressed', 'false');
    });
    pill.classList.add('active');
    pill.setAttribute('aria-pressed', 'true');
    selectedTone = pill.dataset.tone;
  });
});

/* ════════════════════════════════════════════
   FAQ ACCORDION
════════════════════════════════════════════ */
faqList.querySelectorAll('.faq-item').forEach(item => {
  const btn = item.querySelector('.faq-q');
  btn.addEventListener('click', () => {
    const isOpen = item.classList.contains('open');
    // Close all
    faqList.querySelectorAll('.faq-item').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    // Toggle clicked
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ════════════════════════════════════════════
   GENERATE — main trigger
════════════════════════════════════════════ */
generateBtn.addEventListener('click', triggerGenerate);
generateBtnSticky.addEventListener('click', triggerGenerate);
regenerateBtn.addEventListener('click', triggerGenerate);

async function triggerGenerate() {
  if (isGenerating) return;

  const niche        = nicheInput.value.trim();
  const tone         = selectedTone;
  const includeEmoji = document.getElementById('includeEmoji').checked;
  const includeHashtags = document.getElementById('includeHashtags').checked;
  const includeCta   = document.getElementById('includeCta').checked;

  if (!niche) {
    nicheInput.focus();
    nicheInput.classList.add('shake');
    setTimeout(() => nicheInput.classList.remove('shake'), 500);
    showToast('Please describe your post first ↑', 'error');
    return;
  }

  isGenerating = true;
  setLoadingState(true);
  showSkeleton();

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ niche, tone, includeEmoji, includeHashtags, includeCta })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }

    if (!data.captions || !Array.isArray(data.captions) || data.captions.length === 0) {
      throw new Error('No captions were returned. Please try again.');
    }

    captionStore = data.captions;
    renderCaptions(data.captions, { niche, tone });
    showToast('5 captions ready! ✦', 'success');

    // Scroll output into view on mobile
    if (window.innerWidth < 900) {
      setTimeout(() => {
        outputResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 200);
    }

  } catch (err) {
    showSkeleton(false);
    showToast(err.message || 'Connection error. Please try again.', 'error');
  } finally {
    isGenerating = false;
    setLoadingState(false);
  }
}

/* ════════════════════════════════════════════
   RENDER CAPTIONS
════════════════════════════════════════════ */
function renderCaptions(captions, meta) {
  captionsList.innerHTML = '';

  const toneLabel = document.querySelector(`.tone-pill[data-tone="${meta.tone}"] .pill-label`);
  outputMeta.textContent = `${toneLabel ? toneLabel.textContent : meta.tone} tone · "${meta.niche.slice(0, 30)}${meta.niche.length > 30 ? '…' : ''}"`;

  captions.forEach((caption, index) => {
    const card = document.createElement('div');
    card.className = 'caption-card';

    const top = document.createElement('div');
    top.className = 'caption-card-top';

    const idx = document.createElement('span');
    idx.className = 'caption-index';
    idx.textContent = String(index + 1).padStart(2, '0');

    const preview = document.createElement('p');
    preview.className = 'caption-preview';
    preview.textContent = caption;

    const expandIcon = document.createElement('span');
    expandIcon.className = 'caption-expand-icon';
    expandIcon.setAttribute('aria-hidden', 'true');
    expandIcon.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    top.appendChild(idx);
    top.appendChild(preview);
    top.appendChild(expandIcon);

    // Toggle expand on click
    top.addEventListener('click', () => {
      card.classList.toggle('expanded');
    });

    const actions = document.createElement('div');
    actions.className = 'caption-card-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'caption-copy-btn';
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>Copy`;
    copyBtn.addEventListener('click', e => {
      e.stopPropagation();
      copyText(captionStore[index], copyBtn);
    });

    const charCount = document.createElement('span');
    charCount.className = 'caption-char-count';
    charCount.textContent = `${caption.length} chars`;

    actions.appendChild(copyBtn);
    actions.appendChild(charCount);

    card.appendChild(top);
    card.appendChild(actions);
    captionsList.appendChild(card);
  });

  // Show results
  outputSkeleton.classList.remove('active');
  outputSkeleton.style.display = 'none';
  outputEmpty.style.display = 'none';
  outputResults.style.display = 'flex';
  outputResults.classList.add('active');
}

/* ════════════════════════════════════════════
   COPY ALL
════════════════════════════════════════════ */
copyAllBtn.addEventListener('click', () => {
  if (captionStore.length === 0) return;
  const text = captionStore.map((c, i) => `Caption ${i + 1}:\n${c}`).join('\n\n---\n\n');
  copyText(text, copyAllBtn, 'All Copied ✓', 'Copy All');
});

/* ════════════════════════════════════════════
   COPY HELPER
════════════════════════════════════════════ */
function copyText(text, btn, successLabel = 'Copied ✓', resetLabel = null) {
  const originalHTML = btn.innerHTML;

  const onSuccess = () => {
    if (successLabel === 'Copied ✓') {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${successLabel}`;
    } else {
      btn.textContent = successLabel;
    }
    btn.classList.add('copied');
    // Haptic feedback on mobile
    if (navigator.vibrate) navigator.vibrate(40);
    showToast('Copied to clipboard!', 'success');
    setTimeout(() => {
      btn.innerHTML = resetLabel ? resetLabel : originalHTML;
      btn.classList.remove('copied');
    }, 2200);
  };

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      fallbackCopy(text);
      onSuccess();
    });
  } else {
    fallbackCopy(text);
    onSuccess();
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch (_) {}
  document.body.removeChild(ta);
}

/* ════════════════════════════════════════════
   SKELETON LOADER
════════════════════════════════════════════ */
function showSkeleton(show = true) {
  if (show) {
    outputEmpty.style.display    = 'none';
    outputResults.style.display  = 'none';
    outputResults.classList.remove('active');
    outputSkeleton.style.display = 'flex';
    outputSkeleton.classList.add('active');
    outputSkeleton.setAttribute('aria-hidden', 'false');
  } else {
    outputSkeleton.style.display = 'none';
    outputSkeleton.classList.remove('active');
    outputSkeleton.setAttribute('aria-hidden', 'true');
    if (captionStore.length === 0) outputEmpty.style.display = 'flex';
  }
}

/* ════════════════════════════════════════════
   LOADING STATE
════════════════════════════════════════════ */
function setLoadingState(loading) {
  generateBtn.disabled = loading;
  generateBtnSticky.disabled = loading;

  if (loading) {
    btnContent.style.display = 'none';
    btnLoader.style.display  = 'flex';
    generateBtnSticky.style.opacity = '0.7';
  } else {
    btnContent.style.display = 'flex';
    btnLoader.style.display  = 'none';
    generateBtnSticky.style.opacity = '1';
  }
}

/* ════════════════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════════════════ */
let toastTimeout = null;

function showToast(message, type = 'default') {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('toast-success');
  if (type === 'error')   toast.classList.add('toast-error');

  // Force reflow so transition replays if called quickly
  void toast.offsetWidth;
  toast.classList.add('show');

  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ════════════════════════════════════════════
   INPUT SHAKE ANIMATION (CSS only needs this once)
════════════════════════════════════════════ */
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%,100% { transform: translateX(0); }
    20%      { transform: translateX(-6px); }
    40%      { transform: translateX(6px); }
    60%      { transform: translateX(-4px); }
    80%      { transform: translateX(4px); }
  }
  .shake { animation: shake 0.4s var(--ease) both; }
`;
document.head.appendChild(shakeStyle);

/* ════════════════════════════════════════════
   INIT — kick off reveal for elements already in viewport
════════════════════════════════════════════ */
window.dispatchEvent(new Event('scroll'));
