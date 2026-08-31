/**
 * Every string on the marketing site lives here. Sections import from this
 * file so copy changes never require touching layout code. The brand itself
 * lives one level down, in `brand.ts`, which the logo and metadata also read.
 */

import { brand } from "@/lib/brand";

export const site = {
  name: brand.name,
  tagline: brand.tagline,
  description: brand.description,
} as const;

export type NavChild = {
  label: string;
  description: string;
  href: string;
};

export type NavItem = {
  label: string;
  href?: string;
  children?: NavChild[];
};

/**
 * The header dropdowns hold *content*, not navigation. Each panel states
 * something concrete — what a plan costs, which address to write to — so the
 * menu answers the question rather than deferring it to another page. That is
 * why nothing inside a panel is a link.
 *
 * `kind` selects the renderer in `site-header.tsx`.
 */
export type HeaderMenu =
  | {
      label: string;
      kind: "about";
      heading: string;
      body: string;
      facts: readonly { value: string; label: string }[];
    }
  | {
      label: string;
      kind: "capabilities";
      items: readonly { title: string; body: string }[];
    }
  | {
      label: string;
      kind: "steps";
      steps: readonly { number: string; title: string; body: string }[];
    }
  | {
      label: string;
      kind: "pricing";
      plans: readonly {
        name: string;
        price: string;
        cadence: string;
        note: string;
      }[];
      footnote: string;
    }
  | {
      label: string;
      kind: "contact";
      details: readonly { label: string; value: string; note: string }[];
      footnote: string;
    };

export const headerMenus: readonly HeaderMenu[] = [
  {
    label: "About Us",
    kind: "about",
    heading: "We build for understanding, not memorising.",
    body: "Interactive Learning started with a stubborn observation: students who re-read a chapter four times still cannot explain it. Structure is what makes an idea stick, so we build the structure.",
    facts: [
      { value: "2024", label: "Founded" },
      { value: "240k", label: "Maps built this term" },
      { value: "41", label: "Subjects covered" },
    ],
  },
  {
    label: "Platform",
    kind: "capabilities",
    items: [
      {
        title: "Concept maps",
        body: "Any reading turned into a structure you can walk through, expand, and collapse.",
      },
      {
        title: "Animated walkthroughs",
        body: "Long derivations become frames you can scrub, pausing on any single step.",
      },
      {
        title: "Adaptive recall",
        body: "Questions drawn from the parts of your map you keep skipping, then spaced out.",
      },
      {
        title: "Shared canvases",
        body: "One diagram, the whole study group, updating live as people work on it.",
      },
    ],
  },
  {
    label: "How it works",
    kind: "steps",
    steps: [
      {
        number: "01",
        title: "Bring your material",
        body: "PDFs, slide decks, lecture recordings, or pasted notes.",
      },
      {
        number: "02",
        title: "Watch it become a map",
        body: "Ideas become nodes and relationships become edges, in seconds.",
      },
      {
        number: "03",
        title: "Move through it",
        body: "Explore, animate, question, and practise what you find.",
      },
      {
        number: "04",
        title: "Track what sticks",
        body: "The map records which concepts have landed and which have not.",
      },
    ],
  },
  {
    label: "Pricing",
    kind: "pricing",
    plans: [
      {
        name: "Student",
        price: "$0",
        cadence: "forever",
        note: "5 maps a month, and every core feature.",
      },
      {
        name: "Scholar",
        price: "$12",
        cadence: "per month",
        note: "Unlimited maps and shared canvases for 8.",
      },
      {
        name: "Institution",
        price: "$7",
        cadence: "per seat / month",
        note: "Cohort analytics, SSO, and LMS export.",
      },
    ],
    footnote: "Billed annually. Every plan includes source citations.",
  },
  {
    label: "Contact",
    kind: "contact",
    details: [
      {
        label: "Support",
        value: `help@${brand.domain}`,
        note: "Replies within one business day.",
      },
      {
        label: "Schools and districts",
        value: `schools@${brand.domain}`,
        note: "Pilots, rosters, and procurement.",
      },
      {
        label: "Press",
        value: `press@${brand.domain}`,
        note: "Media enquiries and brand assets.",
      },
    ],
    footnote: "Monday to Friday, 9am–6pm ET.",
  },
];

export const navigation: NavItem[] = [
  {
    label: "Platform",
    children: [
      {
        label: "Concept maps",
        description: "Any reading turned into a structure you can walk through.",
        href: "#platform",
      },
      {
        label: "Animated walkthroughs",
        description: "Step through a proof or process one frame at a time.",
        href: "#platform",
      },
      {
        label: "Adaptive recall",
        description: "Practice aimed at the weakest part of your map.",
        href: "#platform",
      },
      {
        label: "Shared canvases",
        description: "Study groups working on one diagram together.",
        href: "#platform",
      },
    ],
  },
  {
    label: "Subjects",
    children: [
      {
        label: "Sciences",
        description: "Biology, chemistry, physics, earth science.",
        href: "#subjects",
      },
      {
        label: "Mathematics",
        description: "Algebra through multivariable calculus and proofs.",
        href: "#subjects",
      },
      {
        label: "Humanities",
        description: "History timelines, argument maps, close reading.",
        href: "#subjects",
      },
      {
        label: "Professional",
        description: "Medicine, law, engineering, and certification prep.",
        href: "#subjects",
      },
    ],
  },
  { label: "How it works", href: "#how-it-works" },
  { label: "Educators", href: "#educators" },
  { label: "Pricing", href: "#pricing" },
];

export const hero = {
  /** Words wrapped in _underscores_ render with the accent underline. */
  headline: "_Visual_ learning that makes hard ideas _obvious_",
  primaryCta: "Start learning free",
  secondaryCta: "See a live map",
} as const;

export const showcase = {
  heading: "Understanding starts\nwith a picture.",
  body: "Drop in a chapter, a lecture recording, or a set of notes. Interactive Learning finds the ideas, draws the relationships between them, and hands you back something you can actually explore.",
  cta: "Watch a two-minute tour",
} as const;

export const trustBar = {
  label: "Content found from:",
} as const;

export type Feature = {
  id: string;
  title: string;
  body: string;
  visual: "map" | "frames" | "recall" | "source" | "sketch" | "group";
  span?: boolean;
};

export const features: Feature[] = [
  {
    id: "maps",
    title: "Concept maps, built from your material",
    body: "Upload a reading and Interactive Learning extracts the ideas and the relationships between them. Expand a node to go deeper; collapse it when it clicks.",
    visual: "map",
    span: true,
  },
  {
    id: "frames",
    title: "Animated walkthroughs",
    body: "Long derivations become frames you can scrub. Pause anywhere and ask why that step follows.",
    visual: "frames",
  },
  {
    id: "recall",
    title: "Practice that finds the gap",
    body: "Recall questions are drawn from the parts of your map you keep skipping, then spaced out until they hold.",
    visual: "recall",
  },
  {
    id: "source",
    title: "Every node cites its source",
    body: "Tap any idea to jump to the page, slide, or timestamp it came from. Nothing is generated without a trail.",
    visual: "source",
  },
  {
    id: "sketch",
    title: "Sketch a question, get a diagram",
    body: "Draw a rough version of what you think is happening. Interactive Learning corrects it and shows you where the model breaks.",
    visual: "sketch",
  },
  {
    id: "group",
    title: "One canvas, the whole study group",
    body: "Shared maps update live. See which parts your group has covered and which nobody has touched.",
    visual: "group",
  },
];

export const steps = [
  {
    number: "01",
    title: "Bring your material",
    body: "PDFs, slide decks, lecture recordings, or a pasted set of notes. Interactive Learning reads all of it.",
  },
  {
    number: "02",
    title: "Watch it become a map",
    body: "Ideas become nodes, relationships become edges, and the whole structure lays itself out in seconds.",
  },
  {
    number: "03",
    title: "Learn by moving through it",
    body: "Explore, animate, question, and practice. The map tracks what has landed and what has not.",
  },
] as const;

export const stats = [
  { value: "3.2x", label: "Faster recall on end-of-unit checks" },
  { value: "18 min", label: "Median time from upload to first map" },
  { value: "240k", label: "Maps built by students this term" },
  { value: "41", label: "Subjects covered end to end" },
] as const;

export const testimonials = [
  {
    quote:
      "I stopped re-reading. I put the chapter in, walked the map twice, and could explain the whole pathway to my roommate that night.",
    name: "Priya R.",
    role: "Second-year medical student",
  },
  {
    quote:
      "My students can finally see why step four follows step three. The animation does in thirty seconds what a whiteboard took me a full period to do.",
    name: "Daniel O.",
    role: "High school physics teacher",
  },
  {
    quote:
      "The recall questions are unnervingly good at finding the exact thing I was pretending to understand.",
    name: "Mei L.",
    role: "Undergraduate, computer science",
  },
] as const;

export const educators = {
  eyebrow: "For educators",
  heading: "See where a class is actually stuck",
  body: "Assign a map instead of a reading. Interactive Learning shows you, at a glance, which concepts a cohort has connected and which ones are still isolated — before the exam tells you.",
  bullets: [
    "Cohort-level heatmaps across every concept",
    "Assignments that hand back structure, not just a score",
    "Rosters, SSO, and LMS export out of the box",
  ],
  cta: "Talk to our education team",
} as const;

export const pricing = [
  {
    name: "Student",
    price: "Free",
    cadence: "forever",
    body: "Everything you need for your own coursework.",
    features: [
      "5 maps per month",
      "Animated walkthroughs",
      "Adaptive recall practice",
      "Source citations",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Scholar",
    price: "$12",
    cadence: "per month",
    body: "For a full course load and a study group.",
    features: [
      "Unlimited maps",
      "Shared canvases for up to 8",
      "Lecture recording import",
      "Sketch-to-diagram",
      "Export to PDF and Anki",
    ],
    cta: "Start 14-day trial",
    featured: true,
  },
  {
    name: "Institution",
    price: "Custom",
    cadence: "per seat",
    body: "For departments, schools, and districts.",
    features: [
      "Cohort analytics",
      "LMS and SSO integration",
      "Assignment workflows",
      "Dedicated onboarding",
    ],
    cta: "Contact sales",
    featured: false,
  },
] as const;

export const faqs = [
  {
    question: "Does Interactive Learning just summarize my readings?",
    answer:
      "No. A summary hands you a shorter wall of text. Interactive Learning produces a structure — the ideas and the relationships between them — that you move through, question, and get tested on. Every node stays linked to the passage it came from.",
  },
  {
    question: "What can I upload?",
    answer:
      "PDFs, slide decks, lecture audio and video, images of handwritten notes, and plain pasted text. Most materials finish processing in under two minutes.",
  },
  {
    question: "Will this work for my subject?",
    answer:
      "Interactive Learning covers 41 subjects end to end, and handles anything with structure — which is most things. Highly notation-heavy fields like organic chemistry and formal logic have purpose-built renderers.",
  },
  {
    question: "Is my coursework private?",
    answer:
      "Your uploads are yours. Materials are never used to train shared models, and you can delete any map and its source files permanently at any time.",
  },
  {
    question: "How is this different from flashcards?",
    answer:
      "Flashcards test facts in isolation. Interactive Learning tests whether you can connect them, then generates recall practice from the connections you keep missing.",
  },
] as const;

export const closingCta = {
  heading: "Stop re-reading.\nStart seeing.",
  body: "Bring one chapter. Watch what happens to it. The first five maps are free.",
  primary: "Create your free account",
  secondary: "Book a walkthrough",
} as const;
