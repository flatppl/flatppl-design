## <a id="sec:example"></a>Worked examples

### High Energy Physics (HEP)

This example walks through a realistic HEP model step by step.

**Signal and background model.** We begin with a systematic uncertainty on the signal
efficiency, modeled as a unit-normal nuisance parameter:

```flatppl
raw_eff_syst = draw(Normal(mu = 0.0, sigma = 1.0))
efficiency = 0.9 + 0.05 * raw_eff_syst
```

Signal and background shapes are defined as step-function densities, normalized over the
analysis region:

```flatppl
sig_shape = stepwise(bin_edges = bin_edges, bin_values = signal_bins, x = _)
bkg_shape = stepwise(bin_edges = bin_edges, bin_values = bkg_bins, x = _)
signal_template = normalize(weighted(sig_shape, Lebesgue(support = interval(lo, hi))))
bkg_template = normalize(weighted(bkg_shape, Lebesgue(support = interval(lo, hi))))
```

**Observation model.** The rate measure superposes signal (scaled by signal strength `mu_sig`
and efficiency) with background. The module input `mu_sig = elementof(reals)` plays the role of the model's
parameter of interest. Events are drawn from a Poisson point process:

```flatppl
rate = superpose(
    weighted(mu_sig * efficiency, signal_template),
    bkg_template
)
events = draw(PoissonProcess(intensity = rate))
```

**Data and likelihood.** We define observed data and construct the likelihood. Since the
event space is scalar, the `PoissonProcess` produces an array variate and the observed data
is a plain array. The observation model uses `lawof` with a boundary input to keep
`raw_eff_syst` as a kernel parameter (rather than marginalizing it out). A separate
constraint term represents the auxiliary measurement that pins the nuisance parameter. The
combined likelihood `L` is a likelihood object on the parameter space
{`mu_sig`, `raw_eff_syst`}:

```flatppl
# Observation likelihood: boundary input keeps raw_eff_syst as a parameter
L_obs = likelihoodof(
    lawof(events, raw_eff_syst = raw_eff_syst),
    [3.1, 5.7, 2.4, 8.9, 4.2])

# Constraint: auxiliary measurement model for the nuisance parameter
aux_eff = draw(Normal(mu = raw_eff_syst, sigma = 1.0))
L_constr = likelihoodof(lawof(aux_eff, raw_eff_syst = raw_eff_syst), 0.0)

# Combined likelihood
L = joint_likelihood(L_obs, L_constr)
```

The constraint likelihood $L_\text{constr}(\alpha) = \varphi(0; \alpha, 1)$ is a genuine function
of `raw_eff_syst` — the auxiliary observation model `Normal(mu = raw_eff_syst, sigma = 1.0)`
is a kernel parameterized by the nuisance parameter, and `likelihoodof` evaluates its density
at the auxiliary datum 0.0. (By Normal symmetry, $\varphi(0; \alpha, 1) = \varphi(\alpha; 0, 1)$,
so numerically this gives the standard Gaussian penalty. But the semantic structure matters:
the constraint is a likelihood term, not a prior.)

A frequentist engine can maximize `L` or compute profile likelihood ratios. A
range-restricted likelihood for a sideband fit is also straightforward:

```flatppl
sideband = interval(0.0, 3.0)
sideband_data = filter(_ in sideband, [3.1, 5.7, 2.4, 8.9, 4.2])
sideband_model = normalize(truncate(lawof(events, raw_eff_syst = raw_eff_syst), sideband))
L_obs_sideband = likelihoodof(sideband_model, sideband_data)
L_sideband = joint_likelihood(L_obs_sideband, L_constr)
```

**Bayesian analysis (optional).** To construct a posterior, define priors and reweight:

```flatppl
mu_sig_prior = draw(Uniform(support = interval(0, 20)))
raw_eff_syst_prior = draw(Normal(mu = 0, sigma = 1))
prior = lawof(record(mu_sig = mu_sig_prior, raw_eff_syst = raw_eff_syst_prior))
posterior = bayesupdate(L, prior)
# posterior is unnormalized; wrap in normalize(...) if needed
```

**Additional patterns.** The following snippets illustrate further language features in the
context of the same analysis style — variate naming, variable transformations, broadcast,
truncation, density-defined distributions, module loading, and hypothesis testing:

```flatppl
# Variate naming with pushfwd
mvmodel = pushfwd(relabel(_, ["a", "b", "c"]), MvNormal(mu = some_mean, cov = some_cov))
L_mv = likelihoodof(mvmodel, record(a = 1.1, b = 2.1, c = 3.1))

# Expanded form (when intermediate variates are needed)
a, b, c = draw(MvNormal(mu = some_mean, cov = some_cov))
mvmodel_expanded = lawof(record(a = a, b = b, c = c))

# Pushforward for variable transformation
log_normal = pushfwd(functionof(exp(x), x = x), Normal(mu = 0, sigma = 1))

# Deterministic function and broadcast
transformed = 2 * a + 1
f = functionof(transformed, a = a)
A = [1.0, 2.0, 3.0, 4.0]
result = broadcast(f, a = A)           # [3.0, 5.0, 7.0, 9.0]
result = broadcast(f, A)              # same, positional (f has declared order)

# Stochastic broadcast
noisy = draw(Normal(mu = a, sigma = 0.1))
K = lawof(noisy)
noisy_array = draw(broadcast(K, a = A))  # independent Normal draws at each element

# Truncated distribution (model physics)
positive_sigma = draw(normalize(truncate(Normal(mu = 1.0, sigma = 0.5), interval(0, inf))))

# Density-defined distribution (Bernstein polynomial)
bern = bernstein(coefficients = [c0, c1, c2, c3], x = _)
smooth_bkg = normalize(weighted(bern, Lebesgue(support = interval(lo, hi))))

# Module loading and composition
sig = load_module("signal_channel.flatppl")
bkg = load_module("background_channel.flatppl")
L_combined = joint_likelihood(
    likelihoodof(sig.model, sig.data),
    likelihoodof(bkg.model, bkg.data)
)

# Hypothesis testing (two models, same data, explicit IID)
model_H0 = iid(Normal(mu = 91.2, sigma = 2.5), 4)
model_H1 = iid(Normal(mu = 125.0, sigma = 3.0), 4)
mass_data = [90.1, 91.8, 124.5, 125.2]
L_H0 = likelihoodof(model_H0, mass_data)
L_H1 = likelihoodof(model_H1, mass_data)
```
