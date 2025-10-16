"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import "./firebaseConfig"; // client-side init

export default function Page() {
  const lines = useMemo(
    () => [
      "Welcome to Aftershock Bible Study",
      "To help Students find their true purpose through the Word of God",
      "Reverent fun · communal hype · sacred + playful.",
      "Tap Play to join the game. Use QR as needed.",
    ],
    []
  );

  const [index, setIndex] = useState(0);
  const [qrTab, setQrTab] = useState("new"); // default to "new"

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % lines.length), 2800);
    return () => clearInterval(id);
  }, [lines.length]);

  const qrMeta =
    qrTab === "new"
      ? {
          title: "New Form",
          subtitle: "Scan for if this is your first time here :)",
          img: "/WelcomeCode.png",
          alt: "Aftershock New/Housekeeping Form (Google Form) QR",
        }
      : {
          title: "Game Join (opens /play)",
          subtitle: "Scan to open the Play screen on your phone",
          img: "/GameJoin.png",
          alt: "Aftershock Game Join QR — opens /play",
        };

  const showGameButtons = qrTab === "play";
  const showInSessionBanner = qrTab === "new";

  return (
    <main className="relative min-h-dvh isolate overflow-hidden bg-[#0B1020] text-white">
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

      <AmbientBokeh />
      <GradientFog />

      <section className="relative z-10 min-h-dvh flex items-center justify-center px-4">
        <motion.div
          className="glass ring-glow rounded-3xl w-full max-w-5xl p-6 sm:p-10"
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="grid gap-8 lg:grid-cols-2 items-center">
            {/* Left */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center justify-center lg:justify-start px-4 py-1.5 mb-4 rounded-full bg-white/5 border border-white/10 text-[10px] md:text-xs tracking-wide uppercase">
                ON WICHITA STATE AS IT IS IN HEAVEN
              </div>

              <h1 className="text-5xl md:text-7xl font-semibold tracking-[-0.02em] leading-tight grad-text">
                Welcome to Aftershock <br className="hidden md:block" />
                Bible Study
              </h1>

              <div className="mt-5 h-[32px] md:h-[36px] relative overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={index}
                    className="text-base md:text-lg text-white/80"
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {lines[index]}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Session banner or Action buttons */}
              {showInSessionBanner ? (
                <div className="mt-8">
                  <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 bg-white/8 border border-white/15 text-xs md:text-sm font-semibold tracking-wide">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: "#14D1A4" }}
                    />
                    BIBLE STUDY IS IN SESSION
                  </div>
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto lg:mx-0">
                  {showGameButtons && (
                    <>
                      <LiftButton href="/play" label="Play Game" />
                      <LiftButton href="/admin" label="Admin" variant="ghost" />
                    </>
                  )}
                </div>
              )}

             
            </div>

            {/* Right: QR card with capsule switch */}
            <motion.div
              className="relative mx-auto w-full max-w-sm"
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            >
              <div className="glass rounded-3xl p-6 border border-white/10">
                {/* Capsule switch */}
                <div
                  role="tablist"
                  aria-label="QR mode"
                  className="relative mb-4 grid grid-cols-2 gap-2 p-1 rounded-full bg-white/6 border border-white/10"
                  style={{ background: "rgba(255,255,255,.06)" }}
                >
                  <CapsuleButton
                    selected={qrTab === "new"}
                    onClick={() => setQrTab("new")}
                  >
                    New
                  </CapsuleButton>
                  <CapsuleButton
                    selected={qrTab === "play"}
                    onClick={() => setQrTab("play")}
                  >
                    Game Join
                  </CapsuleButton>
                </div>

                {/* QR frame */}
                <div className="aspect-square rounded-2xl overflow-hidden bg-white/3 border border-white/10 relative">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={qrTab}
                      className="absolute inset-0 p-3"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <Image
                        src={qrMeta.img}
                        alt={qrMeta.alt}
                        width={768}
                        height={768}
                        className="w-full h-full object-contain"
                        priority
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="mt-4 text-center">
                  <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/75 bg-white/5 border border-white/10 rounded-full px-3 py-1">
                    <span>{qrMeta.title}</span>
                  </div>
                  <div className="mt-2 text-sm text-white/80">{qrMeta.subtitle}</div>

                  {qrTab === "play" && (
                    <div className="mt-3">
                      
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

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

function CapsuleButton({ selected, onClick, children }) {
  return (
    <button
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className="relative z-0 flex items-center justify-center rounded-full py-2 text-[12px] font-semibold tracking-wide text-white/90"
    >
      {selected && (
        <motion.span
          layoutId="pill"
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,122,24,.35), rgba(59,160,242,.35))",
          }}
          transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.6 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}

function LiftButton({ href, label, variant = "solid" }) {
  const base =
    "relative inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold tracking-[-0.01em] transition-transform will-change-transform";
  const solid =
    "bg-white/10 border border-white/15 hover:translate-y-[-2px] hover:shadow-xl active:translate-y-[1px]";
  const ghost =
    "bg-transparent border border-white/10 hover:bg-white/5 hover:translate-y-[-2px] active:translate-y-[1px]";

  return (
    <motion.div whileTap={{ scale: 0.98 }} whileHover={{ y: -4 }}>
      <Link
        href={href}
        className={`${base} ${variant === "solid" ? solid : ghost}`}
        style={{ boxShadow: "0 0 40px rgba(59,160,242,.25)" }}
      >
        <span
          className="absolute inset-0 rounded-2xl"
          style={{
            background:
              "radial-gradient(120% 120% at 0% 0%, rgba(255,122,24,.25), transparent 60%)",
          }}
          aria-hidden
        />
        <span className="relative">{label}</span>
      </Link>
    </motion.div>
  );
}

function AmbientBokeh() {
  const dots = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        size: 120 + (i % 5) * 28,
        x: (i * 53) % 100,
        y: (i * 29) % 100,
        delay: (i % 7) * 0.35,
        duration: 10 + (i % 6) * 2.5,
      })),
    []
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
          transition={{
            repeat: Infinity,
            duration: d.duration,
            delay: d.delay,
            ease: "easeInOut",
          }}
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
