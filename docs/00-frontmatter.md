---
author:
  - name: "Benjamin Cox"
    affiliation: "Max Planck Institute for Physics, Garching/Munich, Germany"
    email: "bcox@mpp.mpg.de"
  - name: "Oliver Schulz"
    affiliation: "Max Planck Institute for Physics, Garching/Munich, Germany"
    email: "oschulz@mpp.mpg.de"
---

<h1>
FlatPPL, the Flat Portable Probabilistic Language <br />
</h1>

**Abstract.** FlatPPL is a declarative, inference-agnostic probabilistic language designed for
authoring, sharing, and converting statistical models across scientific domains. It is
intended both as a directly writable source language and as a portable representation that higher-level modeling frontends may emit. FlatPPL describes
models as static directed acyclic graphs (DAGs) of named mathematical objects — variates,
measures, functions, and likelihoods — in a single flat module-level namespace with no
block structure, no loops, and no dynamic branching. Its canonical surface form is small
and easy to parse. In addition to deterministic and stochastic nodes, the language
provides a measure algebra for measures and Markov kernels. Measures, kernels, and
deterministic functions can be reified from sub-DAGs with optional boundary inputs, making
it possible to extract conditional kernels and deterministic functions from larger models
without auxiliary variables. FlatPPL code can be stored in standalone files
or embedded in languages like Python and Julia. FlatPPL defines profiles,
subsets of the language that map to other probabilistic languages and standards.
FlatPPL is accompanied by the Flat Probabilistic Intermediate Representation
(FlatPIR), to facilitate term-rewriting for optimization and conversion between
profiles.

