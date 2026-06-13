## Intermediate representation

This section defines **FlatPIR**, the intermediate representation of FlatPPL.
FlatPPL engines may ingest either FlatPPL or FlatPIR, depending on their design.

**Note:** The design of FlatPIR is preliminary and subject to change. It is not part
of FlatPPL semantic versioning yet.

FlatPIR is FlatPPL with operators, field access and indexing lowered to function calls. FlatPIR also supports optional type/phase inference metadata annotations.
FlatPPL maps directly to FlatPIR and FlatPIR maps back directly to FlatPPL.
Metadata is dropped when converting FlatPIR to FlatPPL.

Like FlatPPL, FlatPIR comes with a canonical syntax. The canonical FlatPIR
syntax uses standard S-expressions (compatible with Lisp/Scheme readers).
FlatPIR source files in the canonical syntax use the filename extension
`.flatpir`; alternative representations must use different filename extensions.

FlatPIR in S-expression representation allows for Lisp-like `;` comments.
These are intended for tooling annotations and similar use and not a property
of the IR data model. Canonical FlatPPL `#` comments do not propagate to
FlatPIR. Non-textual encodings of FlatPIR (binary, etc.) carry no comments.

FlatPIR is designed to support term-rewriting, with two main use cases:

- Restricting FlatPPL/FlatPIR code to a specific subset that maps directly to a target
  probabilistic language
  (see [Profiles and interoperability](12-profiles.md#sec:profiles)).
- Optimizing FlatPPL/FlatPIR code before handing it off to host-language implementations
  (which then can do further optimization within their own language stack).

Term-rewriting can require both value type and value phase
(see [Phases](04-design.md#phases)) information at intermediate nodes, so FlatPIR
allows type and phase annotations on every call. This lets generic rewrite tools
consume typed/phased terms directly, without re-implementing FlatPPL inference.

The semantics of FlatPIR are identical to the semantics of FlatPPL, with the
addition of metadata. They are independent of the canonical S-expression
representation. Additional representations (e.g. binary) are expected for some use
cases but are not yet specified.

### Naming convention

FlatPIR structural keywords are prefixed with `%` (e.g. `%module`, `%bind`, `%ref`,
`%meta`). FlatPPL built-in names (`Normal`, `add`, `record`, `vector`, `real`,
`integer`, ...) and user-defined names appear bare. The `%` prefix is invalid in
FlatPPL syntax (not Python/Julia AST compatible), so FlatPIR structural keywords
cannot collide with FlatPPL built-in and binding names.

### Module structure

Each surface FlatPPL module (file or embedded code block) maps to one FlatPIR
`(%module ...)`; modules are not flattened in FlatPIR, though tooling
may flatten them internally (e.g. for cross-module optimization before code evaluation).
A FlatPIR file contains exactly one `(%module ...)` form with these elements:

- `(%public <name1> <name2> ...)` — the module's public interface. Bindings listed here
  are the root set for rewriting passes; unlisted bindings may be elided during term-rewriting.
- `(%bind <name> <expression> [(%doc <markup> <line>...)])` — pairs a name
  with an expression and an optional documentation form. The `(%doc ...)`
  sub-form, when present, is always last; see [Documentation](#documentation)
  below. Type and phase live on the RHS expression when the RHS is a call (see
  [Type and phase annotations](#type-and-phase-annotations)).
  Module loads are ordinary bindings whose right-hand side is a `(load_module ...)`
  or `(standard_module ...)` call; engines must resolve such bindings before
  resolving references that depend on them.

Top-level declarations may appear in any order: bindings are resolved by reference,
not by textual position.

FlatPIR versioning is tied to FlatPPL versioning, so like in FlatPPL, the language
version compatibility of a module is optional and is encoded via the value of the binding `flatppl_compat`:

```lisp
(%bind flatppl_compat "0.6")
```

A parameterized load is an ordinary binding whose right-hand side calls
`load_module` with substitution arguments:

```lisp
(%bind helpers (load_module "helpers.flatppl" (%assign center (%ref self a))))
```

A standard-module dependency uses `standard_module` with the module name and a
compatibility version string (same grammar as `flatppl_compat`):

```lisp
(%bind hepphys
  (standard_module "particle-physics" "0.1"))
```

Each substitution takes the form `(%assign <input-name> <expression>)`. The
expression is resolved in the loading module's namespace.

### Documentation

A `(%bind ...)` form may carry an optional trailing
`(%doc <markup-tag> <line-string>...)` sub-form recording the binding's
documentation.

- `<markup-tag>` is a bare symbol: `md` (default, GitHub-Flavored Markdown
  with `$...$` / `$$...$$` math) or `typ` (Typst). Unrecognized tags are
  a parse error; future versions may add tags.
- Each `<line-string>` is one line of doc content. The full text is the
  lines joined by `\n`; the `\n` escape never appears inside a
  `<line-string>` — line structure is carried by the list shape. A blank
  source line becomes `""`. Only `\"` and `\\` escapes apply within a
  line-string.
- `(%doc md)` with zero content lines is semantically equivalent to
  omitting `(%doc ...)` entirely; the absent form is canonical for
  undocumented bindings.

Documentation is metadata and code transformations may strip it fully or
selectively. The surface distinctions between `% ...` and `%%% ... %%%`, and
between leading and trailing doc-comments, are erased at lowering.

Surface FlatPPL → FlatPIR examples:

| Surface FlatPPL | FlatPIR |
|---|---|
| `mu = 0` | `(%bind mu 0)` |
| `% Prior mean.\nmu = 0` | `(%bind mu 0 (%doc md "Prior mean."))` |
| `mu = 0 % Prior mean.` | `(%bind mu 0 (%doc md "Prior mean."))` |
| `%%%\nA\n\nB\n%%%\nmu = 0` | `(%bind mu 0 (%doc md "A" "" "B"))` |

### <a id="type-and-phase-annotations"></a>Type and phase annotations

A **call** in FlatPIR is a built-in operation or a `(%call ...)` form invoking
a user-defined callable. Literals, references (`%ref`), FlatPIR structural
wrappers (`%kwarg`, `%field`, `%assign`), and the input-origin tags and
input lists of `functionof` / `kernelof` are not calls.

Calls (and only calls) may carry an optional positional
`(%meta <type> <phase> <valueset>)` annotation describing the return value,
placed immediately after the head. For example:

```lisp
(add (%meta (%scalar real) %parameterized reals) (%ref self x) (%ref self y))
```

For each slot, three states are recognized:

- **`%deferred`** — not yet inferred. Equivalent to omitting the entire `%meta`
  block.
- **Concrete value** — the inferred type, phase, or value set (e.g.
  `(%scalar real)`, `%parameterized`, `posreals`).
- **`(%failed "<reason>")`** — diagnostic marker indicating inference attempted
  to resolve the slot but could not. A module containing any `%failed` marker is
  ill-formed.

Phase values are `%fixed`, `%parameterized`, or `%stochastic` (see
[Phases](04-design.md#phases)). Phase computation is cheaper than type inference
(an ancestor walk over the binding graph) and the passes may run
independently.

The **value-set slot** records the strongest statically known set containing
the call's value, written as a set expression from the [§03 value-set
vocabulary](03-value-types.md) (set constants, `interval`, `stdsimplex`,
`cartpow`); for a measure-valued call it is the measure's support. `%unknown`
means inference ran but established no constraint (distinct from `%deferred`).
For a value-typed call the set is at least the type's natural extent (e.g.
`reals` for a `(%scalar real)` call) and must be a subset of it — a checkable
redundancy, like `%array`'s `<ndims>`; non-value calls (callables, module
references) carry `%unknown`.
The vocabulary is not intersection-closed, so engines may be conservative —
any sound superset within the type's extent is valid. Producers include
distribution supports (the §08
Domain/Support column), `elementof`/`truncate` set arguments, and
normalization functions (`softmax(v) ∈ stdsimplex(n)`); consumers include the
[total-mass rules](#total-mass-classes) and domain-contract checks.

A missing call annotation is equivalent to
`(%meta %deferred %deferred %deferred)`. The explicit form is useful as an
intermediate state (not yet visited) before type, phase, and/or value-set
inference or to mark inference of a call as blocked by upstream failure.

**Type inference is required to succeed on well-formed modules.** If inference
fails — for example, an unresolvable reference or a type error in an expression —
the module is ill-formed and the engine should report a static error. As a
diagnostic aid, the engine may write `(%failed "reason")` into the affected
type slot of `%meta` so that downstream tooling and users can see the cause and
location of the failure inline.

The "type" terminology refers to the **structural category** of a value — scalar,
array, record, table, measure, kernel, likelihood, function — not to a type system in
the traditional programming-language sense.

**Sets and types are distinct.** Set membership information attached via `elementof`
(e.g. `(elementof posreals)`) is preserved structurally in the expression itself, not
encoded into the type annotation. The type annotation records structural category
(e.g. `(%scalar real)`); the `elementof` expression records set membership
(e.g. `posreals` as a subset of `reals`). The value-set `%meta` slot carries
*inferred* membership for intermediate nodes — derived facts, strippable like
all metadata — while authored membership stays structural.

#### Type categories

- `%deferred` — explicit "not yet resolved" marker; semantically equivalent to
  omitting the entire `%meta` block when both slots would be `%deferred`.
- `(%failed "<reason>")` — diagnostic marker written into the type slot of
  `%meta` when inference attempted to resolve it but could not. The reason
  string is for human and tooling consumption. A module containing any `%failed`
  marker is ill-formed.
- `%any` — used where no concrete-type constraint is applicable, e.g. for the input
  of `fn(sum(_))`. Counterpart of the value-level set `anything`.
- `(%scalar real)`, `(%scalar integer)`, `(%scalar boolean)`, `(%scalar complex)` — the
  four scalar value types.
- `(%array <ndims> <shape> <element-type>)` — arrays. `<ndims>` is the number of
  dimensions (axes), a positive integer literal (not `%dynamic`). Each entry in
  `<shape>` is a positive integer dimension size, or the placeholder `%dynamic` for
  a dimension whose size is determined at load or runtime rather than statically
  (e.g. `(%array 2 (%dynamic 3) (%scalar real))` is a 2D real array with three
  columns and a dynamic row count).
- `(%tvector <length> <element-type>)` — transposed vectors. `<length>` is a
  positive integer literal or `%dynamic`. A distinct type from `(%array 1 ...)`.
- `(%record (<field> <type>) ...)` — records with named fields.
- `(%table (%columns (<name> <type>) ...) (%nrows <N>))` — tables with named columns
  and row count. `<N>` is a positive integer or `%dynamic`; tables loaded via
  `load_data` are a common source of dynamic row counts.
- `(%tuple <type1> <type2> ...)` — tuples with at least two elements.
- `(%measure (%domain <type>) (%mass <mass>))` — closed measures. `<type>` is the
  type of values that sampling generates and on which density evaluation is
  defined; `<mass>` is the total-mass class (see [below](#total-mass-classes)).
- `(%kernel (%inputs <name> ...) (%mass <mass>))` — user-defined transition
  kernels. The `%inputs` names are the callable's input names; `<mass>` is the
  total-mass class of the output measure, uniform over all inputs
  (`%normalized` ⇔ a Markov kernel).
- `(%function (%inputs <name> ...))` — user-defined functions.
- `(%likelihood (%inputs <name> ...) (%obstype <type>))` — likelihood objects.
  `<type>` is the type of the observed data.
- `%module` — a module reference, produced only by `load_module` or
  `standard_module`. A `%module`-typed binding's name serves as the `<alias>` in
  `(%ref <alias> <name>)` lookups of the module's public bindings. Not a value: cannot be
  passed as a function argument or stored in containers.

<a id="total-mass-classes"></a>**Total-mass classes.** The `%mass` slot of measure and kernel types records
the strongest statically known class of the total mass of the measure,
respectively all measures generated by the kernel. `<mass>` must
be one of:

- `%deferred` — not yet inferred.
- `%null` — null measures.
- `%normalized` — total mass of one (probability measures).
- `%finite` — finite total mass (may be zero).
- `%locallyfinite` — infinite total mass, but finite mass on every bounded set
  (e.g. `Lebesgue(reals)` or `Counting(integers)`).
- `%unknown` — unknown total mass.

### Expressions

Expressions in FlatPIR come in structurally distinct shapes for built-in
operations, references, and calls to user-defined callables. Rewriting rules can pattern-match
on expression category without name-based dispatch.

**Built-in operations** are bare-headed forms with the operation name as the head symbol:

```lisp
(add x y)
(Normal (%kwarg mu 0.0) (%kwarg sigma 1.0))
(draw (Normal ...))
(elementof reals)
(load_data (%kwarg source "...") (%kwarg valueset ...))
```

Most built-in callables support both positional arguments and `%kwarg` entries,
matching the surface FlatPPL form. `draw` and `elementof` are positional-only;
user-defined callables reified without explicit boundary declarations are keyword-only
(see [calling conventions](04-design.md#sec:calling-convention)).

Some FlatPPL forms have FlatPIR shapes distinct from ordinary calls and have
variadic keyword arguments which are syntactically the same or ordinary keyword
arguments in surface FlatPPL, but structurally different since their order
carries semantic meaning. Some of these forms also have a single leading
positional argument:

- `functionof` and `kernelof` take variadic kwargs that define the inputs of
  the reified callable (see [below](#reified-callables)).
- `record`, `table`, `cartprod`, `joint`, `jointchain` take variadic kwargs that label
  components of the output. FlatPIR uses `(%field ...)` entries (see [below](#structural-named-entries)).
- `load_module` takes optional substitution kwargs for load-time binding of the
  loaded module's free inputs. FlatPIR uses `(%assign ...)` entries for these
  substitutions (see [Module structure](#module-structure)).

**Built-in constants** appear as bare symbols in argument positions:

```
reals  posreals  integers  booleans  pi  inf  im
```

**References to named bindings** use `(%ref <namespace> <name>)`:

- `(%ref self <name>)` — reference to a binding in the current module.
- `(%ref %local <name>)` — reference to a placeholder input (`_x_`) in
  output expressions and input lists of `functionof` and `kernelof`.
- `(%ref <module> <name>)` — reference to a binding in a loaded module.

**Axis nodes** use `(%axis <name>)` for the symbolic axis labels of
[`aggregate`](04-design.md#sec:aggregate). An axis reference `.i` in
FlatPPL maps to `(%axis i)` in FlatPIR. Variance-marked axes inside
[`metricsum`](04-design.md#sec:metricsum) map to `(%uaxis <name>)`
for upper (contravariant) and `(%laxis <name>)` for lower (covariant)
indices: surface `.mu^` maps to `(%uaxis mu)` and `.mu_` to
`(%laxis mu)`.

**Calls to user-defined callables** use `(%call <callable> <args>...)`, where
`<callable>` is an expression that must evaluate to a user-defined callable —
a `(%ref ...)` in the common case, or an inline callable expression such as a
reification:

```lisp
(%call (%ref self helper_fn) x y)
(%call (%ref helpers obs_kernel) row)
(%call (functionof (%ref self e) %specinputs ((p (%ref self a)))) 2.5)
```

User bindings always use `(%ref ...)` while built-ins use bare symbols. The surface
form `base.foo` (explicit built-in reference; see
[name resolution](04-design.md#sec:binding-names)) also lowers to the bare form
in FlatPIR, not to `(%ref base ...)`.
A rewriter pattern on `(%call ?head ?args...)` fires only on a user-defined callable
while a pattern on `(add ?x ?y)` fires only on the built-in.

**Positional and keyword call forms.** Built-in operations and user-defined calls may use
positional arguments or `%kwarg` entries, matching the surface FlatPPL form. Both are
valid FlatPIR with identical semantics for a given callable. `%kwarg` entries are
unordered: `(Normal (%kwarg sigma 1.0) (%kwarg mu 0.0))` is the same call
as `(Normal (%kwarg mu 0.0) (%kwarg sigma 1.0))`.

<a id="structural-named-entries"></a>**Structural named entries** use two dedicated heads distinct from `%kwarg`:

- `(%field <name> <value>)` — named entries in data constructors (e.g., `record`,
  `cartprod`, `joint`, `table`). Order is part of the structure.
- `(%assign <name> <value>)` — substitutions and interface bindings (e.g., the
  substitution arguments of `load_module` and `standard_module`). Unordered
  (matched by name).

**Literal values.** Primitive scalar literals are bare atoms; their type is
determined by lexical form (integer vs. real digit pattern, quoted string,
`true`/`false`):

```lisp
3            ; integer
1.0          ; real
"inputs.csv" ; string
true         ; boolean
```

Composite literal values use FlatPPL
[scalar restriction and constructor](07-functions.md#scalar-restrictions-and-constructors)
function names as heads:

```lisp
(complex 0.5 2.0)
(vector 1.0 2.0 3.0)
(record (%field mu 0.0) (%field sigma 1.0))
```

The `vector` form is `(vector <expr>...)`. Each element is a full expression
(bare scalar literal, composite literal, reference, or call):

```lisp
(vector 1.0 (%ref self a) 2.0)        ; mixes literal and reference
(vector (%ref self a) (%ref self b))  ; pre-inference; elements are expressions
```

Vectors of vectors:

```lisp
(vector
  (vector 1.0 2.0 3.0)
  (vector 4.0 5.0))
```

Complex elements:

```lisp
(vector (complex 0.5 2.0) (complex 1.0 0.0))
```

The `tuple` form is `(tuple <expr>...)` with at least two elements. Unlike `vector`,
component types may differ and may include non-value objects (functions, measures,
kernels, likelihoods):

```lisp
(tuple (%ref self forward_kernel) (%ref self prior))
```

Tuple decomposition on the surface (`a, b = expr`) lowers to successive `(get ...)`
projections with integer indices.

<a id="reified-callables"></a>**Reified callables.** `functionof` and `kernelof` carry two fixed operands
after the reified output expression: an input-origin tag and an input list.

```lisp
(functionof <output> %specinputs ((<name> <ref>) ...))  ; explicit boundary specification
(functionof <output> %autoinputs %deferred)             ; no boundary specification, not yet inferred
(functionof <output> %autoinputs ((<name> <ref>) ...))  ; no boundary specification, inferred
```

Each entry `(<name> <ref>)` defines one input: `<name>` is the input's name,
`<ref>` refers to a node in the ancestor subgraph of `<output>`
(`(%ref self a)`, `(%ref <module> a)`), or a placeholder within `<output>`
(`(%ref %local _x_)`) bound to that input. Input lists are never empty
(callables cannot be nullary). See the section on
[function reification](04-design.md#sec:functionof) for details.

For example:

```lisp
(functionof
  (Normal (%kwarg mu (add (%ref self center) (%ref %local _x_)))
          (%kwarg sigma (%ref self spread)))
  %specinputs
  ((center (%ref self center)) (spread (%ref self spread)) (x (%ref %local _x_))))
```

- **`%specinputs`** — the reification carried an explicit boundary
  specification. The entries, in order, are preserved; converting FlatPIR to
  FlatPPL restores them as boundary keyword arguments.
- **`%autoinputs`** — the reification carried no boundary specification. The
  list is `%deferred` until inference fills it (see
  [reification](04-design.md#sec:functionof)); a filled list is inference
  metadata, dropped when converting to FlatPPL.

**Normalization.** Bare FlatPIR preserves the surface calling convention for round-trip
fidelity. Optional normalization passes can convert keyword arguments to positional
where the argument order is known (built-ins, explicitly-ordered user callables) and
sort remaining keyword arguments into canonical order. Normalized FlatPIR is easier for
term-rewriting systems to pattern-match and deduplicate.

### Cross-module type inference

Each module is annotated independently: types are computed from its own perspective
(using `self` for current-module references). When module B loads module A, B's
inference proceeds as follows:

1. For each binding whose RHS is `(load_module "..." ...)`, locate A's
   `.flatpir` file.
2. If A is not yet annotated, run inference on it first (with cycle detection).
3. Read A's public bindings and their type annotations.
4. Translate A's `self` references: each `(%ref self X)` becomes `(%ref <module> X)`
   (using the binding's alias as the module name), unless the load supplies a
   substitution for `X`, in which case the substitution expression replaces the
   reference entirely.
5. Use A's translated annotations when resolving cross-module references in B.
   For `%function` and `%kernel` values, the signature carries category and
   input names only; B's inference traverses A's body — flowing B's concrete
   argument types through it — to determine the concrete result type at each
   call site.

### Example

A two-module example showing lowering and annotation.

#### Surface FlatPPL

`helpers.flatppl`:

```flatppl
center = elementof(reals)
spread = elementof(posreals)

obs_kernel = functionof(
    Normal(mu = center + _x_, sigma = spread),
    center = center, spread = spread, x = _x_)

shifted_value = center + 1.0
```

`model.flatppl`:

```flatppl
a = elementof(reals)
helpers = load_module("helpers.flatppl", center = a)

b ~ Normal(mu = 0.0, sigma = 2.0)
_combined = a + b

input_data = 2.5

L = likelihoodof(helpers.obs_kernel, input_data)
```

#### Bare FlatPIR

`helpers.flatpir`:

```lisp
(%module
  (%public center spread obs_kernel shifted_value)

  (%bind center (elementof reals))

  (%bind spread (elementof posreals))

  (%bind obs_kernel
    (functionof
      (Normal
        (%kwarg mu (add (%ref self center) (%ref %local _x_)))
        (%kwarg sigma (%ref self spread)))
      %specinputs
      ((center (%ref self center))
       (spread (%ref self spread))
       (x (%ref %local _x_)))))

  (%bind shifted_value (add (%ref self center) 1.0)))
```

`model.flatpir`:

```lisp
(%module
  (%public a b input_data L)

  (%bind helpers
    (load_module "helpers.flatppl" (%assign center (%ref self a))))

  (%bind a (elementof reals))

  (%bind b (draw (Normal (%kwarg mu 0.0) (%kwarg sigma 2.0))))

  (%bind _combined (add (%ref self a) (%ref self b)))

  (%bind input_data 2.5)

  (%bind L (likelihoodof (%ref helpers obs_kernel) (%ref self input_data))))
```

Calls carry no annotations in the bare form. This is the canonical pre-inference
shape.

#### Annotated FlatPIR

`helpers.flatpir` after type inference:

```lisp
(%module
  (%public center spread obs_kernel shifted_value)

  (%bind center
    (elementof (%meta (%scalar real) %parameterized reals) reals))

  (%bind spread
    (elementof (%meta (%scalar real) %parameterized posreals) posreals))

  (%bind obs_kernel
    (functionof
      (%meta (%kernel (%inputs center spread x) (%mass %normalized))
             %fixed %unknown)
      (Normal (%meta (%measure (%domain (%scalar real)) (%mass %normalized))
                     %parameterized reals)
        (%kwarg mu (add (%meta (%scalar real) %parameterized reals)
                        (%ref self center) (%ref %local _x_)))
        (%kwarg sigma (%ref self spread)))
      %specinputs
      ((center (%ref self center))
       (spread (%ref self spread))
       (x (%ref %local _x_)))))

  (%bind shifted_value
    (add (%meta (%scalar real) %parameterized reals)
         (%ref self center) 1.0)))
```

`model.flatpir` after type inference:

```lisp
(%module
  (%public a b input_data L)

  (%bind helpers
    (load_module (%meta %module %fixed %unknown)
                 "helpers.flatppl" (%assign center (%ref self a))))

  (%bind a
    (elementof (%meta (%scalar real) %parameterized reals) reals))

  (%bind b
    (draw (%meta (%scalar real) %stochastic reals)
          (Normal (%meta (%measure (%domain (%scalar real)) (%mass %normalized))
                         %fixed reals)
                  (%kwarg mu 0.0) (%kwarg sigma 2.0))))

  (%bind _combined
    (add (%meta (%scalar real) %stochastic reals)
         (%ref self a) (%ref self b)))

  (%bind input_data 2.5)

  (%bind L
    (likelihoodof
      (%meta (%likelihood (%inputs center spread x)
                          (%obstype (%scalar real)))
             %fixed %unknown)
      (%ref helpers obs_kernel) (%ref self input_data))))
```

Inside `obs_kernel`'s `functionof` body, phase analysis treats the boundary
nodes (`center`, `spread`) and the placeholder (`_x_`) as `%parameterized`
inputs, so inner
calls depending on them are themselves `%parameterized`; the function value
itself is `%fixed` (the function definition does not change). Annotations on
inner calls are optional in the canonical form: a tool may annotate every call
(as shown for `obs_kernel`) or only the outermost call of each binding's RHS
(as shown for `_combined`); both are valid annotated FlatPIR.

The likelihood `L` inherits its `%inputs` list from `obs_kernel`'s reified inputs —
input names `center`, `spread`, and `x`, decoupled from the nodes they
designate. A downstream tool walks the list and supplies a value for each input at
the call site, with the matching done by name. `input_data` is a literal scalar
observation of type `(%scalar real)`, matching the scalar variate generated by
`obs_kernel` (per [likelihoods and posteriors](06-measure-algebra.md#likelihoods-and-posteriors),
the kernel's variate shape must match the observed data; multiple IID observations
require an explicit `iid` product).
