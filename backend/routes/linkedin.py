import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..core.auth import get_current_user
from ..core.usage import can_generate, increment_usage
from ..core.config import MODEL_FAST
from ..prompts.linkedin_prompts import (
    SYSTEM_PROMPT, TONE_GUIDES, LENGTH_GUIDES,
    build_post_prompt, build_reply_prompt,
)

router = APIRouter(prefix="/api/linkedin", tags=["linkedin"])
claude = anthropic.Anthropic()

MAX_TOPIC_LENGTH = 500
MAX_POST_LENGTH = 2000
MAX_ANGLE_LENGTH = 200


class GenerateRequest(BaseModel):
    type: str
    topic: str | None = None
    tone: str = "thought-leader"
    length: str = "medium"
    original_post: str | None = None
    angle: str | None = None


class GenerateResponse(BaseModel):
    text: str
    tokens_used: int
    usage_remaining: int


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest, user=Depends(get_current_user)):
    allowed, remaining = can_generate(user.id, "linkedin")
    if not allowed:
        raise HTTPException(status_code=429, detail="Daily free limit reached. Upgrade to Pro for unlimited.")

    try:
        if req.type == "post":
            if not req.topic:
                raise HTTPException(status_code=400, detail="Topic is required.")
            if len(req.topic) > MAX_TOPIC_LENGTH:
                raise HTTPException(status_code=400, detail=f"Topic must be under {MAX_TOPIC_LENGTH} characters.")
            if req.tone not in TONE_GUIDES:
                raise HTTPException(status_code=400, detail="Invalid tone.")
            if req.length not in LENGTH_GUIDES:
                raise HTTPException(status_code=400, detail="Invalid length.")
            user_prompt = build_post_prompt(req.topic, req.tone, req.length)
        elif req.type == "reply":
            if not req.original_post:
                raise HTTPException(status_code=400, detail="Original post text is required.")
            if len(req.original_post) > MAX_POST_LENGTH:
                raise HTTPException(status_code=400, detail=f"Post text must be under {MAX_POST_LENGTH} characters.")
            if req.angle and len(req.angle) > MAX_ANGLE_LENGTH:
                raise HTTPException(status_code=400, detail=f"Angle must be under {MAX_ANGLE_LENGTH} characters.")
            if req.tone not in TONE_GUIDES:
                raise HTTPException(status_code=400, detail="Invalid tone.")
            user_prompt = build_reply_prompt(req.original_post, req.tone, req.angle)
        else:
            raise HTTPException(status_code=400, detail="Type must be 'post' or 'reply'.")

        message = claude.messages.create(
            model=MODEL_FAST,
            max_tokens=500,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = message.content[0].text.strip()
        tokens_used = message.usage.input_tokens + message.usage.output_tokens

        increment_usage(user.id, "linkedin")
        _, new_remaining = can_generate(user.id, "linkedin")

        return GenerateResponse(text=text, tokens_used=tokens_used, usage_remaining=new_remaining)
    except HTTPException:
        raise
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable.")
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong.")
