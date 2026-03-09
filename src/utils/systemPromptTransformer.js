/**
 * System Prompt Transformer
 * 
 * Automatically injects the Qwen Code system prompt into incoming requests
 * to ensure consistent agent behavior across all proxy interactions.
 */

const config = require('../config.js');
const fs = require('fs');
const path = require('path');

/**
 * Read system prompt from sys-prompt.txt in current working directory
 * @returns {string} - The system prompt text from the file
 */
function readSystemPromptFromFile() {
  try {
    const filePath = path.join(process.cwd(), 'sys-prompt.txt');
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.trim();
  } catch (error) {
    console.warn('[System Prompt] Could not read sys-prompt.txt, using fallback');
    return '';
  }
}

class SystemPromptTransformer {
  constructor() {
    this.enabled = config.systemPrompt?.enabled ?? false;
    this.customPrompt = config.systemPrompt?.prompt || null;
    this.appendMode = config.systemPrompt?.appendMode ?? 'prepend'; // 'prepend' or 'append'
    this.modelFilter = config.systemPrompt?.modelFilter || null; // Array of model names to apply to, or null for all
    
    // Use custom prompt if provided, otherwise read from sys-prompt.txt
    this.systemPrompt = this.customPrompt || readSystemPromptFromFile();
    
    // Log if no system prompt is available
    if (!this.systemPrompt && this.enabled) {
      console.warn('[System Prompt] No system prompt loaded - please create sys-prompt.txt');
    }
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
        content: [
          {
            type: 'text',
            text: newContent,
            cache_control: {
              type: 'ephemeral'
            }
          }
        ]
      };

      console.log('\x1b[36m%s\x1b[0m', `[System Prompt] Injected into existing system message (${this.appendMode} mode)`);
      return newMessages;
    } else {
      // No system message - add ours at the beginning
      const newMessages = [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: this.systemPrompt,
              cache_control: {
                type: 'ephemeral'
              }
            }
          ]
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
  systemPromptTransformer
};
