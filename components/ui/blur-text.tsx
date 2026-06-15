'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, Variants } from 'framer-motion';

interface BlurTextProps {
  text: string;
  className?: string;
  delay?: number;
  stepDuration?: number;
  animateBy?: 'words' | 'chars';
}

export function BlurText({
  text,
  className = '',
  delay = 0,
  stepDuration = 0.08,
  animateBy = 'words',
}: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });
  const tokens = animateBy === 'words' ? text.split(' ') : text.split('');

  const variants: Variants = {
    hidden: { opacity: 0, filter: 'blur(12px)', y: 8 },
    visible: (i: number) => ({
      opacity: 1,
      filter: 'blur(0px)',
      y: 0,
      transition: {
        delay: delay + i * stepDuration,
        duration: 0.55,
        ease: [0.22, 1, 0.36, 1],
      },
    }),
  };

  return (
    <span ref={ref} className={className} aria-label={text}>
      {tokens.map((token, i) => (
        <motion.span
          key={i}
          custom={i}
          variants={variants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="inline-block"
          style={{ whiteSpace: animateBy === 'words' ? undefined : 'pre' }}
        >
          {token}
          {animateBy === 'words' && i < tokens.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </span>
  );
}
