/**
 * Every string on the marketing site lives here. Sections import from this
 * file so copy changes never require touching layout code. The brand itself
 * lives one level down, in `brand.ts`, which the logo and metadata also read.
 *
 * The numbers and names in this file are the product's own story: pilot
 * cohorts, plan prices, and the people quoted are what the site says about
 * itself, and they are edited here rather than in the components that set
 * them.
 */

import { brand } from "@/lib/brand";

export const site = {
  name: brand.name,
  tagline: brand.tagline,
  description: brand.description,
} as const;

/** The header's links. Anchors resolve against the landing page from anywhere. */
export type NavLink = { label: string; href: string };

export const navigation: readonly NavLink[] = [
  { label: "Product", href: "/#product" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Educators", href: "/#educators" },
  { label: "Pricing", href: "/#pricing" },
  { label: "About", href: "/about" },
];

export const hero = {
  announcement: "Now in private beta",
  announcementHref: "/about",
  /** The last word is set in the display serif. */
  headline: "Visual learning that makes hard ideas",
  headlineAccent: "obvious.",
  body: "Bring a chapter, a lecture, or a set of notes. Interactive Learning turns it into a concept map you can walk through, animate, and get tested on, with every idea linked back to the page it came from.",
  primaryCta: "Get started",
  secondaryCta: "See how it works",
  footnote: "Free for students. No credit card required.",
} as const;

export const trust = {
  label: "Used by learners and teaching teams at",
  names: [
    "Northgate Academy",
    "Riverside Unified",
    "Lakeshore College",
    "Meridian Prep",
    "Westbrook STEM",
    "Halden University",
  ],
} as const;

export type Feature = {
  id: string;
  title: string;
  body: string;
  visual: "map" | "frames" | "recall" | "source" | "sketch" | "group";
  span?: boolean;
};

export const featuresSection = {
  eyebrow: "The platform",
  heading: "Six ways a map beats a page of text",
  body: "Every feature exists for one reason: to move a subject out of prose and into a form your memory can hold onto.",
} as const;

export const features: readonly Feature[] = [
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

export const howItWorks = {
  eyebrow: "How it works",
  heading: "Three steps, about two minutes",
  body: "No setup, no template picking, no tagging. Bring the material you already have.",
  steps: [
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
      body: "Explore, animate, question, and practise. The map tracks what has landed and what has not.",
    },
  ],
} as const;

export const practice = {
  eyebrow: "Practice",
  heading: "Questions aimed at the exact thing you were pretending to understand",
  body: "Flashcards test facts in isolation. Interactive Learning tests whether you can connect them. Every recall session is generated from the edges of your map you keep skipping, then scheduled so the answer is still there in three weeks.",
  bullets: [
    "Spaced repetition tuned per concept, not per deck",
    "Explanations quote the source passage, never a summary of it",
    "Weak spots surface on the map itself, so you can see the gap",
  ],
  cta: "Explore the platform",
} as const;

export const educators = {
  eyebrow: "For educators",
  heading: "See where a class is actually stuck",
  body: "Assign a map instead of a reading. Interactive Learning shows you, at a glance, which concepts a cohort has connected and which ones are still isolated, before the exam tells you.",
  bullets: [
    "Cohort-level heatmaps across every concept",
    "Assignments that hand back structure, not just a score",
    "Rosters, single sign-on, and LMS export out of the box",
  ],
  cta: "Talk to our education team",
} as const;

export const stats = {
  items: [
    { value: "3.2×", label: "Faster recall on end-of-unit checks" },
    { value: "18 min", label: "Median time from upload to first map" },
    { value: "240k", label: "Maps built by students this term" },
    { value: "41", label: "Subjects covered end to end" },
  ],
  footnote:
    "Figures reflect Interactive Learning pilot cohorts, spring term 2026. Individual results vary.",
} as const;

export const testimonialsSection = {
  eyebrow: "From the pilot",
  heading: "What changed for them",
} as const;

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

export const pricingSection = {
  eyebrow: "Pricing",
  heading: "Free while you are a student",
  body: "Upgrade when you need more than five maps a month. Cancel from the account page in one click.",
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
    cta: "Get started",
    href: "/auth/sign-up",
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
      "Sketch to diagram",
      "Export to PDF and Anki",
    ],
    cta: "Start 14-day trial",
    href: "/auth/sign-up",
    featured: true,
  },
  {
    name: "Institution",
    price: "Custom",
    cadence: "per seat",
    body: "For departments, schools, and districts.",
    features: [
      "Cohort analytics",
      "LMS and single sign-on integration",
      "Assignment workflows",
      "Dedicated onboarding",
    ],
    cta: "Contact sales",
    href: "/contact",
    featured: false,
  },
] as const;

export const faqSection = {
  eyebrow: "Questions",
  heading: "Before you start",
} as const;

export const faqs = [
  {
    question: "Does Interactive Learning just summarise my readings?",
    answer:
      "No. A summary hands you a shorter wall of text. Interactive Learning produces a structure, the ideas and the relationships between them, that you move through, question, and get tested on. Every node stays linked to the passage it came from.",
  },
  {
    question: "What can I upload?",
    answer:
      "PDFs, slide decks, lecture audio and video, images of handwritten notes, and plain pasted text. Most materials finish processing in under two minutes.",
  },
  {
    question: "Will this work for my subject?",
    answer:
      "Interactive Learning covers 41 subjects end to end, and handles anything with structure, which is most things. Notation-heavy fields like organic chemistry and formal logic have purpose-built renderers.",
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
  {
    question: "How do I get an invitation?",
    answer:
      "The beta is invitation-only while we grow the cohort. Every member can invite five people, and teaching teams can request a pilot for a whole class from the contact page.",
  },
] as const;

export const closingCta = {
  heading: "Stop re-reading. Start seeing.",
  body: "Bring one chapter. Watch what happens to it. The first five maps are free.",
  primary: "Create your account",
  secondary: "Book a walkthrough",
} as const;

export const footer = {
  blurb:
    "The visual learning platform. Concept maps, animated walkthroughs, and practice that adapts to what you have not understood yet.",
  columns: [
    {
      heading: "Product",
      links: [
        { label: "Concept maps", href: "/#product" },
        { label: "Walkthroughs", href: "/#product" },
        { label: "Practice", href: "/#practice" },
        { label: "For educators", href: "/#educators" },
        { label: "Pricing", href: "/#pricing" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
        { label: "Sign in", href: "/auth/sign-in" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy policy", href: "/pp" },
        { label: "Terms of service", href: "/tos" },
      ],
    },
  ],
} as const;

export const about = {
  eyebrow: "About",
  heading: "We build for understanding, not memorising.",
  lede: "Interactive Learning started with a stubborn observation: students who re-read a chapter four times still cannot explain it. Structure is what makes an idea stick, so we build the structure.",
  facts: [
    { value: "2024", label: "Founded" },
    { value: "240k", label: "Maps built this term" },
    { value: "41", label: "Subjects covered" },
    { value: "12", label: "People on the team" },
  ],
  story: [
    "The first version was a weekend project for one biology course: a script that turned a chapter into a diagram, and a group of students who found they could finally hold cellular respiration in their heads. The diagram was the point. The prose had been hiding the shape of the idea all along.",
    "Two years on, the same principle runs through everything we ship. A reading becomes a map. A derivation becomes frames you can scrub. Practice is generated from the parts of the map you keep skipping, and every node cites the passage it came from, so the structure is always something you can check rather than something you have to trust.",
    "We are a small team of teachers, engineers, and former students of the subjects we map. We run the beta by invitation so that every cohort gets our attention, and we grow it as fast as we can keep that promise.",
  ],
  principles: [
    {
      title: "Structure over summary",
      body: "A shorter wall of text is still a wall of text. We hand back the shape of an idea, not a compressed copy of it.",
    },
    {
      title: "Every claim has a trail",
      body: "Nothing on a map is generated without a source. Tap any node and read the passage it came from.",
    },
    {
      title: "Your material stays yours",
      body: "Uploads are never used to train shared models, and a deleted map is gone with its source files.",
    },
    {
      title: "Built with teachers",
      body: "Every cohort feature was designed alongside the teaching teams that use it, in their classrooms.",
    },
  ],
} as const;

export const contact = {
  eyebrow: "Contact",
  heading: "Talk to a person.",
  lede: "Every address below reaches a member of the team, not a queue. Replies land within one business day, Monday to Friday.",
  channels: [
    {
      label: "Support",
      value: `help@${brand.domain}`,
      note: "Account questions, billing, and anything that is not working.",
    },
    {
      label: "Schools and districts",
      value: `schools@${brand.domain}`,
      note: "Pilots, rosters, procurement, and single sign-on.",
    },
    {
      label: "Press",
      value: `press@${brand.domain}`,
      note: "Media enquiries and brand assets.",
    },
    {
      label: "Privacy",
      value: `privacy@${brand.domain}`,
      note: "Data requests and questions about the privacy policy.",
    },
  ],
  hours: "Monday to Friday, 9am to 6pm Eastern.",
  pilot: {
    heading: "Running a pilot for a class",
    body: "Teaching teams can request a pilot for a whole cohort. We set up rosters, single sign-on, and LMS export with you, and stay on the call until the first maps are built.",
    cta: "Request a pilot",
  },
} as const;
