"use server";

import prisma from "@/lib/prisma";
import { getDbUserId } from "./user.action";
import { revalidatePath } from "next/cache";

// Create Post
export async function createPost({ content, image }: { content: string; image?: string }) {
  try {
    const userId = await getDbUserId();

    if (!userId) {
      return { success: false, error: "User not authenticated" };
    }

    const post = await prisma.post.create({
      data: {
        content,
        image: image || null, 
        authorId: userId,
      },
    });

  
    revalidatePath("/");
    return { success: true, post };
  } catch (error) {
    console.log("Error creating post:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create post",
    };
  }
}
// Get Posts
export async function getPosts() {
  try {
    const posts = await prisma.post.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            image: true,
          },
        },
        comments: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                username: true,
                image: true,
              },
            },
          },
        },
        likes: {
          select: {
            userId: true,
          },
        },
        _count: {
          select: {
            comments: true,
            likes: true,
          },
        },
      },
    });

    return posts;
  } catch (error) {
    console.log("Error fetching posts:", error);
    throw new Error( "Failed to fetch posts" );
  }
}
export async function toggleLike(postId: string) {
  try {
    const userId = await getDbUserId();
    if (!userId) return;
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) throw new Error("Post not found");

    if (existingLike) {
      // unlike
      await prisma.like.delete({
        where: {
          userId_postId: {
            userId,
            postId,
          },
        },
      });
    } else {
      // like and create notification (only if liking someone else's post)
      await prisma.$transaction([
        prisma.like.create({
          data: {
            userId,
            postId,
          },
        }),
        ...(post.authorId !== userId
          ? [
              prisma.notification.create({
                data: {
                  type: "LIKE",
                  userId: post.authorId, // recipient (post author)
                  creatorId: userId, // person who liked
                  postId,
                },
              }),
            ]
          : []),
      ]);
    }
    revalidatePath("/");
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle like:", error);
    return { success: false, error: "Failed to toggle like" };
  }
}
export async function createComment(postId: string, content: string, parentId?: string) {
  try {
    const userId = await getDbUserId();

    if (!userId) return;
    if (!content) throw new Error("Content is required");

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post) throw new Error("Post not found");

    let parentAuthorId: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, authorId: true },
      });
      if (!parent || parent.postId !== postId) {
        throw new Error("Comment to reply to was not found");
      }
      parentAuthorId = parent.authorId;
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        authorId: userId,
        postId,
        parentId: parentId || null,
      },
    });

    const notifyUserIds = new Set<string>();
    if (parentAuthorId && parentAuthorId !== userId) {
      notifyUserIds.add(parentAuthorId);
    }
    if (post.authorId !== userId) {
      notifyUserIds.add(post.authorId);
    }

    for (const recipientId of notifyUserIds) {
      await prisma.notification.create({
        data: {
          type: "COMMENT",
          userId: recipientId,
          creatorId: userId,
          postId,
          commentId: comment.id,
        },
      });
    }

    revalidatePath("/");
    revalidatePath("/notifications");
    return { success: true, comment };
  } catch (error) {
    console.error("Failed to create comment:", error);
    return { success: false, error: "Failed to create comment" };
  }
}
export async function deletePost(postId:string){
  try {
    const userId=await getDbUserId();
    if(!userId) {
      throw new Error("User not authenticated");
    }

    const post = await prisma.post.findUnique({
      where: {
         id: postId,
      },
      select: { authorId: true },
    });
    if (!post) {
      throw new Error("Post not found");
    }
    if (post.authorId !== userId) {
      throw new Error("You are not authorized to delete this post");
    }
    await prisma.post.delete({
      where: { id: postId },
    });
  
    revalidatePath("/");
    return { success: true };
  } catch (error) {
    console.log("Error deleting post:", error);
    throw new Error("Failed to delete post");
  }
}