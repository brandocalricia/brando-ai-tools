import anthropic
import re
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
    transcript: str = ""


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


def get_transcript_via_ytdlp(video_id: str) -> str | None:
    """Use yt-dlp Python API to extract subtitles — most robust method."""
    try:
        import yt_dlp

        url = f"https://www.youtube.com/watch?v={video_id}"
        subtitles_data = {}

        # Custom yt-dlp options to just get subtitle info
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            auto_subs = info.get("automatic_captions", {})
            manual_subs = info.get("subtitles", {})

            # Prefer manual English subs, fall back to auto-generated
            sub_url = None
            for subs_dict in [manual_subs, auto_subs]:
                for lang_key in ["en", "en-US", "en-GB", "en-orig"]:
                    if lang_key in subs_dict:
                        # Find json3 format, fall back to vtt
                        formats = subs_dict[lang_key]
                        for fmt in formats:
                            if fmt.get("ext") == "json3":
                                sub_url = fmt.get("url")
                                break
                        if not sub_url:
                            for fmt in formats:
                                if fmt.get("ext") == "vtt":
                                    sub_url = fmt.get("url")
                                    break
                        if sub_url:
                            break
                if sub_url:
                    break

            # If no English found, try first available language
            if not sub_url:
                for subs_dict in [manual_subs, auto_subs]:
                    if subs_dict:
                        first_lang = next(iter(subs_dict))
                        formats = subs_dict[first_lang]
                        for fmt in formats:
                            if fmt.get("ext") == "json3":
                                sub_url = fmt.get("url")
                                break
                        if not sub_url and formats:
                            sub_url = formats[0].get("url")
                        if sub_url:
                            break

        if not sub_url:
            logger.warning(f"yt-dlp: no subtitles found for {video_id}")
            return None

        # Fetch the subtitle content
        import httpx
        with httpx.Client(timeout=15) as client:
            resp = client.get(sub_url)
            content = resp.text

        # Try parsing as json3
        try:
            data = json.loads(content)
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
        except (json.JSONDecodeError, KeyError):
            pass

        # Parse as VTT
        lines = content.split("\n")
        snippets = []
        for line in lines:
            line = line.strip()
            if not line or line.startswith("WEBVTT") or line.startswith("Kind:") or line.startswith("Language:"):
                continue
            if re.match(r'^\d{2}:\d{2}', line) or re.match(r'^\d+$', line):
                continue
            clean = re.sub(r'<[^>]+>', '', line)
            if clean:
                snippets.append(clean)
        return " ".join(snippets) if snippets else None

    except Exception as e:
        logger.warning(f"yt-dlp failed: {e}")
        return None


def get_transcript_via_library(video_id: str) -> str | None:
    """Try youtube-transcript-api library."""
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
        logger.warning(f"youtube-transcript-api fetch() failed: {e}")

    try:
        from youtube_transcript_api import YouTubeTranscriptApi
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join([entry["text"] for entry in transcript_list])
    except Exception as e:
        logger.warning(f"youtube-transcript-api get_transcript() failed: {e}")

    return None


def get_transcript(video_id: str) -> str:
    """Try multiple methods to get transcript."""
    # Method 1: yt-dlp (most reliable on cloud servers)
    transcript = get_transcript_via_ytdlp(video_id)
    if transcript and len(transcript) > 50:
        logger.info(f"Got transcript via yt-dlp ({len(transcript)} chars)")
        return transcript

    # Method 2: youtube-transcript-api library
    transcript = get_transcript_via_library(video_id)
    if transcript and len(transcript) > 50:
        logger.info(f"Got transcript via library ({len(transcript)} chars)")
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
        # Use client-provided transcript if available, otherwise fetch server-side
        if req.transcript and len(req.transcript) > 50:
            transcript = req.transcript[:15000]  # cap length
            logger.info(f"Using client-provided transcript ({len(transcript)} chars)")
        else:
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
