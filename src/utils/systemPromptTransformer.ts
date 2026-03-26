const config = require("../config.js") as any;
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

type MessagePart = {
  type: string;
  text?: string;
  cache_control?: { type: string };
  [key: string]: unknown;
};

type Message = {
  role?: string;
  content?: string | MessagePart[];
  [key: string]: unknown;
};

function readSystemPromptFromFile(): string {
  try {
    const filePath = path.join(process.cwd(), "sys-prompt.txt");
    const content = fs.readFileSync(filePath, "utf-8");
    return content.trim();
  } catch {
    console.warn("[System Prompt] Could not read sys-prompt.txt, using fallback");
    return "";
  }
}

export class SystemPromptTransformer {
  enabled: boolean;
  customPrompt: string | null;
  appendMode: string;
  modelFilter: string[] | null;
  systemPrompt: string;

  constructor() {
    this.enabled = config.systemPrompt?.enabled ?? false;
    this.customPrompt = config.systemPrompt?.prompt || null;
    this.appendMode = config.systemPrompt?.appendMode ?? "prepend";
    this.modelFilter = config.systemPrompt?.modelFilter || null;
    this.systemPrompt = this.customPrompt || readSystemPromptFromFile();

    if (!this.systemPrompt && this.enabled) {
      console.warn("[System Prompt] No system prompt loaded - please create sys-prompt.txt");
    }
  }

  shouldApplyToModel(model: string): boolean {
    if (!this.enabled) {
      return false;
    }

    if (!this.modelFilter) {
      return true;
    }

    return this.modelFilter.includes(model);
  }

  addCacheControl(message: Message): Message {
    if (typeof message.content === "string") {
      return {
        ...message,
        content: [{ type: "text", text: message.content, cache_control: { type: "ephemeral" } }],
      };
    }

    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part: MessagePart) => {
          if (part.type === "text" && !part.cache_control) {
            return { ...part, cache_control: { type: "ephemeral" } };
          }
          return part;
        }),
      };
    }

    return message;
  }

  transform(messages: Message[], model: string): Message[] {
    const transformedMessages = messages.map((message) => this.addCacheControl(message));

    if (!this.shouldApplyToModel(model)) {
      return transformedMessages;
    }

    const existingSystemMessageIndex = transformedMessages.findIndex((message) => message.role === "system");
    if (existingSystemMessageIndex !== -1) {
      const existingSystemMessage = transformedMessages[existingSystemMessageIndex];
      const existingContent = Array.isArray(existingSystemMessage.content)
        ? existingSystemMessage.content.map((part: MessagePart) => part.text || "").join("")
        : "";

      const newContent = this.appendMode === "prepend"
        ? `${this.systemPrompt}\n\n---\n\n${existingContent}`
        : `${existingContent}\n\n---\n\n${this.systemPrompt}`;

      transformedMessages[existingSystemMessageIndex] = {
        ...existingSystemMessage,
        content: [{ type: "text", text: newContent, cache_control: { type: "ephemeral" } }],
      };
      return transformedMessages;
    }

    return [{
      role: "system",
      content: [{ type: "text", text: this.systemPrompt, cache_control: { type: "ephemeral" } }],
    }, ...transformedMessages];
  }
}

export const systemPromptTransformer = new SystemPromptTransformer();
