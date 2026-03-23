"use client";

import { useEffect, useState } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  className?: string;
  formatter?: (value: number) => string;
}

export function AnimatedNumber({ value, className, formatter }: AnimatedNumberProps) {
  const reduceMotion = !!useReducedMotion();
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, {
    stiffness: 120,
    damping: 20,
    mass: 0.35
  });

  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }

    motionValue.set(value);
  }, [motionValue, reduceMotion, value]);

  useEffect(() => {
    if (reduceMotion) return;

    const unsubscribe = spring.on("change", (latest) => {
      setDisplay(Math.round(latest));
    });

    return unsubscribe;
  }, [reduceMotion, spring]);

  return <span className={className}>{formatter ? formatter(display) : display}</span>;
}
