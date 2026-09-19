import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const GROQ_MODEL = 'openai/gpt-oss-20b';

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

function getRequestedLines(prompt: string, fallback = 2) {
  const promptLower = prompt.toLowerCase();
  if (promptLower.includes('1 line') || promptLower.includes('one line')) return 1;
  if (promptLower.includes('3 line') || promptLower.includes('three line') || promptLower.includes('3 lines')) return 3;
  if (promptLower.includes('2 line') || promptLower.includes('two line') || promptLower.includes('2 lines')) return 2;
  return fallback;
}

function cleanCaption(text: string, maxLines: number) {
  const caption = text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^\s*(here'?s?( is)? (an? )?(improved )?(caption|comment|version)\s*[:\-–—]?\s*)/i, '')
    .trim();

  const lines = caption
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^(line\s*\d+|first line|second line|third line)\s*[:.\-–—]\s*/i, '')
        .replace(/^[-*•]\s+/, '')
        .replace(/^["']|["']$/g, '')
        .trim()
    )
    .filter(Boolean);

  return lines.slice(0, maxLines).join('\n').trim();
}

function generateSystemPrompt(requestedLines: number) {
  return `You write short social captions as a real person, not an AI assistant.

The user can give ANY topic, draft, or thought. Use their words as the source. Do not assume a specific event or story.

Output ONLY the caption. Nothing else.

Rules:
- Exactly ${requestedLines} lines, separated by a newline.
- Never label lines. Do not write "Line 1", "Line 2", "First line", or similar.
- First person. Casual. Specific to whatever they wrote. Use contractions.
- Keep names, places, programs, and details they mentioned.
- Sound like a friend posting, not a press release or a motivational quote.
- No generic filler such as "feeling proud", "ready to take on the challenge", "honoured to announce", "excited to share", "grateful for this opportunity".
- 0-2 emojis max, only if they feel natural. No hashtags. No quotes around the caption.`;
}

function improveSystemPrompt(requestedLines: number) {
  return `You rewrite social captions so they sound like a real person posted them.

This works for ANY caption the user wrote. Keep their topic and details. Do not swap in a different story.

Output ONLY the improved caption. Nothing else.

Rules:
- At most ${requestedLines} lines. Never label them as Line 1 / Line 2.
- Keep the original meaning and details. Do not make it generic.
- First person, casual, specific. Contractions are good.
- Cut fluff and canned phrases. No "feeling proud and ready to take on the challenge" energy.
- 0-2 emojis max if they fit. No hashtags. No quotes. No explanation.`;
}

function commentSystemPrompt(isImprove: boolean) {
  return `You write Instagram comments as a real person texting a friend, not as an AI.

This works for ANY post and ANY draft comment. React to the post they gave you.

Output ONLY the comment. Nothing else.

Rules:
- 1 short line. 2 lines max if needed. Never write Line 1 / Line 2.
- Sound like a chat reply: casual, specific, a little messy in a human way.
- Use 1-2 social slang words when they fit, like bro, brooo, dude, buddy, omg, hey, ngl, fr, lowkey, wait, yo, same, wild. Do not stuff them all in.
- React to details in the post. If they drafted a comment, keep that meaning.
- ${isImprove ? "Keep their point, just make it sound more like a real comment." : "If they gave a thought, turn it into a comment. If they did not, react to the post."}
- No corporate praise, no "that's amazing congratulations on this achievement", no hashtags, no quotes, no explanation.
- 0-2 emojis max, only if they feel natural.`;
}

function commentUserPrompt({
  isImprove,
  prompt,
  postContent,
  postAuthor,
}: {
  isImprove: boolean;
  prompt: string;
  postContent: string;
  postAuthor: string;
}) {
  const postBit = `Post${postAuthor ? ` by @${postAuthor}` : ""}:\n${postContent || "(no text, maybe just a photo)"}`;
  if (isImprove) {
    return `${postBit}\n\nMy draft comment:\n${prompt}\n\nRewrite my comment so it sounds like I actually typed it.`;
  }
  if (prompt.trim()) {
    return `${postBit}\n\nWhat I want to say:\n${prompt}\n\nWrite the comment I would actually leave.`;
  }
  return `${postBit}\n\nWrite a short comment I would actually leave on this post.`;
}

export async function POST(request: NextRequest) {
  try {
    const {
      prompt = "",
      action = "generate",
      kind = "caption",
      postContent = "",
      postAuthor = "",
    } = await request.json();

    const isComment = kind === "comment";
    const isImprove = action === "improve";

    if (!isComment && !prompt?.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter what you want to post about" },
        { status: 400 }
      );
    }

    if (isComment && isImprove && !prompt?.trim()) {
      return NextResponse.json(
        { success: false, error: "Write a comment first to improve it" },
        { status: 400 }
      );
    }

    if (isComment && !isImprove && !prompt?.trim() && !postContent?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nothing to comment on yet" },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is missing");
      return NextResponse.json(
        { success: false, error: "AI service is not configured" },
        { status: 500 }
      );
    }

    const groq = getGroqClient();
    const requestedLines = isComment ? 2 : getRequestedLines(prompt, 2);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: isComment
            ? commentSystemPrompt(isImprove)
            : isImprove
              ? improveSystemPrompt(requestedLines)
              : generateSystemPrompt(requestedLines),
        },
        {
          role: "user",
          content: isComment
            ? commentUserPrompt({
                isImprove,
                prompt,
                postContent,
                postAuthor,
              })
            : isImprove
              ? `Rewrite this so it sounds like I actually posted it. Keep my details:\n${prompt}`
              : `Write a caption I would actually post about this:\n${prompt}`,
        },
      ],
      model: GROQ_MODEL,
      temperature: isComment ? 1 : 0.9,
      max_tokens: 400,
      reasoning_effort: "low",
    });

    const caption = cleanCaption(
      completion.choices[0]?.message?.content || "",
      requestedLines
    );

    if (!caption) {
      return NextResponse.json(
        {
          success: false,
          error: isImprove
            ? `Could not improve the ${isComment ? "comment" : "caption"}`
            : `Could not generate a ${isComment ? "comment" : "caption"}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, caption });
  } catch (error: any) {
    console.error("AI API Error:", error);

    let errorMessage = "Failed to process request. Please try again.";
    if (error.message?.includes("timeout")) errorMessage = "Request timed out.";
    if (error.status === 429) errorMessage = "Too many requests. Please wait.";
    if (error.status === 401) errorMessage = "AI service issue.";
    if (error.status === 404 || error.code === "model_not_found") {
      errorMessage = "AI model is unavailable. Please try again later.";
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
