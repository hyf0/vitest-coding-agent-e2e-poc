type ClaudeModel = 'claude-opus-4-6' | 'claude-sonnet-4-6'
type ClaudeEffort = 'low' | 'medium' | 'high' | 'max'

type CodexModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.3-codex' | 'gpt-5.3-codex-spark' | 'gpt-5.2'
type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export class ClaudeCommand {
  private model: ClaudeModel
  private effort: ClaudeEffort

  constructor(options?: { model?: ClaudeModel; effort?: ClaudeEffort }) {
    this.model = options?.model ?? 'claude-opus-4-6'
    this.effort = options?.effort ?? 'max'
  }

  toString(prompt: string): string {
    return `claude -p ${JSON.stringify(prompt)} --model ${this.model} --effort ${this.effort} --dangerously-skip-permissions`
  }
}

export class CodexCommand {
  private model: CodexModel
  private reasoningEffort: CodexReasoningEffort

  constructor(options?: { model?: CodexModel; reasoningEffort?: CodexReasoningEffort }) {
    this.model = options?.model ?? 'gpt-5.4'
    this.reasoningEffort = options?.reasoningEffort ?? 'xhigh'
  }

  toString(prompt: string): string {
    return `codex exec ${JSON.stringify(prompt)} --model ${this.model} -c model_reasoning_effort=${this.reasoningEffort} --full-auto`
  }
}
