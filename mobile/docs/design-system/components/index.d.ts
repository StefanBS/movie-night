import * as React from "react";

// ---- Button
/**
 * Pill-shaped action control. `primary` is the ember fill — one per screen,
 * reserved for the main action ("Start the night"). `secondary` is a hairline
 * outline, `ghost` is a quiet text action ("Skip turn"), `danger` is red text.
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** @default false */
  fullWidth?: boolean;
  children?: React.ReactNode;
}

export function Button(props: ButtonProps): JSX.Element;

// ---- IconButton
/**
 * Round, borderless tap target for a single icon (Lucide glyph as children).
 * `filled` adds a subtle surface — used for top-bar actions like Settings.
 */
export interface IconButtonProps {
  children?: React.ReactNode;
  /** @default "md" */
  size?: "sm" | "md";
  /** Accessible label (also the tooltip). */
  label?: string;
  /** @default false */
  filled?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

export function IconButton(props: IconButtonProps): JSX.Element;

// ---- Logomark
/**
 * The Movie Night mark: a calendar page with an ember play button — the film
 * is the plan for the day. Frame uses currentColor; play is --accent.
 * `tile` = dark app-icon tile.
 */
export interface LogomarkProps {
  /** Mark size in px. @default 32 */
  size?: number;
  /** Render on a dark app-icon tile. @default false */
  tile?: boolean;
  style?: React.CSSProperties;
}

export function Logomark(props: LogomarkProps): JSX.Element;

// ---- Avatar
/**
 * Initials chip on the member's signature colour. The colour is derived from
 * the name with the app's hash, so a person is always the same colour.
 * Avatars never mark the picker — that's the name's job.
 */
export interface AvatarProps {
  name?: string;
  /** Keyword or px. sm 28 · md 40 · lg 56. @default "md" */
  size?: "sm" | "md" | "lg" | number;
  style?: React.CSSProperties;
}

export function Avatar(props: AvatarProps): JSX.Element;

// ---- MemberRow
/**
 * The core list row — member, attendee, queue entry. Avatar (or a signature
 * dot when `compact`), name, meta line, trailing slot. `highlighted` marks
 * the picker: heavier, larger name. No rings, fills or glows.
 */
export interface MemberRowProps {
  name: string;
  /** Line under the name, e.g. "2 picks · last May 22". */
  meta?: React.ReactNode;
  /** Trailing content — Badge, count, Toggle, chevron. */
  trailing?: React.ReactNode;
  /** Replace the leading avatar/dot (e.g. a queue number). */
  leading?: React.ReactNode;
  /** @default true */
  showAvatar?: boolean;
  /** Signature dot instead of avatar — dense lists. @default false */
  compact?: boolean;
  /** The picker. @default false */
  highlighted?: boolean;
  /** Inactive member. @default false */
  muted?: boolean;
  /** Hairline beneath. @default true */
  divider?: boolean;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  style?: React.CSSProperties;
}

export function MemberRow(props: MemberRowProps): JSX.Element;

// ---- Poster
/**
 * Film poster. Real TMDB image via `uri`; otherwise (and on error) a tile
 * tinted by `hue`, titled in Newsreader (upright) when tall enough (h ≥ 104).
 */
export interface PosterProps {
  uri?: string | null;
  title?: string;
  year?: string | number;
  /** 0–360, stable per title (the caller derives it). @default 30 */
  hue?: number;
  /** @default 56 */
  w?: number;
  /** @default 84 */
  h?: number;
  style?: React.CSSProperties;
}

export function Poster(props: PosterProps): JSX.Element;

// ---- SectionLabel
/** Small sentence-case group heading ("After Tomas", "Who's coming?"). */
export interface SectionLabelProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

export function SectionLabel(props: SectionLabelProps): JSX.Element;

// ---- SettingsRow
/**
 * Grouped settings row: label, optional value, optional right node
 * (Toggle / chevron). Wrap rows in a card yourself; set `divider` between.
 */
export interface SettingsRowProps {
  label: string;
  value?: string;
  right?: React.ReactNode;
  onClick?: () => void;
  /** @default false */
  disabled?: boolean;
  /** Red label for the danger zone. @default false */
  danger?: boolean;
  /** Hairline beneath. @default false */
  divider?: boolean;
  style?: React.CSSProperties;
}

export function SettingsRow(props: SettingsRowProps): JSX.Element;

// ---- Stat
/** A metric: big tabular number over a small label. `accent` turns the value ember. */
export interface StatProps {
  value: string | number;
  label: string;
  /** @default false */
  accent?: boolean;
  style?: React.CSSProperties;
}

export function Stat(props: StatProps): JSX.Element;

// ---- Badge
/**
 * Small sentence-case status pill — "Next up", "Recorded", "Core", "Guest".
 * `solid` is the filled ember pill, reserved for the picker.
 */
export interface BadgeProps {
  children?: React.ReactNode;
  /** @default "accent" */
  tone?: "accent" | "neutral" | "muted" | "danger" | "success";
  /** Filled ember. @default false */
  solid?: boolean;
  style?: React.CSSProperties;
}

export function Badge(props: BadgeProps): JSX.Element;

// ---- Banner
/** Inline message strip — screen-level errors ("Couldn't load turn order: …") and hints. */
export interface BannerProps {
  children?: React.ReactNode;
  /** @default "info" */
  tone?: "danger" | "info" | "success";
  style?: React.CSSProperties;
}

export function Banner(props: BannerProps): JSX.Element;

// ---- Stepper
/** Wizard progress — segmented bar with labels (Date · People · Movie · Done). */
export interface StepperProps {
  /** Zero-based current step. @default 0 */
  current?: number;
  /** @default ["Date","People","Movie","Done"] */
  steps?: string[];
  style?: React.CSSProperties;
}

export function Stepper(props: StepperProps): JSX.Element;

// ---- Toast
/** Confirmation card shown briefly after a save. Presentational only. */
export interface ToastProps {
  title: string;
  body?: string;
  style?: React.CSSProperties;
}

export function Toast(props: ToastProps): JSX.Element;

// ---- Calendar
/**
 * Month date picker for the "Date" step. Selected day = ember disc, today =
 * ring, days that already have a night = dot. Presentational only.
 */
export interface CalendarProps {
  /** Selected ISO date (YYYY-MM-DD). */
  value?: string;
  /** Today's ISO date. */
  today?: string;
  /** Month shown; `month` is 1–12. */
  month: { year: number; month: number };
  /** ISO dates that already have a night. */
  nightDates?: string[];
  onPick?: (iso: string) => void;
  onMonth?: (dir: -1 | 1) => void;
  style?: React.CSSProperties;
}

export function Calendar(props: CalendarProps): JSX.Element;

// ---- Input
/**
 * Single-line text field — member names, film search. 48px tall, card
 * surface, hairline ring, ember focus ring, red ring when `invalid`.
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "style"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  /** @default false */
  invalid?: boolean;
  disabled?: boolean;
  /** Trailing element, e.g. a Button. */
  addon?: React.ReactNode;
  style?: React.CSSProperties;
}

export function Input(props: InputProps): JSX.Element;

// ---- Toggle
/** 44×26 on/off switch for settings rows. Ember when on. */
export interface ToggleProps {
  value?: boolean;
  onChange?: (next: boolean) => void;
  /** Accessible name. */
  label: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Toggle(props: ToggleProps): JSX.Element;

// ---- TopBar
/**
 * App top bar. `home` (logomark + wordmark + group), `tab` (big left title +
 * serif sub), `title` (centered title + back link, for pushed screens).
 */
export interface TopBarProps {
  /** @default "tab" */
  kind?: "home" | "tab" | "title";
  title?: string;
  /** tab: serif line under the title. */
  sub?: string;
  /** home: the group name. */
  group?: string;
  /** title: back link. */
  back?: { label: string; onClick: () => void };
  right?: React.ReactNode;
  style?: React.CSSProperties;
}

export function TopBar(props: TopBarProps): JSX.Element;

// ---- TabBar
/**
 * Bottom navigation: Tonight · Upcoming · Watched · Club. 24px Lucide icon over
 * a 12px label; active = text-primary + semibold, inactive = text-secondary.
 * Never ember. Settings lives behind the top-bar gear, not here.
 */
export interface TabBarTab {
  id: string;
  label: string;
  /** A built-in icon name ("clapperboard" | "calendar-days" | "library" | "users-round") or your own 24px node. */
  icon: string | React.ReactNode;
}

export interface TabBarProps {
  /** Id of the current tab. @default "tonight" */
  active?: "tonight" | "upcoming" | "watched" | "club" | string;
  /** Called with the tapped tab's id. */
  onChange?: (id: string) => void;
  /** @default Tonight · Upcoming · Watched · Club */
  tabs?: TabBarTab[];
  style?: React.CSSProperties;
}

export function TabBar(props: TabBarProps): JSX.Element;

// ---- UpNextCard
/**
 * Home card for a scheduled night: countdown line, the film title as the
 * headline in upright serif ("Not picked yet." until chosen), a small
 * "Picked by Tomas" credit with the picker's avatar, who's coming, and
 * Start / Edit.
 */
export interface UpNextCardProps {
  /** e.g. "Fri 19 Jun". */
  date?: string;
  /** e.g. "In 3 days", "Tonight". */
  countdown?: string;
  /** e.g. "8 pm". */
  time?: string;
  /** Picker's full name. */
  picker: string;
  /** Film title once chosen: the card's headline. */
  film?: string;
  /** Names of attendees. */
  coming?: string[];
  onStart?: () => void;
  onEdit?: () => void;
  style?: React.CSSProperties;
}

export function UpNextCard(props: UpNextCardProps): JSX.Element;
