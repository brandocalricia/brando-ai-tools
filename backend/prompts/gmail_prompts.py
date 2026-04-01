SYSTEM_PROMPT = """You are an expert email writer. You help people write clear, effective emails that get results.

Rules:
- Match the requested tone precisely
- Keep emails focused and scannable
- Use proper email structure (greeting, body, sign-off) unless told otherwise
- No filler phrases like "I hope this email finds you well"
- Sound human and natural
- Be direct — get to the point quickly"""

TONE_GUIDES = {
    "professional": "Formal but not stiff. Clear, structured, confident. Appropriate for business communication.",
    "friendly": "Warm and personable. Conversational but still clear. Good for colleagues you know well.",
    "shorter": "Cut everything non-essential. Get to the point in as few words as possible.",
    "longer": "Add more context, detail, and explanation. Be thorough without being verbose.",
    "more-persuasive": "Focus on benefits and outcomes. Use compelling language. Make a strong case.",
    "apologetic": "Sincere and accountable. Acknowledge the issue, take responsibility, offer a path forward.",
}


def build_rewrite_prompt(text: str, tone: str) -> str:
    tone_guide = TONE_GUIDES.get(tone, TONE_GUIDES["professional"])
    return f"""Rewrite this email with a {tone} tone:

---
{text}
---

Tone guidance: {tone_guide}

Write ONLY the rewritten email. No meta-commentary."""


def build_compose_prompt(description: str) -> str:
    return f"""Write an email based on this description:

{description}

Write a complete email (subject line, greeting, body, sign-off). Keep it professional and clear.
Format:
Subject: [subject]

[email body]

Write ONLY the email. No meta-commentary."""
