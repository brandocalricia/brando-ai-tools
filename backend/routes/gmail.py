import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.auth import get_current_user
from core.usage import can_generate, increment_usage
from core.config import MODEL_FAST
from prompts.gmail_prompts import SYSTEM_PROMPT, TONE_GUIDES, build_rewrite_prompt, build_compose_prompt

router = APIRouter(prefix="/api/gmail", tags=["gmail"])
claude = anthropic.Anthropic()


class RewriteRequest(BaseModel):
    text: str = ""
    tone: str = "professional"
    mode: str = "rewrite"
    description: str = ""


class RewriteResponse(BaseModel):
    text: str
    tokens_used: int
    usage_remaining: int


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite(req: RewriteRequest, user=Depends(get_current_user)):
    allowed, remaining = can_generate(user.id, "gmail")
    if not allowed:
        raise HTTPException(status_code=429, detail="Daily free limit reached. Upgrade to Pro for unlimited.")

    try:
        if req.mode == "rewrite":
            if not req.text:
                raise HTTPException(status_code=400, detail="Text is required for rewrite mode.")
            if len(req.text) > 3000:
                raise HTTPException(status_code=400, detail="Text must be under 3000 characters.")
            if req.tone not in TONE_GUIDES:
                raise HTTPException(status_code=400, detail="Invalid tone.")
            user_prompt = build_rewrite_prompt(req.text, req.tone)
        elif req.mode == "compose":
            if not req.description:
                raise HTTPException(status_code=400, detail="Description is required for compose mode.")
            if len(req.description) > 1000:
                raise HTTPException(status_code=400, detail="Description must be under 1000 characters.")
            user_prompt = build_compose_prompt(req.description)
        else:
            raise HTTPException(status_code=400, detail="Mode must be 'rewrite' or 'compose'.")

        message = claude.messages.create(
            model=MODEL_FAST,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = message.content[0].text.strip()
        tokens_used = message.usage.input_tokens + message.usage.output_tokens

        increment_usage(user.id, "gmail")
        _, new_remaining = can_generate(user.id, "gmail")

        return RewriteResponse(text=text, tokens_used=tokens_used, usage_remaining=new_remaining)
    except HTTPException:
        raise
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable.")
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong.")
