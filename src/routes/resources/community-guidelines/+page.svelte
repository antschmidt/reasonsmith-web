<script lang="ts">
  // Static community guidelines page

  // Add interactive fallacy + cultish modal logic
  // Update Info type to support multiple examples
  type Info = { short: string; detail: string; examples?: string[] };
  // Replace fallacies object with examples arrays
  const fallacies: Record<string, Info> = {
    'Straw man': {
      short: 'Misrepresenting an opponent\'s position to make it easier to attack.',
      detail: 'A weaker distorted version is rebutted instead of the actual claim, generating irrelevant refutations.',
      examples: [
        '“We should refine this policy.” → “They want to abolish all safeguards.”',
        '“Moderate regulation is prudent.” → “You want government control of everything.”',
        '“Trim 5% inefficiency.” → “They\'re trying to gut the entire program.”'
      ]
    },
    'Motte-and-Bailey': {
      short: 'Shifting between bold hard-to-defend and vague easy claims when challenged.',
      detail: 'Advance sweeping “bailey,” retreat to truistic “motte” under scrutiny while implying equivalence.',
      examples: [
        '“This supplement cures chronic disease.” → challenged → “It supports general wellness.”',
        '“AI will replace all doctors soon.” → “AI can help doctors.”',
        '“This proves free will doesn\'t exist.” → challenged → “It influences some choices.”'
      ]
    },
    'False Dichotomy': {
      short: 'Presenting two options as exhaustive when more exist.',
      detail: 'Artificially narrows option space to pressure agreement or polarize.',
      examples: [
        '“Either you support this bill or you hate innovation.”',
        '“Adopt this feature now or fall irreparably behind.”',
        '“You\'re with us or against progress.”'
      ]
    },
    'Moving Goalposts': {
      short: 'Demanding new or higher proof after the requested evidence was supplied.',
      detail: 'Criteria shift midstream preventing resolution.',
      examples: [
        'Study → “Need a meta-analysis.” → “Need real-world deployment data.”',
        'Benchmark numbers → “Need production logs.” → “Need external audit.”',
        'Three sources → “Need randomized trial.”'
      ]
    },
    'Whataboutism': {
      short: 'Deflecting critique by citing a different issue instead of addressing the claim.',
      detail: 'Redirection that avoids falsification pressure and dissipates focus.',
      examples: [
        '“Policy X has flaws.” → “What about Policy Y?”',
        'Safety concern → “What about competitor\'s recall?”',
        'Budget critique → “What about that other department?”'
      ]
    },
    'Cherry Picking': {
      short: 'Selecting only favorable data points while ignoring the broader distribution.',
      detail: 'Creates misleading magnitude or consensus impressions.',
      examples: [
        'One anomalous declining year vs rising 10‑year trend.',
        'One glowing testimonial vs large mixed dataset.',
        'Early beta performance excluding later regressions.'
      ]
    }
  };

  const cultish: Record<string, Info> = {
    'Thought-Terminating Cliché': {
      short: 'Stock phrase that ends inquiry or critical evaluation.',
      detail: 'Provides a sensation of closure without substance.',
      examples: [
        '“It is what it is.”',
        '“That\'s just fear talking.”',
        '“Stop overthinking it.”'
      ]
    },
    'Purity Spiral': {
      short: 'Escalating demands for ideological purity that punish nuance.',
      detail: 'Tightening boundaries incentivize extreme signaling.',
      examples: [
        'Redefining “real supporter” to exclude moderates.',
        'Ratcheting pledges weekly.',
        'Calling nuance “contamination.”'
      ]
    },
    'Mystification': {
      short: 'Invoking inaccessible special knowledge to deflect scrutiny.',
      detail: 'Opaque appeals to hidden insight replace evidence.',
      examples: [
        '“You\'ll understand after months inside.”',
        '“Initiates can\'t grasp advanced layer.”',
        '“Proof is esoteric; trust the process.”'
      ]
    },
    'In-Group / Out-Group Labeling': {
      short: 'Moralizing identity boundaries to delegitimize critique.',
      detail: 'Frames disagreement as disloyalty.',
      examples: [
        '“Real members don\'t question Strategy X.”',
        'Calling skeptics “outsiders.”',
        'Tagging critics “traitors.”'
      ]
    },
    'Reframing Dissent as Harm': {
      short: 'Treating disagreement as emotional or moral injury.',
      detail: 'Uses care norms to insulate claims.',
      examples: [
        '“Questioning this metric is harmful.”',
        '“Your critique is violence.”',
        '“Raising doubts destabilizes everyone.”'
      ]
    },
    'Loaded Language': {
      short: 'Emotionally charged terms replacing neutral description.',
      detail: 'Smuggles evaluation into labeling.',
      examples: [
        'Routine audit = “witch hunt.”',
        'Iteration = “revolution.”',
        'Neutral question = “sabotage.”'
      ]
    },
    'Love Bombing': {
      short: 'Excessive praise to fast-track trust or compliance.',
      detail: 'Creates obligation before norms settle.',
      examples: [
        'Intense praise after minimal agreement.',
        'Flattery flood on first post.',
        'Instant “core member” labeling.'
      ]
    },
    'False Urgency': {
      short: 'Manufacturing crisis to force premature agreement.',
      detail: 'Implies catastrophic delay costs.',
      examples: [
        '“If we don\'t decide today we lose everything.”',
        'Non-critical countdown timer.',
        '“Any pause equals betrayal.”'
      ]
    },
    'Information Gating': {
      short: 'Restricting or over-jargonizing access to basics.',
      detail: 'Creates insider dependency.',
      examples: [
        '“Need Level‑3 clearance for methodology.”',
        'Proprietary jargon for simple steps.',
        'Refusing summaries—closed sessions only.'
      ]
    },
    'Binary Framing': {
      short: 'All-or-nothing depictions of nuanced issues.',
      detail: 'Eliminates middle positions to pressure alignment.',
      examples: [
        '“Either endorse the roadmap or you\'re obstructionist.”',
        '“Total adoption or total failure.”',
        '“Agree 100% or you\'re against us.”'
      ]
    }
  };

  let activeItem: string | null = null;
  let activeKind: 'fallacy' | 'cultish' | null = null;
  let currentItem: Info | null = null;

  $: currentItem = activeItem && activeKind ? (activeKind === 'fallacy' ? fallacies : cultish)[activeItem] : null;

  function openItem(kind: 'fallacy' | 'cultish', name: string) { activeKind = kind; activeItem = name; }
  function closeModal() { activeItem = null; activeKind = null; }
  function onKey(e: KeyboardEvent, kind: 'fallacy' | 'cultish', name: string) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(kind, name); } }
  // Trap basic escape to close
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && activeItem) { closeModal(); } });
  }
</script>

<div class="guide-container">
  <h1 class="guide-title">Community Guidelines</h1>
  <p class="intro">ReasonSmith exists to elevate reasoning quality. These guidelines explain participation standards, our scoring signals, and how we treat edge cases. The goal is not sterile civility—it is intellectually honest, well-supported argumentation.</p>

  <section>
    <h2>Core Principles</h2>
    <ul class="bullet">
      <li><strong>Good Faith First</strong>: Engage to understand, refine, or test ideas—not to score rhetorical wins.</li>
      <li><strong>Evidence over Assertion</strong>: Claims that influence conclusions should cite or label speculation clearly.</li>
      <li><strong>Precision over Volume</strong>: Better one well-structured paragraph than five meandering ones.</li>
      <li><strong>Steelman Before Critique</strong>: Accurately restate what you’re responding to (or ask clarifying questions).</li>
      <li><strong>Separate Person from Position</strong>: Challenge reasoning, data, assumptions—not identity.</li>
    </ul>
  </section>

  <section>
    <h2>Scoring Dimensions (Experimental)</h2>
    <p class="note">We are developing automated + community‑driven metrics. Provisional categories:</p>
    <ul class="metric-list">
      <li><strong>Good-Faith Structure Score</strong>: Presence of steelmanning, explicit assumptions, delineated claims vs. support.</li>
      <li><strong>Fallacy Burden</strong>: Frequency + severity of detected logical fallacy patterns (weighted: straw man > slippery slope > ad hominem aside, etc.).</li>
      <li><strong>Cultish Language Index</strong>: Density of manipulative rhetorical markers (thought-terminating clichés, purity framing, loaded binaries).</li>
      <li><strong>Source Integrity</strong>: Ratio of claims with adequate citations + citation tier quality.</li>
      <li><strong>Responsiveness</strong>: Whether replies address strongest prior point rather than tangential fragments.</li>
    </ul>
    <p class="note">Scores guide moderation tooling and reputation—not instant punishments. False positives are reviewed and models retrained.</p>
  </section>

  <section>
    <h2>Logical Fallacies & Cultish Markers</h2>
    <p>We surface flagged patterns to help you self-correct. A single minor fallacy or a moment of rhetorical heat is not fatal; persistent patterns reduce trust weighting.</p>
    <ul class="bullet">
      <li><strong>Tracked Fallacies (Examples)</strong>:
        <span class="fallacy-tags">
          {#each Object.keys(fallacies) as f}
            <button type="button" class="fallacy-chip" on:click={() => openItem('fallacy', f)} on:keydown={(e) => onKey(e, 'fallacy', f)} tabindex="0" aria-haspopup="dialog">{f}</button>
          {/each}
        </span>
      </li>
      <li><strong>Cultish / Manipulative Signals</strong>:
        <span class="fallacy-tags">
          {#each Object.keys(cultish) as c}
            <button type="button" class="fallacy-chip cultish" on:click={() => openItem('cultish', c)} on:keydown={(e) => onKey(e, 'cultish', c)} tabindex="0" aria-haspopup="dialog">{c}</button>
          {/each}
        </span>
      </li>
      <li><strong>Transparency</strong>: You will be able to see what was flagged and why. Dispute mechanisms coming soon.</li>
    </ul>
  </section>

  <section>
    <h2>Tone vs. Substance (Edge Cases)</h2>
    <p>We prioritize substantive epistemic value over tone purity. Mild rhetorical jabs that accompany solid reasoning are treated differently from content-free insult chains.</p>
    <div class="example-grid">
      <div>
        <h3>Borderline Acceptable</h3>
        <p class="example-label">Contains a harsh aside but delivers structured refutation.</p>
        <pre class="snippet small"><code>"Flat Earth claims persist because people ignore direct observation. Calling the Earth flat is indefensible:
1. Hull-first disappearance of ships: consistent with curvature; incompatible with planar optics.
2. Great-circle navigation & polar routes: real-world flight plans minimize spherical surface distance; cannot be replicated on a Euclidean plane without distortion.
3. Continuous satellite telemetry & ISS 90-min orbits: require consistent gravitational curvature.
If you still deny this, you're willfully discarding multi-domain convergent evidence."</code></pre>
      </div>
      <div>
        <h3>Not Acceptable</h3>
        <p class="example-label">Insult replaces argument; no falsifiable content.</p>
        <pre class="snippet small"><code>"Only idiots believe that. Educate yourself."</code></pre>
      </div>
    </div>
    <p class="note warning">Harsh phrasing (+ one or two ad hominem adjectives) may pass if the post also: (a) steelmans, (b) provides verifiable evidence, (c) advances the discussion. Pure insult without substance will be down‑ranked or removed.</p>
  </section>

  <section>
    <h2>Guided Improvement</h2>
    <ul class="bullet">
      <li>Flagged posts include a private “improve” panel suggesting rewrites.</li>
      <li>Editing quickly after a flag reduces any negative weighting.</li>
      <li>Repeat uncorrected patterns → temporary visibility dampening before moderation escalation.</li>
    </ul>
  </section>

  <section>
    <h2>Reporting & Appeals</h2>
    <ul class="bullet">
      <li><strong>User Reports</strong> are triaged by severity + model confidence.</li>
      <li><strong>Appeal Workflow (Planned)</strong>: See extracted features, challenge misclassification, supply clarifying context.</li>
      <li><strong>Model Feedback Loop</strong>: Successful appeals feed back as counterexamples.</li>
    </ul>
  </section>

  <section>
    <h2>Prohibited Conduct</h2>
    <ul class="bullet">
      <li>Targeted harassment or threats.</li>
      <li>Doxxing or distribution of private identifying information.</li>
      <li>Coordinated brigading, vote manipulation, or spam flooding.</li>
      <li>Intentional data fabrication or falsified citation metadata.</li>
    </ul>
  </section>

  <section>
    <h2>Contributor Responsibilities</h2>
    <ul class="bullet">
      <li>Disclose conflicts of interest (employment, funding) when material.</li>
      <li>Differentiate speculation from evidence (label clearly).</li>
      <li>Do not overwhelm threads with low-signal micro-posting—consolidate.</li>
      <li>Stay open to falsification; invite targeted critique.</li>
    </ul>
  </section>

  

  {#if activeItem && activeKind}
    {#key activeItem}
    <div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="item-title" tabindex="-1">
      <div class="modal" role="document">
        <header class="modal-header">
          <h2 id="item-title" class="modal-title">{activeItem}</h2>
          <button class="close-btn" type="button" aria-label="Close" on:click={closeModal}>×</button>
        </header>
        <div class="modal-body">
          {#if currentItem}
            <p class="modal-short">{currentItem.short}</p>
            <p class="modal-detail">{currentItem.detail}</p>
            {#if currentItem.examples}
              <div class="example-block"><strong>Examples:</strong>
                <ul class="examples">{#each currentItem.examples as ex}<li>{ex}</li>{/each}</ul>
              </div>
            {/if}
          {/if}
        </div>
        <footer class="modal-footer">
          <button type="button" class="btn-primary" on:click={closeModal}>Got it</button>
        </footer>
      </div>
    </div>
    {/key}
  {/if}
</div>

<style>
  .guide-container { max-width: 1000px; margin: 2rem auto; padding: 2rem; }
  /* back-link removed */
  .guide-title { font-size:2.25rem; font-weight:700; font-family: var(--font-family-display); margin-bottom:1rem; }
  .intro { font-size:1.05rem; color: var(--color-text-secondary); margin-bottom:2rem; line-height:1.5; }
  h2 { font-size:1.3rem; font-weight:600; margin:2.25rem 0 0.75rem; }
  .bullet { list-style:disc; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.45rem; }
  .metric-list { list-style:disc; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.45rem; }
  .note { font-size:0.85rem; color: var(--color-text-secondary); margin-top:0.35rem; }
  .warning { color:#b45309; }
  .example-grid { display:grid; gap:1.25rem; grid-template-columns:1fr; }
  @media (min-width:800px) { .example-grid { grid-template-columns:1fr 1fr; } }
  .snippet { background: var(--color-surface); padding:0.85rem 1rem; border:1px solid var(--color-border); border-radius: var(--border-radius-md); font-size:0.75rem; line-height:1.35; white-space:pre-wrap; }
  .snippet.small { max-height:300px; overflow:auto; }
  .example-label { font-size:0.75rem; color: var(--color-text-secondary); margin:0 0 0.4rem; }
  .fallacy-tags { display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem; }
  .fallacy-chip { background: var(--color-surface); border:1px solid var(--color-border); padding:0.35rem 0.6rem; border-radius:999px; font-size:0.75rem; cursor:pointer; line-height:1; color: var(--color-text-primary); }
  .fallacy-chip:hover, .fallacy-chip:focus { background: var(--color-surface-alt); outline:none; }
  .fallacy-chip.cultish { border-color: var(--color-accent); }
  .fallacy-chip.cultish:hover, .fallacy-chip.cultish:focus { background: color-mix(in srgb, var(--color-accent) 15%, transparent); }
  /* Modal */
  .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter: blur(3px); display:flex; align-items:flex-start; justify-content:center; padding:4vh 1rem; z-index:1000; }
  .modal { background: var(--color-surface-elevated, var(--color-surface)); border:1px solid var(--color-border); border-radius: var(--border-radius-md); max-width:560px; width:100%; box-shadow:0 10px 40px -4px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03); display:flex; flex-direction:column; }
  .modal-header { display:flex; align-items:center; justify-content:space-between; padding:1rem 1.25rem; border-bottom:1px solid var(--color-border); }
  .modal-title { font-size:1.15rem; font-weight:600; margin:0; }
  .close-btn { background:transparent; border:none; font-size:1.5rem; line-height:1; cursor:pointer; color: var(--color-text-secondary); padding:0.25rem; }
  .close-btn:hover { color: var(--color-text-primary); }
  .modal-body { padding:1rem 1.25rem 0.85rem; display:flex; flex-direction:column; gap:0.85rem; }
  .modal-short { font-weight:500; }
  .modal-detail { font-size:0.9rem; line-height:1.5; }
  .example-block { background: var(--color-surface-alt, rgba(255,255,255,0.06)); padding:0.6rem 0.75rem; border-radius: var(--border-radius-sm); font-size:0.75rem; }
  .modal-footer { padding:0.75rem 1.25rem 1rem; border-top:1px solid var(--color-border); display:flex; justify-content:flex-end; }
  .btn-primary { display:inline-block; background: var(--color-primary); color: var(--color-surface); padding:0.75rem 1.25rem; border-radius: var(--border-radius-md); text-decoration:none; font-weight:600; border: none; cursor: pointer; }
  .btn-primary:hover { opacity:0.9; }
  
  @media (max-width: 640px) { .guide-container { padding:1.25rem; } .guide-title { font-size:1.9rem; } }
  @media (max-width:600px){ .modal { max-width:100%; } }
  .examples { margin:0.4rem 0 0; padding-left:1.05rem; display:flex; flex-direction:column; gap:0.35rem; font-size:0.7rem; }
</style>
