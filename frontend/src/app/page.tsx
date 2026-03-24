import Image from "next/image";
import Countdown from "@/components/Countdown";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[hsl(190,50%,97%)] to-[hsl(190,50%,88%)] dark:from-[hsl(215,28%,8%)] dark:to-[hsl(215,28%,14%)] px-6 text-center">
      <div className="flex flex-col items-center gap-8 max-w-lg">
        {/* Logo */}
        <Image
          src="/logo.png"
          alt="Mon Assistant Kiné"
          width={140}
          height={140}
          priority
          className="drop-shadow-lg"
        />

        {/* Nom */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[hsl(190,50%,30%)] dark:text-[hsl(190,60%,70%)]">
          Mon Assistant Kiné
        </h1>

        {/* Accroche */}
        <p className="text-lg sm:text-xl text-[hsl(215,20%,40%)] dark:text-[hsl(210,40%,75%)] leading-relaxed">
          L&apos;intelligence artificielle au service de votre pratique.
        </p>

        {/* Compte à rebours */}
        <div className="mt-4 rounded-2xl border border-[hsl(190,50%,75%)] dark:border-[hsl(190,60%,30%)] bg-white/60 dark:bg-white/5 backdrop-blur-sm px-8 py-5 shadow-sm">
          <p className="text-sm uppercase tracking-widest text-[hsl(190,50%,45%)] dark:text-[hsl(190,60%,50%)] font-semibold mb-3">
            Lancement le 22 avril 2026
          </p>
          <Countdown />
        </div>

        {/* Séparateur subtil */}
        <div className="w-16 h-px bg-[hsl(190,50%,70%)] dark:bg-[hsl(190,60%,30%)]" />

        <p className="text-sm text-[hsl(215,20%,55%)] dark:text-[hsl(210,40%,60%)]">
          Restez connectés.
        </p>
      </div>
    </div>
  );
}
