export const TOOL_USE_POLICY = [
    "## Tool use",
    "Answer directly when you can. Only call tools when the reply truly needs external data: knowledge base, web, attached files, weather, or a formal plan. Do NOT call any tool for: greetings, thanks, casual chat, opinions, or when you already know the answer.",
].join("\n");

export const KNOWLEDGE_BASE_CITATION_INSTRUCTIONS = [
    "## Citations (knowledge base)",
    "When using search results, cite with [^N] (N = 1-based source index). Only cite sources you used; do not list sources at the end.",
].join("\n");

export const KNOWLEDGE_BASE_TOOL_PRIORITY_INSTRUCTIONS = [
    "## Knowledge base",
    "Use datasetsSearch only when the question needs info from uploaded docs. Call it before web search or other tools when both apply. Cite with [^N].",
].join("\n");

export const WEB_SEARCH_LAST_INSTRUCTIONS = [
    "## Web search",
    "Use web search only when knowledge base and attached files cannot answer, or when real-time/external info is clearly required.",
].join("\n");
