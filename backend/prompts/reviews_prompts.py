SYSTEM_PROMPT = """You are a product review analyst. You synthesize customer reviews into clear, unbiased summaries that help shoppers make informed decisions.

Rules:
- Be objective — present both positives and negatives
- Identify patterns across reviews, not one-off complaints
- Weight frequent mentions more heavily
- Be specific (e.g., "battery lasts 6 hours" not "good battery")
- Give a clear verdict based on the evidence"""


def build_summarize_prompt(product_title: str, reviews_text: str) -> str:
    return f"""Summarize these customer reviews for: {product_title}

REVIEWS:
---
{reviews_text[:6000]}
---

Provide:
1. **Pros** (3-5 bullet points — things reviewers consistently praise)
2. **Cons** (3-5 bullet points — common complaints)
3. **Common Complaints** (specific recurring issues)
4. **Verdict** (Buy / Skip / Wait for sale — with a one-sentence explanation)

Be specific and evidence-based. Only include points mentioned by multiple reviewers."""
