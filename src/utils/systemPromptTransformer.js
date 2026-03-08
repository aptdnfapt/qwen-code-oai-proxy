/**
 * System Prompt Transformer
 * 
 * Automatically injects the Qwen Code system prompt into incoming requests
 * to ensure consistent agent behavior across all proxy interactions.
 */

const config = require('../config.js');

/**
 * Default Qwen Code system prompt
 * This is the core identity and behavioral instructions for the agent
 */
const DEFAULT_SYSTEM_PROMPT = `You are Qwen Code, an interactive CLI agent developed by Alibaba Group, specializing in software engineering tasks. Your primary goal is to help users safely and efficiently, adhering strictly to the following instructions and utilizing your available tools.\n\n# Core Mandates\n\n- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.\n- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project before employing it.\n- **Style & Structure:** Mimic the style, structure, framework choices, and architectural patterns of existing code in the project.\n- **Proactiveness:** Fulfill the user's request thoroughly.\n- **Path Construction:** Before using any file system tool, you must construct the full absolute path for the file_path argument.\n\n# Tool Usage\n- **File Paths:** Always use absolute paths.\n- **Parallelism:** Execute multiple independent tool calls in parallel.\n- **Command Execution:** Use the run_shell_command tool for running shell commands.\n\n# Available Tools\n- edit: Edit file\n- write_file: Create/write file  \n- read_file: Read file\n- grep_search: Search content\n- glob: Find files by pattern\n- run_shell_command: Execute shell commands\n- todo_write: Manage task list\n- save_memory: Remember user facts\n- task: Delegate to subagent\n- skill: Load specialized skill\n- exit_plan_mode: Exit planning mode\n- web_fetch: Fetch web content\n- web_search: Search the web\n- list_directory: List directory\n- lsp: Language server ops`;

class SystemPromptTransformer {
  constructor() {
    this.enabled = config.systemPrompt?.enabled ?? false;
    this.customPrompt = config.systemPrompt?.prompt || null;
    this.appendMode = config.systemPrompt?.appendMode ?? 'prepend'; // 'prepend' or 'append'
    this.modelFilter = config.systemPrompt?.modelFilter || null; // Array of model names to apply to, or null for all
    
    // Use custom prompt if provided, otherwise use default
    this.systemPrompt = this.customPrompt || DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Check if system prompt injection should be applied to a given model
   * @param {string} model - The model name
   * @returns {boolean} - Whether to apply the system prompt
   */
  shouldApplyToModel(model) {
    if (!this.enabled) {
      return false;
    }
    
    if (!this.modelFilter) {
      return true; // Apply to all models if no filter specified
    }
    
    return this.modelFilter.includes(model);
  }

  /**
   * Transform messages by injecting the system prompt
   * @param {Array} messages - Array of conversation messages
   * @param {string} model - The model name being used
   * @returns {Array} - Transformed messages with system prompt injected
   */
  transform(messages, model) {
    if (!this.shouldApplyToModel(model)) {
      return messages;
    }

    // Check if there's already a system message
    const existingSystemMessageIndex = messages.findIndex(msg => msg.role === 'system');

    if (existingSystemMessageIndex !== -1) {
      // System message exists - handle based on appendMode
      const existingSystemMessage = messages[existingSystemMessageIndex];
      const existingContent = typeof existingSystemMessage.content === 'string' 
        ? existingSystemMessage.content 
        : '';

      let newContent;
      if (this.appendMode === 'prepend') {
        // Add our system prompt before the existing system message
        newContent = `${this.systemPrompt}\n\n---\n\n${existingContent}`;
      } else {
        // Add our system prompt after the existing system message
        newContent = `${existingContent}\n\n---\n\n${this.systemPrompt}`;
      }

      // Create a new messages array with the updated system message
      const newMessages = [...messages];
      newMessages[existingSystemMessageIndex] = {
        ...existingSystemMessage,
        content: newContent
      };

      console.log('\x1b[36m%s\x1b[0m', `[System Prompt] Injected into existing system message (${this.appendMode} mode)`);
      return newMessages;
    } else {
      // No system message - add ours at the beginning
      const newMessages = [
        {
          role: 'system',
          content: this.systemPrompt
        },
        ...messages
      ];

      console.log('\x1b[36m%s\x1b[0m', '[System Prompt] Added new system message');
      return newMessages;
    }
  }

  /**
   * Get the current system prompt text
   * @returns {string} - The system prompt text
   */
  getSystemPrompt() {
    return this.systemPrompt;
  }

  /**
   * Check if the transformer is enabled
   * @returns {boolean} - Whether the transformer is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get transformer configuration details
   * @returns {Object} - Configuration details
   */
  getConfig() {
    return {
      enabled: this.enabled,
      appendMode: this.appendMode,
      modelFilter: this.modelFilter,
      hasCustomPrompt: !!this.customPrompt,
      promptLength: this.systemPrompt.length
    };
  }
}

// Export singleton instance
const systemPromptTransformer = new SystemPromptTransformer();

module.exports = {
  SystemPromptTransformer,
  systemPromptTransformer,
  DEFAULT_SYSTEM_PROMPT
};
