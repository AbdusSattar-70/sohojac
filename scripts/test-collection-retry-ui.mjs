import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";

const source = await readFile(
  new URL("../components/staff/collections-register.tsx", import.meta.url),
  "utf8",
);
const jsx = source.indexOf("  return <div");
assert(jsx > 0, "The production hook logic must precede the JSX view");
// Execute the production state, effects and request handlers. Only the JSX view
// is replaced with an inspection surface; no payment lifecycle is reimplemented.
const executable = stripTypeScriptTypes(
  source.slice(0, jsx) +
    "  return {collect,refresh,pending,unconfirmed,busy,message,actorId,invoiceId,amount,method,reference,reason,setInvoiceId,setAmount,setMethod,setReference,setReason};\n}",
  { mode: "strip" },
)
  .replace(/^import[^\n]*\n/gm, "")
  .replace(/\bexport (?=(?:async )?function|const)/g, "");

const actorA = "55555555-5555-4555-8555-555555555555";
const actorB = "66666666-6666-4666-8666-666666666666";
const invoiceId = "33333333-3333-4333-8333-333333333333";
const storageKey = (actor) => "sohojac:pending-payment:" + actor;
const event = () => ({ preventDefault() {} });
const sameDependencies = (a, b) =>
  !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
const posted = (receiptNo = "SA-RCPT-RECOVERED") =>
  Response.json({ ok: true, state: "POSTED", receiptNo });
const unconfirmed = () => Response.json({ state: "UNCONFIRMED" });

function mount({ storage = new Map(), actor = actorA, lookup, post } = {}) {
  const state = [], refs = [], effects = [], callbacks = [], memos = [];
  const requests = [];
  let stateIndex, refIndex, effectIndex, callbackIndex, memoIndex;
  let dirty = true, ui, generated = 0;
  const scheduled = [];
  const bindings = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => {
        const value = typeof next === "function" ? next(state[index]) : next;
        if (!Object.is(value, state[index])) { state[index] = value; dirty = true; }
      }];
    },
    useRef(initial) {
      const index = refIndex++;
      return refs[index] ?? (refs[index] = { current: initial });
    },
    useEffect(effect, dependencies) {
      const index = effectIndex++;
      if (!sameDependencies(effects[index], dependencies)) {
        effects[index] = dependencies;
        scheduled.push(effect);
      }
    },
    useCallback(callback, dependencies) {
      const index = callbackIndex++;
      if (!sameDependencies(callbacks[index]?.dependencies, dependencies))
        callbacks[index] = { callback, dependencies };
      return callbacks[index].callback;
    },
    useMemo(callback, dependencies) {
      const index = memoIndex++;
      if (!sameDependencies(memos[index]?.dependencies, dependencies))
        memos[index] = { value: callback(), dependencies };
      return memos[index].value;
    },
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    crypto: { randomUUID() { generated++; return crypto.randomUUID(); } },
    async fetch(url, options = {}) {
      const request = {
        method: options.method ?? "GET", url,
        body: options.body ? JSON.parse(options.body) : undefined,
      };
      requests.push(request);
      if (request.method === "POST") return post(request.body, request);
      if (url.includes("?requestId=")) return lookup(new URL(url, "https://erp.invalid").searchParams.get("requestId"), request);
      return Response.json({ actorId: actor, canPost: true, receipts: [], invoices: [{
        id: invoiceId, invoice_no: "INV-UI", student_name: "Synthetic Student",
        amount_paisa: 100000, paid_paisa: 0, status: "ISSUED",
      }] });
    },
  };
  const CollectionsRegister = new Function(
    ...Object.keys(bindings), executable + "\nreturn CollectionsRegister;",
  )(...Object.values(bindings));
  function render() {
    stateIndex = refIndex = effectIndex = callbackIndex = memoIndex = 0;
    dirty = false;
    ui = CollectionsRegister();
  }
  async function flush() {
    for (let i = 0; i < 20; i++) {
      if (dirty || !ui) render();
      for (const effect of scheduled.splice(0)) effect();
      await new Promise(setImmediate);
      if (!dirty && scheduled.length === 0) return ui;
    }
    throw Error("Production hooks did not settle");
  }
  async function fill(patch = {}) {
    await flush();
    const values = { invoiceId, amount: "10.99", method: "CASH", reference: "Original reference", reason: "Payment received and verified", ...patch };
    ui.setInvoiceId(values.invoiceId); ui.setAmount(values.amount); ui.setMethod(values.method);
    ui.setReference(values.reference); ui.setReason(values.reason);
    return flush();
  }
  return {
    flush, fill, storage, requests,
    get ui() { return ui; }, get generated() { return generated; },
    async submit() { await flush(); await ui.collect(event()); return flush(); },
    async switchActor(next) { actor = next; await ui.refresh(); return flush(); },
  };
}

test("a lost committed reply is recovered by result lookup before another payment can be posted", async () => {
  let committed = false;
  const harness = mount({
    lookup: async () => committed ? posted() : unconfirmed(),
    post: async () => { committed = true; throw Error("Transport lost after commit"); },
  });
  await harness.fill();
  const ui = await harness.submit();
  const operations = harness.requests.filter(({ url, method }) => method === "POST" || url.includes("?"));
  assert.deepEqual(operations.map(({ method }) => method), ["GET", "POST", "GET"]);
  const payment = operations[1].body;
  assert.equal(new URL(operations[0].url, "https://erp.invalid").searchParams.get("requestId"), payment.requestId);
  assert.equal(new URL(operations[2].url, "https://erp.invalid").searchParams.get("requestId"), payment.requestId);
  assert.equal(ui.unconfirmed, false);
  assert.equal(harness.storage.has(storageKey(actorA)), false);
  assert.match(ui.message, /Payment confirmed.*SA-RCPT-RECOVERED/);
  assert.equal(harness.generated, 1);
});

test("ambiguous retries preserve the exact payload and key despite stale input events; confirmation permits a new key", async () => {
  const posts = [];
  const harness = mount({
    lookup: async () => unconfirmed(),
    post: async (body) => {
      posts.push(body);
      if (posts.length === 1) throw Error("Network unavailable");
      if (posts.length === 2) return Response.json({ error: "Outcome unconfirmed" }, { status: 503 });
      return posted();
    },
  });
  await harness.fill();
  await harness.submit();
  assert.equal(harness.ui.unconfirmed, true);
  assert.deepEqual(JSON.parse(harness.storage.get(storageKey(actorA))), posts[0]);
  await harness.fill({ amount: "99.99", method: "BANK", reference: "Stale edit", reason: "Different reason from a stale event" });
  await harness.submit();
  assert.equal(harness.ui.unconfirmed, true);
  // Recovery uses the persisted intent even if a stale browser event carries
  // invalid current input; validation must not prevent finding its receipt.
  await harness.fill({ amount: "invalid", reason: "" });
  await harness.submit();
  assert.equal(harness.ui.unconfirmed, false);
  assert.deepEqual(posts[1], posts[0]);
  assert.deepEqual(posts[2], posts[0]);
  assert.equal(posts[0].amountPaisa, 1099);
  assert.equal(harness.generated, 1);
  for (const request of harness.requests.filter(({ method }) => method === "POST")) {
    const index = harness.requests.indexOf(request);
    assert.equal(harness.requests[index - 1].method, "GET");
    assert(harness.requests[index - 1].url.includes(encodeURIComponent(request.body.requestId)));
  }
  await harness.fill({ amount: "1.00" });
  await harness.submit();
  assert.notEqual(posts[3].requestId, posts[0].requestId);
  assert.equal(harness.generated, 2);
  assert(source.includes("disabled={busy||unconfirmed}"));
});

test("session storage restores the same actor's pending payment after reload and a recovered receipt avoids POST", async () => {
  const storage = new Map();
  const first = mount({ storage, lookup: async () => unconfirmed(), post: async () => { throw Error("Reply lost"); } });
  await first.fill({ method: "MFS" });
  await first.submit();
  const pending = JSON.parse(storage.get(storageKey(actorA)));
  const reloaded = mount({ storage, lookup: async () => posted("SA-RCPT-RELOADED"), post: async () => assert.fail("Recovered payments must not POST again") });
  let ui = await reloaded.flush();
  assert.equal(ui.unconfirmed, true);
  assert.equal(ui.invoiceId, pending.invoiceId);
  assert.equal(ui.amount, "10.99"); assert.equal(ui.method, "MFS");
  assert.deepEqual(ui.pending.current, pending);
  assert.equal(reloaded.generated, 0);
  ui = await reloaded.submit();
  assert.equal(ui.unconfirmed, false);
  assert.match(ui.message, /SA-RCPT-RELOADED/);
  assert.equal(reloaded.requests.filter(({ method }) => method === "POST").length, 0);
  assert.equal(storage.has(storageKey(actorA)), false);
});

test("pending session payments are restored independently for each authenticated actor", async () => {
  const storage = new Map();
  const a = mount({ storage, lookup: async () => unconfirmed(), post: async () => { throw Error("Offline"); } });
  await a.fill(); await a.submit();
  const pendingA = JSON.parse(storage.get(storageKey(actorA)));
  const b = mount({ storage, actor: actorB, lookup: async () => unconfirmed(), post: async () => { throw Error("Offline"); } });
  assert.equal((await b.flush()).unconfirmed, false);
  await b.fill({ amount: "2.00", reason: "Payment received by another cashier" }); await b.submit();
  const pendingB = JSON.parse(storage.get(storageKey(actorB)));
  assert.notEqual(pendingA.requestId, pendingB.requestId);
  assert.deepEqual((await b.switchActor(actorA)).pending.current, pendingA);
  assert.deepEqual((await b.switchActor(actorB)).pending.current, pendingB);
  assert.deepEqual(JSON.parse(storage.get(storageKey(actorA))), pendingA);
});

test("an unconfirmed payment blocks another submit while its POST is in flight", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const harness = mount({ lookup: async () => unconfirmed(), post: async () => gate });
  await harness.fill();
  const first = harness.ui.collect(event());
  await harness.flush();
  assert.equal(harness.ui.busy, true);
  await harness.ui.collect(event());
  assert.equal(harness.requests.filter(({ method }) => method === "POST").length, 1);
  release(posted()); await first; await harness.flush();
  assert.equal(harness.ui.busy, false);
  assert.equal(harness.generated, 1);
});

test("an explicit unposted BALANCE rejection allows cashier correction without automatically posting another payment", async () => {
  const posts = [];
  const harness = mount({
    lookup: async () => unconfirmed(),
    post: async (body) => {
      posts.push(body);
      if (posts.length === 1) return Response.json({
        code: "BALANCE", error: "Invoice balance changed; no payment was posted",
      }, { status: 409 });
      return posted("SA-RCPT-CORRECTED");
    },
  });
  await harness.fill();
  let ui = await harness.submit();
  assert.equal(ui.unconfirmed, false);
  assert.equal(ui.pending.current, null);
  assert.equal(harness.storage.has(storageKey(actorA)), false);
  assert.match(ui.message, /no payment was posted/);
  assert.equal(posts.length, 1);
  assert.equal(harness.generated, 1);
  await harness.fill({ amount: "1.00" });
  ui = await harness.submit();
  assert.equal(posts.length, 2);
  assert.notEqual(posts[1].requestId, posts[0].requestId);
  assert.equal(posts[1].amountPaisa, 100);
  assert.match(ui.message, /SA-RCPT-CORRECTED/);
});

test("unavailable receipt lookup preserves the pending request and blocks POST until recovery is available", async () => {
  let unavailable = true;
  const posts = [];
  const harness = mount({
    lookup: async () => unavailable
      ? Response.json({ error: "Payment outcome unavailable" }, { status: 503 })
      : unconfirmed(),
    post: async (body) => { posts.push(body); return posted(); },
  });
  await harness.fill();
  let ui = await harness.submit();
  assert.equal(posts.length, 0);
  assert.equal(ui.unconfirmed, true);
  const pending = JSON.parse(harness.storage.get(storageKey(actorA)));
  assert.equal(pending.requestId, ui.pending.current.requestId);
  assert.equal(harness.generated, 1);
  unavailable = false;
  ui = await harness.submit();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0], pending);
  assert.equal(harness.generated, 1);
  assert.equal(ui.unconfirmed, false);
});

test("invalid stale form inputs cannot block recovery of an already snapshotted payment", async () => {
  let committed = false;
  const posts = [];
  const harness = mount({
    lookup: async () => committed ? posted("SA-RCPT-STALE-FORM") : unconfirmed(),
    post: async (body) => { posts.push(body); throw Error("Reply unavailable"); },
  });
  await harness.fill();
  await harness.submit();
  const pending = JSON.parse(harness.storage.get(storageKey(actorA)));
  assert.equal(harness.ui.unconfirmed, true);
  await harness.fill({ invoiceId: "", amount: "not money", reason: "" });
  committed = true;
  const ui = await harness.submit();
  const lookup = harness.requests.filter(({ url }) => url.includes("?requestId=")).at(-1);
  assert.equal(new URL(lookup.url, "https://erp.invalid").searchParams.get("requestId"), pending.requestId);
  assert.equal(posts.length, 1);
  assert.equal(harness.generated, 1);
  assert.equal(ui.unconfirmed, false);
  assert.equal(harness.storage.has(storageKey(actorA)), false);
  assert.match(ui.message, /SA-RCPT-STALE-FORM/);
});
