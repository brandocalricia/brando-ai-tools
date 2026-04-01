import anthropic
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.auth import get_current_user
from core.usage import can_generate, increment_usage
from core.config import MODEL_FAST
from prompts.youtube_prompts import SYSTEM_PROMPT, build_summarize_prompt

router = APIRouter(prefix="/api/youtube", tags=["youtube"])
claude = anthropic.Anthropic()


class SummarizeRequest(BaseModel):
    video_url: str
    video_title: str = ""


class SummarizeResponse(BaseModel):
    summary: str
    tokens_used: int
    usage_remaining: int


def extract_video_id(url: str) -> str:
    import re
    patterns = [
        r'(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'(?:embed/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError("Could not extract video ID from URL.")


def get_transcript(video_id: str) -> str:
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join([entry["text"] for entry in transcript_list])
    except Exception:
        raise HTTPException(status_code=400, detail="Could not retrieve transcript. The video may not have captions.")


@router.post("/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, user=Depends(get_current_user)):
    allowed, remaining = can_generate(user.id, "youtube")
    if not allowed:
        raise HTTPException(status_code=429, detail="Daily free limit reached. Upgrade to Pro for unlimited.")

    if len(req.video_url) > 500:
        raise HTTPException(status_code=400, detail="Video URL must be under 500 characters.")
    if req.video_title and len(req.video_title) > 200:
        raise HTTPException(status_code=400, detail="Video title must be under 200 characters.")

    try:
        video_id = extract_video_id(req.video_url)
        transcript = get_transcript(video_id)
        user_prompt = build_summarize_prompt(transcript, req.video_title)

        message = claude.messages.create(
            model=MODEL_FAST,
            max_tokens=1000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text = message.content[0].text.strip()
        tokens_used = message.usage.input_tokens + message.usage.output_tokens

        increment_usage(user.id, "youtube")
        _, new_remaining = can_generate(user.id, "youtube")

        return SummarizeResponse(summary=text, tokens_used=tokens_used, usage_remaining=new_remaining)
    except HTTPException:
        raise
    except anthropic.APIError:
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable.")
    except Exception as e:
        raise HTTPException(status_code=500, detail="Something went wrong.")
