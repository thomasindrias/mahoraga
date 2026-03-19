import OpenAI from 'openai';
import type { AgentExecutor, AgentExecutionResult, AgentExecuteOptions } from './executor.js';

const PROVIDER_DEFAULTS: Record<string, { baseURL: string; model: string }> = {
  openai: { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: 'gemini-2.5-pro',
  },
};

const MAX_TURNS = 30;

const TOOLS: OpenAI.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to project root' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to project root' },
          content: { type: 'string', description: 'Full file content to write' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_directory',
      description: 'List files in a directory (non-recursive by default)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to project root' },
          recursive: { type: 'boolean', description: 'List recursively (default: false)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_files',
      description: 'Search for a text pattern across files (like grep)',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Text or regex pattern to search for' },
          path: { type: 'string', description: 'Directory to search in (default: ".")' },
          file_pattern: { type: 'string', description: 'Glob pattern for files to search (e.g. "*.ts")' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Run a shell command in the project directory',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
];

const SYSTEM_PROMPT = `You are an expert code fixer. You are given a detected UI issue from production analytics and must create a focused fix.

You have access to tools to read/write files and run commands in the project directory. Use them to:
1. Explore the codebase to find the relevant code
2. Understand the root cause of the issue
3. Make a minimal, focused fix
4. Verify your changes compile (run typecheck if available)

Rules:
- Only modify files that are necessary to fix the issue
- Keep changes minimal — do not refactor unrelated code
- Ensure your fix handles edge cases (null checks, optional chaining, etc.)
- When done, output a brief summary of what you changed and why`;

/**
 * API-based agent executor using OpenAI-compatible chat completions with tool use.
 * Works with OpenAI, Gemini (via OpenAI-compatible endpoint), and any compatible provider.
 */
export class APIAgentExecutor implements AgentExecutor {
  readonly provider: string;
  private client: OpenAI;
  private model: string;

  constructor(config: {
    provider: string;
    apiKey: string;
    model?: string;
    baseURL?: string;
  }) {
    this.provider = config.provider;
    const defaults = PROVIDER_DEFAULTS[config.provider];
    this.model = config.model ?? defaults?.model ?? 'gpt-4o';

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL ?? defaults?.baseURL,
    });
  }

  async execute(
    prompt: string,
    workDir: string,
    options?: AgentExecuteOptions,
  ): Promise<AgentExecutionResult> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ];

    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages,
          tools: TOOLS,
          tool_choice: turn === MAX_TURNS - 1 ? 'none' : 'auto',
        });

        const choice = response.choices[0]!;
        const message = choice.message;

        if (choice.finish_reason === 'stop' || !message.tool_calls?.length) {
          // Agent is done
          return {
            success: true,
            diff: message.content ?? 'Fix applied',
          };
        }

        // Add assistant message with tool calls
        messages.push(message);

        // Execute each tool call
        for (const toolCall of message.tool_calls) {
          const result = await this.executeTool(toolCall, workDir);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }

      return {
        success: true,
        diff: 'Fix applied (max turns reached)',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  private async executeTool(
    toolCall: OpenAI.Chat.Completions.ChatCompletionMessageToolCall,
    workDir: string,
  ): Promise<string> {
    const { readFile, writeFile, readdir, mkdir } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);

    if (toolCall.type !== 'function') return 'Unsupported tool type';
    const name = toolCall.function.name;
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch {
      return 'Error: Invalid JSON arguments';
    }

    try {
      switch (name) {
        case 'read_file': {
          const filePath = join(workDir, args.path as string);
          const content = await readFile(filePath, 'utf-8');
          return content;
        }

        case 'write_file': {
          const filePath = join(workDir, args.path as string);
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, args.content as string, 'utf-8');
          return `File written: ${args.path}`;
        }

        case 'list_directory': {
          const dirPath = join(workDir, (args.path as string) || '.');
          if (args.recursive) {
            const { stdout } = await exec(
              'find', [dirPath, '-type', 'f', '-not', '-path', '*/node_modules/*', '-not', '-path', '*/.git/*'],
              { cwd: workDir, timeout: 10_000, maxBuffer: 1024 * 1024 },
            );
            // Return relative paths
            return stdout.split('\n').filter(Boolean).map(f => f.replace(workDir + '/', '')).join('\n');
          }
          const entries = await readdir(dirPath, { withFileTypes: true });
          return entries.map(e => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`).join('\n');
        }

        case 'search_files': {
          const searchPath = join(workDir, (args.path as string) || '.');
          const grepArgs = ['-rn', '--include', args.file_pattern as string || '*.ts', args.pattern as string, searchPath];
          try {
            const { stdout } = await exec('grep', grepArgs, { cwd: workDir, timeout: 10_000, maxBuffer: 1024 * 1024 });
            return stdout.split('\n').filter(Boolean).map(l => l.replace(workDir + '/', '')).slice(0, 50).join('\n');
          } catch {
            return 'No matches found';
          }
        }

        case 'run_command': {
          const { stdout, stderr } = await exec(
            'bash', ['-c', args.command as string],
            { cwd: workDir, timeout: 60_000, maxBuffer: 5 * 1024 * 1024 },
          );
          const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
          // Truncate long output
          return output.length > 10_000 ? output.slice(0, 10_000) + '\n... (truncated)' : output;
        }

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error: ${msg}`;
    }
  }
}
