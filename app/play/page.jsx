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
  collection,
  query,
  where,
  getDocs,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  serverTimestamp,
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

  // —— Global state doc (chosen host, status, game) ——
  const [state, setState] = useState({ status: "waitingHost", hostFirstName: null, game: null });

  // —— Host detection (case-insensitive) ——
  const isHost =
    firstName &&
    state.hostFirstName &&
    firstName.toLowerCase() === String(state.hostFirstName).toLowerCase();

  // —— Auth (anon ok) ——
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch {}
      } else {
        // If we already stored name earlier, mark joined if a matching player doc exists
        if (firstName) {
          const q = query(
            collection(db, "players"),
            where("uid", "==", user.uid),
            where("firstName", "==", firstName)
          );
          const snap = await getDocs(q);
          setJoined(!snap.empty);
        }
      }
    });
    return () => unsub();
  }, [auth, db, firstName]);

  // —— Subscribe to meta/state ——
  useEffect(() => {
    const ref = doc(db, "meta", "state");
    const unsub = onSnapshot(ref, async (snap) => {
      if (!snap.exists()) {
        await setDoc(ref, { status: "waitingHost", updatedAt: serverTimestamp() }).catch(() => {});
        setState({ status: "waitingHost", hostFirstName: null, game: null });
      } else {
        setState({
          status: snap.data().status ?? "waitingHost",
          hostFirstName: snap.data().hostFirstName ?? null,
          game: snap.data().game ?? null,
        });
      }
    });
    return () => unsub();
  }, [db]);

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

      await addDoc(collection(db, "players"), {
        firstName: name,
        uid: user.uid,
        joinedAt: serverTimestamp(),
        status: "idle",
      });

      if (typeof window !== "undefined") localStorage.setItem("firstName", name);
      setJoined(true);
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

  // —— Host chooses game (only active: Judas) ——
  async function chooseGame(game) {
    if (!isHost) return;
    try {
      const ref = doc(db, "meta", "state");
      await updateDoc(ref, {
        game,
        status: "rules", // show rules to everyone; host will start later
        updatedAt: serverTimestamp(),
      });
      // Nudge host toward control room
      setTimeout(() => router.push("/host"), 400);
    } catch (e) {
      console.error(e);
      setError("Couldn’t set game. Check Firestore rules for /meta/state writes.");
    }
  }

  // —— UI helpers ——
  const lines = useMemo(
    () => [
      "Quick Join — first name only",
      "Admin will pick a host",
      "Be kind · have fun · play fair",
    ],
    []
  );
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % lines.length), 2400);
    return () => clearInterval(id);
  }, [lines.length]);

  // ————————————————— UI —————————————————
  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#0B1020] text-white">
      <StyleTokens />
      <AmbientBokeh />
      <GradientFog />

      <section className="relative z-10 min-h-dvh flex items-center justify-center px-4">
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

          {/* 1) Not joined yet: show join form */}
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
                      style={{
                        background:
                          "radial-gradient(120% 120% at 0% 0%, rgba(255,122,24,.35), transparent 60%)",
                      }}
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
              {/* 2) Joined — Host vs Player views */}
              <header className="mb-6">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em]">
                  Hi, <span className="grad-text">{firstName}</span>
                </h1>
                {isHost ? (
                  <p className="mt-2 text-white/75 text-sm">
                    You’re the host. Choose a game below.{" "}
                    <Link href="/host" className="underline text-white/90">
                      Open host controls
                    </Link>
                    .
                  </p>
                ) : state.status === "waitingHost" ? (
                  <p className="mt-2 text-white/75 text-sm">Waiting for an admin to choose a host…</p>
                ) : state.status === "waitingStart" ? (
                  <p className="mt-2 text-white/75 text-sm">
                    Host selected — waiting for host to choose a game…
                  </p>
                ) : state.status === "rules" && state.game ? (
                  <p className="mt-2 text-white/75 text-sm">
                    {displayGameName(state.game)} selected — review the rules below. Waiting for the
                    host to start the game.
                  </p>
                ) : null}
              </header>

              {/* Host: show Game Grid */}
              {isHost ? (
                <GameGrid onChoose={chooseGame} />
              ) : state.status === "rules" && state.game ? (
                <RulesCard game={state.game} />
              ) : (
                <WaitingCard status={state.status} />
              )}
            </>
          )}
        </motion.div>
      </section>
    </main>
  );
}

/* ——— Game grid (Host) ——— */
function GameGrid({ onChoose }) {
  const cards = [
    {
      key: "judas",
      title: "Judas (Biblical Mafia)",
      desc: "Hidden roles · night & day · discern with care.",
      cta: "Choose Game",
      comingSoon: false,
      emoji: "🕊️",
    },
    { key: "trivia", title: "Trivia", desc: "Fast Q&A showdown.", cta: "Coming soon", comingSoon: true, emoji: "❓" },
    { key: "empire", title: "Empire", desc: "Name-claim reveal waves.", cta: "Coming soon", comingSoon: true, emoji: "👑" },
  ];

  return (
    <div className="grid md:grid-cols-3 gap-4">
      {cards.map((c) => (
        <motion.div
          key={c.key}
          className="rounded-2xl border border-white/10 bg-white/8 p-5 hover:bg-white/12"
          whileHover={{ y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <div className="text-2xl">{c.emoji}</div>
          <h3 className="mt-3 text-lg font-semibold">{c.title}</h3>
          <p className="mt-1 text-sm text-white/70">{c.desc}</p>
          <div className="mt-4">
            {c.comingSoon ? (
              <button className="w-full rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 opacity-60 cursor-not-allowed">
                {c.cta}
              </button>
            ) : (
              <motion.button
                onClick={() => onChoose(c.key)}
                whileTap={{ scale: 0.98 }}
                whileHover={{ y: -2 }}
                className="w-full rounded-xl px-4 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow"
                style={{ boxShadow: "0 0 20px rgba(59,160,242,.2)" }}
              >
                {c.cta}
              </motion.button>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ——— Rules card (Players & Host after choose) ——— */
function RulesCard({ game }) {
  if (game !== "judas") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
        <h3 className="text-xl font-semibold">Rules</h3>
        <p className="mt-2 text-white/75 text-sm">Rules for {displayGameName(game)} coming soon.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
      <div className="text-2xl">🕊️</div>
      <h3 className="mt-2 text-xl font-semibold">Judas (Biblical Mafia) — How to Play</h3>
      <ul className="mt-3 text-sm text-white/80 space-y-2 list-disc list-inside">
        <li>Roles are dealt secretly to phones (Judas, Angel, Peter, Mary, Luke, Disciples).</li>
        <li>Night: Judas chooses a target; Angel may protect; seer roles discern.</li>
        <li>Day: event revealed, discuss kindly; then vote to accuse or spare.</li>
        <li>Resolution: eliminate or spare; continue rounds until a win condition.</li>
        <li>Win: all Judas eliminated — or Judas count ≥ villagers.</li>
      </ul>
      <p className="mt-3 text-xs text-white/60">
        Tone: respectful & scripture-adjacent. Identify roles by icon + pattern (not color only).
      </p>
      <div className="mt-4 text-sm text-white/75">Waiting for host to start the game…</div>
    </div>
  );
}

/* ——— Waiting states (non-host) ——— */
function WaitingCard({ status }) {
  const msg =
    status === "waitingHost"
      ? "Waiting for an admin to choose a host…"
      : "Host selected — waiting for host to choose a game…";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-6">
      <h3 className="text-xl font-semibold">Lobby</h3>
      <p className="mt-2 text-white/75 text-sm">{msg}</p>
    </div>
  );
}

/* ——— utils ——— */
function displayGameName(key) {
  if (key === "judas") return "Judas (Biblical Mafia)";
  if (key === "trivia") return "Trivia";
  if (key === "empire") return "Empire";
  return key;
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
