import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import logo from "@/assets/bot-logo.png";

export function SplashScreen() {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(false), 3000);
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 100 ? prev + 1.5 : 100));
    }, 30);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.8, ease: [0.43, 0.13, 0.23, 0.96] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background overflow-hidden"
        >
          {/* Background Ambient Glow */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-primary/10 rounded-full blur-[80px]" />
          </div>

          <div className="relative flex flex-col items-center">
            {/* Logo with Animated Rings */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="relative mb-16"
            >
              {/* Pulsing Rings */}
              {[...Array(3)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ 
                    opacity: [0, 0.2, 0],
                    scale: [1, 1.5 + i * 0.2, 2],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 0.8,
                    ease: "easeOut"
                  }}
                  className="absolute inset-[-10px] rounded-full border border-primary/40 pointer-events-none"
                />
              ))}

              {/* Inner Rotating Ring */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[-15px] rounded-full border border-dashed border-primary/20"
              />

              {/* Main Logo Container */}
              <div className="relative h-32 w-32 flex items-center justify-center bg-transparent rounded-3xl overflow-hidden">
                <motion.div
                  animate={{ 
                    y: [0, -5, 0],
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                >
                  <img
                    src={logo}
                    alt="BOT Logo"
                    className="h-24 w-24 object-contain"
                    style={{ mixBlendMode: "multiply" }}
                  />
                </motion.div>
              </div>
            </motion.div>

            {/* Brand text with Glow */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mb-10 flex flex-col items-center"
            >
              <h2 className="text-[16px] font-bold tracking-[0.8em] text-primary uppercase drop-shadow-[0_0_15px_rgba(var(--primary),0.5)]">
                Be On Time
              </h2>
            </motion.div>

            {/* Premium Progress Bar */}
            <div className="relative w-64">
              <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40 backdrop-blur-sm border border-white/5 dark:border-white/10">
                <motion.div
                  className="absolute left-0 top-0 h-full bg-gradient-primary shadow-glow"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>
              
              {/* Progress Percentage */}
              <div className="absolute -bottom-6 left-0 right-0 flex justify-center">
                <span className="text-[9px] font-bold text-primary/60 tabular-nums">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
          </div>

          {/* Footer Copyright */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 1 }}
            className="absolute bottom-10 flex flex-col items-center gap-2"
          >
            <div className="h-px w-8 bg-primary/20" />
            <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-[0.3em]">
              © {new Date().getFullYear()} BE ON TIME Platform
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}