'use client';

import {
  forwardRef,
  memo,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';
import { gsap } from 'gsap';
import { LOGO_PARTS, LOGO_SOURCE } from './logo-data';
import { LOGO_LAYOUT, SYMBOL_OCCLUSION, SYMBOL_ROUTES, VIEW_BOX } from './geometry';
import { EDITION } from '../../lib/brand';
import symbolSvg from '../../../public/rairio-symbol.svg?raw';
import { LOGO_MOTION } from './timing';
import { createLogoTimeline, showFinalLogo } from './timeline';
import styles from './LogoAnimation.module.css';
import { Trademark } from '../Trademark';

export interface LogoAnimationHandle {
  restart: () => void;
  pause: () => void;
  play: () => void;
  /** Seek to a normalized position (0–1) and pause playback. */
  seek: (progress: number) => void;
}

export interface LogoAnimationProps {
  className?: string;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  /** Total seconds for drawing and assembling the lockup, excluding delay. Default: 2.7. */
  duration?: number;
  /** Seconds before playback. */
  delay?: number;
  /** False renders the completed logo without creating a timeline. */
  autoplay?: boolean;
  color?: string;
  decorative?: boolean;
  label?: string;
  /** Once per playback; also called for static/reduced-motion rendering. */
  onComplete?: () => void;
}

const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const frontContour = symbolSvg.match(/<path id="rairio-symbol-front" d="([^"]+)"/)![1];

export const LogoAnimation = memo(
  forwardRef<LogoAnimationHandle, LogoAnimationProps>(function LogoAnimation(
    {
      className = '',
      width = 360,
      height,
      duration = LOGO_MOTION.duration,
      delay = 0,
      autoplay = true,
      color = '#000000',
      decorative = false,
      label = `${LOGO_SOURCE.label} ${EDITION}`,
      onComplete,
    },
    ref,
  ) {
    const svgRef = useRef<SVGSVGElement>(null);
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const completeRef = useRef(onComplete);
    const reportedRef = useRef(false);
    completeRef.current = onComplete;
    const id = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const symbolMarkup = useMemo(() => {
      const inner = symbolSvg.slice(symbolSvg.indexOf('<defs>'), symbolSvg.lastIndexOf('</svg>'));
      return inner
        .replaceAll('rairio-symbol-', id + '-symbol-')
        .replace(
          '<g id="' + id + '-symbol-back-layer"',
          '<g mask="url(#' + id + '-rear-reveal)" id="' + id + '-symbol-back-layer"',
        )
        .replace(
          '<g id="' + id + '-symbol-front-layer"',
          '<g mask="url(#' + id + '-front-reveal)" id="' + id + '-symbol-front-layer"',
        );
    }, [id]);

    useImperativeHandle(
      ref,
      () => ({
        restart() {
          if (!timelineRef.current) return;
          reportedRef.current = false;
          if (svgRef.current) svgRef.current.dataset.state = 'playing';
          timelineRef.current.restart(true);
        },
        pause() {
          if (!timelineRef.current) return;
          timelineRef.current.pause();
          if (svgRef.current) svgRef.current.dataset.state = 'paused';
        },
        play() {
          if (!timelineRef.current) return;
          timelineRef.current.play();
          if (svgRef.current && timelineRef.current.progress() < 1) {
            svgRef.current.dataset.state = 'playing';
          }
        },
        seek(progress) {
          if (!timelineRef.current || !Number.isFinite(progress)) return;
          const value = Math.max(0, Math.min(1, progress));
          timelineRef.current.pause().progress(value);
          if (svgRef.current) svgRef.current.dataset.state = value < 1 ? 'paused' : 'complete';
        },
      }),
      [],
    );

    useBrowserLayoutEffect(() => {
      const svg = svgRef.current!;
      const complete = () => {
        svg.dataset.state = 'complete';
        if (reportedRef.current) return;
        reportedRef.current = true;
        completeRef.current?.();
      };
      const media = gsap.matchMedia();
      media.add(
        {
          reduce: '(prefers-reduced-motion: reduce)',
          normal: '(prefers-reduced-motion: no-preference)',
        },
        (match) => {
          if (match.conditions?.reduce || !autoplay) {
            showFinalLogo(svg);
            complete();
            return;
          }
          reportedRef.current = false;
          const timeline = createLogoTimeline(svg, {
            duration: Number.isFinite(duration) ? Math.max(0.2, duration) : LOGO_MOTION.duration,
            delay: Number.isFinite(delay) ? Math.max(0, delay) : 0,
            onComplete: complete,
          });
          timelineRef.current = timeline;
          svg.dataset.state = delay > 0 ? 'waiting' : 'playing';
          timeline.play();
          return () => {
            timeline.kill();
            timelineRef.current = null;
          };
        },
        svg,
      );
      return () => {
        media.revert();
        timelineRef.current = null;
      };
    }, [autoplay, delay, duration]);

    return (
      <svg
        ref={svgRef}
        className={`${styles.logo} ${className}`.trim()}
        viewBox={VIEW_BOX}
        width={LOGO_LAYOUT.canvasWidth}
        height={LOGO_LAYOUT.canvasHeight}
        style={
          {
            width,
            height: height ?? 'auto',
            color,
            visibility: autoplay ? undefined : 'visible',
            '--logo-left-inset': `${(40 / LOGO_LAYOUT.canvasWidth) * 100}%`,
          } as CSSProperties
        }
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative ? true : undefined}
        focusable="false"
        data-logo-animation=""
        data-state="initial"
      >
        <defs>
          <radialGradient id={`${id}-tip-atmosphere`}>
            <stop offset="0" stopColor="#edfcff" stopOpacity=".95" />
            <stop offset=".25" stopColor="#b5f3ff" stopOpacity=".8" />
            <stop offset=".6" stopColor="#55d5ff" stopOpacity=".4" />
            <stop offset=".85" stopColor="#32baff" stopOpacity=".15" />
            <stop offset="1" stopColor="#32baff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`${id}-tip-back-occlusion`} clipPathUnits="userSpaceOnUse">
            <path
              d={`M335 123H1085V599H335Z ${frontContour}`}
              clipRule="evenodd"
              fillRule="evenodd"
            />
          </clipPath>
          <filter
            id={`${id}-tip-light`}
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="tipNear" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" result="tipWide" />
            <feMerge>
              <feMergeNode in="tipWide" />
              <feMergeNode in="tipWide" />
              <feMergeNode in="tipNear" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <mask
            id={`${id}-word-occlusion`}
            maskUnits="userSpaceOnUse"
            x={LOGO_LAYOUT.symbolX - 140}
            y="-140"
            width={LOGO_LAYOUT.canvasWidth + 280}
            height={LOGO_LAYOUT.canvasHeight + 280}
            style={{ maskType: 'luminance' }}
          >
            <rect
              x={LOGO_LAYOUT.symbolX - 140}
              y="-140"
              width={LOGO_LAYOUT.canvasWidth + 280}
              height={LOGO_LAYOUT.canvasHeight + 280}
              fill="white"
            />
            <g data-word-occluder="">
              <rect
                data-word-occlusion-guard=""
                x={LOGO_LAYOUT.symbolX - 140}
                y="-140"
                width={LOGO_LAYOUT.symbolWidth + 160}
                height={LOGO_LAYOUT.stackHeight + 280}
                fill="black"
              />
              <svg
                x={LOGO_LAYOUT.symbolX}
                y="0"
                width={LOGO_LAYOUT.symbolWidth}
                height={LOGO_LAYOUT.stackHeight}
                viewBox="6 10 467 196"
              >
                <path
                  data-word-occlusion-shape=""
                  d={SYMBOL_OCCLUSION}
                  transform="translate(-469 -253)"
                  fill="black"
                  stroke="black"
                  strokeWidth="6"
                  strokeLinejoin="round"
                />
              </svg>
            </g>
          </mask>
          <filter
            id={`${id}-bloom`}
            filterUnits="userSpaceOnUse"
            x="-140"
            y="-140"
            width="760"
            height="496"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="10" result="nearBloom" />
            <feFlood
              floodColor="#6ed5ff"
              floodOpacity=".85"
              data-symbol-glow-base=".85"
              result="nearTint"
            />
            <feComposite in="nearTint" in2="nearBloom" operator="in" result="nearLight" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="26" result="farBloom" />
            <feFlood
              floodColor="#42bfff"
              floodOpacity=".65"
              data-symbol-glow-base=".65"
              result="farTint"
            />
            <feComposite in="farTint" in2="farBloom" operator="in" result="farLight" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="48" result="ambientBloom" />
            <feFlood
              floodColor="#269de8"
              floodOpacity=".35"
              data-symbol-glow-base=".35"
              result="ambientTint"
            />
            <feComposite in="ambientTint" in2="ambientBloom" operator="in" result="ambientLight" />
            <feGaussianBlur in="SourceAlpha" stdDeviation="18" result="closingBloom" />
            <feFlood
              floodColor="#c4f1ff"
              floodOpacity="0"
              data-symbol-flash=""
              result="closingTint"
            />
            <feComposite in="closingTint" in2="closingBloom" operator="in" result="closingLight" />
            <feMerge result="bloom">
              <feMergeNode in="ambientLight" />
              <feMergeNode in="farLight" />
              <feMergeNode in="nearLight" />
              <feMergeNode in="closingLight" />
            </feMerge>
            <feComposite in="bloom" in2="SourceAlpha" operator="out" result="outerLight" />
            <feMerge>
              <feMergeNode in="outerLight" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {['front', 'rear'].map((layer) => (
            <mask
              key={layer}
              id={id + '-' + layer + '-reveal'}
              maskUnits="userSpaceOnUse"
              x="465"
              y="253"
              width="490"
              height="216"
              style={{ maskType: 'alpha' }}
            >
              {SYMBOL_ROUTES.filter((route) =>
                layer === 'rear' ? route.part.startsWith('rear') : route.part === 'front',
              ).map((route) => (
                <path
                  key={route.part}
                  data-symbol-trace={route.part}
                  d={route.d}
                  fill="none"
                  stroke="white"
                  strokeWidth="64"
                  strokeLinecap="round"
                />
              ))}
            </mask>
          ))}
        </defs>
        <g mask={`url(#${id}-word-occlusion)`}>
          <g
            data-final-logo=""
            data-wordmark=""
            opacity={autoplay ? 0 : 1}
            visibility={autoplay ? 'hidden' : 'visible'}
          >
            {LOGO_PARTS.map((part) => (
              <path
                key={part.id}
                d={part.d}
                data-logo-fill=""
                data-logo-part={part.id}
                fill="currentColor"
              />
            ))}
            <Trademark
              x={LOGO_LAYOUT.trademarkX}
              y={LOGO_LAYOUT.trademarkY}
              height={LOGO_LAYOUT.trademarkHeight}
            />
          </g>
        </g>
        <g data-symbol-position="">
          <svg
            x={LOGO_LAYOUT.symbolX}
            y="0"
            width={LOGO_LAYOUT.symbolWidth}
            height={LOGO_LAYOUT.stackHeight}
            viewBox="6 10 467 196"
            aria-hidden="true"
            style={{ overflow: 'visible' }}
          >
            <g
              data-symbol-art=""
              fill="none"
              filter={`url(#${id}-bloom)`}
              dangerouslySetInnerHTML={{ __html: symbolMarkup }}
            />
            <g transform="translate(-469 -253)" pointerEvents="none">
              <g data-tip-depth="" data-back-mask={`url(#${id}-tip-back-occlusion)`}>
                <g data-symbol-tip="" opacity="0" filter={`url(#${id}-tip-light)`}>
                  <g data-tip-atmosphere="" opacity=".8">
                    <circle cx="26" r="88" fill={`url(#${id}-tip-atmosphere)`} opacity=".5" />
                    <circle cx="26" r="55" fill={`url(#${id}-tip-atmosphere)`} />
                  </g>
                  {['rear', 'front'].map((layer) => (
                    <g
                      key={layer}
                      data-tip-surface={layer}
                      clipPath={`url(#${id}-symbol-${layer === 'rear' ? 'back' : 'front'}-clip)`}
                      mask={`url(#${id}-${layer}-reveal)`}
                    >
                      <g>
                        <g data-tip-plane="" fill="none" opacity=".8">
                          <path d="M0 -31 A31 31 0 0 1 0 31" stroke="#7deaff" strokeWidth="28" />
                          <path d="M0 -31 A31 31 0 0 1 0 31" stroke="#e5faff" strokeWidth="5" />
                        </g>
                      </g>
                    </g>
                  ))}
                </g>
              </g>
            </g>
          </svg>
        </g>
        <g data-edition-stage="" opacity={autoplay ? 0 : 1}>
          <text
            data-logo-edition=""
            x="0"
            y={LOGO_LAYOUT.editionBaseline}
            fontSize={LOGO_LAYOUT.editionFontSize}
            fontFamily="inherit"
            fontWeight="400"
            letterSpacing="0.02em"
            fill="currentColor"
            opacity={autoplay ? 0 : 1}
            visibility={autoplay ? 'hidden' : 'visible'}
            aria-hidden="true"
          >
            {EDITION}
          </text>
        </g>
      </svg>
    );
  }),
);

export default LogoAnimation;
