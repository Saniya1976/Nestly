"use client";

import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Textarea } from "./ui/textarea";
import { ImageIcon, Loader2Icon, SendIcon, SparklesIcon, WandIcon } from "lucide-react";
import { Button } from "./ui/button";
import { createPost } from "@/actions/post.action";
import ImageUpload from "./ImageUpload";
import { toast } from "sonner";

function CreatePost() {
  const { user } = useUser();
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isPosting, setIsPosting] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [aiMode, setAiMode] = useState<"generate" | "improve" | null>(null);
  const isGenerating = aiMode !== null;

  // API call function for AI
  const callAIApi = async (prompt: string, action: 'generate' | 'improve' = 'generate') => {
    try {
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          action,
          timestamp: Date.now()
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('API Call Error:', error);
      throw error;
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() && !imageUrl) return;

    setIsPosting(true);
    try {
      const result = await createPost({ content, image: imageUrl });
      if (result?.success) {
        setContent("");
        setImageUrl("");
        setShowImageUpload(false);
        toast.success("Post created successfully");
      }
    } catch (error) {
      console.error("Failed to create post:", error);
      toast.error("Failed to create post");
    } finally {
      setIsPosting(false);
    }
  };

  const handleGenerateFromText = async () => {
    if (!content.trim()) {
      toast.error("Write something in the box first");
      return;
    }

    setAiMode("generate");
    try {
      const result = await callAIApi(content, 'generate');
      
      if (result.success && result.caption) {
        setContent(result.caption);
        toast.success("Caption generated! ✨");
      } else {
        toast.error(result.error || "Failed to generate caption");
      }
    } catch (error: any) {
      console.error("Generate Error:", error);
      toast.error(error.message || "Network error. Check your connection.");
    } finally {
      setAiMode(null);
    }
  };

  const handleImproveCaption = async () => {
    if (!content.trim()) {
      toast.error("Please write some content first");
      return;
    }

    setAiMode("improve");
    try {
      const result = await callAIApi(content, 'improve');
      
      if (result.success && result.caption) {
        setContent(result.caption);
        toast.success("Caption improved! ✨");
      } else {
        toast.error(result.error || "Failed to improve caption");
      }
    } catch (error: any) {
      console.error("Improve Error:", error);
      toast.error(error.message || "Network error. Check your connection.");
    } finally {
      setAiMode(null);
    }
  };

  return (
    <Card className="mb-4 sm:mb-6">
      <CardContent className="pt-4 sm:pt-6 px-3 sm:px-6">
        <div className="space-y-3 sm:space-y-4">
          {/* HEADER WITH AVATAR AND TEXTAREA */}
          <div className="flex space-x-2 sm:space-x-4">
            <Avatar className="w-8 h-8 sm:w-10 sm:h-10 flex-shrink-0">
              <AvatarImage src={user?.imageUrl || "/avatar.png"} />
            </Avatar>
            <div className="flex-1 min-w-0">
              <Textarea
                placeholder="What's on your mind? Type here, then tap Generate."
                className="min-h-[80px] sm:min-h-[100px] resize-none border-none focus-visible:ring-0 p-0 text-sm sm:text-base"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isPosting || isGenerating}
              />
            </div>
          </div>

          {/* IMAGE UPLOAD SECTION */}
          {(showImageUpload || imageUrl) && (
            <div className="border rounded-lg p-3 sm:p-4">
              <ImageUpload
                value={imageUrl}
                onChange={(url) => {
                  setImageUrl(url);
                  if (url) {
                    setShowImageUpload(true);
                  }
                }}
              />
            </div>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="grid w-full min-w-0 grid-cols-3 gap-1 sm:flex sm:w-auto sm:gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 min-w-0 px-2 text-xs sm:flex-none sm:px-3 sm:text-sm text-muted-foreground hover:text-primary"
                onClick={() => setShowImageUpload(!showImageUpload)}
                disabled={isPosting || isGenerating}
              >
                <ImageIcon className="size-4 shrink-0" />
                <span className="truncate">Photo</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 min-w-0 px-2 text-xs sm:flex-none sm:px-3 sm:text-sm text-muted-foreground hover:text-purple-500"
                onClick={handleGenerateFromText}
                disabled={isPosting || isGenerating || !content.trim()}
              >
                <SparklesIcon className="size-4 shrink-0" />
                <span className="truncate">
                  {aiMode === "generate" ? "Generating..." : "Generate"}
                </span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 min-w-0 px-2 text-xs sm:flex-none sm:px-3 sm:text-sm text-muted-foreground hover:text-blue-500 disabled:opacity-40"
                onClick={handleImproveCaption}
                disabled={isPosting || isGenerating || !content.trim()}
              >
                <WandIcon className="size-4 shrink-0" />
                <span className="truncate">
                  {aiMode === "improve" ? "Improving..." : "Improve"}
                </span>
              </Button>
            </div>

            {/* Post Button */}
            <div className="w-full sm:w-auto sm:ml-auto">
              <Button
                className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base px-4"
                onClick={handleSubmit}
                disabled={(!content.trim() && !imageUrl) || isPosting || isGenerating}
              >
                {isPosting ? (
                  <>
                    <Loader2Icon className="size-4 mr-2 animate-spin" />
                    <span className="sm:inline">Posting...</span>
                  </>
                ) : (
                  <>
                    <SendIcon className="size-4 mr-2" />
                    <span className="sm:inline">Post</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CreatePost;