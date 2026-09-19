import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

// llama-3.3-70b-versatile was retired by Groq on 2026-08-16 for free/dev accounts.
const GROQ_MODEL = 'openai/gpt-oss-20b';

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

// Strict line counter function
function countLines(text: string): number {
  return text.split('\n').filter(line => line.trim().length > 0).length;
}

// Helper to make text personal
function makePersonal(text: string): string {
  // Replace "you" with "I" at the start of sentences
  let result = text.replace(/\bYou\b/g, 'I').replace(/\byou\b/g, 'me');
  // Replace "your" with "my"
  result = result.replace(/\byour\b/g, 'my');
  // Replace "you're" with "I'm"
  result = result.replace(/\byou're\b/g, "I'm");
  // Replace "you should" with "I'll" or "I'm going to"
  result = result.replace(/\byou should\b/gi, "I'll");
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { prompt, action = 'generate' } = await request.json();

    if (!prompt?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Please enter what you want to post about' },
        { status: 400 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      console.error('GROQ_API_KEY is missing');
      return NextResponse.json(
        { success: false, error: 'AI service is not configured' },
        { status: 500 }
      );
    }

    const groq = getGroqClient();
    const promptLower = prompt.toLowerCase();
    let requestedLines = 2; // Default
    
    // Strict line detection
    if (promptLower.includes('1 line') || promptLower.includes('one line')) requestedLines = 1;
    if (promptLower.includes('2 line') || promptLower.includes('two line') || promptLower.includes('2 lines')) requestedLines = 2;
    if (promptLower.includes('3 line') || promptLower.includes('three line') || promptLower.includes('3 lines')) requestedLines = 3;

    if (action === 'improve') {
      // IMPROVE existing caption - STRICT line limit
      const systemPrompt = `You are a social media expert. IMPROVE this caption following these STRICT rules:

CRITICAL RULES:
1. MAXIMUM ${requestedLines} LINES ONLY. Count your lines before responding.
2. Write from FIRST-PERSON perspective (use I/me/my, NOT you/your)
3. Remove ALL filler words: "here's", "just", "simple", "concise", "improved", "version"
4. Be direct - start with the main point immediately
5. Write like a real person speaking naturally
6. NEVER mention that you're improving it
7. Just give the ${requestedLines}-line caption, NO explanations
8. Each line should be a complete thought
9. End with 1-2 relevant emojis (if appropriate)

Example format for ${requestedLines} lines:
Line 1: [Main point]
Line 2: [Supporting thought or conclusion]`;

      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: 'system', 
            content: systemPrompt 
          },
          { 
            role: 'user', 
            content: `Make this caption exactly ${requestedLines} lines, first-person, and better: "${prompt}"`
          },
        ],
        model: GROQ_MODEL,
        temperature: 0.7,
        max_tokens: 400,
        reasoning_effort: 'low',
      });

      let caption = completion.choices[0]?.message?.content?.trim() || '';
      
      // Apply personalization fix
      caption = makePersonal(caption);
      
      // Count lines and trim if needed
      const lines = caption.split('\n').filter(line => line.trim().length > 0);
      if (lines.length > requestedLines) {
        // Take only the requested number of lines
        caption = lines.slice(0, requestedLines).join('\n');
      }

      if (!caption) {
        return NextResponse.json(
          { success: false, error: 'Could not improve the caption' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, caption });
      
    } else {
      // GENERATE new caption - STRICT line limit
      const systemPrompt = `You are a creative social media user writing a personal post. Write a caption from FIRST-PERSON perspective.

STRICT RULES (VIOLATION NOT ALLOWED):
1. Write EXACTLY ${requestedLines} lines. Not ${requestedLines-1}, not ${requestedLines+1}. ${requestedLines} LINES.
2. Use FIRST-PERSON ONLY: I, me, my, mine. NEVER use "you", "your", "yours".
3. Each line must be a complete sentence/thought.
4. Start with the main point immediately.
5. Write naturally like you're talking to friends.
6. End with 1-2 relevant emojis.
7. NO hashtags.
8. NO explanations, just the ${requestedLines}-line caption.

FORMAT EXAMPLE (${requestedLines} lines):
${requestedLines === 1 ? 'Just one impactful line with 1-2 emojis.' : 
 requestedLines === 2 ? 'First line: Main thought.\nSecond line: Additional thought or feeling.' :
 'First line: Opening thought.\nSecond line: Developing idea.\nThird line: Conclusion or reflection.'}`;

      const completion = await groq.chat.completions.create({
        messages: [
          { 
            role: 'system', 
            content: systemPrompt 
          },
          { 
            role: 'user', 
            content: `Write exactly ${requestedLines} first-person lines about: ${prompt}`
          },
        ],
        model: GROQ_MODEL,
        temperature: 0.75,
        max_tokens: 400,
        reasoning_effort: 'low',
      });

      let caption = completion.choices[0]?.message?.content?.trim() || '';
      
      // Apply personalization fix
      caption = makePersonal(caption);
      
      // Enforce line limit strictly
      const lines = caption.split('\n').filter(line => line.trim().length > 0);
      if (lines.length !== requestedLines) {
        // If wrong number of lines, regenerate with stricter prompt
        const strictCompletion = await groq.chat.completions.create({
          messages: [
            { 
              role: 'system', 
              content: `STRICT: Write EXACTLY ${requestedLines} lines. Use FIRST-PERSON (I/me/my). Each line complete. No explanations.` 
            },
            { 
              role: 'user', 
              content: `Topic: ${prompt}`
            },
          ],
          model: GROQ_MODEL,
          temperature: 0.6,
          max_tokens: 400,
          reasoning_effort: 'low',
        });
        
        caption = strictCompletion.choices[0]?.message?.content?.trim() || '';
        caption = makePersonal(caption);
      }

      // Final line count check and trim
      const finalLines = caption.split('\n').filter(line => line.trim().length > 0);
      if (finalLines.length > requestedLines) {
        caption = finalLines.slice(0, requestedLines).join('\n');
      }

      if (!caption) {
        return NextResponse.json(
          { success: false, error: 'Could not generate a caption' },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true, caption });
    }
    
  } catch (error: any) {
    console.error('AI API Error:', error);
    
    let errorMessage = 'Failed to process request. Please try again.';
    if (error.message?.includes('timeout')) errorMessage = 'Request timed out.';
    if (error.status === 429) errorMessage = 'Too many requests. Please wait.';
    if (error.status === 401) errorMessage = 'AI service issue.';
    if (error.status === 404 || error.code === 'model_not_found') {
      errorMessage = 'AI model is unavailable. Please try again later.';
    }
    
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}