<svelte:options runes={true} />
<script lang="ts">
  // Static guide page
</script>

<div class="guide-container">
  <a href="/" class="back-link" aria-label="Back to Dashboard">← Back to Dashboard</a>
  <h1 class="guide-title">Citation Best Practices</h1>
  <p class="intro">Clear, transparent sourcing strengthens credibility and accelerates collaborative reasoning. This guide outlines how to cite responsibly inside ReasonSmith discussions.</p>

  <section class="why">
    <h2>Why Citations Matter</h2>
    <ul class="bullet">
      <li>Allow others to verify claims rapidly.</li>
      <li>Differentiate empirical findings from opinion or inference.</li>
      <li>Reduce duplicate work by pointing to canonical references.</li>
      <li>Expose assumption chains early (so disagreements localize).</li>
      <li>Elevate discourse quality by rewarding precision.</li>
    </ul>
  </section>

  <section class="tiers">
    <h2>Evidence Tiers (Use the Highest You Can)</h2>
    <ol class="tiers-list">
      <li><strong>Primary Data</strong>: Peer‑reviewed studies, official statistics, datasets.</li>
      <li><strong>Secondary Analyses</strong>: Meta‑analyses, systematic reviews, scholarly summaries.</li>
      <li><strong>Expert Consensus</strong>: Position statements, reputable institutional reports.</li>
      <li><strong>Technically Informed Commentary</strong>: Domain expert blogs / preprints (flag as such).</li>
      <li><strong>Tertiary / Popular Media</strong>: Journalism summarizing sources (scrutinize accuracy).</li>
      <li><strong>Anecdote / Personal Observation</strong>: Lowest generalizability (label clearly).</li>
    </ol>
  </section>

  <section class="inline">
    <h2>Inline Citation Pattern</h2>
    <pre class="snippet"><code>Claim. (Author Year) or [short source tag]
Example: Global mangrove loss has slowed since 2000 (Goldberg 2020).
Example: Adoption plateaued after Q2 2024 [AcmeAnalytics-2024Q3].</code></pre>
    <p class="note">Consistent, compressed tags keep threads readable. If multiple sources support a point, cite the strongest representative not a dump.</p>
  </section>

  <section class="components">
    <h2>Minimal Citation Components</h2>
    <table class="matrix">
      <thead><tr><th>Type</th><th>Required</th><th>Recommended Fields</th></tr></thead>
      <tbody>
        <tr><td>Journal Article</td><td>Author, Year, Title, DOI/URL</td><td>Journal, Volume(Issue), Pages</td></tr>
        <tr><td>Dataset</td><td>Maintainer, Version/Date, URL</td><td>License, Retrieval Date (if volatile)</td></tr>
        <tr><td>Report</td><td>Org, Year, Title, URL</td><td>Section/Page for specific figure</td></tr>
        <tr><td>Preprint</td><td>Author, Year, Title, DOI/URL</td><td>Server, Version</td></tr>
        <tr><td>News</td><td>Outlet, Author (if given), Date, URL</td><td>Archive link (optional)</td></tr>
        <tr><td>Anecdote</td><td>Context + timeframe</td><td>Limitations</td></tr>
      </tbody>
    </table>
  </section>

  <section class="good-vs-bad">
    <h2>Good vs. Weak Citation Examples</h2>
    <div class="example-grid">
      <div>
        <h3>Weak</h3>
        <ul>
          <li>"Studies show..." (which studies?)</li>
          <li>Unlinked screenshot of a chart.</li>
          <li>Blog claim w/out author or date.</li>
        </ul>
      </div>
      <div>
        <h3>Better</h3>
        <ul>
          <li>“Urban heat island intensity decreased (Zhao et al. 2022, Fig.3).”</li>
          <li>Linked dataset with version hash.</li>
          <li>Explicit preprint with DOI + limitations.</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="disclosure">
    <h2>Disclose Limitations & Uncertainty</h2>
    <p>Briefly indicate: sample size constraints, methodological caveats, model assumptions, or contested status. This invites refinement instead of defensive pushback.</p>
  </section>

  <section class="common-issues">
    <h2>Common Missteps</h2>
    <ul class="bullet">
      <li><strong>Overcitation</strong>: Flooding references to signal strength—choose relevance over quantity.</li>
      <li><strong>Link Rot</strong>: Use durable URLs (DOI, archived copy) to ensure verifiability later.</li>
      <li><strong>Selective Quotation</strong>: Quote range or summarize full finding; avoid cherry‑picked clause.</li>
      <li><strong>Source Blindness</strong>: Treating preprint and peer review equally—flag status.</li>
      <li><strong>Secondary Source Looping</strong>: Citing an article that cites another; go upstream when possible.</li>
    </ul>
  </section>

  <section class="formatting">
    <h2>Recommended Formatting Snippet</h2>
    <pre class="snippet"><code>[Tag]: Author(s) Year. Title. Source / Journal. DOI/URL
[Zhao2022-UHI]: Zhao, L. et al. 2022. Global Urban Heat Trends. Environmental Research Letters. doi:10.xxxx/erl.####
[FAO2023-FishStat]: FAO 2023. Global capture production dataset v2023. URL (accessed 2025-08-01).</code></pre>
  </section>

  <section class="integration">
    <h2>Integrating Citations in ReasonSmith</h2>
    <ul class="bullet">
      <li>Use concise inline tags, then optionally collect full entries in a concluding block.</li>
      <li>Group related evidence: one concise paragraph + citations, not interleaving a link every sentence.</li>
      <li>When contesting a source, specify which element (method, scope, interpretation) you dispute.</li>
      <li>Invite scrutiny: “Let me know if you want the raw data slice for this.”</li>
    </ul>
  </section>

  <section class="cta">
    <a href="/" class="btn-primary">Return to Dashboard</a>
  </section>
</div>

<style>
  .guide-container { max-width: 1000px; margin: 2rem auto; padding: 2rem; }
  .back-link { display:inline-block; margin-bottom:0.75rem; color: var(--color-primary); text-decoration:none; font-size:0.875rem; }
  .back-link:hover { text-decoration:underline; }
  .guide-title { font-size:2.25rem; font-weight:700; font-family: var(--font-family-display); margin-bottom:1rem; }
  .intro { font-size:1.05rem; color: var(--color-text-secondary); margin-bottom:2rem; line-height:1.5; }
  h2 { font-size:1.3rem; font-weight:600; margin:2.25rem 0 0.75rem; }
  .bullet { list-style:disc; padding-left:1.2rem; display:flex; flex-direction:column; gap:0.4rem; }
  .tiers-list { list-style:decimal; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.4rem; }
  .snippet { background: var(--color-surface); padding:1rem; border:1px solid var(--color-border); border-radius: var(--border-radius-md); font-size:0.85rem; overflow-x:auto; line-height:1.4; }
  .matrix { width:100%; border-collapse:collapse; font-size:0.8rem; }
  .matrix th, .matrix td { border:1px solid var(--color-border); padding:0.5rem 0.6rem; vertical-align:top; text-align:left; }
  .example-grid { display:grid; gap:1rem; grid-template-columns:1fr; }
  @media (min-width:720px){ .example-grid { grid-template-columns:1fr 1fr; } }
  .example-grid h3 { margin:0 0 0.5rem; font-size:0.95rem; font-weight:600; }
  .good-vs-bad ul { list-style:disc; padding-left:1.1rem; display:flex; flex-direction:column; gap:0.35rem; }
  .btn-primary { display:inline-block; background: var(--color-primary); color: var(--color-surface); padding:0.75rem 1.25rem; border-radius: var(--border-radius-md); text-decoration:none; font-weight:600; }
  .btn-primary:hover { opacity:0.9; }
  @media (max-width: 640px) { .guide-container { padding:1.25rem; } .guide-title { font-size:1.9rem; } }
</style>
