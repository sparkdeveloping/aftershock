// /app/host/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import "../firebaseConfig";

import { getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  orderBy,
  onSnapshot,
  where,
  getDocs,
  writeBatch,
} from "firebase/firestore";

export default function HostPage() {
  const router = useRouter();

  // —— Firebase singletons ——
  const app = useMemo(() => getApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);

  // —— Local identity ——
  const [firstName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("firstName")) || ""
  );

  // —— Auth (anon ok) ——
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch {}
      }
    });
    return () => unsub();
  }, [auth]);

  // —— Global state (who is host, status, game, phase, round) ——
  const [state, setState] = useState({
    status: "waitingHost",
    hostFirstName: null,
    game: null,
    phase: "rules",
    round: 1,
  });
  const stateRef = useMemo(() => doc(db, "meta", "state"), [db]);

  useEffect(() => {
    const unsub = onSnapshot(stateRef, async (snap) => {
      if (!snap.exists()) {
        await setDoc(stateRef, {
          status: "waitingHost",
          game: null,
          phase: "rules",
          round: 1,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        setState({
          status: "waitingHost",
          hostFirstName: null,
          game: null,
          phase: "rules",
          round: 1,
        });
      } else {
        const d = snap.data();
        setState({
          status: d.status ?? "waitingHost",
          hostFirstName: d.hostFirstName ?? null,
          game: d.game ?? null,
          phase: d.phase ?? "rules",
          round: d.round ?? 1,
        });
      }
    });
    return () => unsub();
  }, [stateRef]);

  const isHost =
    firstName &&
    state.hostFirstName &&
    firstName.toLowerCase() === String(state.hostFirstName).toLowerCase();

  // —— Players (alive/out) ——
  const [players, setPlayers] = useState([]);
  useEffect(() => {
    const qPlayers = query(collection(db, "players"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(qPlayers, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, alive: true, ...d.data() }));
      setPlayers(list.map((p) => ({ ...p, alive: p.alive !== false })));
    });
    return () => unsub();
  }, [db]);

  const alivePlayers = players.filter((p) => p.alive);
  const outPlayers = players.filter((p) => !p.alive);

  // —— Votes (live tally) ——
  const [voteRound, setVoteRound] = useState(1);
  const [votes, setVotes] = useState([]); // raw votes
  const [tally, setTally] = useState([]); // [{targetFirstName, count, display}]
  useEffect(() => {
    setVoteRound(state.round || 1);
  }, [state.round]);

  useEffect(() => {
    const qVotes = query(
      collection(db, "votes"), // top-level collection
      where("round", "==", voteRound),
      orderBy("at", "asc")
    );
    const unsub = onSnapshot(qVotes, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setVotes(list);
      const map = new Map();
      for (const v of list) {
        const key = (v.targetFirstName || "").toLowerCase();
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
      const grouped = Array.from(map.entries())
        .map(([k, count]) => ({
          targetFirstName: k,
          count,
          display:
            players.find((p) => p.firstName?.toLowerCase() === k)?.firstName || k,
        }))
        .sort((a, b) => b.count - a.count);
      setTally(grouped);
    });
    return () => unsub();
  }, [db, voteRound, players]);

  // —— Host actions ——
  async function setPhase(next) {
    if (!isHost) return;
    await updateDoc(stateRef, {
      phase: next,
      status: next === "inGame" ? "inGame" : "rules",
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function nextRound() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      round: (state.round || 1) + 1,
      phase: "night",
      status: "inGame",
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function startGame() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      status: "inGame",
      phase: "night",
      round: state.round || 1,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function backToRules() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      status: "rules",
      phase: "rules",
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function killPlayer(firstName) {
    if (!isHost) return;
    const target = players.find(
      (p) => p.firstName?.toLowerCase() === firstName.toLowerCase()
    );
    if (!target) return;
    const ref = doc(db, "players", target.id);
    await updateDoc(ref, { alive: false }).catch(() => {});
  }

  async function revivePlayer(firstName) {
    if (!isHost) return;
    const target = players.find(
      (p) => p.firstName?.toLowerCase() === firstName.toLowerCase()
    );
    if (!target) return;
    const ref = doc(db, "players", target.id);
    await updateDoc(ref, { alive: true }).catch(() => {});
  }

  async function eliminateTop() {
    if (!isHost || tally.length === 0) return;
    await killPlayer(tally[0].display);
  }

  async function clearVotesForRound() {
    if (!isHost) return;
    const qDel = query(collection(db, "votes"), where("round", "==", voteRound));
    const snap = await getDocs(qDel);
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit().catch(() => {});
  }

  // —— UI copy helpers ——
  const headerStatus =
    state.status === "waitingHost"
      ? "Waiting for admin to choose a host…"
      : state.status === "waitingStart"
      ? "Host selected — choose a game on your phone at /play."
      : state.status === "rules"
      ? `Showing rules for ${displayGameName(state.game)}`
      : state.status === "inGame"
      ? `In game — ${displayGameName(state.game)}`
      : "";

  const inJudas = state.game === "judas";

  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#0B1020] text-white">
      <StyleTokens />
      <AmbientBokeh />
      <GradientFog />

      <section className="relative z-10 min-h-dvh max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-wide uppercase">
            Host Control Room
          </div>
          <Link href="/" className="text-xs text-white/70 hover:text-white transition">
            ← Back to Splash
          </Link>
        </div>

        {/* Host guard */}
        {!isHost ? (
          <Guard state={state} />
        ) : (
          <>
            {/* Top status card */}
            <motion.div
              className="glass rounded-3xl p-6 border border-white/10"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em]">
                    Welcome, <span className="grad-text">{firstName}</span>
                  </h1>
                  <p className="mt-2 text-white/75 text-sm">{headerStatus}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <Chip>Total: {players.length}</Chip>
                    <Chip>Alive: {alivePlayers.length}</Chip>
                    <Chip>Out: {outPlayers.length}</Chip>
                    <Chip>Round: {state.round || 1}</Chip>
                    <Chip>Phase: {state.phase}</Chip>
                  </div>
                </div>

                {/* Contextual host controls */}
                <div className="flex flex-wrap gap-2">
                  {state.status !== "inGame" && state.game === "judas" && (
                    <PrimaryBtn onClick={startGame}>Start Judas</PrimaryBtn>
                  )}
                  {state.status === "rules" && (
                    <SecondaryBtn onClick={() => router.push("/play")}>
                      Change Game
                    </SecondaryBtn>
                  )}
                  {state.status === "inGame" && (
                    <>
                      <SecondaryBtn onClick={backToRules}>Show Rules</SecondaryBtn>
                      <PhaseSwitcher
                        current={state.phase}
                        onNight={() => setPhase("night")}
                        onDay={() => setPhase("day")}
                        onVote={() => setPhase("vote")}
                      />
                    </>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Main columns */}
            <div className="grid gap-6 mt-6 md:grid-cols-[2fr,1fr]">
              <motion.div
                className="glass rounded-3xl p-6 border border-white/10"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
              >
                {/* Left: Rules or Live */}
                {state.status !== "inGame" ? (
                  <RulesPanel game={state.game} />
                ) : inJudas ? (
                  <JudasPanel
                    phase={state.phase}
                    round={state.round || 1}
                    votes={votes}
                    tally={tally}
                    onEliminateTop={eliminateTop}
                    onClearVotes={clearVotesForRound}
                    onNextRound={nextRound}
                  />
                ) : (
                  <div>
                    <h3 className="text-xl font-semibold">Live Game</h3>
                    <p className="mt-2 text-sm text-white/75">Coming soon.</p>
                  </div>
                )}
              </motion.div>

              {/* Right: players list & kill/revive */}
              <motion.div
                className="glass rounded-3xl p-6 border border-white/10"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
              >
                <h3 className="text-lg font-semibold">Players ({players.length})</h3>
                {players.length === 0 ? (
                  <p className="mt-2 text-sm text-white/70">
                    Waiting for players to join on /play…
                  </p>
                ) : (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {players.map((p) => (
                      <li
                        key={p.id}
                        className={`rounded-xl border px-3 py-2 text-sm ${
                          p.alive
                            ? "bg-white/8 border-white/10"
                            : "bg-red-400/10 border-red-400/30"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{p.firstName}</div>
                            <div className="text-[11px] text-white/60">
                              {p.alive ? "Alive" : "Out"}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {p.alive ? (
                              <DangerBtn onClick={() => killPlayer(p.firstName)}>
                                Kill
                              </DangerBtn>
                            ) : (
                              <SecondaryBtn onClick={() => revivePlayer(p.firstName)}>
                                Revive
                              </SecondaryBtn>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

/* ——— Panels & widgets ——— */

function Guard({ state }) {
  return (
    <motion.div
      className="glass rounded-3xl p-6 border border-white/10"
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
    >
      <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] grad-text">
        You’re not the host
      </h1>
      <p className="mt-2 text-white/75 text-sm">
        Current host: <b>{state.hostFirstName || "— none —"}</b>
      </p>
      <p className="mt-2 text-white/70 text-sm">
        Ask an admin on <code>/admin</code> to set you as host. Meanwhile you can join on{" "}
        <Link href="/play" className="underline">/play</Link>.
      </p>
    </motion.div>
  );
}

function RulesPanel({ game }) {
  if (!game) {
    return (
      <div>
        <h3 className="text-xl font-semibold">Choose a game</h3>
        <p className="mt-2 text-sm text-white/75">
          On your phone, open <b>/play</b> and pick a game. Players will see rules here.
        </p>
      </div>
    );
  }
  if (game !== "judas") {
    return (
      <div>
        <h3 className="text-xl font-semibold">Rules</h3>
        <p className="mt-2 text-sm text-white/75">Rules for this game are coming soon.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="text-2xl">🕊️</div>
      <h3 className="text-xl font-semibold mt-1">Judas (Biblical Mafia) — How to Play</h3>
      <ul className="mt-3 text-sm text-white/80 space-y-2 list-disc list-inside">
        <li>Roles are dealt secretly to phones (Judas, Angel, Peter, Mary, Luke, Disciples).</li>
        <li>Night: Judas chooses; Angel may protect; seers discern.</li>
        <li>Day: reveal event, discuss kindly, then vote to accuse or spare.</li>
        <li>Resolution: eliminate or spare; repeat rounds until win condition.</li>
        <li>Win: all Judas eliminated — or Judas count ≥ villagers.</li>
      </ul>
      <p className="mt-3 text-xs text-white/60">
        Accessibility: role = color + icon + pattern (never color-only).
      </p>
    </div>
  );
}

function Chip({ children }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] border border-white/10 bg-white/8">
      {children}
    </span>
  );
}

function PhaseSwitcher({ current, onNight, onDay, onVote }) {
  return (
    <div className="inline-flex items-center gap-2">
      <SmallBtn onClick={onNight} active={current === "night"}>
        Night
      </SmallBtn>
      <SmallBtn onClick={onDay} active={current === "day"}>
        Day
      </SmallBtn>
      <SmallBtn onClick={onVote} active={current === "vote"}>
        Vote
      </SmallBtn>
    </div>
  );
}

function JudasPanel({ phase, round, votes, tally, onEliminateTop, onClearVotes, onNextRound }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold">Judas — {capitalize(phase)} · Round {round}</h3>
        {phase === "vote" && (
          <div className="flex items-center gap-2">
            <SecondaryBtn onClick={onClearVotes}>Clear Votes</SecondaryBtn>
            <PrimaryBtn onClick={onEliminateTop}>Eliminate Top</PrimaryBtn>
          </div>
        )}
      </div>

      {phase === "night" && (
        <p className="mt-2 text-sm text-white/75">
          Night: Judas selects a target (players vote Judas privately). Angel may protect. Seers discern.
        </p>
      )}
      {phase === "day" && (
        <p className="mt-2 text-sm text-white/75">
          Day: Reveal last night’s event, discuss kindly, prepare to vote.
        </p>
      )}
      {phase === "vote" && (
        <>
          <p className="mt-2 text-sm text-white/75">
            Vote: players select who they believe is Judas (or other roles). Tallies update live.
          </p>
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <VoteTallyCard tally={tally} />
            <VoteFeed votes={votes} />
          </div>
          <div className="mt-5 text-xs text-white/60">
            Tip: use “Eliminate Top” to remove the current frontrunner, or use Kill on the right list.
          </div>
        </>
      )}

      {phase !== "vote" && (
        <div className="mt-5">
          <SecondaryBtn onClick={onNextRound}>Advance to Next Round (start Night)</SecondaryBtn>
        </div>
      )}
    </div>
  );
}

function VoteTallyCard({ tally }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
      <h4 className="font-semibold">Tally</h4>
      {tally.length === 0 ? (
        <p className="mt-2 text-sm text-white/70">No votes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {tally.map((t, i) => (
            <li
              key={t.targetFirstName}
              className={`flex items-center justify-between rounded-xl px-3 py-2 border ${
                i === 0 ? "bg-white/15 border-white/30" : "bg-white/8 border-white/12"
              }`}
            >
              <span className="font-semibold">{t.display}</span>
              <span className="text-sm">{t.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VoteFeed({ votes }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
      <h4 className="font-semibold">Vote Feed</h4>
      {votes.length === 0 ? (
        <p className="mt-2 text-sm text-white/70">No votes yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 max-h-60 overflow-auto pr-2">
          {votes.map((v) => (
            <li key={v.id} className="rounded-xl px-3 py-2 bg-white/6 border border-white/10">
              <div className="text-sm">
                <b>{ellipsis(v.voterUid, 6)}</b> → <b>{v.targetFirstName}</b>
                {v.roleGuess ? <span className="text-white/70"> as {v.roleGuess}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ——— UI atoms ——— */

function PrimaryBtn({ onClick, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow"
      style={{ boxShadow: "0 0 20px rgba(59,160,242,.25)" }}
    >
      {children}
    </motion.button>
  );
}

function SecondaryBtn({ onClick, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="rounded-xl px-4 py-2 text-sm font-semibold bg-white/6 border border-white/15 hover:shadow"
    >
      {children}
    </motion.button>
  );
}

function SmallBtn({ onClick, children, active }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={`rounded-xl px-3 py-2 text-sm font-semibold border ${
        active ? "bg-white/15 border-white/30" : "bg-white/8 border-white/15"
      }`}
    >
      {children}
    </motion.button>
  );
}

function DangerBtn({ onClick, children }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-sm font-semibold border"
      style={{
        background: "rgba(239, 68, 68, 0.15)",
        borderColor: "rgba(239, 68, 68, 0.35)",
        boxShadow: "0 0 20px rgba(239,68,68,.2)",
      }}
    >
      {children}
    </motion.button>
  );
}

/* ——— utils ——— */
function displayGameName(key) {
  if (key === "judas") return "Judas (Biblical Mafia)";
  if (key === "trivia") return "Trivia";
  if (key === "empire") return "Empire";
  return key || "—";
}
function capitalize(s) {
  return (s || "").slice(0, 1).toUpperCase() + (s || "").slice(1);
}
function ellipsis(str = "", n = 6) {
  return String(str).length > n ? `${String(str).slice(0, n)}…` : str;
}

/* ——— Aesthetic helpers ——— */
function StyleTokens() {
  return (
    <style>{`
      :root{
        --ink-900:#0B1020; --ink-800:#131A2A; --ink-100:#EAF0FF;
        --orange-500:#FF7A18; --orange-400:#FF9E3D; --orange-300:#FFB65E;
        --blue-400:#3BA0F2; --blue-600:#1F6FEB; --blue-700:#0E4CC5;
        --grad-primary: linear-gradient(135deg, #FF7A18 0%, #FFB65E 35%, #3BA0F2 70%, #1F6FEB 100%);
      }
      .glass {
        background: rgba(255,255,255,.08);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 20px 60px rgba(16,35,80,.25), inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter: blur(18px);
      }
      .ring-glow { box-shadow: 0 0 40px rgba(59,160,242,.35), 0 0 40px rgba(255,122,24,.25) inset; }
      .grad-text {
        background: var(--grad-primary);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
    `}</style>
  );
}

function AmbientBokeh() {
  const [dots] = useState(() =>
    Array.from({ length: 16 }).map((_, i) => ({
      id: i,
      size: 110 + (i % 5) * 26,
      x: (i * 53) % 100,
      y: (i * 29) % 100,
      delay: (i % 7) * 0.35,
      duration: 10 + (i % 6) * 2.5,
    }))
  );

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 0% 0%, rgba(31,111,235,.15), transparent 55%), radial-gradient(120% 100% at 100% 100%, rgba(255,122,24,.18), transparent 55%), linear-gradient(180deg, #0B1020 0%, #0B1020 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%23100% height=%23100%><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%222%22 stitchTiles=%22stitch%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22/></svg>')",
        }}
      />
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full blur-3xl"
          style={{
            width: d.size,
            height: d.size,
            left: `${d.x}%`,
            top: `${d.y}%`,
            background:
              d.id % 2 === 0
                ? "radial-gradient(circle at 30% 30%, rgba(59,160,242,.55), rgba(59,160,242,0))"
                : "radial-gradient(circle at 70% 70%, rgba(255,122,24,.55), rgba(255,122,24,0))",
          }}
          initial={{ y: 0, opacity: 0.6 }}
          animate={{ y: [0, -16, 0], opacity: [0.6, 0.85, 0.6] }}
          transition={{ repeat: Infinity, duration: d.duration, delay: d.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function GradientFog() {
  return (
    <div className="absolute inset-0 -z-10 pointer-events-none">
      <div
        className="absolute -top-24 -left-24 w-[520px] h-[520px] rounded-full opacity-40 blur-[120px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, #1F6FEB 0%, rgba(31,111,235,0) 70%)",
        }}
      />
      <div
        className="absolute -bottom-24 -right-24 w-[520px] h-[520px] rounded-full opacity-40 blur-[120px]"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, #FF7A18 0%, rgba(255,122,24,0) 70%)",
        }}
      />
    </div>
  );
}
