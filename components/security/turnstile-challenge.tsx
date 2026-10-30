"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
export function TurnstileChallenge({ action, onToken, resetKey = 0 }: {
  action: string; onToken: (token: string) => void; resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<{ required: boolean; ready: boolean; siteKey: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("Preparing security check…");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/security/challenge", { cache: "no-store", credentials: "same-origin" })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<{ required: boolean; ready: boolean; siteKey: string }>; })
      .then(value => { if (active) { setConfig(value); setMessage(""); } })
      .catch(() => { if (active) setMessage("Security check unavailable. Please retry."); });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    onToken("");
    if (!config?.ready) return;
    if (!config.required) { onToken("local-development"); return; }
    const api = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!loaded || !container.current || !api) return;
    const id = api.render(container.current, {
      sitekey: config.siteKey, action, theme: "auto",
      callback: (token: string) => { setMessage(""); onToken(token); },
      "expired-callback": () => { onToken(""); setMessage("Security check expired. Please retry."); },
      "error-callback": () => { onToken(""); setMessage("Security check failed. Please retry."); },
    });
    return () => { api.remove(id); };
  }, [config, loaded, action, onToken, resetKey, retry]);
  return <div className="space-y-2">
    {config?.required && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive" onReady={() => setLoaded(true)} onError={() => setMessage("Security check could not load. Please retry.")} />}
    <div ref={container} />
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {message && <button type="button" className="text-sm underline" onClick={() => { setConfig(null); onToken(""); setRetry(value => value + 1); }}>Retry security check</button>}
  </div>;
}
