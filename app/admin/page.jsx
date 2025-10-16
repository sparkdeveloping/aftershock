// /app/admin/page.js
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import "../firebaseConfig";

import { getApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

export default function AdminPage() {
  // Firebase singletons
  const app = useMemo(() => getApp(), []);
  const auth = useMemo(() => getAuth(app), [app]);
  const db = useMemo(() => getFirestore(app), [app]);

  // Session (anon ok)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) signInAnonymously(auth).catch(() => {});
    });
    return () => unsub();
  }, [auth]);

  // Admin unlock
  const [adminName, setAdminName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");

  const handleUnlock = useCallback(async () => {
    const name = adminName.trim();
    if (!name) return setAdminMsg("Enter your first name.");
    const id = name.toLowerCase();
    const ref = doc(db, "admins", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (id === "denzel") {
        await setDoc(ref, { createdAt: serverTimestamp(), createdBy: "system" });
        setIsAdmin(true);
        setAdminMsg("Admin unlocked (seeded).");
      } else {
        setAdminMsg("Not an admin. Ask Denzel to add you.");
        setIsAdmin(false);
      }
    } else {
      setIsAdmin(true);
      setAdminMsg("Admin unlocked.");
    }
  }, [adminName, db]);

  // Players list
  const [players, setPlayers] = useState([]);
  useEffect(() => {
    const q = query(collection(db, "players"), orderBy("joinedAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setPlayers(list);
    });
    return () => unsub();
  }, [db]);

  // Lobby state (host, status)
  const stateRef = useMemo(() => doc(db, "meta", "state"), [db]);
  const [host, setHost] = useState(null);
  const [status, setStatus] = useState("waitingHost");

  useEffect(() => {
    const unsub = onSnapshot(stateRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setHost(data.hostFirstName ?? null);
        setStatus(data.status ?? "waitingHost");
      } else {
        setDoc(stateRef, { status: "waitingHost", updatedAt: serverTimestamp() }).catch(() => {});
      }
    });
    return () => unsub();
  }, [stateRef]);

  async function chooseHost(firstName) {
    if (!isAdmin) return;
    await updateDoc(stateRef, {
      hostFirstName: firstName,
      status: "waitingStart",
      updatedAt: serverTimestamp(),
    }).catch(async () => {
      await setDoc(stateRef, {
        hostFirstName: firstName,
        status: "waitingStart",
        updatedAt: serverTimestamp(),
      });
    });
  }

  async function clearHost() {
    if (!isAdmin) return;
    await updateDoc(stateRef, {
      hostFirstName: null,
      status: "waitingHost",
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }

  // —— NEW: delete single player / clear all ——
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function deletePlayer(playerId) {
    if (!isAdmin) return;
    try {
      setBusy(true);
      await deleteDoc(doc(db, "players", playerId));
      setMsg("Player removed.");
    } catch (e) {
      setMsg("Delete failed. Check Firestore rules.");
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 1200);
    }
  }

  async function clearAllPlayers() {
    if (!isAdmin) return;
    try {
      setBusy(true);
      const batch = writeBatch(db);
      players.forEach((p) => batch.delete(doc(db, "players", p.id)));
      await batch.commit();
      setMsg("All players cleared.");
    } catch (e) {
      setMsg("Bulk delete failed. Check Firestore rules.");
    } finally {
      setBusy(false);
      setConfirmAllOpen(false);
      setTimeout(() => setMsg(""), 1200);
    }
  }

  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#0B1020] text-white">
      <StyleTokens />
      <AmbientBokeh />
      <GradientFog />

      <section className="relative z-10 min-h-dvh max-w-5xl mx-auto px-4 py-10">
        <HeaderBar />

        {!isAdmin ? (
          <motion.div
            className="glass rounded-3xl p-6 border border-white/10"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] grad-text">
              Admin — Unlock
            </h1>
            <p className="mt-2 text-white/75 text-sm">
              Enter your first name to access host controls. Default admin is <b>Denzel</b>.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-[1fr,140px]">
              <input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Your first name"
                className="rounded-2xl bg-white/10 border border-white/15 focus:outline-none focus:ring-2 focus:ring-[#7CD4FD] px-4 py-3 placeholder:text-white/40"
              />
              <motion.button
                whileTap={{ scale: 0.98 }}
                whileHover={{ y: -2 }}
                onClick={handleUnlock}
                className="rounded-2xl px-4 py-3 font-semibold bg-white/10 border border-white/15 hover:shadow-xl"
                style={{ boxShadow: "0 0 40px rgba(59,160,242,.25)" }}
              >
                Unlock
              </motion.button>
            </div>

            {adminMsg && <div className="mt-3 text-sm text-white/75">{adminMsg}</div>}
          </motion.div>
        ) : (
          <div className="grid gap-6">
            {/* Host Status Card */}
            <motion.div
              className="glass rounded-3xl p-6 border border-white/10"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-semibold tracking-[-0.02em]">
                    Host Controls
                  </h2>
                  <p className="mt-1 text-white/70 text-sm">
                    Status:{" "}
                    <span className="text-white">
                      {status === "waitingHost" && "Waiting for host…"}
                      {status === "waitingStart" && "Host selected — waiting to start a game"}
                      {status === "inGame" && "Game in progress"}
                    </span>
                  </p>
                  <p className="mt-1 text-white/70 text-sm">
                    Current Host: <span className="text-white">{host ?? "— none —"}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <SmallBtn onClick={() => clearHost()} disabled={!host}>
                    Clear Host
                  </SmallBtn>
                  <SmallBtn disabled={!host}>Start (soon)</SmallBtn>
                </div>
              </div>
            </motion.div>

            {/* Players List + Clear Controls */}
            <motion.div
              className="glass rounded-3xl p-6 border border-white/10"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-xl font-semibold">Players</h3>
                  <div className="text-sm text-white/70">{players.length} joined</div>
                </div>
                <div className="flex items-center gap-2">
                  <SmallBtn
                    onClick={() => setConfirmAllOpen(true)}
                    disabled={players.length === 0 || busy}
                  >
                    Clear All
                  </SmallBtn>
                </div>
              </div>

              {players.length === 0 ? (
                <div className="text-white/70 text-sm">No players yet. Ask them to open /play.</div>
              ) : (
                <ul className="grid sm:grid-cols-2 gap-3">
                  {players.map((p) => {
                    const selected = host && p.firstName?.toLowerCase() === host?.toLowerCase();
                    return (
                      <li key={p.id}>
                        <div
                          className={`w-full rounded-2xl px-4 py-3 border ${
                            selected ? "bg-white/15 border-white/30" : "bg-white/8 border-white/12"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{p.firstName}</div>
                              <div className="text-xs text-white/60 mt-1">
                                uid: {p.uid?.slice(0, 6)}… · joined
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <SmallBtn onClick={() => chooseHost(p.firstName)}>
                                Make Host
                              </SmallBtn>
                              <DangerBtn onClick={() => deletePlayer(p.id)} disabled={busy}>
                                Remove
                              </DangerBtn>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              {msg && <div className="mt-3 text-sm text-white/75">{msg}</div>}
            </motion.div>
          </div>
        )}
      </section>

      {/* Confirm Clear All Modal */}
      <AnimatePresence>
        {confirmAllOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmAllOpen(false)} />
            <motion.div
              className="glass rounded-3xl p-6 border border-white/10 relative max-w-md w-full"
              initial={{ y: 24, scale: 0.98, opacity: 0 }}
              animate={{ y: 0, scale: 1, opacity: 1 }}
              exit={{ y: 12, scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <h4 className="text-xl font-semibold">Clear all players?</h4>
              <p className="mt-2 text-sm text-white/75">
                This removes everyone currently in the players list.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <SmallBtn onClick={() => setConfirmAllOpen(false)} disabled={busy}>
                  Cancel
                </SmallBtn>
                <DangerBtn onClick={clearAllPlayers} disabled={busy}>
                  {busy ? "Clearing…" : "Clear All"}
                </DangerBtn>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/* ————————————————————————————————————————————————
   UI bits
——————————————————————————————————————————————————— */

function HeaderBar() {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs tracking-wide uppercase">
        Admin
      </div>
      <Link href="/" className="text-xs text-white/70 hover:text-white transition">
        ← Back to Splash
      </Link>
    </div>
  );
}

function SmallBtn({ children, onClick, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-3 py-2 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow disabled:opacity-60"
      style={{ boxShadow: "0 0 20px rgba(59,160,242,.2)" }}
    >
      {children}
    </motion.button>
  );
}

function DangerBtn({ children, onClick, disabled }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ y: -2 }}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-3 py-2 text-sm font-semibold border hover:shadow disabled:opacity-60"
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

/* ————————————————————————————————————————————————
   Aesthetic helpers
——————————————————————————————————————————————————— */

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
