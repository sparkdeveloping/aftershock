// /app/play/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import "../firebaseConfig";

import { getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  addDoc,
  setDoc,
  updateDoc,
  getDocs,
  getDoc,
  serverTimestamp,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
} from "firebase/firestore";

export default function PlayPage() {
  const router = useRouter();

  // —— Firebase singletons ——
  const app = useMemo(() => getApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);

  // —— Local session ——
  const [firstName, setFirstName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("firstName")) || ""
  );
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // —— Global state ——
  const [state, setState] = useState({
    status: "waitingHost",
    hostFirstName: null,
    game: null,
    phase: "rules",
    round: 1,
    dayEndsAt: null,   // Timestamp from host for discussion timer (optional)
    eliminated: null,  // firstName eliminated (reveal)
  });

  // —— Players & me ——
  const [players, setPlayers] = useState([]);
  const [meDoc, setMeDoc] = useState(null); // full doc (incl role, alive, id)
  const me = meDoc; // alias
  const isAlive = me?.alive !== false;

  // —— Derived ——
  const isHostNameMatch =
    firstName && state.hostFirstName &&
    firstName.toLowerCase() === String(state.hostFirstName).toLowerCase();

  // host does NOT play
  const hostNameLower = (state.hostFirstName || "").toLowerCase();
  const alivePlayers = players.filter(
    (p) => p.alive && p.firstName?.toLowerCase() !== hostNameLower
  );
  const nonSelfAliveTargets = alivePlayers.filter(
    (p) => p.firstName?.toLowerCase() !== (firstName || "").toLowerCase()
  );

  // —— Auth & joined rehydrate ——
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch {}
      } else if (firstName) {
        const q = query(
          collection(db, "players"),
          where("uid", "==", user.uid),
          where("firstName", "==", firstName)
        );
        const snap = await getDocs(q);
        setJoined(!snap.empty);
        if (!snap.empty) setMeDoc({ id: snap.docs[0].id, ...snap.docs[0].data() });
      }
    });
    return () => unsub();
  }, [auth, db, firstName]);

  // —— State sub —— 
  useEffect(() => {
    const ref = doc(db, "meta", "state");
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        await setDoc(ref, {
          status: "waitingHost",
          game: null,
          phase: "rules",
          round: 1,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        setState((s) => ({ ...s, status: "waitingHost", hostFirstName: null, game: null, phase: "rules", round: 1 }));
      } else {
        const d = snap.data();
        setState({
          status: d.status ?? "waitingHost",
          hostFirstName: d.hostFirstName ?? null,
          game: d.game ?? null,
          phase: d.phase ?? "rules",
          round: d.round ?? 1,
          dayEndsAt: d.dayEndsAt ?? null,
          eliminated: d.eliminated ?? null,
        });
      }
    });
    return () => unsub();
  }, [db]);

  // —— Players sub (also re-pull me for role changes) ——
  useEffect(() => {
    const qPlayers = query(collection(db, "players"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(qPlayers, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, alive: true, ...d.data() }));
      const finalList = list.map((p) => ({ ...p, alive: p.alive !== false }));
      setPlayers(finalList);

      if (auth.currentUser && firstName) {
        const mine = finalList.find(
          (p) => p.uid === auth.currentUser.uid && p.firstName?.toLowerCase() === firstName.toLowerCase()
        );
        if (mine) setMeDoc(mine);
      }
    });
    return () => unsub();
  }, [db, auth, firstName]);

  // —— Join handler ——
  async function handleJoin(e) {
    e.preventDefault();
    setError("");
    const name = firstName.trim();
    if (!name) return setError("First name is required.");
    if (name.length > 24) return setError("Keep it under 24 characters.");
    try {
      setBusy(true);
      const user = auth.currentUser ?? (await signInAnonymously(auth)).user;

      const ref = await addDoc(collection(db, "players"), {
        firstName: name,
        uid: user.uid,
        joinedAt: serverTimestamp(),
        status: "idle",
        alive: true,
        role: null, // host will assign before starting
      });

      if (typeof window !== "undefined") localStorage.setItem("firstName", name);
      setJoined(true);
      setMeDoc({ id: ref.id, firstName: name, uid: user.uid, alive: true, role: null });
    } catch (err) {
      console.error(err);
      if (String(err.code).includes("auth/admin-restricted-operation")) {
        setError("Enable Anonymous sign-in in Firebase Auth → Sign-in method.");
      } else if (String(err.code).includes("permission-denied")) {
        setError("Update Firestore rules to allow authenticated users to write /players.");
      } else {
        setError("Could not join. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  // —— Host chooses game on /play (same as before) ——
  const isHost = isHostNameMatch;
  async function chooseGame(game) {
    if (!isHost) return;
    try {
      const ref = doc(db, "meta", "state");
      await updateDoc(ref, {
        game,
        status: "rules",
        phase: "rules",
        updatedAt: serverTimestamp(),
      });
      setTimeout(() => router.push("/host"), 300);
    } catch (e) {
      console.error(e);
      setError("Couldn’t set game. Check /meta/state write rules.");
    }
  }

  // —— Day vote (same collection `votes`) ——
  const [voteBusy, setVoteBusy] = useState(false);
  const [voteMsg, setVoteMsg] = useState("");
  const [voteTarget, setVoteTarget] = useState("");
  const [roleGuess, setRoleGuess] = useState("");

  async function submitDayVote() {
    if (!auth.currentUser) return;
    if (!me || !isAlive) {
      setVoteMsg("You are out — cannot vote.");
      return;
    }
    if (!voteTarget) {
      setVoteMsg("Pick a player to vote for.");
      return;
    }
    try {
      setVoteBusy(true);
      const voterUid = auth.currentUser.uid;
      const round = state.round || 1;

      const voteId = `${round}_${voterUid}`;
      await setDoc(
        doc(db, "votes", voteId),
        {
          round,
          voterUid,
          targetFirstName: voteTarget,
          roleGuess: roleGuess || null,
          at: serverTimestamp(),
        },
        { merge: true }
      );

      setVoteMsg("Vote submitted ✅");
      setTimeout(() => setVoteMsg(""), 1400);
    } catch (e) {
      console.error(e);
      setVoteMsg("Vote failed. Try again.");
    } finally {
      setVoteBusy(false);
    }
  }

  // —— Night actions —— 
  const [nightTarget, setNightTarget] = useState("");
  const [protectTarget, setProtectTarget] = useState("");
  const [nightMsg, setNightMsg] = useState("");
  const round = state.round || 1;

  async function submitJudasVote() {
    if (!auth.currentUser || !me || !isAlive) return;
    if (!nightTarget) {
      setNightMsg("Pick someone to target.");
      return;
    }
    try {
      const id = `${round}_${auth.currentUser.uid}`;
      await setDoc(
        doc(db, "nightVotes", id),
        {
          round,
          voterUid: auth.currentUser.uid,
          targetFirstName: nightTarget,
          role: "judas",
          at: serverTimestamp(),
        },
        { merge: true }
      );
      setNightMsg("Target locked. Waiting for other Judas players…");
    } catch (e) {
      console.error(e);
      setNightMsg("Couldn’t submit target. Try again.");
    }
  }

  async function submitAngelProtect() {
    if (!auth.currentUser || !me || !isAlive) return;
    if (!protectTarget) {
      setNightMsg("Pick someone to protect.");
      return;
    }
    try {
      const id = `${round}_${auth.currentUser.uid}`;
      await setDoc(
        doc(db, "protects", id),
        {
          round,
          protectorUid: auth.currentUser.uid,
          targetFirstName: protectTarget,
          role: "angel",
          at: serverTimestamp(),
        },
        { merge: true }
      );
      setNightMsg("Protection set for tonight.");
    } catch (e) {
      console.error(e);
      setNightMsg("Couldn’t set protection. Try again.");
    }
  }

  // —— 2-minute discussion timer (host can set dayEndsAt; fallback local 120s) ——
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    let interval;
    if (state.phase === "day_discuss") {
      const targetMs = state.dayEndsAt?.toMillis ? state.dayEndsAt.toMillis() : Date.now() + 120000;
      const tick = () => {
        const ms = Math.max(0, targetMs - Date.now());
        setRemaining(ms);
      };
      tick();
      interval = setInterval(tick, 250);
    } else {
      setRemaining(0);
    }
    return () => interval && clearInterval(interval);
  }, [state.phase, state.dayEndsAt]);

  const timerText = msToClock(remaining);

  // —— UI helpers ——
  const lines = useMemo(
    () => ["Quick Join — first name only", "Admin picks a host", "Be kind · have fun · play fair"],
    []
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % lines.length), 2400);
    return () => clearInterval(id);
  }, [lines.length]);

  const isInRules = state.status === "rules" && state.game;
  const isInGame = state.status === "inGame" && state.game;
  const showOutOverlay = joined && me && !isAlive;

  const role = me?.role || null;
  const isJudas = role === "judas";
  const isAngel = role === "angel";

  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#0B1020] text-white">
      <StyleTokens />
      <AmbientBokeh />
      <GradientFog />

      <section className="relative z-10 min-h-dvh flex items-center justify-center px-4 py-8">
        <motion.div
          className="glass ring-glow rounded-3xl w-full max-w-5xl p-6 sm:p-10"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-wide uppercase">
              Play
            </div>
            <Link href="/" className="text-xs text-white/70 hover:text-white transition">
              ← Back
            </Link>
          </div>

          {/* 1) Not joined yet */}
          {!joined ? (
            <>
              <h1 className="text-4xl md:text-5xl font-semibold tracking-[-0.02em] grad-text">
                Play — Enter First Name
              </h1>
              <div className="mt-3 h-[28px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={idx}
                    className="text-sm md:text-base text-white/75"
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -10, opacity: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {lines[idx]}
                  </motion.p>
                </AnimatePresence>
              </div>

              <form onSubmit={handleJoin} className="mt-8 space-y-4 max-w-xl">
                <label className="block">
                  <span className="text-sm text-white/80">First name</span>
                  <div className="mt-2 relative">
                    <input
                      type="text"
                      inputMode="text"
                      autoComplete="given-name"
                      placeholder="e.g., Denzel"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-2xl bg-white/10 border border-white/15 focus:outline-none focus:ring-2 focus:ring-[#7CD4FD] px-4 py-3 placeholder:text-white/40"
                    />
                    <span
                      className="pointer-events-none absolute inset-y-0 right-3 my-auto h-7 w-7 rounded-full"
                      style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(255,122,24,.35), transparent 60%)" }}
                    />
                  </div>
                </label>

                {error && <div className="text-sm text-[#FFB020]">{error}</div>}

                <motion.button
                  type="submit"
                  disabled={busy}
                  whileTap={{ scale: 0.98 }}
                  whileHover={{ y: -3 }}
                  className="w-full sm:w-auto rounded-2xl px-5 py-3 font-semibold bg-white/10 border border-white/15 hover:shadow-xl disabled:opacity-60"
                  style={{ boxShadow: "0 0 40px rgba(59,160,242,.25)" }}
                >
                  {busy ? "Joining…" : "Join"}
                </motion.button>
              </form>

              <p className="mt-6 text-xs text-white/55">
                If your name is taken, host will distinguish you visually in the lobby.
              </p>
            </>
          ) : (
            <>
              {/* 2) Joined — header */}
              <header className="mb-6">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em]">
                  Hi, <span className="grad-text">{firstName}</span>
                </h1>

                {/* role banner */}
                {role && (
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/12 px-3 py-1.5 text-xs">
                    <span className="opacity-70">Your role:</span>
                    <span className="font-semibold">{prettyRole(role)}</span>
                  </div>
                )}

                {!state.hostFirstName && (
                  <p className="mt-2 text-white/75 text-sm">Waiting for an admin to choose a host…</p>
                )}

                {state.hostFirstName && !isHost && state.status === "waitingStart" && (
                  <p className="mt-2 text-white/75 text-sm">Host selected — waiting for host to choose a game…</p>
                )}

                {isHost && (
                  <p className="mt-2 text-white/80 text-sm">
                    You’re the host —{" "}
                    <Link href="/host" className="underline text-white">open host controls</Link>.
                    (Host doesn’t play.)
                  </p>
                )}
              </header>

              {/* Host game grid (only on host's phone) */}
              {isHost && state.status === "waitingStart" && <GameGrid onChoose={chooseGame} />}

              {/* Rules */}
              {isInRules && <RulesCard game={state.game} />}

              {/* In-game */}
              {isInGame && (
                <div className="mt-6 grid gap-6">
                  {/* Out overlay strip */}
                  {!isAlive && (
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-white/80">
                      You’re <b>out</b>. Please remain silent and let others play. Thank you!
                    </div>
                  )}

                  {/* Reveal */}
                  {state.phase === "reveal" && (
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
                      <h3 className="text-xl font-semibold">Reveal</h3>
                      {state.eliminated ? (
                        <p className="mt-2 text-sm text-white/75">
                          <b>{state.eliminated}</b> has been eliminated.
                          {state.eliminated.toLowerCase() === firstName.toLowerCase()
                            ? " (That’s you. Any last words?)"
                            : ""}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-white/75">Waiting for host…</p>
                      )}
                    </div>
                  )}

                  {/* Night: Judas */}
                  {state.phase === "night_judas" && (
                    <NightPanel
                      title="Night — Judas"
                      hint="Judases agree on one target."
                      hidden={!isJudas || !isAlive}
                    >
                      {isJudas && isAlive ? (
                        <ActionChooser
                          label="Choose a target"
                          people={nonSelfAliveTargets}
                          value={nightTarget}
                          setValue={setNightTarget}
                          onSubmit={submitJudasVote}
                          submitText="Lock Target"
                          msg={nightMsg}
                        />
                      ) : (
                        <QuietCard text="Sleep quietly. (Judas acts now.)" />
                      )}
                    </NightPanel>
                  )}

                  {/* Night: Angel */}
                  {state.phase === "night_angel" && (
                    <NightPanel
                      title="Night — Angel"
                      hint="Angel may protect one person."
                      hidden={!isAngel || !isAlive}
                    >
                      {isAngel && isAlive ? (
                        <ActionChooser
                          label="Protect someone"
                          people={alivePlayers}
                          value={protectTarget}
                          setValue={setProtectTarget}
                          onSubmit={submitAngelProtect}
                          submitText="Set Protection"
                          msg={nightMsg}
                        />
                      ) : (
                        <QuietCard text="Sleep quietly. (Angel acts now.)" />
                      )}
                    </NightPanel>
                  )}

                  {/* Day: Discuss */}
                  {state.phase === "day_discuss" && (
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
                      <h3 className="text-xl font-semibold">Day — Discussion</h3>
                      <p className="mt-2 text-sm text-white/75">
                        Talk kindly. You’ll vote after the timer ends.
                      </p>
                      <div className="mt-4 text-4xl font-bold tracking-tight">
                        {timerText || "02:00"}
                      </div>
                    </div>
                  )}

                  {/* Day: Vote */}
                  {state.phase === "day_vote" && (
                    <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
                      <h3 className="text-xl font-semibold">Day — Vote</h3>
                      {!isAlive ? (
                        <p className="mt-2 text-sm text-white/70">You’re out. No voting.</p>
                      ) : (
                        <>
                          <p className="mt-2 text-sm text-white/75">
                            Choose who to accuse. One vote per round; you can change until the host resolves.
                          </p>
                          <div className="mt-4 grid gap-3 sm:grid-cols-[2fr,1fr]">
                            <div>
                              <label className="text-sm text-white/80">Pick a player</label>
                              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {alivePlayers.length === 0 && (
                                  <div className="text-sm text-white/70">No alive players.</div>
                                )}
                                {alivePlayers
                                  .filter((p) => p.firstName?.toLowerCase() !== firstName.toLowerCase())
                                  .map((p) => (
                                    <button
                                      key={p.id}
                                      onClick={() => setVoteTarget(p.firstName)}
                                      className={`rounded-xl px-3 py-2 text-sm border ${
                                        voteTarget === p.firstName
                                          ? "bg-white/15 border-white/30"
                                          : "bg-white/8 border-white/12 hover:bg-white/12"
                                      }`}
                                    >
                                      {p.firstName}
                                    </button>
                                  ))}
                              </div>
                            </div>

                            <div>
                              <label className="text-sm text-white/80">Optional role guess</label>
                              <select
                                value={roleGuess}
                                onChange={(e) => setRoleGuess(e.target.value)}
                                className="mt-2 w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CD4FD]"
                              >
                                <option value="">— None —</option>
                                <option>Judas</option>
                                <option>Angel</option>
                                <option>Peter</option>
                                <option>Mary</option>
                                <option>Luke</option>
                                <option>Disciple</option>
                              </select>
                            </div>
                          </div>

                          <div className="mt-4">
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              whileHover={{ y: -2 }}
                              onClick={submitDayVote}
                              className="rounded-2xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow"
                              style={{ boxShadow: "0 0 20px rgba(59,160,242,.2)" }}
                              disabled={voteBusy}
                            >
                              {voteBusy ? "Submitting…" : "Submit Vote"}
                            </motion.button>
                            {voteMsg && <div className="mt-2 text-sm text-white/80">{voteMsg}</div>}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </motion.div>

        {/* gray-out overlay for out players */}
        {showOutOverlay && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          </div>
        )}
      </section>
    </main>
  );
}

/* ——— Components ——— */

function GameGrid({ onChoose }) {
  const cards = [
    { key: "judas", title: "Judas (Biblical Mafia)", desc: "Hidden roles · night & day · discern with care.", cta: "Choose Game", comingSoon: false, emoji: "🕊️" },
    { key: "trivia", title: "Trivia", desc: "Fast Q&A showdown.", cta: "Coming soon", comingSoon: true, emoji: "❓" },
    { key: "empire", title: "Empire", desc: "Name-claim reveal waves.", cta: "Coming soon", comingSoon: true, emoji: "👑" },
  ];
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <motion.div key={c.key} className="rounded-2xl border border-white/10 bg-white/8 p-5 hover:bg-white/12" whileHover={{ y: -4 }} transition={{ duration: 0.2 }}>
          <div className="text-2xl">{c.emoji}</div>
          <h3 className="mt-3 text-lg font-semibold">{c.title}</h3>
          <p className="mt-1 text-sm text-white/70">{c.desc}</p>
          <div className="mt-4">
            {c.comingSoon ? (
              <button className="w-full rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 opacity-60 cursor-not-allowed">
                {c.cta}
              </button>
            ) : (
              <motion.button onClick={() => onChoose(c.key)} whileTap={{ scale: 0.98 }} whileHover={{ y: -2 }}
                className="w-full rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow"
                style={{ boxShadow: "0 0 20px rgba(59,160,242,.2)" }}>
                {c.cta}
              </motion.button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function RulesCard({ game }) {
  if (game !== "judas") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/8 p-6 mt-6">
        <h3 className="text-xl font-semibold">Rules</h3>
        <p className="mt-2 text-white/75 text-sm">Rules for this game are coming soon.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-6 mt-6">
      <div className="text-2xl">🕊️</div>
      <h3 className="text-xl font-semibold mt-1">Judas (Biblical Mafia) — How to Play</h3>
      <ul className="mt-3 text-sm text-white/80 space-y-2 list-disc list-inside">
        <li>Roles are dealt secretly to phones (Judas, Angel, Peter, Mary, Luke, Disciples).</li>
        <li>Night: Judas chooses a target; Angel may protect; seers discern.</li>
        <li>Day: reveal event, discuss kindly; then vote to accuse or spare.</li>
        <li>Resolution: eliminate or spare; repeat rounds until a win condition.</li>
        <li>Win: all Judas eliminated — or Judas count ≥ villagers.</li>
      </ul>
      <p className="mt-3 text-xs text-white/60">Tone: respectful & scripture-adjacent. Role identity uses icon + pattern (never color-only).</p>
      <div className="mt-4 text-sm text-white/75">Waiting for host to start the game…</div>
    </div>
  );
}

function NightPanel({ title, hint, hidden, children }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/8 p-6 ${hidden ? "opacity-80" : ""}`}>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/75">{hint}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function QuietCard({ text }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/6 p-4 text-sm text-white/75">
      {text}
    </div>
  );
}

function ActionChooser({ label, people, value, setValue, onSubmit, submitText, msg }) {
  return (
    <>
      <label className="text-sm text-white/80">{label}</label>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {people.length === 0 && <div className="text-sm text-white/70">No available players.</div>}
        {people.map((p) => (
          <button
            key={p.id}
            onClick={() => setValue(p.firstName)}
            className={`rounded-xl px-3 py-2 text-sm border ${
              value === p.firstName ? "bg-white/15 border-white/30" : "bg-white/8 border-white/12 hover:bg-white/12"
            }`}
          >
            {p.firstName}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <motion.button
          whileTap={{ scale: 0.98 }}
          whileHover={{ y: -2 }}
          onClick={onSubmit}
          className="rounded-2xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow"
          style={{ boxShadow: "0 0 20px rgba(59,160,242,.2)" }}
        >
          {submitText}
        </motion.button>
        {msg && <div className="mt-2 text-sm text-white/80">{msg}</div>}
      </div>
    </>
  );
}

/* ——— utils ——— */
function prettyRole(r) {
  const map = { judas: "Judas", angel: "Angel", peter: "Peter", mary: "Mary", luke: "Luke", disciple: "Disciple" };
  return map[r] || r;
}
function msToClock(ms) {
  const s = Math.ceil(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
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
        style={{ background: "radial-gradient(50% 50% at 50% 50%, #1F6FEB 0%, rgba(31,111,235,0) 70%)" }}
      />
      <div
        className="absolute -bottom-24 -right-24 w-[520px] h-[520px] rounded-full opacity-40 blur-[120px]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, #FF7A18 0%, rgba(255,122,24,0) 70%)" }}
      />
    </div>
  );
}
