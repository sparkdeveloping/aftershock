// app/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import "./firebaseConfig";

import {
  getFirestore,
  collection,
  onSnapshot,
  orderBy,
  limit as fsLimit,
  query,
} from "firebase/firestore";

export default function Page() {
  const db = useMemo(() => getFirestore(), []);
  const [qrTab, setQrTab] = useState("new"); // "new" | "play" | "groupme"
  const [timeStr, setTimeStr] = useState("");

  // live clock
  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      const s = String(d.getSeconds()).padStart(2, "0");
      setTimeStr(`${h}:${m}:${s}`);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // verse feed
  const [verses, setVerses] = useState([]); // [{id,text,reference,name}]
  const [vIx, setVIx] = useState(0);

  useEffect(() => {
    const qV = query(
      collection(db, "verses"),
      orderBy("createdAt", "desc"),
      fsLimit(30)
    );
    const unsub = onSnapshot(qV, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setVerses(rows);
      setVIx(0);
    });
    return () => unsub();
  }, [db]);

  useEffect(() => {
    if (!verses.length) return;
    const id = setInterval(() => setVIx((i) => (i + 1) % verses.length), 8000);
    return () => clearInterval(id);
  }, [verses.length]);

  const v = verses[vIx] || null;

  const qrMeta =
    qrTab === "new"
      ? {
          title: "New Form",
          subtitle: "Scan if this is your first time here :)",
          img: "/WelcomeCode.png",
          alt: "Aftershock New/Housekeeping Form QR",
        }
      : qrTab === "play"
      ? {
          title: "Game Join (opens /play)",
          subtitle: "Scan to open the Play screen on your phone",
          img: "/GameJoin.png",
          alt: "Aftershock Game Join QR — opens /play",
        }
      : {
          title: "GroupMe",
          subtitle: "Scan to join our GroupMe",
          img: "/GroupMe.png",
          alt: "Aftershock GroupMe QR",
        };

  const showGameButtons = qrTab === "play";
  const showInSessionBanner = qrTab === "new";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#070B16] text-white">
      <StyleTokens />
      <AuroraLayers />
      <StarsEnhanced />
      <SoftVignette />

      {/* CONTENT: two-column, perfectly centered */}
      <section className="relative z-10 h-full max-w-6xl mx-auto px-4 grid items-center"
        style={{ gridTemplateColumns: "1.05fr 0.95fr" }}>
        {/* LEFT: headline & chips */}
        <div className="flex flex-col items-start justify-center">
          <div className="w-full flex items-center justify-between gap-3 mb-4">
            <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-white/6 border border-white/12 text-[10px] md:text-xs tracking-wide uppercase">
              ON WICHITA STATE AS IT IS IN HEAVEN
            </div>
            <TimeBadge timeStr={timeStr} />
          </div>

          <h1 className="text-5xl md:text-7xl font-semibold tracking-[-0.02em] leading-tight grad-text">
            Welcome to <span className="whitespace-nowrap">Aftershock Bible Study</span>
          </h1>

          <p className="mt-4 text-white/85 text-base md:text-lg">
            Reverent fun · communal hype · sacred + playful.
          </p>

          <div className="mt-6">
            {showInSessionBanner ? (
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-white/8 border border-white/15 text-xs md:text-sm font-semibold tracking-wide">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#14D1A4" }} />
                BIBLE STUDY IS IN SESSION
              </div>
            ) : showGameButtons ? (
              <div className="grid grid-cols-2 gap-3">
                <LiftButton href="/play" label="Play Game" />
                <LiftButton href="/admin" label="Admin" variant="ghost" />
              </div>
            ) : null}
          </div>

          {/* Instagram handle */}
          <div className="mt-8 inline-flex items-center gap-2 text-white/85">
            <InstagramIcon />
            <a
              href="https://instagram.com/wsuaftershock"
              target="_blank"
              rel="noreferrer"
              className="font-semibold hover:underline"
            >
              @wsuaftershock
            </a>
          </div>
        </div>

        {/* RIGHT: QR card */}
        <motion.div
          className="justify-self-center w-full max-w-md"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="glass ring-glow rounded-3xl border border-white/10 p-6">
            {/* tabs */}
            <div
              role="tablist"
              aria-label="QR mode"
              className="relative mb-4 grid grid-cols-3 gap-2 p-1 rounded-full bg-white/6 border border-white/10"
            >
              <CapsuleButton selected={qrTab === "new"} onClick={() => setQrTab("new")}>New</CapsuleButton>
              <CapsuleButton selected={qrTab === "play"} onClick={() => setQrTab("play")}>Game Join</CapsuleButton>
              <CapsuleButton selected={qrTab === "groupme"} onClick={() => setQrTab("groupme")}>GroupMe</CapsuleButton>
            </div>

            {/* QR */}
            <div className="aspect-square rounded-2xl overflow-hidden bg-white/3 border border-white/10 relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={qrTab}
                  className="absolute inset-0 p-3"
                  initial={{ opacity: 0, scale: 0.975, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.985, y: -8 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Image
                    src={qrMeta.img}
                    alt={qrMeta.alt}
                    width={896}
                    height={896}
                    className="w-full h-full object-contain"
                    priority
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* label */}
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/80 bg-white/6 border border-white/12 rounded-full px-3 py-1">
                <span>{qrMeta.title}</span>
              </div>
              <div className="mt-2 text-sm text-white/85">{qrMeta.subtitle}</div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* VERSE BAR — small BibleVerse QR + rotating verse */}
      <div className="fixed left-0 right-0 bottom-0 z-10 px-4 pb-4">
        <motion.div
          className="mx-auto w-full max-w-6xl rounded-2xl bg-white/7 border border-white/12 backdrop-blur-md"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.45 }}
        >
          <div className="flex items-center gap-4 p-3">
            {/* small QR */}
            <div className="flex items-center gap-2 pl-1 pr-3">
              <div className="rounded-xl overflow-hidden border border-white/14 bg-white/10">
                <Image
                  src="/BibleVerseQR.png"  // <-- your saved filename
                  width={64}
                  height={64}
                  alt="Bible Verse QR"
                />
              </div>
              <div className="text-[11px] uppercase tracking-wide text-white/85">
                Verses
              </div>
            </div>

            {/* verse text */}
            <div className="flex-1 min-h-[22px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={v ? v.id : "empty"}
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -10, opacity: 0 }}
                  transition={{ duration: 0.35 }}
                  className="text-sm md:text-base text-white/92"
                >
                  {v ? (
                    <span>
                      “{v.text || "—"}”
                      {v.reference ? <span className="opacity-85"> — {v.reference}</span> : null}
                      {v.name ? <span className="opacity-70"> · {v.name}</span> : null}
                    </span>
                  ) : (
                    <span className="opacity-85">Share a verse anytime — scan the QR.</span>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="pr-2">
              <Link
                href="/verse"
                className="text-[11px] font-semibold uppercase tracking-wide text-white/85 hover:text-white underline decoration-white/30"
              >
                Open /verse
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {/* top soft glow */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-white/5 to-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      />
    </main>
  );
}

/* ───────────── atoms ───────────── */

function TimeBadge({ timeStr }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 bg-white/6 border border-white/12 text-[11px] font-semibold tracking-wide tabular-nums">
      <span className="opacity-85">Time</span>
      <span className="opacity-95">{timeStr || "—:—:—"}</span>
    </div>
  );
}

function CapsuleButton({ selected, onClick, children }) {
  return (
    <motion.button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.7 }}
      className="relative z-0 flex items-center justify-center rounded-full py-2 text-[12px] font-semibold tracking-wide text-white/92"
    >
      {selected && (
        <motion.span
          layoutId="pill"
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,122,24,.38), rgba(59,160,242,.38))",
          }}
          transition={{ type: "spring", stiffness: 360, damping: 26, mass: 0.7 }}
        />
      )}
      <span className="relative px-2">{children}</span>
    </motion.button>
  );
}

function LiftButton({ href, label, variant = "solid" }) {
  const base =
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold tracking-[-0.01em] transition-transform will-change-transform";
  const solid =
    "bg-white/10 border border-white/15 hover:translate-y-[-2px] hover:shadow-xl active:translate-y-[1px]";
  const ghost =
    "bg-transparent border border-white/10 hover:bg-white/6 hover:translate-y-[-2px] active:translate-y-[1px]";
  return (
    <motion.div whileHover={{ y: -4, scale: 1.02 }} whileTap={{ scale: 0.985 }}>
      <Link
        href={href}
        className={`${base} ${variant === "solid" ? solid : ghost}`}
        style={{ boxShadow: "0 0 40px rgba(59,160,242,.28)" }}
      >
        <span
          className="absolute inset-0 rounded-2xl"
          style={{ background: "radial-gradient(120% 120% at 0% 0%, rgba(255,122,24,.25), transparent 60%)" }}
          aria-hidden
        />
        <span className="relative">{label}</span>
      </Link>
    </motion.div>
  );
}

function InstagramIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="opacity-90" aria-hidden>
      <path
        fill="currentColor"
        d="M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10Zm0-5c3 0 3.36.01 4.54.07c1.17.06 1.97.24 2.66.51c.72.28 1.33.66 1.93 1.26c.6.6.98 1.21 1.26 1.93c.27.69.45 1.49.51 2.66C23 9.64 23 10 23 13s-.01 3.36-.07 4.54c-.06 1.17-.24 1.97-.51 2.66c-.28.72-.66 1.33-1.26 1.93c-.6.6-1.21.98-1.93 1.26c-.69.27-1.49.45-2.66.51C15.36 24 15 24 12 24s-3.36-.01-4.54-.07c-1.17-.06-1.97-.24-2.66-.51c-.72-.28-1.33-.66-1.93-1.26c-.6-.6-.98-1.21-1.26-1.93c-.27-.69-.45-1.49-.51-2.66C1 16.36 1 16 1 13s.01-3.36.07-4.54c.06-1.17.24-1.97.51-2.66c.28-.72.66-1.33 1.26-1.93c.6-.6 1.21-.98 1.93-1.26c.69-.27 1.49-.45 2.66-.51C8.64 2 9 2 12 2Zm0 3.5a6.5 6.5 0 1 1 0 13a6.5 6.5 0 0 1 0-13Zm6.75-.5a1.25 1.25 0 1 0 0 2.5a1.25 1.25 0 0 0 0-2.5Z"
      />
    </svg>
  );
}

/* ───────────── visuals ───────────── */

function StyleTokens() {
  return (
    <style>{`
      :root{
        --ink-900:#070B16; --ink-800:#0B1020; --ink-100:#EAF0FF;
        --orange-500:#FF7A18; --orange-400:#FF9E3D; --orange-300:#FFB65E;
        --blue-300:#65C7FF; --blue-400:#3BA0F2; --blue-600:#1F6FEB; --blue-700:#0E4CC5; --violet-500:#7C5CFF;
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

function AuroraLayers() {
  const ribbons = useMemo(
    () =>
      Array.from({ length: 4 }).map((_, i) => ({
        id: i,
        hueA: i % 2 ? "rgba(124,92,255,.34)" : "rgba(59,160,242,.32)",
        hueB: i % 2 ? "rgba(255,122,24,.27)" : "rgba(101,199,255,.24)",
        rot: i * 18 + (i % 2 ? -10 : 8),
        delay: i * 0.55,
      })),
    []
  );

  const orbs = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, i) => ({
        id: i,
        size: 220 + (i % 5) * 60,
        left: `${(i * 9) % 100}%`,
        top: `${(i * 13) % 100}%`,
        dur: 18 + (i % 6) * 4,
        del: (i % 7) * 0.8,
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
            top: `${12 + r.id * 18}vh`,
            background: `linear-gradient(90deg, ${r.hueA}, ${r.hueB})`,
            transform: `rotate(${r.rot}deg)`,
            opacity: 0.55,
          }}
          initial={{ x: -40, opacity: 0.2 }}
          animate={{ x: 40, opacity: 0.55 }}
          transition={{ repeat: Infinity, repeatType: "mirror", duration: 12, delay: r.delay }}
        />
      ))}
      {orbs.map((o) => (
        <motion.span
          key={o.id}
          className="absolute rounded-full blur-[80px]"
          style={{
            width: o.size,
            height: o.size,
            left: o.left,
            top: o.top,
            background:
              o.id % 2 === 0
                ? "radial-gradient(circle at 30% 30%, rgba(59,160,242,.32), rgba(59,160,242,0))"
                : "radial-gradient(circle at 70% 70%, rgba(255,122,24,.30), rgba(255,122,24,0))",
          }}
          initial={{ y: 0, opacity: 0.5 }}
          animate={{ y: [0, -22, 0], opacity: [0.45, 0.7, 0.45] }}
          transition={{ repeat: Infinity, duration: o.dur, delay: o.del, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function StarsEnhanced() {
  const small = useMemo(
    () =>
      Array.from({ length: 140 }).map((_, i) => ({
        id: `s${i}`,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 1.2 + 0.3,
        d: 2 + Math.random() * 3,
      })),
    []
  );
  const glows = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: `g${i}`,
        x: Math.random() * 100,
        y: Math.random() * 100,
        s: Math.random() * 2.4 + 1.2,
        d: 3 + Math.random() * 4,
      })),
    []
  );

  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      {small.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            background: "rgba(255,255,255,.75)",
            filter: "blur(.3px)",
          }}
          animate={{ opacity: [0.15, 0.85, 0.15] }}
          transition={{ repeat: Infinity, duration: s.d, delay: (parseInt(s.id.slice(1)) % 25) * 0.08 }}
        />
      ))}
      {glows.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.s,
            height: s.s,
            background:
              "radial-gradient(circle, rgba(255,255,255,.9) 0%, rgba(255,255,255,.45) 35%, rgba(255,255,255,0) 70%)",
            filter: "blur(1.2px)",
          }}
          animate={{ opacity: [0.3, 0.95, 0.3], scale: [0.9, 1.08, 0.9] }}
          transition={{ repeat: Infinity, duration: s.d + 2, delay: (parseInt(s.id.slice(1)) % 24) * 0.12 }}
        />
      ))}
      <ShootingStar />
    </div>
  );
}

function ShootingStar() {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setKey((k) => k + 1), 9000 + Math.random() * 4000);
    return () => clearInterval(id);
  }, []);
  const sx = -10 + Math.random() * 30;
  const sy = 5 + Math.random() * 40;
  const ex = sx + 70 + Math.random() * 20;
  const ey = sy + 20 + Math.random() * 10;

  return (
    <motion.span
      key={key}
      className="absolute h-[2px] w-[120px] rounded-full"
      style={{
        left: `${sx}%`,
        top: `${sy}%`,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,.9) 55%, rgba(255,255,255,0) 100%)",
        filter: "blur(.3px)",
      }}
      initial={{ opacity: 0 }}
      animate={{ x: `${ex - sx}%`, y: `${ey - sy}%`, opacity: [0, 1, 0] }}
      transition={{ duration: 1.6, ease: "easeOut" }}
    />
  );
}

function SoftVignette() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 0% 0%, rgba(31,111,235,.16), transparent 55%), radial-gradient(120% 100% at 100% 100%, rgba(255,122,24,.18), transparent 55%)",
        }}
      />
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 220px rgba(0,0,0,.55)" }} />
    </div>
  );
}
