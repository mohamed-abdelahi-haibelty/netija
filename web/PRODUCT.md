# Product

## Register

product

## Users

Mauritanian students and their families, looking up Baccalauréat results in the anxious hours after publication. Most access from mobile, often in Arabic (RTL). Many are not technical — grandparents helping grandchildren, parents sharing results in family group chats. The interface must feel effortless for someone who rarely uses apps. A small cohort of administrators upload yearly result files and manage the import pipeline from a desktop dashboard.

## Product Purpose

Netija is an independent platform for looking up Mauritanian Baccalauréat results — built privately, not affiliated with any government body. A student types their exam number or name and immediately sees their decision, their average, and their full attempt history across years. It exists because the official experience is poor and people deserve something genuinely beautiful and easy to use. Success: finding a result feels effortless, and seeing it feels special. The result page is something people screenshot and share — not because the news is good, but because the page itself is worth looking at.

## Brand Personality

Calm · Beautiful · Effortless

Calm is the baseline — it protects the fail case, which is always possible. Beautiful is not decoration; it is the product. Effortless is not simplicity theater; it is the removal of every obstacle between a person and their result.

## Anti-references

- **Government-portal aesthetic**: heavy borders, institutional blues, dated visual vocabulary, dense form layouts
- **SaaS/startup template**: hero sections, feature cards, gradient CTAs, metric dashboards
- **Generic shadcn grayscale**: no-chroma tokens, visually indistinct, reads as a skeleton or a dev build
- **Arabic-as-afterthought**: LTR layouts patched for RTL, Latin fonts stretched over Arabic characters
- **Clinical / sterile**: technically correct but cold. Results are a human moment, not a database query.

## Design Principles

1. **Beauty and simplicity are the same thing.** A non-technical person finding their result in three taps is beautiful. An interface that requires thinking is ugly. These are one goal, not a tradeoff — every design decision must serve both simultaneously.
2. **The result page is the showpiece.** Every page is beautiful; the student results page is the most beautiful surface in the system. It is screenshot-worthy. It should be something people open just to look at, and something they are proud to share — regardless of the result.
3. **Emotional intelligence, not emotional neutrality.** Passing the Bac is one of the biggest moments in a young person's life. A pass (Admis) gets a genuine, tasteful celebration — a small animation, a moment of joy. A fail (Ajourné) or resit (Sessionnaire) stays calm, warm, and deeply respectful. The interface knows the difference and responds accordingly. Never festive about a fail.
4. **Bilingual by design, not by override.** Arabic and French are equal first-class citizens. RTL/LTR are not accessibility modes — they are the two native dialects of the same product.
5. **Speed as respect.** A fast result is more dignified than a beautiful loader. Performance is part of the experience, not separate from it.

## Accessibility & Inclusion

WCAG 2.1 AA throughout. Correct RTL rendering for Arabic on all components. `prefers-reduced-motion` honored on all transitions — including the Admis celebration (crossfade only, no motion). Decision badges must not rely on color alone — pair color with text and shape. Mobile-first responsive. Large tap targets for non-technical users.
