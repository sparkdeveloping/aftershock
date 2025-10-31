// app/verse/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import "../firebaseConfig";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * /verse — QR destination
 * - Minimal form: name (optional), reference, verse text
 * - Saves to Firestore: collection 'verses'
 * - Device rate limit via localStorage (20s)
 * - Success confirmation + quick link back to Home
 */

export default function VersePage() {
  const db = useMemo(() => getFirestore(), []);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  // simple device cooldown
  const COOLDOWN_MS = 20_000;

  useEffect(() => {
    // Allow prefill via URL params (?ref=John%203:16&name=…)
    const u = new URL(window.location.href);
    const ref = u.searchParams.get("ref");
    const nm = u.searchParams.get("name");
    if (ref) setReference(ref);
    if (nm) setName(nm);
  }, []);

  function normalizeRef(s) {
    // Trim & collapse whitespace; keep case as typed
    return s.replace(/\s+/g, " ").trim();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");

    const last = Number(localStorage.getItem("lastVerseAt") || "0");
    const now = Date.now();
    if (now - last < COOLDOWN_MS) {
      const sec = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
      setErr(`Please wait ${sec}s before submitting again.`);
      return;
    }

    const ref = normalizeRef(reference);
    if (!ref || !text.trim()) {
      setErr("Please add both a verse reference and the verse text.");
      return;
    }
    if (text.length > 800) {
      setErr("Verse text is a bit long. Please keep it under 800 characters.");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, "verses"), {
        reference: ref,
        text: text.trim(),
        name: name.trim() || null,
        createdAt: serverTimestamp(),
        ua: navigator.userAgent || null,
      });
      localStorage.setItem("lastVerseAt", String(Date.now()));
      setOk(true);
      setName("");
      setReference("");
      setText("");
    } catch (e) {
      console.error(e);
      setErr("Something went wrong saving your verse. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#070B16] text-white">
      <StyleTokens />
      <AuroraMesh />
      <Starfield />
      <SoftVignette />

      <section className="relative z-10 min-h-dvh flex items-center justify-center px-4 py-8">
        <motion.div
          className="glass ring-glow rounded-3xl w-full max-w-lg p-6 sm:p-8 border border-white/10"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-white/6 border border-white/12 text-[10px] tracking-wide uppercase">
              Submit a Bible Verse
            </div>
            <Link
              href="/"
              className="text-xs text-white/75 hover:text-white underline decoration-white/30"
            >
              Back to Home
            </Link>
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-[-0.02em] grad-text">
            Share your favorite verse
          </h1>
          <p className="mt-2 text-sm text-white/75">
            It may appear on the screen during Bible Study. Keep it respectful and concise.
          </p>

          <AnimatePresence mode="wait">
            {ok ? (
              <motion.div
                key="ok"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-6 rounded-2xl bg-white/8 border border-white/15 p-4"
              >
                <div className="text-sm">
                  <span
                    className="inline-block align-middle h-2 w-2 rounded-full mr-2"
                    style={{ backgroundColor: "#14D1A4" }}
                  />
                  <b>Thank you!</b> Your verse was submitted. You can close this page.
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {err ? (
            <div className="mt-4 text-xs text-red-300 bg-red-400/10 border border-red-400/30 rounded-xl px-3 py-2">
              {err}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <Field label="Your name (optional)">
              <input
                type="text"
                inputMode="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Jordan"
                className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CD4FD]"
              />
            </Field>

            <Field label="Verse reference">
              <input
                type="text"
                inputMode="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g., John 3:16"
                required
                className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CD4FD]"
              />
            </Field>

            <Field label="Verse text">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="For God so loved the world…"
                rows={5}
                required
                maxLength={800}
                className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7CD4FD] resize-y"
              />
              <div className="mt-1 text-[11px] text-white/60">
                {text.length}/800
              </div>
            </Field>

            <motion.button
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -2 }}
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold bg-white/10 border border-white/15 hover:shadow disabled:opacity-60"
              style={{ boxShadow: "0 0 24px rgba(59,160,242,.25)" }}
            >
              {loading ? "Submitting…" : "Submit Verse"}
            </motion.button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-[11px] text-white/60">
            By submitting, you agree that your verse and first name may be shown on the
            projector during the service.
          </div>
        </motion.div>
      </section>

      {/* top glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-white/5 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      />
    </main>
  );
}

/* ——— small components ——— */

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm text-white/85">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

/* ——— visuals & tokens (kept consistent with the home screen) ——— */

function StyleTokens() {
  return (
    <style>{`
      :root{
        --ink-900:#070B16; --ink-800:#0B1020; --ink-100:#EAF0FF;
        --orange-500:#FF7A18; --orange-400:#FF9E3D; --orange-300:#FFB65E;
        --blue-300:#65C7FF; --blue-400:#3BA0F2; --blue-600:#1F6FEB; --violet-500:#7C5CFF;
        --grad-primary: linear-gradient(135deg, #FF7A18 0%, #FFB65E 35%, #65C7FF 70%, #7C5CFF 100%);
      }
      .glass {
        background: rgba(255,255,255,.075);
        border: 1px solid rgba(255,255,255,.12);
        box-shadow: 0 20px 70px rgba(16,35,80,.35), inset 0 1px 0 rgba(255,255,255,.08);
        backdrop-filter: blur(18px);
      }
      .ring-glow { box-shadow: 0 0 60px rgba(59,160,242,.35), 0 0 48px rgba(255,122,24,.22) inset; }
      .grad-text {
        background: var(--grad-primary);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
    `}</style>
  );
}

function AuroraMesh() {
  const ribbons = useMemo(
    () =>
      Array.from({ length: 3 }).map((_, i) => ({
        id: i,
        hueA: i % 2 ? "rgba(124,92,255,.35)" : "rgba(59,160,242,.33)",
        hueB: i % 2 ? "rgba(255,122,24,.28)" : "rgba(101,199,255,.25)",
        rot: i * 20 + (i % 2 ? -10 : 6),
        delay: i * 0.6,
      })),
    []
  );
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {ribbons.map((r) => (
        <motion.div
          key={r.id}
          className="absolute -left-1/4 -right-1/4 h-[36vh] blur-3xl"
          style={{
            top: `${14 + r.id * 22}vh`,
            background: `linear-gradient(90deg, ${r.hueA}, ${r.hueB})`,
            transform: `rotate(${r.rot}deg)`,
            opacity: 0.55,
          }}
          initial={{ x: -40, opacity: 0.2 }}
          animate={{ x: 40, opacity: 0.55 }}
          transition={{ repeat: Infinity, repeatType: "mirror", duration: 12, delay: r.delay }}
        />
      ))}
    </div>
  );
}

function Starfield() {
  const [stars] = useState(() =>
    Array.from({ length: 80 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      s: Math.random() * 1.2 + 0.3,
      d: 2 + Math.random() * 3,
    }))
  );
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {stars.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            background: "rgba(255,255,255,.65)",
            filter: "blur(.5px)",
          }}
          animate={{ opacity: [0.15, 0.6, 0.15] }}
          transition={{ repeat: Infinity, duration: s.d, delay: s.id * 0.02 }}
        />
      ))}
    </div>
  );
}

function SoftVignette() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 0% 0%, rgba(31,111,235,.14), transparent 55%), radial-gradient(120% 100% at 100% 100%, rgba(255,122,24,.16), transparent 55%)",
        }}
      />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,.55)" }} />
    </div>
  );
}
