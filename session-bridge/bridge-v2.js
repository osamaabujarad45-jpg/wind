import { randomUUID } from 'node:crypto';
export const inject = ['tools', 'sessionController'];
const allowed = new Set(['1e890b48-a3f7-4d1d-82fd-f34414b26f6c']);
export function apply(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'fastship_session_bridge',
    description: 'Read the Fastship lead session status or recent events, or queue a coordination message without interrupting its current work. Returns admission acknowledgment, not proof the message was read.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['state', 'events', 'queue'] }, sessionId: { type: 'string', description: 'Authorized Fastship lead session ID.', enum: ['1e890b48-a3f7-4d1d-82fd-f34414b26f6c'] }, text: { type: 'string', description: 'Required for queue; identify yourself as a helper agent.' } }, required: ['action', 'sessionId'], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    async execute(args, exec) {
      if (!allowed.has(args.sessionId)) throw new Error('Session not authorized');
      const service = ctx.sessionController;
      if (args.action === 'state') return service.state({ sessionId: 'session-' + args.sessionId }, exec.signal);
      if (args.action === 'events') return service.events({ address: { kind: 'session', sessionId: 'session-' + args.sessionId }, maxMessages: 6 }, exec.signal);
      if (args.action === 'queue' && typeof args.text === 'string' && args.text.trim() && args.text.length <= 12000) return service.prompt({ requestId: randomUUID(), sessionId: 'session-' + args.sessionId, mode: 'queue', content: [{ type: 'text', text: args.text }], clientTimeZone: 'Asia/Hebron' }, exec.signal);
      throw new Error('Invalid bridge request');
    }
  }));
}
