type ClaudeModel = 'claude-opus-4-6' | 'claude-opus-4-6[1m]' | 'claude-sonnet-4-6' | 'claude-sonnet-4-6[1m]'
type ClaudeEffort = 'low' | 'medium' | 'high' | 'max'

type CodexModel = 'gpt-5.4' | 'gpt-5.4-mini' | 'gpt-5.3-codex' | 'gpt-5.3-codex-spark' | 'gpt-5.2'
type CodexReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

interface ClaudeOptions {
  model: ClaudeModel
  effort: ClaudeEffort
}

interface CodexOptions {
  model: CodexModel
  reasoningEffort: CodexReasoningEffort
}

const claudePresets = {
  'opus4.6-max': { model: 'claude-opus-4-6', effort: 'max' },
  'opus4.6[1m]-max': { model: 'claude-opus-4-6[1m]', effort: 'max' },
  'sonnet4.6-high': { model: 'claude-sonnet-4-6', effort: 'high' },
  'sonnet4.6[1m]-high': { model: 'claude-sonnet-4-6[1m]', effort: 'high' },
} as const satisfies Record<string, ClaudeOptions>

const codexPresets = {
  'gpt5.4-xhigh': { model: 'gpt-5.4', reasoningEffort: 'xhigh' },
  'gpt5.4-mini-high': { model: 'gpt-5.4-mini', reasoningEffort: 'high' },
} as const satisfies Record<string, CodexOptions>

export class ClaudeCommand {
  readonly model: ClaudeModel
  private readonly effort: ClaudeEffort

  constructor(options: ClaudeOptions) {
    this.model = options.model
    this.effort = options.effort
  }

  static fromPreset(name: keyof typeof claudePresets): ClaudeCommand {
    return new ClaudeCommand(claudePresets[name])
  }

  toString(prompt: string): string {
    return `claude -p ${JSON.stringify(prompt)} --model ${this.model} --effort ${this.effort} --dangerously-skip-permissions`
  }
}

export class CodexCommand {
  readonly model: CodexModel
  private readonly reasoningEffort: CodexReasoningEffort

  constructor(options: CodexOptions) {
    this.model = options.model
    this.reasoningEffort = options.reasoningEffort
  }

  static fromPreset(name: keyof typeof codexPresets): CodexCommand {
    return new CodexCommand(codexPresets[name])
  }

  toString(prompt: string): string {
    return `codex exec ${JSON.stringify(prompt)} --model ${this.model} -c model_reasoning_effort=${this.reasoningEffort} --full-auto`
  }
}
