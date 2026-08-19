// Returns a safe same-origin, path-relative redirect target, or "/" if the
// input is absolute, protocol-relative, or otherwise tries to leave the origin.
// Note: the WHATWG URL parser treats backslashes as slashes in the authority,
// so "/\evil.com" must be rejected even though it starts with a single slash.
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  // reject anything that does not start with a single slash before resolution
  if (!raw.startsWith("/")) return "/";
  // resolve against a fixed dummy origin and require the result stays on it
  const base = "http://localhost";
  let target: URL;
  try {
    target = new URL(raw, base);
  } catch {
    return "/";
  }
  if (target.origin !== base) return "/";
  const path = target.pathname + target.search + target.hash;
  // defense in depth: only allow a clean leading single slash
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return "/";
  }
  return path;
}

// Reduces the confirm page's `next` (the raw RedirectTo, usually a full URL)
// to a safe app path. A callback-shaped target is unwrapped to its inner
// `next`: sign-in sends /auth/callback?next=X so the default (PKCE) email
// template keeps working, but after a token_hash confirm the code exchange
// never happens, so the user should land on X directly.
export function confirmNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  let path = raw;
  try {
    const url = new URL(raw);
    path = url.pathname + url.search;
  } catch {
    // not a full URL: treat as a path
  }
  const safe = safeNext(path);
  if (safe.startsWith("/auth/callback")) {
    const inner = new URL(safe, "http://localhost").searchParams.get("next");
    return safeNext(inner);
  }
  return safe;
}
