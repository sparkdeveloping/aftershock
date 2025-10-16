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

  // ——— Firebase singletons ———
  const app = useMemo(() => getApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);

  // ——— Local identity ———
  const [firstName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("firstName")) || ""
  );

  // ——— Auth (anon ok) ———
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

  // ——— Global state ———
  const [state, setState] = useState({
    status: "waitingHost",          // 'waitingHost' | 'waitingStart' | 'rules' | 'inGame'
    hostFirstName: null,
    game: "judas",
    phase: "rules",                 // 'rules' | 'night_judas' | 'night_angel' | 'reveal' | 'day_discuss' | 'day_vote'
    round: 1,
    dayEndsAt: null,                // ms epoch for player timers
    eliminated: null,               // firstName eliminated for reveal
    roleCounts: { judas: 1, angel: 1 },
    hideRolesAlive: true,           // NEW: hide roles for alive players
    revealDeadRoles: false,         // NEW: reveal roles for dead players
  });

  const stateRef = useMemo(() => doc(db, "meta", "state"), [db]);

  useEffect(() => {
    const unsub = onSnapshot(stateRef, async (snap) => {
      if (!snap.exists()) {
        await setDoc(stateRef, {
          status: "waitingHost",
          game: "judas",
          phase: "rules",
          round: 1,
          roleCounts: { judas: 1, angel: 1 },
          hideRolesAlive: true,
          revealDeadRoles: false,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
        setState((s) => ({
          ...s,
          status: "waitingHost",
          game: "judas",
          phase: "rules",
          round: 1,
          hideRolesAlive: true,
          revealDeadRoles: false,
        }));
      } else {
        const d = snap.data();
        setState({
          status: d.status ?? "waitingHost",
          hostFirstName: d.hostFirstName ?? null,
          game: d.game ?? "judas",
          phase: d.phase ?? "rules",
          round: d.round ?? 1,
          dayEndsAt: d.dayEndsAt ?? null,
          eliminated: d.eliminated ?? null,
          roleCounts: d.roleCounts ?? { judas: 1, angel: 1 },
          hideRolesAlive: d.hideRolesAlive ?? true,
          revealDeadRoles: d.revealDeadRoles ?? false,
        });
      }
    });
    return () => unsub();
  }, [stateRef]);

  const isHost =
    firstName &&
    state.hostFirstName &&
    firstName.toLowerCase() === String(state.hostFirstName).toLowerCase();

  // ——— Players (host does not play) ———
  const [players, setPlayers] = useState([]);
  useEffect(() => {
    const qPlayers = query(collection(db, "players"), orderBy("joinedAt", "asc"));
    const unsub = onSnapshot(qPlayers, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, alive: true, role: null, ...d.data() }));
      setPlayers(list.map((p) => ({ ...p, alive: p.alive !== false })));
    });
    return () => unsub();
  }, [db]);

  const hostNameLower = (state.hostFirstName || "").toLowerCase();
  const playersNoHost = players.filter(
    (p) => p.firstName?.toLowerCase() !== hostNameLower
  );
  const alivePlayers = playersNoHost.filter((p) => p.alive);
  const outPlayers = playersNoHost.filter((p) => !p.alive);

  // ——— Live votes (day) ———
  const [votes, setVotes] = useState([]);
  const [tally, setTally] = useState([]); // {targetFirstName, count, display}
  useEffect(() => {
    const qVotes = query(
      collection(db, "votes"),
      where("round", "==", state.round || 1)
      // (orderBy optional; omit to avoid composite index)
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
          display: alivePlayers.find((p) => p.firstName?.toLowerCase() === k)?.firstName || k,
        }))
        .sort((a, b) => b.count - a.count);
      setTally(grouped);
    });
    return () => unsub();
  }, [db, state.round, alivePlayers.length]);

  // ——— Night votes (Judas) ———
  const [nightVotes, setNightVotes] = useState([]); // { voterUid, targetFirstName, role }
  useEffect(() => {
    const qNV = query(
      collection(db, "nightVotes"),
      where("round", "==", state.round || 1)
    );
    const unsub = onSnapshot(qNV, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setNightVotes(list);
    });
    return () => unsub();
  }, [db, state.round]);

  // —— Protects (Angel) ——
  const [protects, setProtects] = useState([]); // { protectorUid, targetFirstName }
  useEffect(() => {
    const qP = query(
      collection(db, "protects"),
      where("round", "==", state.round || 1)
    );
    const unsub = onSnapshot(qP, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setProtects(list);
    });
    return () => unsub();
  }, [db, state.round]);

  // ——— Role config (defaults) ———
  const [roleCfg, setRoleCfg] = useState({ judas: 1, angel: 1 });
  useEffect(() => {
    const def = suggestCounts(playersNoHost.length);
    setRoleCfg((c) => ({ ...def, ...state.roleCounts }));
  }, [playersNoHost.length, state.roleCounts]);

  // ——— Host actions ———
  async function setPhase(phase) {
    if (!isHost) return;
    await updateDoc(stateRef, {
      phase,
      status: phase === "rules" ? "rules" : "inGame",
      updatedAt: serverTimestamp(),
      eliminated: phase === "reveal" ? state.eliminated ?? null : null,
    }).catch(() => {});
  }

  async function startDayDiscussion() {
    if (!isHost) return;
    const targetMs = Date.now() + 120000; // 2m
    await updateDoc(stateRef, {
      phase: "day_discuss",
      status: "inGame",
      dayEndsAt: targetMs,
      updatedAt: serverTimestamp(),
      eliminated: null,
    }).catch(() => {});
  }

  async function openVoting() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      phase: "day_vote",
      status: "inGame",
      updatedAt: serverTimestamp(),
      eliminated: null,
    }).catch(() => {});
  }

  async function resolveDayVote() {
    if (!isHost) return;
    if (tally.length === 0) {
      await updateDoc(stateRef, {
        phase: "reveal",
        eliminated: null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      return;
    }
    const top = tally[0];
    const tied = tally.length > 1 && tally[1].count === top.count;
    if (tied || !top.display) {
      await updateDoc(stateRef, {
        phase: "reveal",
        eliminated: null,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      return;
    }
    const target = playersNoHost.find(
      (p) => p.firstName?.toLowerCase() === top.targetFirstName
    );
    if (target) {
      await updateDoc(doc(db, "players", target.id), { alive: false }).catch(() => {});
    }
    await updateDoc(stateRef, {
      phase: "reveal",
      eliminated: top.display,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function nextRound() {
    if (!isHost) return;
    await clearCollectionRound("votes", state.round);
    await clearCollectionRound("nightVotes", state.round);
    await clearCollectionRound("protects", state.round);

    await updateDoc(stateRef, {
      round: (state.round || 1) + 1,
      phase: "night_judas",
      status: "inGame",
      eliminated: null,
      dayEndsAt: null,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function clearCollectionRound(coll, round) {
    const qDel = query(collection(db, coll), where("round", "==", round));
    const snap = await getDocs(qDel);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit().catch(() => {});
  }

  // ——— Role dealing ———
  async function dealRolesAndStart() {
    if (!isHost) return;
    const total = playersNoHost.length;
    const cfg = normalizeCounts(roleCfg, total);
    // build pool of indexes
    const idxs = Array.from({ length: total }, (_, i) => i);
    shuffle(idxs);
    const judasIdxs = new Set(idxs.slice(0, cfg.judas));
    const angelIdxs = new Set(idxs.slice(cfg.judas, cfg.judas + cfg.angel));
    // update players
    const batch = writeBatch(db);
    playersNoHost.forEach((p, i) => {
      const role = judasIdxs.has(i)
        ? "judas"
        : angelIdxs.has(i)
        ? "angel"
        : "disciple";
      batch.update(doc(db, "players", p.id), { role, alive: true });
    });
    await batch.commit().catch(() => {});

    await updateDoc(stateRef, {
      roleCounts: cfg,
      status: "inGame",
      phase: "night_judas",
      round: state.round || 1,
      eliminated: null,
      dayEndsAt: null,
      hideRolesAlive: state.hideRolesAlive ?? true,
      revealDeadRoles: state.revealDeadRoles ?? false,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  // ——— Night resolution helpers ———
  const expectedJudas = clamp(state.roleCounts?.judas ?? roleCfg.judas, 0, 4);
  const expectedAngel = clamp(state.roleCounts?.angel ?? roleCfg.angel, 0, 4);

  const judasVotesThisRound = nightVotes.filter((v) => v.role === "judas");
  const unanimousTarget = getUnanimousTarget(judasVotesThisRound);

  const protectedNames = new Set(
    protects.map((p) => (p.targetFirstName || "").toLowerCase())
  );

  async function proceedToAngel() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      phase: "night_angel",
      eliminated: unanimousTarget ? toDisplayCase(unanimousTarget, playersNoHost) : null,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  async function revealNight() {
    if (!isHost) return;
    let eliminatedName = null;
    if (unanimousTarget && !protectedNames.has(unanimousTarget)) {
      eliminatedName = toDisplayCase(unanimousTarget, playersNoHost);
      const victim = playersNoHost.find(
        (p) => p.firstName?.toLowerCase() === unanimousTarget
      );
      if (victim) {
        await updateDoc(doc(db, "players", victim.id), { alive: false }).catch(() => {});
      }
    }
    await updateDoc(stateRef, {
      phase: "reveal",
      eliminated: eliminatedName, // null means "no one"
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  // ——— Player management (manual) ———
  async function killPlayer(firstName) {
    if (!isHost) return;
    const target = playersNoHost.find((p) => p.firstName?.toLowerCase() === firstName.toLowerCase());
    if (!target) return;
    await updateDoc(doc(db, "players", target.id), { alive: false }).catch(() => {});
  }
  async function revivePlayer(firstName) {
    if (!isHost) return;
    const target = playersNoHost.find((p) => p.firstName?.toLowerCase() === firstName.toLowerCase());
    if (!target) return;
    await updateDoc(doc(db, "players", target.id), { alive: true }).catch(() => {});
  }

  // ——— Role privacy toggles (persisted) ———
  async function toggleHideRolesAlive() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      hideRolesAlive: !state.hideRolesAlive,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }
  async function toggleRevealDeadRoles() {
    if (!isHost) return;
    await updateDoc(stateRef, {
      revealDeadRoles: !state.revealDeadRoles,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  // ——— Header copy ———
  const headerStatus =
    state.status === "waitingHost"
      ? "Waiting for admin to choose a host…"
      : state.status === "waitingStart"
      ? "Host selected — choose a game on your phone at /play."
      : state.status === "rules"
      ? "Showing rules"
      : state.status === "inGame"
      ? `In game — Round ${state.round}`
      : "";

  const phaseTitle = prettyPhase(state.phase);
  const phaseInstruction = phaseCallout(state.phase, state.roleCounts);

  // ——— Render ———
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

        {!isHost ? (
          <Guard state={state} />
        ) : (
          <>
            {/* Big phase banner */}
            <motion.div
              className="relative overflow-hidden rounded-3xl p-6 sm:p-8 border border-white/10"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,122,24,.15), rgba(59,160,242,.18))",
                boxShadow: "0 20px 60px rgba(16,35,80,.25)",
              }}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <h2 className="text-3xl md:text-5xl font-semibold tracking-[-0.02em] grad-text">
                    {phaseTitle}
                  </h2>
                  <p className="mt-2 text-white/90 text-base md:text-lg">
                    {phaseInstruction}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/75">
                    <Chip>Round {state.round || 1}</Chip>
                    <Chip>Players (excl. host): {playersNoHost.length}</Chip>
                    <Chip>Alive {alivePlayers.length}</Chip>
                    <Chip>Out {outPlayers.length}</Chip>
                  </div>
                </div>

                {/* Global projector privacy controls */}
                <div className="flex flex-wrap gap-2">
                  <SecondaryBtn onClick={toggleHideRolesAlive}>
                    {state.hideRolesAlive ? "Show Roles (Alive)" : "Hide Roles (Alive)"}
                  </SecondaryBtn>
                  <SecondaryBtn onClick={toggleRevealDeadRoles}>
                    {state.revealDeadRoles ? "Hide Roles (Dead)" : "Reveal Roles (Dead)"}
                  </SecondaryBtn>
                </div>
              </div>
            </motion.div>

            {/* Top status & contextual minor actions */}
            <motion.div
              className="glass rounded-3xl p-6 border border-white/10 mt-6"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em]">
                    Welcome, <span className="grad-text">{firstName}</span>
                  </h1>
                  <p className="mt-2 text-white/75 text-sm">{headerStatus}</p>
                </div>

                {/* Contextual controls */}
                <div className="flex flex-wrap gap-2">
                  {state.phase === "rules" && (
                    <SecondaryBtn onClick={() => router.push("/play")}>Change Game</SecondaryBtn>
                  )}
                  {state.phase === "day_discuss" && (
                    <PrimaryBtn onClick={openVoting}>Open Voting</PrimaryBtn>
                  )}
                  {state.phase === "day_vote" && (
                    <PrimaryBtn onClick={resolveDayVote}>Resolve Day Vote</PrimaryBtn>
                  )}
                  {state.phase === "reveal" && (
                    <PrimaryBtn onClick={nextRound}>Next Round</PrimaryBtn>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Main columns */}
            <div className="grid gap-6 mt-6 md:grid-cols-[2fr,1fr]">
              {/* Left: flow panels */}
              <motion.div
                className="glass rounded-3xl p-6 border border-white/10"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
              >
                {state.phase === "rules" && (
                  <RulesAndRoles
                    players={playersNoHost}
                    roleCfg={roleCfg}
                    setRoleCfg={setRoleCfg}
                    onDeal={dealRolesAndStart}
                    revealDeadRoles={state.revealDeadRoles}
                    onToggleRevealDead={toggleRevealDeadRoles}
                  />
                )}

                {state.phase === "night_judas" && (
                  <NightStage
                    title="Night — Judas"
                    subtitle="Prompt: “Judas, wake up.” Wait for a unanimous target."
                  >
                    <div className="mt-3 text-sm text-white/80">
                      Judas votes: {nightVotes.filter(v => v.role === "judas").length}/{state.roleCounts?.judas ?? roleCfg.judas}
                      {getUnanimousTarget(nightVotes.filter(v => v.role === "judas")) ? (
                        <div className="mt-2">
                          Target locked:{" "}
                          <b>
                            {toDisplayCase(
                              getUnanimousTarget(nightVotes.filter(v => v.role === "judas")),
                              playersNoHost
                            ) || "—"}
                          </b>
                        </div>
                      ) : (
                        <div className="mt-2">Waiting for unanimity…</div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <PrimaryBtn
                        onClick={proceedToAngel}
                        disabled={!getUnanimousTarget(nightVotes.filter(v => v.role === "judas"))}
                      >
                        Proceed to Angel
                      </PrimaryBtn>
                    </div>
                  </NightStage>
                )}

                {state.phase === "night_angel" && (
                  <NightStage
                    title="Night — Angel"
                    subtitle="Prompt: “Angel, wake up.” Angel chooses one to protect."
                  >
                    <div className="mt-3 text-sm text-white/80">
                      Protection received: {protects.length}/{state.roleCounts?.angel ?? roleCfg.angel}
                      <div className="mt-2">
                        Judas target: <b>{state.eliminated || "— (none yet)"}</b>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <PrimaryBtn onClick={revealNight}>Reveal Night</PrimaryBtn>
                    </div>
                  </NightStage>
                )}

                {state.phase === "reveal" && (
                  <div>
                    <h3 className="text-xl font-semibold">Reveal</h3>
                    <p className="mt-2 text-sm text-white/75">
                      {state.eliminated ? (
                        <>Eliminated: <b>{state.eliminated}</b></>
                      ) : (
                        <>No one was eliminated.</>
                      )}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <SecondaryBtn onClick={startDayDiscussion}>Start Day Discussion (2 min)</SecondaryBtn>
                    </div>
                  </div>
                )}

                {state.phase === "day_discuss" && (
                  <div>
                    <h3 className="text-xl font-semibold">Day — Discussion</h3>
                    <p className="mt-2 text-sm text-white/75">
                      Give players ~2 minutes to discuss. Then open voting.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <PrimaryBtn onClick={openVoting}>Open Voting Now</PrimaryBtn>
                    </div>
                  </div>
                )}

                {state.phase === "day_vote" && (
                  <div>
                    <h3 className="text-xl font-semibold">Day — Vote</h3>
                    {tally.length === 0 ? (
                      <p className="mt-2 text-sm text-white/75">No votes yet…</p>
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
                    <div className="mt-4 flex gap-2">
                      <PrimaryBtn onClick={resolveDayVote}>Resolve Vote</PrimaryBtn>
                      <SecondaryBtn onClick={() => clearCollectionRound("votes", state.round)}>
                        Clear Votes
                      </SecondaryBtn>
                    </div>
                  </div>
                )}
              </motion.div>

              {/* Right: players list & manual controls */}
              <motion.div
                className="glass rounded-3xl p-6 border border-white/10"
                initial={{ y: 16, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
              >
                <h3 className="text-lg font-semibold">Players ({playersNoHost.length})</h3>
                {playersNoHost.length === 0 ? (
                  <p className="mt-2 text-sm text-white/70">
                    Waiting for players to join on /play…
                  </p>
                ) : (
                  <ul className="mt-3 grid sm:grid-cols-2 gap-2">
                    {playersNoHost.map((p) => {
                      const showRole =
                        p.role &&
                        (
                          (!state.hideRolesAlive && p.alive) ||
                          (!p.alive && state.revealDeadRoles)
                        );
                      return (
                        <li
                          key={p.id}
                          className={`rounded-xl border px-3 py-2 text-sm ${
                            p.alive ? "bg-white/8 border-white/10" : "bg-red-400/10 border-red-400/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{p.firstName}</div>
                              <div className="text-[11px] text-white/60">
                                {p.alive ? "Alive" : "Out"} · {showRole ? prettyRole(p.role) : "—"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {p.alive ? (
                                <DangerBtn onClick={() => killPlayer(p.firstName)}>Kill</DangerBtn>
                              ) : (
                                <SecondaryBtn onClick={() => revivePlayer(p.firstName)}>Revive</SecondaryBtn>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
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

/* ——— Panels ——— */

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

function RulesAndRoles({ players, roleCfg, setRoleCfg, onDeal, revealDeadRoles, onToggleRevealDead }) {
  const total = players.length;
  const minJudas = Math.min(3, Math.max(1, Math.floor(total / 6) || 1));
  const minAngel = Math.min(2, Math.max(0, Math.floor(total / 8)));

  return (
    <div>
      <div className="text-2xl">🕊️</div>
      <h3 className="text-xl font-semibold mt-1">Judas — Setup</h3>
      <p className="mt-2 text-sm text-white/75">
        Choose role counts (host does not play). Defaults scale with player count.
      </p>

      <div className="mt-4 grid sm:grid-cols-2 gap-3">
        <NumberField
          label="Judas (mafia)"
          value={roleCfg.judas}
          min={minJudas}
          max={Math.max(minJudas, Math.min(3, Math.floor(total / 3)))}
          onChange={(v) => setRoleCfg((c) => ({ ...c, judas: v }))}
        />
        <NumberField
          label="Angel (protector)"
          value={roleCfg.angel}
          min={minAngel}
          max={Math.max(minAngel, Math.min(2, Math.floor(total / 4)))}
          onChange={(v) => setRoleCfg((c) => ({ ...c, angel: v }))}
        />
      </div>

      <div className="mt-4">
        <label className="inline-flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={revealDeadRoles}
            onChange={onToggleRevealDead}
            className="accent-[#3BA0F2]"
          />
          Reveal roles for eliminated players on projector
        </label>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <PrimaryBtn onClick={onDeal} disabled={total < 5}>
          Deal Roles & Start Night
        </PrimaryBtn>
        <span className="text-xs text-white/60">Need at least 5 players for a good game.</span>
      </div>
    </div>
  );
}

function NightStage({ title, subtitle, children }) {
  return (
    <div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/75">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ——— UI atoms ——— */

function NumberField({ label, value, min = 0, max = 10, onChange }) {
  return (
    <label className="block">
      <span className="text-sm text-white/80">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(parseInt(e.target.value || "0", 10), min, max))}
        className="mt-2 w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CD4FD]"
      />
      <span className="text-[11px] text-white/50">min {min} · max {max}</span>
    </label>
  );
}

function PrimaryBtn({ onClick, children, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: disabled ? 1 : 0.98 }}
      whileHover={{ y: disabled ? 0 : -2 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow disabled:opacity-60"
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

function Chip({ children }) {
  return (
    <span className="rounded-full px-2.5 py-1 text-[11px] border border-white/10 bg-white/8">
      {children}
    </span>
  );
}

/* ——— utils ——— */
function prettyRole(r) {
  const map = { judas: "Judas", angel: "Angel", disciple: "Disciple" };
  return map[r] || r;
}
function prettyPhase(p) {
  const map = {
    rules: "Rules",
    night_judas: "Night (Judas)",
    night_angel: "Night (Angel)",
    day_discuss: "Day (Discuss)",
    day_vote: "Day (Vote)",
    reveal: "Reveal",
  };
  return map[p] || p;
}
function phaseCallout(phase, roleCounts) {
  const j = roleCounts?.judas || 1;
  const judasWord = j > 1 ? "Judases" : "Judas";
  switch (phase) {
    case "rules":
      return "Review roles and settings, then deal and begin.";
    case "night_judas":
      return `${judasWord}, choose a target—silently.`;
    case "night_angel":
      return "Angel, select one player to protect.";
    case "reveal":
      return "Reveal what happened last phase.";
    case "day_discuss":
      return "Everyone discuss together. Be kind; listen well.";
    case "day_vote":
      return "All players vote thoughtfully. Host will resolve.";
    default:
      return "";
  }
}
function suggestCounts(n) {
  const judas = Math.max(1, Math.min(3, Math.floor(n / 5)));
  const angel = n >= 6 ? 1 : 0;
  return { judas, angel };
}
function normalizeCounts(cfg, total) {
  let j = clamp(cfg.judas | 0, 1, Math.min(3, Math.max(1, Math.floor(total / 3))));
  let a = clamp(cfg.angel | 0, 0, Math.min(2, Math.floor(total / 4)));
  if (j + a > total - 1) a = Math.max(0, total - 1 - j); // keep at least 1 disciple
  return { judas: j, angel: a };
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function getUnanimousTarget(list) {
  if (!list || list.length === 0) return null;
  const first = (list[0].targetFirstName || "").toLowerCase();
  if (!first) return null;
  for (const v of list) {
    if ((v.targetFirstName || "").toLowerCase() !== first) return null;
  }
  return first;
}
function toDisplayCase(lowerName, players) {
  if (!lowerName) return null;
  const hit = players.find((p) => p.firstName?.toLowerCase() === lowerName);
  return hit?.firstName || capitalize(lowerName);
}
function capitalize(s = "") {
  return s.slice(0, 1).toUpperCase() + s.slice(1);
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
