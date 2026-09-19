// app/notifications/page.tsx
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { getNotifications, markNotificationsAsRead } from "@/actions/notification.action";
import { NotificationsSkeleton } from "@/components/NotificationSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { HeartIcon, MessageCircleIcon, UserPlusIcon } from "lucide-react";
import Link from "next/link";

// ✅ Extract notifications list into its own async server component
async function NotificationsList() {
  const notifications = await getNotifications();

  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
  if (unreadIds.length > 0) {
    // fire & forget so UI isn't blocked
    markNotificationsAsRead(unreadIds);
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "LIKE":
        return <HeartIcon className="size-4 text-red-500" />;
      case "COMMENT":
        return <MessageCircleIcon className="size-4 text-blue-500" />;
      case "FOLLOW":
        return <UserPlusIcon className="size-4 text-green-500" />;
      default:
        return null;
    }
  };

  const getNotificationText = (type: string) => {
    switch (type) {
      case "FOLLOW":
        return "started following you";
      case "LIKE":
        return "liked your post";
      case "COMMENT":
        return "commented or replied";
      default:
        return "sent you a notification";
    }
  };

  if (notifications.length === 0) {
    return <div className="p-4 text-center text-muted-foreground">No notifications yet</div>;
  }

  return (
    <>
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`flex items-start gap-4 p-4 border-b hover:bg-muted/25 transition-colors ${
            !notification.read ? "bg-muted/50" : ""
          }`}
        >
          <Link href={`/profile/${notification.creator.username}`} className="shrink-0">
            <Avatar className="mt-1">
              <AvatarImage
                src={notification.creator.image || "/avatar.png"}
                alt={notification.creator.username || "User"}
              />
            </Avatar>
          </Link>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">{getNotificationIcon(notification.type)}</span>
              <span className="min-w-0 break-words">
                <Link
                  href={`/profile/${notification.creator.username}`}
                  className="font-medium hover:underline"
                >
                  {notification.creator.username}
                </Link>{" "}
                {getNotificationText(notification.type)}
              </span>
            </div>

            {notification.post &&
              (notification.type === "LIKE" || notification.type === "COMMENT") && (
                <div className="pl-6 space-y-2">
                  <div className="text-sm text-muted-foreground rounded-md p-2 bg-muted/30 mt-2">
                    <p>{notification.post.content}</p>
                    {notification.post.image && (
                      <img
                        src={notification.post.image}
                        alt="Post content"
                        className="mt-2 rounded-md w-full max-w-[200px] h-auto object-cover"
                      />
                    )}
                  </div>

                  {notification.type === "COMMENT" && notification.comment && (
                    <div className="text-sm p-2 bg-accent/50 rounded-md">
                      {notification.comment.content}
                    </div>
                  )}
                </div>
              )}

            <p className="text-sm text-muted-foreground pl-6">
              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}

export default function NotificationsPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle>Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-12rem)]">
            {/* ✅ Suspense with skeleton */}
            <Suspense fallback={<NotificationsSkeleton />}>
              <NotificationsList />
            </Suspense>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
