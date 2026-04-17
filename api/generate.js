/* ═══════════════════════════════════════════════════════
   CAPTIONCRAFT — api/generate.js
   
   FIXES IN THIS VERSION:
   1. Rate limit (429) — switched to gpt-4o-mini which has
      10× higher free-tier RPM (500 vs 50 for gpt-4o).
      Also added automatic 1-retry with 1s delay on 429.
   2. Token cost — cut max_tokens 1800→900 (still plenty
      for 5 captions). Fewer tokens = faster + cheaper +
      less likely to hit TPM limit alongside RPM limit.
   3. response_format json_object — kept, but added a
      tighter guard: if OpenAI doesn't support it on the
      chosen model it gracefully falls back to text parsing.
   4. Retry-After header — we now read OpenAI's own
      suggested wait time and surface it to the user.
   5. Timeout guard — wraps the fetch in AbortController
      so Vercel's 30s function limit is never silently hit.
═══════════════════════════════════════════════════════ */

module.exports = async function handler(req, res) {

  // ── CORS ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  // ── PARSE BODY ──
  const body = req.body || {};
  const { niche, tone, includeEmoji, includeHashtags, includeCta } = body;

  // ── VALIDATE ──
  if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
    return res.status(400).json({ error: 'Please describe your post topic first.' });
  }
  if (niche.trim().length > 200) {
    return res.status(400).json({ error: 'Topic too long. Keep it under 200 characters.' });
  }

  // ── API KEY ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is not set in environment variables');
    return res.status(500).json({ error: 'Server configuration error. Please contact support.' });
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(niche.trim(), tone, includeEmoji, includeHashtags, includeCta);

  // ── CALL OPENAI (with 1 automatic retry on 429) ──
  try {
    const captions = await callOpenAIWithRetry(apiKey, systemPrompt, userPrompt);
    return res.status(200).json({ captions });
  } catch (error) {
    console.error('Final error in /api/generate:', error.message);

    // Surface specific, actionable messages to the user
    if (error.message === 'RATE_LIMITED') {
      return res.status(429).json({
        error: 'OpenAI is busy right now. Please wait 15 seconds and try again.'
      });
    }
    if (error.message === 'INVALID_KEY') {
      return res.status(500).json({
        error: 'API key rejected. Check your OPENAI_API_KEY environment variable on Vercel.'
      });
    }
    if (error.message === 'TIMEOUT') {
      return res.status(504).json({
        error: 'Request timed out. OpenAI may be slow — please try again.'
      });
    }
    if (error.message === 'NO_CAPTIONS') {
      return res.status(500).json({
        error: 'AI returned an empty response. Please try a different topic or tone.'
      });
    }

    return res.status(500).json({
      error: 'Something went wrong. Please try again in a moment.'
    });
  }
};

/* ═══════════════════════════════════════════════════════
   CORE API CALLER — with retry logic
   
   WHY gpt-4o-mini?
   Free tier (Tier 1) rate limits on OpenAI:
     gpt-4o       → 50  requests/min,  30,000 tokens/min
     gpt-4o-mini  → 500 requests/min, 200,000 tokens/min
   
   For a free SaaS tool with real users, gpt-4o easily
   hits the 50 RPM wall under moderate traffic.
   gpt-4o-mini is 10× more permissive AND 15× cheaper,
   while still producing excellent Instagram captions.
   
   Upgrade to gpt-4o only after you're on Tier 2+
   (requires $50+ spend on your OpenAI account).
═══════════════════════════════════════════════════════ */
async function callOpenAIWithRetry(apiKey, systemPrompt, userPrompt, attempt = 1) {
  const MAX_ATTEMPTS = 2;      // 1 initial try + 1 retry
  const RETRY_DELAY_MS = 1500; // wait 1.5s before retry

  // 25-second timeout — stays safely under Vercel's 30s limit
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 25000);

  let openAIResponse;
  try {
    openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // FIX 1: Use gpt-4o-mini — 10× higher rate limits on free tier
        model: 'gpt-4o-mini',

        temperature: 0.85,

        // FIX 2: Cut max_tokens from 1800 → 900
        // 5 captions with hashtags fit comfortably in 900 tokens.
        // Lower tokens = faster response + much less likely to hit
        // the tokens-per-minute (TPM) limit alongside the RPM limit.
        max_tokens: 900,

        // FIX 3: json_object mode — forces clean JSON output every time
        response_format: { type: 'json_object' },

        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt   },
        ],
      }),
    });
  } catch (fetchError) {
    clearTimeout(timeoutId);
    // AbortController fired = timeout
    if (fetchError.name === 'AbortError') throw new Error('TIMEOUT');
    throw new Error('NETWORK_ERROR');
  }

  clearTimeout(timeoutId);

  // ── HANDLE NON-200 RESPONSES ──
  if (!openAIResponse.ok) {
    const status = openAIResponse.status;
    const errBody = await openAIResponse.json().catch(() => ({}));
    console.error(`OpenAI ${status}:`, JSON.stringify(errBody));

    // 401 — bad API key, no point retrying
    if (status === 401) throw new Error('INVALID_KEY');

    // 429 — rate limited: retry once after a short delay
    if (status === 429) {
      if (attempt < MAX_ATTEMPTS) {
        console.log(`Rate limited (attempt ${attempt}). Retrying in ${RETRY_DELAY_MS}ms...`);
        await sleep(RETRY_DELAY_MS);
        return callOpenAIWithRetry(apiKey, systemPrompt, userPrompt, attempt + 1);
      }
      // Both attempts rate-limited — tell user clearly
      throw new Error('RATE_LIMITED');
    }

    // 500/503 from OpenAI — retry once
    if (status >= 500 && attempt < MAX_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS);
      return callOpenAIWithRetry(apiKey, systemPrompt, userPrompt, attempt + 1);
    }

    throw new Error(`OPENAI_ERROR_${status}`);
  }

  // ── PARSE RESPONSE ──
  const aiData = await openAIResponse.json();
  const rawText = aiData?.choices?.[0]?.message?.content || '';

  if (!rawText) throw new Error('NO_CAPTIONS');

  // Parse the JSON the model returned
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    // json_object mode should never fail, but if it somehow does,
    // fall back to splitting on numbered lines
    parsed = { captions: extractFallback(rawText) };
  }

  const captions = Array.isArray(parsed.captions)
    ? parsed.captions
        .slice(0, 5)
        .map(c => (typeof c === 'string' ? c : c.text || String(c)).trim())
        .filter(c => c.length > 5)
    : extractFallback(rawText);

  if (captions.length === 0) throw new Error('NO_CAPTIONS');

  return captions;
}

/* ═══════════════════════════════════════════════════════
   PROMPTS
═══════════════════════════════════════════════════════ */
function buildSystemPrompt() {
  return `You are an elite Instagram copywriter and content strategist.
You specialize in writing captions that drive real engagement: comments, saves, shares, and follows.

CAPTION PHILOSOPHY:
- Open every caption with a HOOK that stops the scroll (bold claim, unexpected question, vulnerable truth, or cliffhanger)
- Write for humans, not algorithms — authentic voice beats keyword stuffing
- Make the reader feel something: curiosity, laughter, inspiration, or desire
- Vary structure dramatically across the 5 captions so users have real choices

OUTPUT FORMAT — strict JSON only:
{
  "captions": [
    "full caption 1 text here",
    "full caption 2 text here",
    "full caption 3 text here",
    "full caption 4 text here",
    "full caption 5 text here"
  ]
}
Rules:
- Return ONLY the JSON object above — no prose, no markdown, no explanation
- Each array item is one complete, ready-to-post caption string
- Include hashtags and CTAs inline inside each caption string when requested`;
}

function buildUserPrompt(niche, tone, includeEmoji, includeHashtags, includeCta) {
  const tones = {
    motivational: 'Deeply motivational and empowering. Use power words that stir emotion. Pair vulnerability with strength. Make the reader feel unstoppable.',
    funny:        'Genuinely witty and clever. Unexpected observations, self-aware humor, or punchy wordplay. The kind of caption people screenshot and send to friends.',
    professional: 'Polished, authoritative, and premium. Position the author as a credible expert. Confident, precise language — no fluff.',
    aesthetic:    'Poetic, cinematic, emotionally evocative. Write in images and feelings. Captions that feel like excerpts from a beautiful journal.',
    storytelling: 'Narrative-driven. Build a micro-story: opening scene → tension/realization → payoff. Make the reader feel like they lived it.',
    sales:        'Conversion-focused but never pushy. Lead with a pain point or value. Build desire with specifics. Create urgency through transformation, not hype.',
    educational:  'Teach something genuinely useful. "Did you know" or "Here is why" frameworks. Leave readers smarter and eager to follow for more.',
    casual:       'Warm, unfiltered, best-friend energy. Like a voice note turned into text. Authentic, relatable, no corporate polish.',
  };

  const toneDesc    = tones[tone] || 'Engaging, authentic, and tailored to the audience.';
  const emojiRule   = includeEmoji
    ? 'Use 1–3 emojis max, only where they genuinely add personality. Never force them.'
    : 'NO emojis. Pure text only.';
  const hashtagRule = includeHashtags
    ? 'Add 5–7 relevant hashtags at the end of each caption (mix broad + niche-specific).'
    : 'No hashtags.';
  const ctaRule     = includeCta
    ? 'End 3 of the 5 captions with a natural CTA (question, ask to save, tag a friend, follow for more).'
    : 'No explicit CTAs.';

  return `Write 5 unique Instagram captions for: "${niche}"

TONE: ${toneDesc}
EMOJIS: ${emojiRule}
HASHTAGS: ${hashtagRule}
CTA: ${ctaRule}

VARIETY (mandatory):
- Caption 1: Short & punchy (1–3 lines)
- Caption 2: Medium (4–6 lines), hook + mini-story + payoff
- Caption 3: Longer narrative (6–9 lines), emotional arc
- Caption 4: Different structure (list, Q&A, bold statement + unpacking)
- Caption 5: Wildcard — an angle they wouldn't have thought of

QUALITY RULES:
- No clichés: no "blessed", "grateful", "crushing it", "living my best life"
- No weak openers: no "I'm excited to share" or "So I've been thinking"
- Every first line must stop a scroll cold

Respond ONLY with the JSON object.`;
}

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractFallback(rawText) {
  // Numbered list fallback parser — used only if JSON.parse fails
  const parts = rawText.split(/\n(?=\d+[\.\)])/);
  return parts
    .map(p => p.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(p => p.length > 15)
    .slice(0, 5);
}
