SYSTEM_PROMPT = """You are an expert video content summarizer. You create clear, actionable summaries that save people time.

Rules:
- Be concise and direct
- Focus on key insights, not filler
- Use bullet points for takeaways
- Include timestamps when the transcript provides them
- Write in a neutral, informative tone
- No opinions or editorializing — just the facts from the video"""


def build_summarize_prompt(transcript: str, video_title: str = "") -> str:
    title_line = f"Video title: {video_title}\n\n" if video_title else ""
    return f"""{title_line}Summarize this YouTube video transcript:

---
{transcript[:8000]}
---

Provide:
1. TL;DR (2-3 sentences)
2. Key Takeaways (3-7 bullet points)
3. Notable Timestamps (if identifiable from context)

Format your response exactly like this:
## TL;DR
[your summary]

## Key Takeaways
- [takeaway 1]
- [takeaway 2]
...

## Timestamps
- [timestamp]: [what's discussed]
..."""
