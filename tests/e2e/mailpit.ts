// The local stack's mail catcher (config.toml [inbucket], port 54324) exposes
// the Mailpit HTTP API. Magic links are extracted straight from the message.
const MAILPIT = "http://127.0.0.1:54324";

type MailpitMessage = { ID: string; To: { Address: string }[] };

export async function magicLinkFor(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/messages?limit=20`);
    const body = (await res.json()) as { messages: MailpitMessage[] };
    const msg = body.messages.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase())
    );
    if (msg) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`);
      const data = (await detail.json()) as { Text: string };
      const match = data.Text.match(/https?:\/\/[^\s)>\]]+verify[^\s)>\]]*/);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link arrived for ${email}`);
}
