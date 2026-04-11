---
author:
  - name: "Oliver Schulz"
    affiliation: "Max Planck Institute for Physics, Garching/Munich, Germany"
    email: "oschulz@mpp.mpg.de"
---

<h1>
FlatPPL, a Flat Portable Probabilistic Language <br />
<em>Expert-Level Proposal/Motivation and Design Draft</em>
</h1>

**Abstract.** FlatPPL is a declarative, inference-agnostic probabilistic language designed for
authoring, sharing, and converting statistical models across scientific domains. It is
intended both as a directly writable source language and as a portable representation that higher-level modeling frontends may emit. The design
is still under development; this document presents the current draft. FlatPPL describes
models as static directed acyclic graphs (DAGs) of named mathematical objects — variates,
measures, functions, and likelihoods — in a single global namespace with no block structure,
no loops, and no dynamic branching. Its surface syntax is designed to lie in the intersection
of valid Python and valid Julia, making parsing relatively lightweight and host-language
embedding practical. In addition to deterministic and stochastic nodes, the language
provides a measure algebra for measures and Markov kernels. Measures, kernels, and
deterministic functions can be reified from sub-DAGs with optional boundary inputs, making
it possible to extract conditional kernels and deterministic functions from larger models
without auxiliary variables. FlatPPL defines profiles, subsets of the language that map to
target languages like the HEP Statistics Serialization Standard (HS³). FlatPPL is accompanied
by the Flat Probabilistic Intermediate Representation (FlatPIR), to facilitate term-rewriting
for optimization and conversion between profiles.

**Scope and status of this document.**

This document is a design draft. It is intended for collaborators and technical experts.
It is not a tutorial, user or reference manual, or a complete language specification.

The aim is to motivate FlatPPL and make the proposed semantics, syntax, and features concrete
enough to discuss feasibility of implementation and interoperability, and to present concepts
that might also be transferred to existing standards and frameworks. The document also aims
to provide enough detail that domain scientists with a strong statistical background can
evaluate how models from their disciplines would map to FlatPPL, identify
abstractions and features still missing, and contribute to a design
with wide scope.

This is a living document and the design is not frozen. Some details should be read as
current proposals rather than final decisions. Readers are encouraged to test
the language against realistic use cases and to treat areas where the draft falls short
as useful feedback for the next iteration.
