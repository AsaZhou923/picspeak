# PicSpeak Design System

Status: approved direction for the 2026 frontend optimization
Owner: product/frontend
Applies to: `frontend/src/app`, `frontend/src/components`, `frontend/src/features`

## 1. Source of truth

This file is the canonical product UI/UX and visual design contract for PicSpeak. When implementation and older screenshots or planning notes disagree, follow this document unless a newer approved product decision explicitly overrides it.

Supporting product context:

- External product entry: `/Users/ze/Documents/docs/01 - Projects/PicSpeak/PicSpeak.md`
- Product flow history: `/Users/ze/Documents/docs/01 - Projects/PicSpeak/01 - Product/前端页面规划.md`
- Product direction: `/Users/ze/Documents/docs/01 - Projects/PicSpeak/08 - Plans/2026-04-18 产品路线图.md`
- Result-page history: `/Users/ze/Documents/docs/01 - Projects/PicSpeak/03 - Frontend/PicSpeak 结果页前端 TODO.md`

The screenshots under `docs/assets/screenshots/` are historical evidence, not pixel-perfect targets.

## 2. Brand

### Promise

PicSpeak turns an AI opinion into the next useful photographic decision. It helps people see what is working, understand what to change, and repeat the shot with intent.

### Personality

- Professional photography coach: credible, observant, calm, specific.
- Efficient AI tool: explicit inputs, visible system state, predictable next actions.
- Editorial photography studio: warm, image-led, tactile and crafted.

### Experience statement

“A calm expert beside the contact sheet, with the speed and precision of a modern AI workbench.”

### Brand hierarchy

1. Clarity and trust.
2. Actionability and continuity.
3. Photographic craft and atmosphere.
4. Delight.

If atmosphere conflicts with task clarity, task clarity wins.

### Avoid

- Generic purple-gradient SaaS styling.
- Sci-fi decoration that implies capability the product does not have.
- Gold body text on light surfaces.
- Dense card grids with equal visual weight.
- Decorative motion that delays reading or hides state.
- Vague encouragement without a concrete next action.

## 3. Product goals

### Primary goal

Strengthen the loop:

`Upload → critique → choose one improvement → retake or generate a reference → compare → continue`

### Supporting goals

- Make first-use value legible before sign-in.
- Make the result page feel credible without overstating AI certainty.
- Reduce the cognitive cost of choosing the next action.
- Create a reusable visual and interaction system across public and application routes.
- Preserve strong SEO, localization, accessibility and responsive behavior.

### Non-goals

- Adding a new social network or large content category.
- Replacing the frontend framework or introducing a third-party UI kit.
- Redesigning backend contracts, billing rules or quota behavior.
- Full brand replacement.
- Inventing model data for visualizations that the API does not provide.

## 4. Users and jobs

### Learning photographer

Job: “Tell me the one or two changes most likely to improve my next shot.”
Needs: plain language, examples, visual hierarchy, reassurance without false praise.

### Practicing creator

Job: “Help me diagnose a frame quickly and keep my improvement history useful.”
Needs: compact evidence, comparable scores, metadata, repeatable workflow and exports.

### AI-assisted visual creator

Job: “Turn critique into a usable reference or prompt without rebuilding context.”
Needs: preserved settings, explicit credit/state feedback, fast transitions between critique and generation.

### Visitor evaluating the product

Job: “Show me what I will receive and why I should trust it.”
Needs: a real output preview, product loop explanation, transparent limits and one clear start action.

## 5. Information architecture

### Top-level intent groups

- Improve: Workspace, review tasks, review results, Retake Coach, review history.
- Create: Generate, generation tasks, generated-image detail, generation history.
- Explore: Gallery, prompt examples, Blog/Lens Notes, Updates.
- Account: Usage, plan, credits, settings and authentication.

### Navigation rules

- Desktop navigation exposes the primary Improve and Create entries; secondary discovery links can live in a grouped menu or footer.
- Mobile navigation contains at most five persistent destinations and uses labels, not icons alone.
- The active destination is indicated by shape and typography in addition to color.
- The header owns its layout offset. Pages must not guess fixed-header height independently.
- Marketing routes and application routes may use distinct headers, but they share brand, token and interaction rules.

### Core journey hierarchy

At every step, the interface should answer:

1. Where am I in the improvement loop?
2. What did the system learn or produce?
3. What is the best next action?
4. What are the safe alternatives?

## 6. Design principles

### 6.1 One dominant decision per viewport

Each major screen has one primary action. Secondary actions remain discoverable without competing at the same weight.

### 6.2 Evidence before decoration

Images, scores, concise findings, settings and system status carry more visual weight than ambient effects.

### 6.3 Coach the next move

Copy and layout translate diagnosis into an action. “Lighting: 6” is weaker than “Lift the face from shadow on the next frame.”

### 6.4 Continuity is a feature

Context moves with the user from critique into Retake or Generate. Re-entry and history should feel like returning to an active practice, not browsing disconnected records.

### 6.5 Progressive disclosure

Show the strongest conclusion and next step first; expose technical detail, metadata and alternatives on demand.

### 6.6 Honest AI state

Make processing, failure, confidence limits, quotas and paid actions explicit. Never use animation as a substitute for status text.

## 7. Visual language

### 7.1 Color roles

Keep the warm neutral foundation and separate decorative accent from readable text roles.

| Role | Light theme | Dark theme | Use |
| --- | --- | --- | --- |
| Canvas | warm ivory | warm charcoal | page background |
| Surface | paper beige | graphite | standard panels |
| Raised | warm white | raised graphite | menus, dialogs, emphasized panels |
| Ink | near-black | warm white | primary text |
| Muted ink | cool warm-gray | light warm-gray | supporting text; still AA-compliant |
| Action fill | burnished ochre | luminous warm gold | primary buttons, selected state |
| Action ink | dark espresso | dark espresso | text on action fill |
| Accent text | dark ochre | pale gold | links, labels and small text |
| Positive | deep sage | pale sage | strengths/success |
| Caution | deep rust | pale rust | problems/warnings |
| Focus | high-contrast gold/blue ring | high-contrast gold/blue ring | keyboard focus |

Rules:

- `gold` is not a universal text color. Small light-theme text uses a darker `accent-ink` role.
- Status is communicated with icon/label/shape, never color alone.
- Ambient gradients stay below content contrast and disappear in reduced-motion/high-contrast contexts.
- Body copy targets WCAG AA: 4.5:1 for normal text and 3:1 for large text.

### 7.2 Typography

- Display: Cormorant Garamond for brand moments, editorial page titles and score numerals.
- Body: DM Sans for navigation, controls, explanatory copy and data labels.
- Mono: JetBrains Mono for IDs, timestamps, camera metadata and technical state only.
- Marketing headlines may use display type; application task titles use body type unless a restrained editorial moment improves hierarchy.
- Limit display type to short phrases. Never use it for long instructions or button labels.

Type scale:

- Display hero: fluid `clamp(3rem, 8vw, 6.75rem)`, compact line height.
- Page title: fluid `clamp(2rem, 5vw, 4.5rem)`.
- Section title: 1.5–2.25rem.
- Card title: 1–1.25rem.
- Body: 1rem, 1.65–1.8 line height for reading surfaces.
- Supporting/meta: 0.75–0.875rem; never reduce contrast to compensate for density.

### 7.3 Spacing and layout

- Base spacing unit: 4px.
- Preferred rhythm: 8, 12, 16, 24, 32, 48, 64, 96px.
- Content containers:
  - Reading: 720px.
  - Task form: 800px.
  - Product workspace: 1180px.
  - Editorial/marketing wide: 1280px.
- Section padding: 64px mobile, 96–128px desktop when content warrants it.
- Dense application panels may use 16–24px internal spacing; marketing cards use 24–32px.
- Chrome/layout tokens describe normal-flow structure and sticky layering. They must not reintroduce synthetic fixed-header compensation heights.

### 7.4 Shape

Use four semantic radius levels:

- `control`: 12px.
- `card`: 20px.
- `feature`: 28px.
- `pill`: 999px.

Do not introduce one-off radii unless an image crop or device silhouette requires it.

### 7.5 Elevation

- Level 0: border only; default cards and list rows.
- Level 1: soft short shadow; raised controls and hoverable cards.
- Level 2: focused task panel or sticky action surface.
- Level 3: dialog/popover only.

Use warm/black translucent shadows tied to the theme. Avoid unique arbitrary shadow strings per component.

### 7.6 Imagery

- Real photographs and actual product outputs are the strongest brand assets.
- Prefer contact-sheet crops, before/after pairs and focused details over abstract AI illustrations.
- Generated examples must be labeled as examples and retain source/license metadata where required.
- Image overlays must preserve subject readability and never make photography look like a background texture.

### 7.7 Motion

- Functional motion: 120–220ms for controls, 220–360ms for panels.
- Entrance animation is used once, in reading order, and never blocks interaction.
- Marquee and ambient drift are optional brand accents, not required content carriers.
- `prefers-reduced-motion: reduce` disables marquee, orbit, shimmer, parallax and entrance transforms; state transitions remain immediate and legible.
- The global atmosphere uses restrained warm photographic light and grain. Indigo/teal aurora fields and star particles must be removed or reduced to static, low-contrast texture when they compete with evidence or imply a generic sci-fi product.

## 8. Core page patterns

### Homepage

- Open with the user outcome and one primary “Critique a photo” action.
- Show a credible critique artifact within the first viewport on desktop and immediately after the primary action on mobile.
- Explain the improvement loop as a connected sequence, not an equal-weight feature grid.
- Distinguish Improve and Create intents after the core critique proposition is understood.
- Use proof, examples and pricing after product understanding; do not front-load every feature.

### Workspace

- Present a focused three-stage shell: image → intent/settings → submit.
- Preserve current quota, auth and upload behavior.
- Make image readiness, model/mode cost and submit state explicit.
- On mobile, keep the active image and primary action visible without trapping the user in a tall settings stack.

### Review result

- First view: image, overall result, strongest insight and next recommended action.
- Second view: dimension evidence and prioritized findings.
- Third view: metadata, export/share, history and secondary actions.
- Retake is the preferred continuation when advice is shootable; Generate is the preferred reference path when a visual example is useful.
- Recommended actions are selected from stable structured state such as ownership, comparison/source-review context and existing capability availability. Do not infer the primary CTA from free-text critique keywords; preserve explicit user choice when both Retake and Generate are valid.
- AI limitations remain visible but quiet.

### Retake Coach

- Show continuity from the source critique.
- Use explicit sequence and comparison language: original → target → retake → change.
- Comparison outcomes use text and symbols in addition to color.
- The next critique or adjustment remains one click away.

### Generate

- Present a professional toolbench: prompt and settings are primary; credits/history are supporting.
- Preserve context when entering from a review.
- Show cost before submission, state during generation and clear reuse/download/retake actions after completion.

### Supporting routes

Gallery, Blog, Updates and account/history pages adopt the shared container, panel, heading, filter, empty-state and action patterns. They are not functionally restructured in the first pass unless a shared-shell defect requires it.

## 9. Component contract

### Buttons

- Primary: filled action color, one per local decision group.
- Secondary: raised or outlined neutral surface.
- Tertiary: text/quiet control for reversible or low-priority actions.
- Destructive: explicit rust/red semantics with confirmation where needed.
- Minimum target: 44×44px on touch surfaces.
- Loading retains label context and prevents duplicate submission.

### Panels

- Standard panel: level-0 surface, card radius, semantic border.
- Feature panel: feature radius, stronger hierarchy, reserved for the main artifact or decision.
- Interactive card: native link/button semantics, visible focus, level-1 hover elevation.
- Avoid nesting more than two bordered panels.

### Page intros

Use eyebrow → concise title → one-sentence outcome → optional metadata/actions. Do not repeat a second hero immediately below a server-visible SEO hero.

### Form controls

- Label stays visible; placeholder is an example, not the label.
- Help and error text have stable reserved placement.
- Selected states use fill/border/icon/text, not hue alone.
- Costs and irreversible effects appear before the submit action.

### Dialogs

- `role="dialog"`, `aria-modal="true"`, accessible title and optional description.
- Focus moves inside on open, cycles within, returns to the trigger on close.
- Escape closes unless doing so could lose an active irreversible operation.
- Backdrop clicks are supplementary, not the only close mechanism.

### Status and feedback

- Loading: name the operation and preserve an honest progress/state label.
- Empty: explain why the area is empty and provide one next action.
- Error: say what failed, what was preserved and how to recover.
- Success: confirm the outcome and present the continuation.

### Task shell boundary

- A shared task shell may own layout slots, progress/context presentation, status placement and action hierarchy.
- It must not own request handlers, authentication, quota/credit logic, idempotency keys, analytics events, router transitions or domain state.
- Promote a page pattern into a shared component only after at least one complete vertical journey proves the repeated contract.

## 10. Accessibility

- One `main` landmark is owned by `SiteChrome`; page components use `section`, `article` or `div` beneath it.
- Heading order begins with one meaningful `h1` and descends without decorative level jumps.
- Every pointer interaction has an equivalent keyboard interaction, preferably through native elements.
- Hover-only education is also available on focus and touch.
- Focus indicators remain visible on every theme and surface.
- Dialog behavior follows the shared focus-trap hook.
- Light and dark palettes meet WCAG AA for body/control text.
- Reduced motion is global, not component opt-in.
- Decorative icons are hidden from assistive technology; icon-only controls have accessible names.
- Image alt text describes product-relevant content without repeating adjacent captions.

## 11. Responsive behavior

### Mobile first

- Base layouts are single-column and content-ordered for the primary task.
- Persistent mobile navigation does not obscure content and is included in shared shell spacing.
- Primary actions may become sticky only when they do not cover errors, system status or required fields.
- Horizontal carousels are optional enhancement; essential content remains reachable without precision swiping.

### Breakpoint intent

- `<640px`: one-column task flow, compact chrome, 16–20px side padding.
- `640–1023px`: wider reading/task layout; selective two-column summaries.
- `≥1024px`: workspace split layouts and sticky supporting panels where useful.
- `≥1280px`: increased whitespace, never unbounded line length.

### Localization resilience

- Buttons and tabs must tolerate longer English/German-like lengths even though current locales are zh/en/ja.
- Japanese/Chinese line breaking must not produce isolated punctuation or clipped vertical rhythm.
- Avoid fixed text-height cards when translated copy can grow.

## 12. Interaction states

Every interactive component must define:

- Default.
- Hover where supported.
- Focus-visible.
- Active/pressed.
- Selected/current where applicable.
- Disabled with reason when useful.
- Loading.
- Success or completion.
- Error and retry.

Task flows additionally define draft preservation, navigation-away behavior and idempotent resubmission expectations.

## 13. Content voice

- Calm and specific: “Move two steps left to separate the subject” over “Improve composition.”
- Honest: “AI critique for creative reference” over claims of objective judgment.
- Forward-looking: lead with what the user can do next.
- Concise controls: verb-first labels such as “Critique photo”, “Plan a retake”, “Generate reference”.
- Avoid hype, blame, excessive exclamation marks and unexplained model terminology.
- Localized copy preserves intent and hierarchy rather than mirroring sentence length.

## 14. Technical constraints

- Next.js 15 App Router, React 18, TypeScript and Tailwind CSS remain in place.
- Existing semantic CSS variables are evolved rather than bypassed with new hard-coded colors.
- Reuse existing modal, analytics, auth, quota, checkout and task-state helpers.
- No new dependency without explicit product approval.
- Public route changes preserve canonical URLs, metadata, structured data, sitemap and server-visible content.
- Core behavior remains covered by typecheck, lint, Node tests and production build.
- Existing analytics event names, attribution source, required metadata and URL/query continuity are part of the behavior contract. Visual restructuring must preserve them unless an explicit analytics migration is documented and verified.

## 15. Open questions

- Conversion and repeat-use metrics should be instrumented against a stable pre-change baseline before attributing business impact to this redesign.
- Rich composition/focus/crop overlays remain future work until backend/model output supports trustworthy coordinates.
- A dedicated visual regression solution can be considered after the new core pages stabilize; it is not required for the first implementation pass.

## 16. Definition of done

- The core journey visibly follows this contract on desktop and mobile.
- Shared tokens replace arbitrary core-route radius, shadow, surface and action styles.
- Known contrast, landmark, pointer-only interaction, modal and reduced-motion defects are resolved.
- Supporting routes inherit the new visual system without breaking functionality.
- Automated frontend checks and a production build pass.
- Representative screenshots are reviewed against the brand hierarchy and page-pattern requirements above.
- A dated implementation record is published in the external PicSpeak frontend documentation directory.
