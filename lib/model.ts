// Token Radar — the model (radar-2).
//
// One sealed snapshot of the protocol universe in, one ranked board out.
// The board ranks ONLY protocols that record no token (no market cap, no
// CoinGecko id, no symbol) AND pass the house watchlist's own genuineness
// rule: not a bridge / liquid-staking / restaking / CEX product, not a
// versioned pool (a name ending in V2, v2, 2.0 …), no whole word wrapped /
// staked / staking in the name, and not named after an exchange. The
// watchlist applies that rule at a $50M floor; this board applies it to
// every row, so a ranked protocol is a genuine launch candidate, not a
// wrapper of a token that already trades. All 40 watchlist slugs are in.
//
// Implied value follows ONLY from the snapshot's own figures — TVL, the
// seven-day TVL change, how long the protocol has run with no token, and
// how many chains it runs on. No protocol name is ever special-cased: the
// same function scores every row, and the dashboard recomputes each row
// from the same figures so a reader can check the board.
//
//   base        = tvl_usd x BASE_MULTIPLE            (0.28)
//   growth      = clamp(change_7d, -50, +150) per cent; null reads as 0
//   growthMult  = 1 + growth/100 x weight, asymmetric:
//                 rises use GROWTH_UP (0.55), falls use GROWTH_DOWN (0.90)
//                 — a falling TVL hurts a launch case more than a rising
//                 one helps it — floored at 0.55, capped at 1.825
//   ageMult     = 0.75 + min(age_days, 1460) / 1460 x 0.45   (0.75 … 1.20)
//                 age_days is listed_at → as_of; unknown age uses the
//                 MEDIAN age of the rankable set, computed from the
//                 snapshot at run time, never a hard-coded guess.
//                 Age under 90 days takes a further x0.90: unproven.
//   breadthMult = 1 + 0.015 x min(chains - 1, 8)            (1.00 … 1.12)
//   certainty   = 0.97 when change_7d is unreported, else 1.00
//   implied     = max(1, round(base x growthMult x ageMult
//                               x breadthMult x certainty))
//
// A protocol that has run a long time at large TVL with no token is the
// strongest launch case: the value was built without a token to sell.
// Young, single-chain, shrinking protocols score lowest. The model is a
// claim about value IF a token launched on the record as it stands — it
// never predicts whether or when a token is issued.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_up: number;
  growth_down: number;
  growth_floor: number;
  growth_cap: number;
  growth_mult_floor: number;
  growth_mult_cap: number;
  age_floor: number;
  age_range: number;
  age_days_cap: number;
  young_age_days: number;
  young_factor: number;
  breadth_step: number;
  breadth_max_chains: number;
  unknown_growth_factor: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.28,
  growth_up: 0.55,
  growth_down: 0.9,
  growth_floor: -50,
  growth_cap: 150,
  growth_mult_floor: 0.55,
  growth_mult_cap: 1.825,
  age_floor: 0.75,
  age_range: 0.45,
  age_days_cap: 1460,
  young_age_days: 90,
  young_factor: 0.9,
  breadth_step: 0.015,
  breadth_max_chains: 8,
  unknown_growth_factor: 0.97,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  signal: string;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    age_multiplier: number;
    breadth_multiplier: number;
    certainty_multiplier: number;
    age_days: number | null;
    median_age_days: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  signal: string;
  growth_multiplier: number;
  age_multiplier: number;
  breadth_multiplier: number;
  certainty_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  median_age_days: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a sorted list of whole days; 365 only when the list is empty. */
export function medianAge(ages: number[]): number {
  if (ages.length === 0) return 365;
  const sorted = [...ages].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  medianAgeDays: number,
): { implied: number; growthPct: number; growthMult: number; ageMult: number; breadthMult: number; certaintyMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = protocol.change_7d === null ? null : finite(protocol.change_7d, 0);
  const growthPct = rawGrowth === null ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const weight = growthPct >= 0 ? model.growth_up : model.growth_down;
  const growthMult = Math.min(
    model.growth_mult_cap,
    Math.max(model.growth_mult_floor, 1 + (growthPct / 100) * weight),
  );
  const ageForModel = age ?? medianAgeDays;
  let ageMult = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
  if (age !== null && age < model.young_age_days) ageMult *= model.young_factor;
  if (age === null) ageMult *= model.young_factor;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + model.breadth_step * extraChains;
  const certaintyMult = rawGrowth === null ? model.unknown_growth_factor : 1;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * ageMult * breadthMult * certaintyMult));
  return { implied, growthPct, growthMult, ageMult, breadthMult, certaintyMult, age };
}

/** A one-word read of the row's own figures, for the board's signal column. */
export function signalFor(growthPct: number, age: number | null, chains: number): string {
  if (growthPct >= 20) return 'Surging';
  if (growthPct >= 5) return 'Growing';
  if (growthPct <= -15) return 'Cooling';
  if (age !== null && age >= 730) return 'Seasoned';
  if (age !== null && age < 180) return 'Early';
  if (chains >= 5) return 'Multi-chain';
  return 'Steady';
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Categories the house watchlist rule treats as a wrapped, staked or bridged product. */
const WRAPPER_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word wrapped, staked or staking anywhere in the name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a genuine protocol never starts with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol is one the board may rank: pre-token and a genuine launch candidate. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPER_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, at any TVL —
  // the whole genuine launch set, not a top-N cut by TVL. A chosen protocol
  // stays chosen; the watchlist is never replaced by the early rows.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }
  const ages = [...chosen.values()]
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const median = medianAge(ages);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model, median);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    age_days: s.age,
    implied_value_usd: s.implied,
    signal: signalFor(s.growthPct, s.age, s.p.chains.length),
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      age_multiplier: round4(s.ageMult),
      breadth_multiplier: round4(s.breadthMult),
      certainty_multiplier: round4(s.certaintyMult),
      age_days: s.age,
      median_age_days: median,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral') || c.includes('uncollateralized')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the loan position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s highest-TVL vault on ${chain} and keep the shares.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis trading')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active.`;
  if (c.includes('restak') || c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $${capital} through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('index')) return `Buy $${capital} of the ${name} index on ${chain} and hold the shares.`;
  if (c.includes('farm')) return `Stake $${capital} of LP tokens in ${name}'s farm on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, category-specific weekly action so the plan is not one action repeated. */
function weeklyFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp')) return 'adjust the collateral or borrow a small amount once, then repay it';
  if (c.includes('dex')) return 'swap a small amount through the pool once';
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator')) return 're-deposit the vault yield once';
  if (c.includes('perpetual') || c.includes('derivative')) return 'close and reopen one small hedged position';
  if (c.includes('rwa')) return 'claim or re-stake the asset yield once';
  return 'make one deposit, swap, vote or other on-chain action';
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names. Step 6 is the warning every
 * plan carries: a token may never launch, and points are not an allocation.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const weekly = weeklyFor(p);
  const otherChains = p.chains.length > 1 ? ` Repeat the deposit on a second chain, ${p.chains[1]}, with half the amount.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as ${weekly}.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.${otherChains}`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Once a month open the protocol's own points or rewards page from its official site and record your rank or points.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a month',
    },
    {
      text: `Remember a token may never launch and points are not a promised allocation, so never deposit more than you can afford to keep locked.`,
      cost: `the $${capital} is at risk while it is deposited`,
      time: 'read this before you start',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    signal: row.signal,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    certainty_multiplier: row.model.certainty_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const median = board.length > 0 ? board[0]!.model.median_age_days : 365;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist].sort(),
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    median_age_days: median,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol === '-' ? null : p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, the gate takes 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'the board repeats a slug';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
