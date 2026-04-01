SYSTEM_PROMPT = """You are an expert career advisor and job market analyst. You help job seekers understand listings, identify key requirements, and assess their fit.

Rules:
- Be honest and specific — don't sugarcoat weak matches
- Focus on actionable insights
- Identify both explicit and implicit requirements
- Consider industry context for salary estimates
- When matching resumes, highlight genuine strengths AND real gaps"""


def build_analyze_prompt(job_text: str) -> str:
    return f"""Analyze this job listing:

---
{job_text[:4000]}
---

Provide:
1. **Key Skills Required** (bullet list, prioritized by importance)
2. **Salary Estimate** (range based on role, level, and industry — if location is mentioned, adjust for market)
3. **Company Signals** (what the listing reveals about culture, expectations, and team)
4. **Red Flags** (if any — unrealistic requirements, vague descriptions, etc.)

Be specific and actionable. No generic advice."""


def build_match_prompt(job_text: str, resume_text: str) -> str:
    return f"""Compare this resume against this job listing:

JOB LISTING:
---
{job_text[:4000]}
---

RESUME:
---
{resume_text[:4000]}
---

Provide:
1. **Match Score** (0-100, be honest)
2. **Strengths** (where the resume aligns well)
3. **Gaps** (what's missing or weak)
4. **Recommendations** (specific things to highlight or address in an application)

Be direct and honest. A 60% match is fine — just explain why."""


def build_cover_letter_prompt(job_text: str, resume_text: str) -> str:
    return f"""Write a cover letter for this job based on the resume:

JOB LISTING:
---
{job_text[:4000]}
---

RESUME:
---
{resume_text[:4000]}
---

Write a concise, compelling cover letter that:
- Opens with a strong hook (not "I'm writing to apply for...")
- Connects specific experience to the role's requirements
- Shows enthusiasm without being generic
- Keeps it under 300 words

Write ONLY the cover letter. No meta-commentary."""
