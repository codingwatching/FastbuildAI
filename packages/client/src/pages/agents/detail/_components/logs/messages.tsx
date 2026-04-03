import type { AgentChatMessageItem, AgentChatRecordItem } from "@buildingai/services/web";
import {
  useAgentConversationMessagesQuery,
  useAgentConversationsQuery,
} from "@buildingai/services/web";
import { InfiniteScrollTop } from "@buildingai/ui/components/infinite-scroll-top";
import { Badge } from "@buildingai/ui/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@buildingai/ui/components/ui/drawer";
import { Input } from "@buildingai/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@buildingai/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@buildingai/ui/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@buildingai/ui/components/ui/tooltip";
import { usePagination } from "@buildingai/ui/hooks/use-pagination";
import { cn } from "@buildingai/ui/lib/utils";
import type { UIMessage } from "ai";
import {
  AlertTriangle,
  Loader2,
  MessageSquare,
  ThumbsDown,
  ThumbsUp,
  User,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type DisplayMessage, MessageItem } from "@/components/ask-assistant-ui";

type MessagesProps = { agentId: string };

const MESSAGES_PAGE_SIZE = 20;
const TABLE_PAGE_SIZE = 25;
const SORT_OPTIONS = [
  { value: "createdAt", label: "创建时间" },
  { value: "updatedAt", label: "更新时间" },
] as const;

type AgentMessageFeedback =
  | {
      type: "like";
      dislikeReason?: string;
      confidenceScore?: number;
    }
  | {
      type: "dislike";
      dislikeReason?: string;
      confidenceScore?: number;
    };

function MessageFeedbackBadge({ feedback }: { feedback?: AgentMessageFeedback | null }) {
  if (!feedback) return null;
  if (feedback.type === "like") {
    return (
      <Badge variant="default" className="gap-1">
        <ThumbsUp className="size-3" />
        <span>赞</span>
      </Badge>
    );
  }
  const confidenceScore = feedback.confidenceScore ?? 0.5;
  const opacity = Math.max(0.3, Math.min(1, confidenceScore));
  const intensity = confidenceScore > 0.7 ? "high" : confidenceScore > 0.4 ? "medium" : "low";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="destructive"
          className="gap-1"
          style={{
            opacity,
            backgroundColor: `rgba(239, 68, 68, ${opacity})`,
          }}
        >
          <ThumbsDown className="size-3" />
          <span>踩</span>
          {intensity === "high" && <AlertTriangle className="size-3" />}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          {feedback.dislikeReason && (
            <div>
              <div className="font-semibold">原因：</div>
              <div className="text-sm">{feedback.dislikeReason}</div>
            </div>
          )}
          <div className="text-muted-foreground text-xs">
            置信度: {(confidenceScore * 100).toFixed(0)}%
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function toUIMessage(m: {
  id: string;
  message?: { role?: string; parts?: unknown[]; [k: string]: unknown };
}): UIMessage {
  const stored = m.message && typeof m.message === "object" ? m.message : {};
  const parts = Array.isArray(stored.parts) ? stored.parts : [];
  const role = (stored.role as "user" | "assistant" | "system") ?? "assistant";
  return { ...stored, id: m.id, role, parts } as UIMessage;
}

function MessageListContent({
  agentId,
  conversationId,
}: {
  agentId: string;
  conversationId: string;
}) {
  const [page, setPage] = useState(1);
  const [allMessages, setAllMessages] = useState<AgentChatMessageItem[]>([]);
  const prevConversationIdRef = useRef<string | null>(null);
  const { data, isLoading, isFetching } = useAgentConversationMessagesQuery(
    agentId,
    conversationId,
    { page, pageSize: MESSAGES_PAGE_SIZE },
    { enabled: !!agentId && !!conversationId },
  );

  useEffect(() => {
    if (
      prevConversationIdRef.current !== null &&
      prevConversationIdRef.current !== conversationId
    ) {
      setPage(1);
      setAllMessages([]);
    }
    prevConversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!data?.items) return;
    const reversed = [...data.items].reverse();
    if (page === 1) {
      setAllMessages(reversed);
    } else {
      setAllMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newItems = reversed.filter((item) => !existingIds.has(item.id));
        if (newItems.length === 0) return prev;
        return [...newItems, ...prev];
      });
    }
  }, [data?.items, page]);

  const isLoadingMore = isFetching && page > 1;
  const hasMore = useMemo(() => {
    if (data === undefined) return true;
    const total = data?.total ?? 0;
    return total > 0 && allMessages.length < total;
  }, [data, allMessages.length]);

  const handleLoadMore = useCallback(() => {
    if (isLoading || isLoadingMore || !hasMore) return;
    setPage((prev) => prev + 1);
  }, [hasMore, isLoading, isLoadingMore]);

  if (isLoading && page === 1 && allMessages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  if (
    !isLoading &&
    !isFetching &&
    allMessages.length === 0 &&
    data !== undefined &&
    (data.items?.length ?? 0) === 0
  ) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center py-12 text-sm">
        该对话暂无消息
      </div>
    );
  }

  return (
    <InfiniteScrollTop
      className="chat-scroll flex h-full min-h-0 flex-col contain-[layout_style_paint]"
      prependKey={allMessages[0]?.id ?? null}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={handleLoadMore}
      hideScrollToBottomButton
      initial="instant"
      resize="instant"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pt-4 pb-10">
        {allMessages.map((m, index) => {
          const uiMessage = toUIMessage(m);
          const displayMessage: DisplayMessage = {
            id: uiMessage.id,
            message: uiMessage,
            parentId: null,
            sequence: index,
            branchNumber: 0,
            branchCount: 1,
            branches: [],
            isLast: index === allMessages.length - 1,
          };
          const rawFeedback = (m.message as { feedback?: AgentMessageFeedback | null } | undefined)
            ?.feedback;
          const isAssistant = uiMessage.role === "assistant";
          return (
            <MessageItem
              key={displayMessage.id}
              displayMessage={displayMessage}
              isStreaming={false}
              liked={rawFeedback?.type === "like"}
              disliked={rawFeedback?.type === "dislike"}
              extraActions={
                isAssistant && rawFeedback ? (
                  <MessageFeedbackBadge feedback={rawFeedback} />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </InfiniteScrollTop>
  );
}

function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function FeedbackCell({ record }: { record: AgentChatRecordItem }) {
  const like = record.feedbackStatus?.like ?? 0;
  const dislike = record.feedbackStatus?.dislike ?? 0;
  if (like === 0 && dislike === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <div className="flex items-center gap-2">
      {like > 0 && (
        <span className="flex items-center gap-1 text-green-600">
          <ThumbsUp className="size-3.5" />
          {like}
        </span>
      )}
      {dislike > 0 && (
        <span className="flex items-center gap-1 text-red-600">
          <ThumbsDown className="size-3.5" />
          {dislike}
        </span>
      )}
    </div>
  );
}

export default function Messages({ agentId }: MessagesProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<AgentChatRecordItem | null>(null);
  const [sortBy, setSortBy] = useState<string>("createdAt");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const queryParams = useMemo(
    () => ({
      page,
      pageSize: TABLE_PAGE_SIZE,
      keyword: keyword.trim() || undefined,
      sortBy: sortBy as "createdAt" | "updatedAt",
    }),
    [page, keyword, sortBy],
  );

  const { data, isLoading: loadingConversations } = useAgentConversationsQuery(
    agentId || undefined,
    queryParams,
    { enabled: !!agentId },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const { PaginationComponent, totalPages } = usePagination({
    total,
    pageSize: TABLE_PAGE_SIZE,
    page,
    onPageChange: setPage,
  });
  const showPagination = totalPages > 1;

  const handleRowClick = useCallback((c: AgentChatRecordItem) => {
    setSelected(c);
    setDrawerOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setDrawerOpen(open);
    if (!open) setSelected(null);
  }, []);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col rounded-lg">
        <div className="flex shrink-0 flex-wrap items-center gap-2 pb-3">
          <Select
            value={sortBy}
            onValueChange={(v) => {
              setSortBy(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="排序" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  排序: {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="text"
            placeholder="搜索"
            value={keyword}
            className="w-70"
            onChange={(e) => {
              setKeyword(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-0!">
                <TableHead
                  className="bg-muted w-[14%]"
                  style={{ borderRadius: "var(--radius) 0 0 var(--radius)" }}
                >
                  标题
                </TableHead>
                <TableHead className="bg-muted w-[24%]">用户或账户</TableHead>
                <TableHead className="bg-muted w-18">消息数</TableHead>
                <TableHead className="bg-muted w-26">用户反馈</TableHead>
                <TableHead className="bg-muted w-32">更新时间</TableHead>
                <TableHead className="bg-muted w-32 rounded-r-lg">创建时间</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {items.map((c) => (
                <TableRow
                  key={c.id}
                  className={cn("cursor-pointer", selected?.id === c.id && "bg-muted/60")}
                  onClick={() => handleRowClick(c)}
                >
                  <TableCell
                    className="max-w-[200px] truncate font-medium"
                    title={c.title ?? undefined}
                  >
                    {c.title?.trim() || "无标题"}
                  </TableCell>
                  <TableCell
                    className="text-muted-foreground text-sm"
                    title={c.userName ?? c.userId ?? c.id ?? "—"}
                  >
                    {c.anonymousIdentifier != null ? (
                      <div className="flex items-center gap-2 truncate">
                        <User className="size-4 shrink-0" />
                        <span className="min-w-0 truncate">游客</span>
                      </div>
                    ) : c.userName != null || c.userAvatar != null ? (
                      <div className="flex items-center gap-2 truncate">
                        {c.userAvatar ? (
                          <img
                            src={c.userAvatar}
                            alt=""
                            className="size-6 shrink-0 rounded-full object-cover"
                          />
                        ) : null}
                        <span className="min-w-0 truncate">{c.userName?.trim() || "—"}</span>
                      </div>
                    ) : (
                      <span className="truncate">{c.userId ?? c.id?.slice(0, 8) ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell>{c.messageCount ?? 0}</TableCell>
                  <TableCell>
                    <FeedbackCell record={c} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(c.updatedAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loadingConversations && items.length === 0 && (
            <div className="flex h-full w-full flex-col items-center justify-center text-center">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          )}
          {items.length === 0 && !loadingConversations && (
            <div className="flex h-full w-full flex-col items-center justify-center text-center">
              <p className="text-muted-foreground">暂无数据</p>
            </div>
          )}
        </div>
        {showPagination && (
          <div className="bg-background sticky bottom-0 z-2 flex shrink-0 pt-2">
            <PaginationComponent className="mx-0 w-fit" />
          </div>
        )}
      </div>
      <Drawer open={drawerOpen} onOpenChange={handleOpenChange} direction="right">
        <DrawerContent className="bg-muted flex h-full max-w-2xl! flex-col outline-none! sm:max-w-2xl!">
          <DrawerHeader className="shrink-0 px-4 py-3">
            <DrawerTitle className="flex items-center justify-between gap-3 text-base">
              <span className="min-w-0 truncate">{selected?.title?.trim() || "无标题"}</span>
              {selected && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <MessageSquare className="size-3.5" />
                    {selected.messageCount ?? 0} 条消息
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Zap className="size-3.5" />
                    {(selected.totalTokens ?? 0).toLocaleString()} tokens
                  </Badge>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    {(selected.consumedPower ?? 0).toLocaleString()} 积分
                  </Badge>
                  {(selected.feedbackStatus?.like ?? 0) > 0 && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-green-200 font-normal text-green-700 dark:border-green-800 dark:text-green-400"
                    >
                      <ThumbsUp className="size-3.5" />
                      {selected.feedbackStatus?.like ?? 0}
                    </Badge>
                  )}
                  {(selected.feedbackStatus?.dislike ?? 0) > 0 && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-red-200 font-normal text-red-700 dark:border-red-800 dark:text-red-400"
                    >
                      <ThumbsDown className="size-3.5" />
                      {selected.feedbackStatus?.dislike ?? 0}
                    </Badge>
                  )}
                </div>
              )}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex h-full min-h-0 flex-col px-1 pb-1">
            <div className="bg-background mt-0 h-full min-h-0 rounded-xl">
              {selected && agentId ? (
                <MessageListContent
                  key={selected.id}
                  agentId={agentId}
                  conversationId={selected.id}
                />
              ) : null}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
