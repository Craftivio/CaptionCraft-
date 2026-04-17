/* ═══════════════════════════════════════════════════════
   CAPTIONCRAFT — api/generate.js  (Premium Upgrade)

   Upgrades:
   - Accepts includeHashtags + includeCta flags from frontend
   - Uses JSON-structured output format (100% reliable parsing)
   - Better system prompt for higher caption quality
   - Cleaner error handling
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
    return res.status(400).json({ error: 'Please provide a niche or topic.' });
  }
  if (niche.trim().length > 200) {
    return res.status(400).json({ error: 'Topic too long. Keep it under 200 characters.' });
  }

  // ── API KEY ──
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY');
    return res.status(500).json({ error: 'Server configuration error. Please contact support.' });
  }

  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(niche.trim(), tone, includeEmoji, includeHashtags, includeCta);

  try {
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.88,
        max_tokens: 1800,
        response_format: { type: 'json_object' },  // Force JSON output — no parsing guesswork
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userPrompt },
        ],
      }),
    });

    if (!openAIResponse.ok) {
      const err = await openAIResponse.json().catch(() => ({}));
      console.error('OpenAI error:', err);
      if (openAIResponse.status === 401) return res.status(500).json({ error: 'Invalid API key.' });
      if (openAIResponse.status === 429) return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
      return res.status(500).json({ error: 'AI service unavailable. Please try again.' });
    }

    const aiData  = await openAIResponse.json();
    const rawText = aiData.choices[0].message.content;

    // Parse the structured JSON the AI returned
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (_) {
      // Fallback: try to extract a captions array from raw text
      parsed = { captions: extractFallback(rawText) };
    }

    const captions = Array.isArray(parsed.captions)
      ? parsed.captions.slice(0, 5).map(c => (typeof c === 'string' ? c : c.text || String(c)).trim())
      : extractFallback(rawText);

    if (captions.length === 0) {
      return res.status(500).json({ error: 'Could not parse captions. Please try again.' });
    }

    return res.status(200).json({ captions });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Unexpected error. Please try again.' });
  }
};

/* ─────────────────────────────────────────────────────
   SYSTEM PROMPT — Elite caption writer persona
───────────────────────────────────────────────────── */
function buildSystemPrompt() {
  return `You are an elite Instagram copywriter and content strategist.
You have grown accounts to 1M+ followers and specialize in writing captions that drive real engagement: comments, saves, shares, and follows — not just passive likes.

CAPTION PHILOSOPHY:
- Every caption opens with a HOOK that stops the scroll cold (a bold claim, an unexpected question, a vulnerable truth, or a cliffhanger)
- You write for humans, not algorithms — authentic voice beats keyword stuffing every time
- You understand the psychology of each tone deeply and execute it with precision
- Great captions make the reader feel something: curiosity, laughter, inspiration, recognition, or desire
- You vary structure dramatically across the 5 captions so users have real options

OUTPUT RULES:
- You ALWAYS respond with valid JSON in this exact format:
{
  "captions": [
    "caption 1 full text here",
    "caption 2 full text here",
    "caption 3 full text here",
    "caption 4 full text here",
    "caption 5 full text here"
  ]
}
- Nothing outside the JSON object — no intro, no explanation, no markdown
- Each caption is a complete, ready-to-post Instagram caption string
- If hashtags are requested, include them inline at the end of each caption string
- If a CTA is requested, weave it naturally into the caption`;
}

/* ─────────────────────────────────────────────────────
   USER PROMPT — Specific request per user input
───────────────────────────────────────────────────── */
function buildUserPrompt(niche, tone, includeEmoji, includeHashtags, includeCta) {
  const tones = {
    motivational: 'Deeply motivational and empowering. Use power words that stir emotion. Make the reader feel like they can conquer anything. Pair vulnerability with strength.',
    funny:        'Genuinely witty and clever. Use unexpected observations, self-aware humor, or punchy wordplay. Aim for the kind of caption people screenshot and send to friends. Avoid trying too hard.',
    professional: 'Polished, authoritative, and premium. Position the author as a credible expert. Use confident, precise language. No fluff. Every sentence earns its place.',
    aesthetic:    'Poetic, cinematic, and emotionally evocative. Write in images and feelings. Use white space. Create captions that feel like excerpts from a beautiful journal people will save.',
    storytelling: 'Narrative-driven. Build a micro-story with an opening scene, a moment of tension or realization, and a payoff. Make the reader feel like they lived it too.',
    sales:        'Conversion-focused but never pushy. Lead with genuine value or a pain point. Build desire with specifics. Create urgency through scarcity or transformation, not hype.',
    educational:  'Teach something genuinely useful. Use "did you know" or "here is why" frameworks. Position the author as a thought leader. Leave readers smarter and eager to follow for more.',
    casual:       'Warm, unfiltered, and best-friend energy. Like a voice note turned into text. Authentic, a little messy, deeply relatable. No corporate polish — just real talk.',
  };

  const toneDesc      = tones[tone] || 'Engaging, authentic, and tailored to the audience.';
  const emojiRule     = includeEmoji
    ? 'Use emojis naturally — 1 to 4 max, only where they genuinely add personality or visual rhythm. Never force them.'
    : 'NO emojis whatsoever. Pure text only.';
  const hashtagRule   = includeHashtags
    ? 'Add 5–8 highly relevant hashtags at the end of each caption (mix: 1–2 broad, 2–3 mid-tier, 2–3 niche-specific). Keep them natural, not spammy.'
    : 'Do NOT include any hashtags.';
  const ctaRule       = includeCta
    ? 'End at least 3 of the 5 captions with a natural, non-desperate CTA (e.g. invite a comment with a genuine question, ask them to save, tag a friend, or follow for more). The CTA should feel like a natural part of the caption, not tacked on.'
    : 'No explicit CTAs needed — let the caption speak for itself.';

  return `Write 5 unique, high-performing Instagram captions for: "${niche}"

TONE: ${toneDesc}

EMOJI RULE: ${emojiRule}
HASHTAG RULE: ${hashtagRule}
CTA RULE: ${ctaRule}

VARIETY REQUIREMENTS (mandatory):
- Caption 1: Short & punchy (1–3 lines). Maximum impact, minimum words.
- Caption 2: Medium length (4–6 lines). Hook + story fragment + payoff.
- Caption 3: Longer and more narrative (7–10 lines). Build a scene or emotional arc.
- Caption 4: A completely different structural approach from the first three (e.g. list format, Q&A, bold statement + unpacking, dialogue).
- Caption 5: Wildcard — surprise the user with an angle they wouldn't have thought of themselves.

QUALITY BAR:
- Every opening line must be strong enough to stop someone mid-scroll
- No clichés: avoid "blessed", "grateful", "crushing it", "living my best life", "hustle"
- Avoid generic openers like "I'm so excited to share..." or "So, I've been thinking..."
- Make each caption feel like it was written specifically for this niche, not copy-pasted from a template

Respond ONLY with the JSON object.`;
}

/* ─────────────────────────────────────────────────────
   FALLBACK PARSER — used if JSON.parse fails
───────────────────────────────────────────────────── */
function extractFallback(rawText) {
  const parts = rawText.split(/\n(?=\d+[\.\)])/);
  return parts
    .map(p => p.replace(/^\d+[\.\)]\s*/, '').trim())
    .filter(p => p.length > 15)
    .slice(0, 5);
}
