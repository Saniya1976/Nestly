"use server";

import Groq from "groq-sdk";

const GROQ_MODEL = "openai/gpt-oss-20b";

function getGroqClient() {
  return new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
}

function analyzeUserRequest(prompt: string) {
  const promptLower = prompt.toLowerCase();
  
  return {
    lines: promptLower.includes('1 line') ? 1 : 
           promptLower.includes('2 line') ? 2 : 
           promptLower.includes('3 line') ? 3 : 2,
    style: promptLower.includes('funny') ? 'funny' :
           promptLower.includes('inspir') ? 'inspirational' :
           promptLower.includes('profession') ? 'professional' : 'engaging',
    includeEmojis: !promptLower.includes('no emoji')
  };
}

export async function generateCaptionFromText(prompt: string) {
  try {
    if (!prompt.trim()) {
      return { success: false, error: "Please enter what you want to post about" };
    }

    if (!process.env.GROQ_API_KEY) {
      return { success: false, error: "AI service not configured" };
    }

    const requirements = analyzeUserRequest(prompt);
    const groq = getGroqClient();
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Write a ${requirements.style} social media caption (${requirements.lines} lines max). ${requirements.includeEmojis ? 'Add 1-2 relevant emojis.' : 'No emojis.'} Be direct and engaging. Just write the caption.`,
        },
        {
          role: "user",
          content: `Topic: ${prompt}`,
        },
      ],
      model: GROQ_MODEL,
      temperature: 0.85,
      max_tokens: 400,
      reasoning_effort: "low",
    });

    const caption = completion.choices[0]?.message?.content?.trim() || "";

    if (!caption) {
      return { success: false, error: "Could not generate caption" };
    }

    return { success: true, caption };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate caption",
    };
  }
}

export async function improveCaption(currentCaption: string) {
  try {
    if (!currentCaption.trim()) {
      return { success: false, error: "Please enter a caption to improve" };
    }

    if (!process.env.GROQ_API_KEY) {
      return { success: false, error: "AI service not configured" };
    }

    const groq = getGroqClient();
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Improve this social media caption to be more impactful and concise. Keep it 1-2 lines max. Remove filler words. Write naturally. Just give the improved version.`,
        },
        {
          role: "user",
          content: `Improve: "${currentCaption}"`,
        },
      ],
      model: GROQ_MODEL,
      temperature: 0.8,
      max_tokens: 400,
      reasoning_effort: "low",
    });

    const caption = completion.choices[0]?.message?.content?.trim() || "";

    if (!caption) {
      return { success: false, error: "Could not improve caption" };
    }

    return { success: true, caption };
  } catch (error: any) {
    console.error("Error:", error);
    return {
      success: false,
      error: error.message || "Failed to improve caption",
    };
  }
}