import anthropic
import re
import httpx
import json
import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from core.auth import get_current_user
from core.usage import can_generate, increment_usage
from core.config import MODEL_FAST
from prompts.youtube_prompts import SYSTEM_PROMPT, build_summarize_prompt

logger = logging.getLogger(__name__)

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
    patterns = [
        r'(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'(?:embed/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError("Could not extract video ID from URL.")


def get_transcript_via_library(video_id: str) -> str | None:
    """Try youtube-transcript-api library (works locally, often blocked on cloud)."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        ytt = YouTubeTranscriptApi()
        transcript_data = ytt.fetch(video_id)
        snippets = []
        for entry in transcript_data:
            text = entry.text if hasattr(entry, "text") else entry.get("text", "")
            if text:
                snippets.append(text)
        if snippets:
            return " ".join(snippets)
    except Exception as e:
        logger.warning(f"youtube-transcript-api failed: {e}")

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join([entry["text"] for entry in transcript_list])
    except Exception as e:
        logger.warning(f"youtube-transcript-api legacy failed: {e}")

    return None


def get_transcript_via_innertube(video_id: str) -> str | None:
    """Fetch captions directly via YouTube's InnerTube API (no library needed)."""
    try:
        # First get the video page to find caption tracks
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        with httpx.Client(timeout=15) as client:
            resp = client.get(f"https://www.youtube.com/watch?v={video_id}", headers=headers)
            html = resp.text

        # Extract captions JSON from page source
        caption_match = re.search(r'"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"', html, re.DOTALL)
        if not caption_match:
            # Try alternate pattern
            caption_match = re.search(r'"captionTracks":\s*(\[.*?\])', html, re.DOTALL)
            if caption_match:
                tracks = json.loads(caption_match.group(1))
            else:
                return None
        else:
            captions_json = json.loads(caption_match.group(1))
            tracks = captions_json.get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])

        if not tracks:
            return None

        # Prefer English, fall back to first available (often auto-generated)
        caption_url = None
        for track in tracks:
            lang = track.get("languageCode", "")
            if lang.startswith("en"):
                caption_url = track.get("baseUrl")
                break
        if not caption_url:
            caption_url = tracks[0].get("baseUrl")
        if not caption_url:
            return None

        # Fetch the captions XML
        caption_url += "&fmt=json3"
        with httpx.Client(timeout=15) as client:
            resp = client.get(caption_url, headers=headers)
            data = resp.json()

        events = data.get("events", [])
        snippets = []
        for event in events:
            segs = event.get("segs", [])
            for seg in segs:
                text = seg.get("utf8", "").strip()
                if text and text != "\n":
                    snippets.append(text)

        if snippets:
            return " ".join(snippets)
    except Exception as e:
        logger.warning(f"InnerTube caption fetch failed: {e}")

    return None


def get_transcript_via_timedtext(video_id: str) -> str | None:
    """Try YouTube's timedtext API directly."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        }
        url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&fmt=json3"
        with httpx.Client(timeout=15) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                # Try auto-generated
                url = f"https://www.youtube.com/api/timedtext?v={video_id}&lang=en&kind=asr&fmt=json3"
                resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            data = resp.json()

        events = data.get("events", [])
        snippets = []
        for event in events:
            segs = event.get("segs", [])
            for seg in segs:
                text = seg.get("utf8", "").strip()
                if text and text != "\n":
                    snippets.append(text)

        if snippets:
            return " ".join(snippets)
    except Exception as e:
        logger.warning(f"Timedtext API failed: {e}")

    return None


def get_transcript(video_id: str) -> str:
    """Try multiple methods to get transcript."""
    # Method 1: youtube-transcript-api library
    transcript = get_transcript_via_library(video_id)
    if transcript:
        return transcript

    # Method 2: Direct InnerTube page scrape
    transcript = get_transcript_via_innertube(video_id)
    if transcript:
        return transcript

    # Method 3: Timedtext API
    transcript = get_transcript_via_timedtext(video_id)
    if transcript:
        return transcript

    raise HTTPException(
        status_code=400,
        detail="Could not retrieve transcript. The video may not have captions available."
    )


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
        logger.error(f"YouTube summarize error: {e}")
        raise HTTPException(status_code=500, detail="Something went wrong.")
