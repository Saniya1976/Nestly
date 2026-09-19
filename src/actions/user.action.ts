"use server";

import prisma from "@/lib/prisma";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

export async function syncUser(){
    try {
        const {userId}=await auth();
        const user= await currentUser();
        if(!userId || !user) return;
        
        const existingUser=await prisma.user.findUnique({
            where:{
                clerkId:userId
            }
        })
        if(existingUser) return existingUser;
        
        const dbUser=await prisma.user.create({
            data:{
                clerkId:userId,
                name: `${user.firstName || ""} ${user.lastName || ""}`,
                username: user.username ?? user.emailAddresses[0].emailAddress.split("@")[0],
                email: user.emailAddresses[0].emailAddress,
                image: user.imageUrl,
            }
        })
        return dbUser;
    } catch (error) {
        console.error("Error syncing user:", error);
        return null;
    }
}

// Create a separate function just for getting the ID
export async function getDbUserIdByClerkId(clerkId: string) {
  try {
    return await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true } // Only get what you need
    });
  } catch (error) {
    console.error("Error getting user by Clerk ID:", error);
    return null;
  }
}

// Keep your existing heavy function for when you need full data
export async function getUserByClerkId(clerkId: string) {
  try {
    return await prisma.user.findUnique({
      where: { clerkId },
      include: {
        _count: {
          select: {
            posts: true,
            followers: true,
            following: true,
          }
        }
      }
    });
  } catch (error) {
    console.error("Error getting full user by Clerk ID:", error);
    return null;
  }
}

// Fixed getDbUserId with auto-sync
export async function getDbUserId() {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) return null;
    
    // First try to find the user
    let user = await getDbUserIdByClerkId(clerkId);
    
    // If user doesn't exist in DB, sync them first
    if (!user) {
      console.log('🔄 User not found in DB, syncing from Clerk...');
      const syncedUser = await syncUser();
      if (!syncedUser) {
        throw new Error("Failed to sync user");
      }
      return syncedUser.id;
    }
    
    return user.id;
  } catch (error) {
    console.error("Error getting DB user ID:", error);
    return null;
  }
}

export async function getRandomUsers(){
    try {
      const userId=await getDbUserId();
      if(!userId) return [];
      
      const randomUsers=await prisma.user.findMany({
        where:{
            AND:[
                {NOT:{id:userId},},
                {NOT:{
                    followers:{
                        some:{
                            followerId:userId
                        }
                    }
                }},
            ]
        },
        select:{
            id:true,
            username:true,
            image:true,
            name:true,
            _count:{
                select:{
                    posts:true,
                    followers:true,
                    following:true,
                }
            }
        },
        take:3,
      })
      return randomUsers;

    } catch (error) {
        console.log("Error fetching random users:", error);
        return [];
    }
}

export async function toggleFollow({ userId }: { userId: string }) {
  try {
    const currentUserId = await getDbUserId();

    if (!userId || !currentUserId) {
      return { success: false, error: "Invalid user" };
    }

    if (userId === currentUserId) {
      throw new Error("You cannot follow yourself");
    }

    const existingFollow = await prisma.follows.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: userId,
        },
      },
    });

    if (existingFollow) {
      await prisma.follows.delete({
        where: {
          followerId_followingId: {
            followerId: currentUserId,
            followingId: userId,
          },
        },
      });
    } else {
      await prisma.$transaction([
        prisma.follows.create({
          data: {
            followerId: currentUserId,
            followingId: userId,
          },
        }),
        prisma.notification.create({
          data: {
            type: "FOLLOW",
            userId: userId,
            creatorId: currentUserId,
          },
        }),
      ]);
    }

    revalidatePath("/");
    revalidatePath("/notifications");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle follow", error);
    return { success: false, error: "Error Toggling Follow" };
  }
}