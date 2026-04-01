import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.auth import get_current_user
from core.usage import can_generate, increment_usage
from core.config import MODEL_FAST, MODEL_SMART
from prompts.jobs_prompts import SYSTEM_PROMPT, build_analyze_prompt, build_match_prompt, build_cover_letter_prompt

router = APIRouter(prefix="/api/jobs", tags=["jobs"])
claude = anthropic.Anthropic()


class AnalyzeRequest(BaseModel):
    job_text: str
    resume_text: str = ""
    mode: str = "analyze"


class AnalyzeResponse(BaseModel):
    text: str
    tokens_used: int
    usage_remaining: int


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest, user=Depends(get_current_user)):
    allowed, remaining = can_generate(user.id, "jobs")
    if not allowed:
        raise HTTPException(status_code=429, detail="Daily free limit reached. Upgrade to Pro for unlimited.")

    try:
        if not req.job_text:
            raise HTTPException(status_code=400, detail="Job listing text is required.")
        if len(req.job_text) > 5000:
            raise HTTPException(status_code=400, detail="Job text must be under 5000 characters.")
        if req.resume_text and len(req.resume_text) > 5000:
            raise HTTPException(status_code=400, detail="Resume text must be under 5000 characters.")

        if req.mode == "analyze":
            user_prompt = build_analyze_prompt(req.job_text)
            model = MODEL_FAST
        elif req.mode == "match":
            if not req.resume_text:
                raise HTTPException(status_code=400, detail="Resume text is required for matching.")
            user_prompt = build_match_prompt(req.job_text, req.resume_text)
            model = MODEL_SMART
        elif req.mode == "cover-letter":
            if not req.resume_text:
                raise HTTPException(status_code=400, detail="Resume text is required for cover letter.")
            user_prompt = build_cover_letter_prompt(req.job_text, req.resume_text)
            model = MODEL_FAST
        else:
            raise HTTPException(status_code=400, detail="Mode must be 'analyze', 'match', or 'cover-letter'.")

        message = claude.messages.create(
            model=model,
            max_tokens=1200,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = message.content[0].text.strip()
        tokens_used = message.usage.input_tokens + message.usage.output_tokens

        increment_usage(user.id, "jobs")
        _, new_remaining = can_generate(user.id, "jobs")

        return AnalyzeResponse(text=text, tokens_used=tokens_used, usage_remaining=new_remaining)
    except HTTPException:
        raise
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable.")
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong.")
