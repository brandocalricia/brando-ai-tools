import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ..core.auth import get_current_user
from ..core.usage import can_generate, increment_usage
from ..core.config import MODEL_FAST
from ..prompts.reviews_prompts import SYSTEM_PROMPT, build_summarize_prompt

router = APIRouter(prefix="/api/reviews", tags=["reviews"])
claude = anthropic.Anthropic()


class SummarizeRequest(BaseModel):
    product_title: str
    reviews_text: str
    product_url: str = ""


class SummarizeResponse(BaseModel):
    text: str
    tokens_used: int


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, user=Depends(get_current_user)):
    allowed, _ = can_generate(user.id, "reviews")
    if not allowed:
        raise HTTPException(status_code=429, detail="Daily limit reached. Try again tomorrow.")

    try:
        if not req.product_title or not req.reviews_text:
            raise HTTPException(status_code=400, detail="Product title and reviews text are required.")
        if len(req.product_title) > 200:
            raise HTTPException(status_code=400, detail="Product title must be under 200 characters.")
        if len(req.reviews_text) > 8000:
            raise HTTPException(status_code=400, detail="Reviews text must be under 8000 characters.")

        user_prompt = build_summarize_prompt(req.product_title, req.reviews_text)

        message = claude.messages.create(
            model=MODEL_FAST,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = message.content[0].text.strip()
        tokens_used = message.usage.input_tokens + message.usage.output_tokens

        increment_usage(user.id, "reviews")

        return SummarizeResponse(text=text, tokens_used=tokens_used)
    except HTTPException:
        raise
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable.")
    except Exception:
        raise HTTPException(status_code=500, detail="Something went wrong.")
