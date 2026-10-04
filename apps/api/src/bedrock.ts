/**
 * Amazon Bedrock, through the Converse API, for the AI host assistant
 * (docs/64).
 *
 * Plain fetch with a Bedrock API key as a bearer token, so the API gains no
 * dependency for one POST. If the spike finds the key route unavailable in
 * the hackathon's account, this file is the one to swap for the SDK; nothing
 * else knows how the model is reached.
 *
 * The request asks for exactly one tool and forces it, so the answer arrives
 * as structured input rather than prose. Whatever comes back is still only
 * `raw` - parseAssist in core decides what of it exists.
 */

import type { AssistModel, AssistModelReply, AssistModelRequest } from './assist-service.ts';

export interface BedrockOptions {
  region: string;
  /** An inference profile or model id from the Bedrock console. */
  modelId: string;
  token: string;
  fetch?: typeof fetch;
  maxTokens?: number;
}

/** Room for two short sentences in two languages and a note per photo. */
const DEFAULT_MAX_TOKENS = 1024;

interface ConverseReply {
  output?: { message?: { content?: { toolUse?: { name?: string; input?: unknown } }[] } };
  usage?: { inputTokens?: number; outputTokens?: number };
}

export function bedrockModel(opts: BedrockOptions): AssistModel {
  const doFetch = opts.fetch ?? fetch;
  const url =
    `https://bedrock-runtime.${opts.region}.amazonaws.com/model/${encodeURIComponent(opts.modelId)}/converse`;

  return {
    id: opts.modelId,
    async run(req: AssistModelRequest, signal: AbortSignal): Promise<AssistModelReply> {
      const body = {
        system: [{ text: req.system }],
        messages: [{
          role: 'user',
          content: [
            { text: req.user },
            ...req.images.map((bytes) => ({
              image: { format: 'jpeg', source: { bytes: bytes.toString('base64') } },
            })),
          ],
        }],
        toolConfig: {
          tools: [{
            toolSpec: {
              name: req.toolName,
              description: 'Record your opinion of this proof for the host.',
              inputSchema: { json: req.toolSchema },
            },
          }],
          toolChoice: { tool: { name: req.toolName } },
        },
        // Same photos, same opinion: a host comparing two proofs should not
        // be comparing two moods.
        inferenceConfig: { maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, temperature: 0 },
      };

      const res = await doFetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${opts.token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      // The status only. An error body can quote the request back, header
      // and all, and this message is logged.
      // The status rides on the error so consult() can tell a refusal that
      // will repeat (a bad key, a bad request) from one worth retrying.
      if (!res.ok) {
        throw Object.assign(new Error(`bedrock converse: HTTP ${res.status}`), { status: res.status });
      }

      const data = (await res.json()) as ConverseReply;
      const use = data.output?.message?.content?.find((c) => c.toolUse?.name === req.toolName)?.toolUse;
      return {
        raw: use?.input ?? null,
        inputTokens: typeof data.usage?.inputTokens === 'number' ? data.usage.inputTokens : null,
        outputTokens: typeof data.usage?.outputTokens === 'number' ? data.usage.outputTokens : null,
      };
    },
  };
}
