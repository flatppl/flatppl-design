# WIP — FlatPIR `%meta`, profiles (`.flatprof`), rules (`.flatrules`)

**TEMPORARY working note.** Captures the state of the design discussion so we can
land the pieces in order. Not normative; the spec (`flatppl-design`) and
ARCHITECTURE (`flatppl-rust`) win. Delete once folded into the spec + Rust.

Status legend: **LANDED** (written into the spec/files) · **LOCKED** (settled,
partly written) · **DECIDED** (agreed, not yet written down) · **DEFERRED**
(intentionally postponed) · **OPEN** (needs a call).

## Landing status (2026-06-17)

- **§A FlatPIR `%meta` wrapper** — LANDED. Spec committed (`flatppl-design`
  `fe89f11`); Rust adapted (`flatppl-rust` `3473f2e`, `flatpir` branch) + goldens;
  full suite green (one pre-existing, unrelated lint failure).
- **§B linear profile metavars / §C non-linear rule metavars** — LANDED in
  `docs/12-profiles.md` (`?name` bullet): profiles linear, rules capture.
- **§C `?=` where-clause** (computed *and* guarded-pattern bindings; shared metavar =
  cross-node equality) — LANDED in `rulesets/core-equivalences.flatrules` header.
- **§D canonical-FlatPIR matching precondition** — STATED in §12 (conformance) + the
  rules header (rewriting). REMAINING: promote §11's "Normalization" note to a
  normative *Canonical FlatPIR* subsection (a deliberate §11 follow-on).
- **§E algebraic-property markers** — LANDED as `rulesets/operator-algebra.flatrules`
  (`&commutative`/`&associative`, reserved `&idempotent`, guarded `mul`; add/mul
  associativity withheld — IEEE non-associativity).
- **§F `%meta` lifecycle** — LANDED in the core-equivalences header (+ the §12 guard
  note: a guard reads inferred metadata).
- `simplemath.flatprof` was dropped; only `full` + `scalarmath` remain.
- STILL OPEN: lambda / reified-callable shorthand for the `[schematic]` rules + the
  η-law zip (§I); module/cardinality constraints; per-target cost (§H).

---

## 0. Sequencing (the plan)

1. **Land the FlatPIR `%meta` wrapper change** (§A). It is a *change* to existing
   FlatPIR → existing Rust (`flatppl-flatpir` reader/writer, `flatppl-infer`
   annotated-output projection, spec-§11 goldens).
2. **Then add profiles + rules as *additions*** (§B–§C): new spec content (rule
   format), new Rust crates (profile-conformance checker, rule/rewrite engine).
   These do not modify the IR; they consume it.

So: `%meta` = the one breaking change; everything else is additive.

---

## A. FlatPIR `%meta` change — **LANDED**

Wrapper form, replacing the old inline-slot form and `%lit`:

```lisp
(%meta (<type> <phase> <valueset>) <expr>)
```

- type/phase/valueset grouped as a 3-list, then the wrapped expression.
- **Transparent wrapper**: tools that don't consult it read straight through to
  `<expr>`.
- **Never nests directly**: `<expr>` is not itself a `(%meta …)`.
- **Bare expr ≡ all-`%deferred` wrapper** `(%meta (%deferred %deferred %deferred) <expr>)`.
- **`%lit` removed entirely.** Scalar literals are bare (self-typing); annotate a
  standalone literal by wrapping: `(%meta ((%scalar real) %fixed reals) 3.14)`.
  Constructor args stay bare (the call carries the aggregate `%meta`).
- Non-value type slots: `(%module …)`, `(%measure …)`, `(%kernel …)`,
  `(%function …)`, `(%likelihood …)`, `(%array …)`, etc., exactly as the §11
  type-category list.

Example (module RHS wrapper):
```lisp
(%bind b (%meta ((%scalar real) %stochastic reals)
                (draw (%meta ((%measure (%domain (%scalar real)) (%mass %normalized)) %fixed reals)
                             (Normal (%kwarg mu 0.0) (%kwarg sigma 2.0))))))
```

**Landed:** spec committed (`flatppl-design` `fe89f11`, "Turn FlatPIR meta into an
annotation wrapper"). Rust adapted on the `flatpir` branch (`flatppl-rust`
`3473f2e`): `flatppl-flatpir` reader/writer + JSON + `flatppl-infer` projection moved
to the wrapper shape, goldens updated, full suite green. Writer policy is **sparse** —
the wrapper is emitted only around calls; atomic leaves (literals, refs, consts,
axes) stay bare, matching the §11 annotated example. In-memory IR unchanged
(annotations already live in per-NodeId side-tables).

---

## B. Profiles (`.flatprof`) — **DECIDED**

`(&profile <production>…)` — a **tree grammar** over fully-inferred FlatPIR.
Conformance = **grammar membership**, pure inclusion. `&` marks a DSL keyword
(non-FlatPIR).

Pattern vocabulary:
- `?_` / `?name` — closed metavars (range over the profile's productions).
- `??` — open wildcard (any legal term).
- `(?| a b …)` — alternation (one production per alternative).
- `*` / `+` suffixes — variadic runs (`?_*`, `??+`); `(?* <pat>)` / `(?+ <pat>)`
  repetition form, ranging over structural entries too (`%field`, `%specinputs`
  pairs, …).
- `(%meta (<type> <phase> <valueset>) <pat>)` — annotation guard; reads inferred
  metadata.

Properties:
- **Linear only.** Every metavar independent; a repeated `?name` is
  cosmetic/forbidden, *never* "same subterm." Keeps membership linear-time and
  matches the semantics (legality of shape, not equality). → **No `?=`, no
  non-linear capture in profiles.** Cross-node consistency (dimensions, shape)
  is *well-formedness* — the language's job, already enforced before conformance
  runs over fully-inferred terms.
- `anything` is bounded by **producer inclusion**: a value type only arises where
  the profile admits a producer for it, so omitting producers omits the type. No
  separate value-type restriction needed (only free inputs pin their set).
- Constants are **production-gated terminals** (listed to allow).
- **Module / cardinality / role constraints are NOT productions.** Push what
  reduces to type/`%meta`/position into the grammar (e.g. "measures
  record-valued" = `%meta` domain guard; "vectors only as observed data" =
  positional production). Genuinely non-grammatical ones (Stan ≤1 likelihood — a
  count) are **named imperative checks in the conformance checker (Rust)**,
  documented beside the `.flatprof`.

Examples settled: `full` = `(&profile ??)`; `scalarmath`, `simplemath` drafted.
**OPEN:** record/table `%field` production shape (flagged in `simplemath.flatprof`).

---

## C. Rules (`.flatrules`) — **DECIDED**

`(&termrules <rule>…)` where each rule is:
- `(&equiv <a> <b> <side>*)` — bidirectional equality (→ egglog `birewrite`).
- `(&rewrite <from> <to> <side>*)` — directional (→ egglog `rewrite` / greedy
  legalizer). Maps onto ARCHITECTURE's equality-saturation vs directional-
  legalization regimes.

Properties:
- **Non-linear.** Repeated metavar = same subterm; metavars carry across
  LHS↔RHS as substitution.
- **Side conditions** = trailing `(?= <var> <pattern-or-expr>)` clauses, one
  binding each, after lhs/rhs. Two binding kinds:
  - computed: `(?= ?n (lengthof ?mu))`
  - guarded pattern: `(?= ?a (%meta (?k ?? ??) ?_))` — and a shared metavar
    across guards (`?k`) expresses cross-node equality (e.g. "same scalar type").
- A `%meta` guard **reads inferred metadata**, not a syntactic wrapper match — so
  it works on bare literals too.

Reification calculus split:
- **β-law** `(lawof (draw ?m)) ≡ ?m` and **`kernelof = functionof∘lawof`** carry
  input lists *whole* → clean rule-file `&equiv` entries (already in the draft).
- **η-laws** need the **zip** (boundary input list element-wise = call args), which
  doesn't fit egglog → kept **engine-level / structural** for now, not rule-file
  text. (See §G hybrid.)

---

## D. Canonical FlatPIR (matching precondition) — **DECIDED** (write in §11)

Rewriting and conformance operate on **Canonical FlatPIR** — a *required*
precondition (promote §11's current "optional Normalization" paragraph to a
normative subsection). The set:
- kwargs → positional for built-ins (known order); residual user keyword-only
  kwargs sorted by name.
- `%assign` (unordered) sorted by name; `%field` left as-is (order is semantic).
- **α-canonicalize bound variables** — eliminate name freedom for syntactic
  matching (e-graphs don't handle binders natively):
  - placeholder tokens `_x_`: generalize the `fn` reading-order `_arg1_,…`
    convention to **all** placeholder sources (`arg->` lambdas, explicit
    `functionof(…, name=_p_)`). `fn` already canonical.
  - `aggregate`/`metricsum` **axis names** (`%axis`/`%uaxis`/`%laxis`) — bound,
    scoped; canonicalize to positional order. (Wholly outside calling conventions.)
  - **NOT** input/argument names (the keyword interface) — rules wildcard them.
- aliases resolved (§04 "aliasing is just assignment").
- **docs**: transparent to matching but **retained on bindings** for
  round-trip/emit (e.g. HS³ descriptions) — *not* stripped. Lost only when a
  private binding is inlined/eliminated.
- bare ≡ all-`%deferred` `%meta` normalized.

Orthogonality: positional normalization canonicalizes *call sites*; α-renaming
canonicalizes *binders*. Different axes; neither subsumes the other.

---

## E. AC / algebraic properties — **DECIDED**

Declare per-operator properties in **structured form, same `&`-keyword S-expr DSL
(no new file format)** — a sibling `.flatrules`-format file or header block.

- **Unconditional AC** (`superpose`, `add`, `min`, `max`, `land`, `lor`, `lxor`,
  `equal`, `unequal`, future `set`) → bare markers `(&commutative …)` /
  `(&associative …)` / `(&idempotent set)`.
- **Conditional** (`mul` — commutative for **scalars only**, NOT matrices) → a
  **guarded `&equiv`** (the `?=` form), not a bare marker. `joint`/`cartprod` are
  **not** commutative (ordered `cat` variate layout).
- Marker = explicit signal to the engine's AC subsystem (canonical operand sort /
  AC-match), avoiding e-graph blowup of naive commutativity birewrite and fragile
  auto-detection.
- Each engine realizes per capability (greedy: canonical sort; egglog: AC-match /
  controlled birewrite; Maude-style: native ACI).
- Seed of a future **machine-readable operator catalogue** (arity + type/shape
  signature + properties) that `flatppl-infer` wants anyway. A per-op form
  `(&op mul (&commutative (?= ?k (%scalar ??))))` keeps the guard attached and
  grows into that catalogue — OPEN whether to adopt per-op now vs property-lists.

---

## F. `%meta` lifecycle — **DECIDED** (write short note in §12 + rules header)

1. Inference **writes** `%meta`; rules only **guard** on it, never assert it.
2. A guard reads the node's inferred metadata, independent of whether the
   serialized term wrote a wrapper.
3. Saturating engine → `%meta` is an **e-class analysis**, auto re-derived
   (incl. on reinserted nodes); each domain is a join-semilattice (phase, type,
   valueset, mass). Greedy legalizer → re-run inference between passes.
4. Serialized `%meta` in a `.flatpir` is a **snapshot**, valid for that term only;
   consumers re-derive after transformation.

---

## G. Hybrid engine — **DECIDED** (architecture; notation-agnostic)

Intersperse egglog saturation with hardcoded structural/binder passes (η, zip)
and re-inference. egglog supports this first-class (scheduled rulesets, external
primitives, continuous e-class analyses).

Bridges between e-graph (many equivalents) and a structural pass (one tree):
- **host-primitive in a rule** — for local structural conditions (η-redex check).
- **extract → transform → assert-equal → re-saturate** — for bigger external
  passes (the standard way to do binders/β in e-graphs).

Re-inference: automatic on the egglog path (analyses to fixpoint); cheap re-run
between passes on the greedy path.

Caveats: external ops must be genuine equivalences (soundness); extract-based
passes see only the extracted representative (completeness — iterate);
manage ping-pong via scheduling / directionality / cost.

This is an **engine-realization** choice — it does not change the notation.

---

## H. Cost model — **DEFERRED**

- Baseline legality-cost **auto-derives from the profile** (illegal head = ∞,
  else uniform + smallest-term tiebreak) → extraction-to-profile for free now.
- Per-target performance cost = separate later artifact (target-dependent, not
  auto-generatable); notation TBD. Cleanly separable; doesn't constrain
  profile/rule notation.

---

## I. Open / deferred items

- `(?zip …)` ellipsis / parallel-sequence correspondence notation — DEFER until a
  second consumer beyond η appears (η stays structural meanwhile).
- record/table `%field` production shape in profiles.
- relational arithmetic predicates in side conditions (beyond `?=`
  bindings/guards) — rare; DEFER.
- operator-catalogue consolidation (properties + arity + signatures) — §E.
- documentation format for extra-grammatical profile conditions (beside profiles).
- per-target cost notation — §H.

---

## J. Where each piece is written down

- **§11 (FlatPIR):** Canonical FlatPIR subsection (§D); algebraic-property table /
  sibling structured file (§E).
- **§12 (Profiles):** pattern-language refinements — linear-profile vs
  non-linear-rule, the `?=` where-clause as **rule-only**, the `%meta`-lifecycle
  note (§F), scaffolding productions.
- **Engine (Rust):** generic reification identities (η) as structural passes;
  extra-grammatical profile conditions; per-target cost tables; re-inference
  scheduling.
- **`flatppl-dev/rulesets/`:** the rule + property files (draft → spec eventually).
