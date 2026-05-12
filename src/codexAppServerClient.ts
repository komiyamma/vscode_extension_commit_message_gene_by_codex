import { spawn, type ChildProcessByStdio } from 'child_process';
import * as readline from 'readline';
import type { Readable, Writable } from 'stream';

type JsonRpcResponse = {
	id?: number;
	result?: any;
	error?: any;
};

type JsonRpcMessage = JsonRpcResponse & {
	method?: string;
	params?: any;
};

type PendingRequest = {
	resolve: (msg: JsonRpcResponse) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

export type AppServerTurnResult = {
	status: string;
	output: string;
};

export type AppServerClientOptions = {
	clientName: string;
	clientTitle: string;
	clientVersion: string;
	model: string;
	reasoningEffort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
	onLog?: (message: string) => void;
};

const CONNECT_TIMEOUT_MS = 3_000;
const REQUEST_TIMEOUT_MS = 30_000;
let nextId = 0;

export class CodexAppServerClient {
	readonly mode: 'proxy' | 'stdio';

	private readonly proc: ChildProcessByStdio<Writable, Readable, null>;
	private readonly rl: readline.Interface;
	private readonly pending = new Map<number, PendingRequest>();
	private readonly completedTurnResults: AppServerTurnResult[] = [];
	private readonly agentMessages: string[] = [];
	private turnCompletion:
		| {
			resolve: (result: AppServerTurnResult) => void;
			reject: (error: Error) => void;
		}
		| null = null;
	private closed = false;
	private runningTurn: Promise<AppServerTurnResult> | null = null;

	private constructor(
		proc: ChildProcessByStdio<Writable, Readable, null>,
		mode: 'proxy' | 'stdio',
		private readonly options: AppServerClientOptions,
	) {
		this.proc = proc;
		this.mode = mode;
		this.rl = readline.createInterface({ input: proc.stdout });

		this.rl.on('line', (line) => this.handleLine(line));
		this.proc.once('exit', (code, signal) => {
			this.closed = true;
			const reason = signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`;
			for (const [id, request] of this.pending) {
				clearTimeout(request.timer);
				request.reject(new Error(`codex app-server ${this.mode} exited before request ${id} completed (${reason})`));
			}
			this.pending.clear();
			if (this.turnCompletion) {
				this.turnCompletion.reject(new Error(`codex app-server ${this.mode} exited before the turn completed (${reason})`));
				this.turnCompletion = null;
			}
		});
	}

	static async connect(options: AppServerClientOptions): Promise<CodexAppServerClient> {
		const proxyClient = await CodexAppServerClient.tryCreate(['app-server', 'proxy'], 'proxy', options);
		if (proxyClient) {
			return proxyClient;
		}

		return CodexAppServerClient.createInitialized(['app-server'], 'stdio', options);
	}

	async runFreshTurn(prompt: string, cwd: string, sessionStartSource: 'startup' | 'clear'): Promise<AppServerTurnResult> {
		if (this.runningTurn) {
			throw new Error('Codex app-server is already processing a turn.');
		}

		this.runningTurn = this.runFreshTurnInner(prompt, cwd, sessionStartSource);
		try {
			return await this.runningTurn;
		} finally {
			this.runningTurn = null;
		}
	}

	close(): void {
		if (!this.closed) {
			this.proc.stdin.end();
			this.proc.kill();
		}
		this.rl.close();
	}

	private static async tryCreate(args: string[], mode: 'proxy' | 'stdio', options: AppServerClientOptions): Promise<CodexAppServerClient | null> {
		const client = CodexAppServerClient.create(args, mode, options);
		try {
			await client.initialize(CONNECT_TIMEOUT_MS);
			return client;
		} catch (error) {
			options.onLog?.(`codex app-server ${mode} connection failed: ${error instanceof Error ? error.message : String(error)}`);
			client.close();
			return null;
		}
	}

	private static async createInitialized(args: string[], mode: 'proxy' | 'stdio', options: AppServerClientOptions): Promise<CodexAppServerClient> {
		const client = CodexAppServerClient.create(args, mode, options);
		try {
			await client.initialize(CONNECT_TIMEOUT_MS);
			return client;
		} catch (error) {
			client.close();
			throw error;
		}
	}

	private static create(args: string[], mode: 'proxy' | 'stdio', options: AppServerClientOptions): CodexAppServerClient {
		const command = process.platform === 'win32' ? 'codex.cmd' : 'codex';
		const proc = spawn(command, args, {
			stdio: ['pipe', 'pipe', 'inherit'],
			shell: process.platform === 'win32',
			windowsHide: true,
		});
		return new CodexAppServerClient(proc, mode, options);
	}

	private async initialize(timeoutMs: number): Promise<void> {
		const response = await this.request('initialize', {
			clientInfo: {
				name: this.options.clientName,
				title: this.options.clientTitle,
				version: this.options.clientVersion,
			},
			capabilities: {
				optOutNotificationMethods: [
					'item/agentMessage/delta',
					'item/reasoning/textDelta',
					'item/reasoning/summaryTextDelta',
					'item/reasoning/summaryPartAdded',
				],
			},
		}, timeoutMs);
		assertOk(response, 'initialize');
		this.send({ method: 'initialized', params: {} });
	}

	private async runFreshTurnInner(prompt: string, cwd: string, sessionStartSource: 'startup' | 'clear'): Promise<AppServerTurnResult> {
		const threadResponse = await this.request('thread/start', {
			model: this.options.model,
			approvalPolicy: 'never',
			sandbox: 'workspaceWrite',
			cwd,
			serviceName: this.options.clientName,
			ephemeral: true,
			sessionStartSource,
		});
		assertOk(threadResponse, 'thread/start');

		const threadId = threadResponse.result?.thread?.id;
		if (typeof threadId !== 'string' || threadId.length === 0) {
			throw new Error('thread/start did not return a thread id.');
		}

		try {
			const turnResponse = await this.request('turn/start', {
				threadId,
				input: [{ type: 'text', text: prompt }],
				effort: this.options.reasoningEffort,
			});
			assertOk(turnResponse, 'turn/start');
			return await this.waitForTurnCompleted();
		} finally {
			try {
				const unsubscribeResponse = await this.request('thread/unsubscribe', { threadId });
				assertOk(unsubscribeResponse, 'thread/unsubscribe');
			} catch (error) {
				this.options.onLog?.(`thread/unsubscribe failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}

	private request(method: string, params: Record<string, unknown> = {}, timeoutMs = REQUEST_TIMEOUT_MS): Promise<JsonRpcResponse> {
		if (this.closed) {
			return Promise.reject(new Error(`codex app-server ${this.mode} is not running`));
		}

		const id = nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Timed out waiting for ${method} response from codex app-server ${this.mode}`));
			}, timeoutMs);

			this.pending.set(id, { resolve, reject, timer });
			this.send({ method, id, params });
		});
	}

	private send(message: unknown): void {
		this.proc.stdin.write(`${JSON.stringify(message)}\n`);
	}

	private waitForTurnCompleted(): Promise<AppServerTurnResult> {
		if (this.turnCompletion) {
			throw new Error('Already waiting for a turn to complete.');
		}

		const completedResult = this.completedTurnResults.shift();
		if (completedResult) {
			return Promise.resolve(completedResult);
		}

		return new Promise((resolve, reject) => {
			this.turnCompletion = { resolve, reject };
		});
	}

	private handleLine(line: string): void {
		let message: JsonRpcMessage;
		try {
			message = JSON.parse(line) as JsonRpcMessage;
		} catch {
			this.options.onLog?.(`Ignoring non-JSON app-server output: ${line}`);
			return;
		}

		if (typeof message.id === 'number') {
			const request = this.pending.get(message.id);
			if (request) {
				clearTimeout(request.timer);
				this.pending.delete(message.id);
				request.resolve(message);
			}
		}

		if (message.method === 'item/completed') {
			const item = message.params?.item;
			if (item?.type === 'agentMessage' && typeof item.text === 'string') {
				this.agentMessages.push(item.text);
			}
		}

		if (message.method === 'turn/completed') {
			const result = {
				status: typeof message.params?.turn?.status === 'string' ? message.params.turn.status : 'unknown',
				output: this.agentMessages.join('\n').trim(),
			};
			this.agentMessages.length = 0;

			if (this.turnCompletion) {
				this.turnCompletion.resolve(result);
				this.turnCompletion = null;
			} else {
				this.completedTurnResults.push(result);
			}
		}
	}
}

function assertOk(response: JsonRpcResponse, method: string): void {
	if (response.error) {
		throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
	}
}
