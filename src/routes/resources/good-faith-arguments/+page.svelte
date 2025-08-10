<svelte:options runes={true} />
<script lang="ts">
  // Removed unused goto import to resolve type issue
</script>

<div class="guide-container">
  <a href="/" class="back-link" aria-label="Back to Dashboard">← Back to Dashboard</a>
  <h1 class="guide-title">How to Craft Good-Faith Arguments</h1>
  <p class="intro">
    Good-faith argumentation is about seeking truth, understanding, and constructive progress—rather than simply winning. This guide provides practical principles to help you participate productively in ReasonSmith discussions.
  </p>

  <ol class="principles">
    <li>
      <h2>1. Clarify the Claim</h2>
      <p>State your thesis clearly. Define key terms. Avoid ambiguity that could derail the discussion later.</p>
    </li>
    <li>
      <h2>2. Steelman Before You Counter</h2>
      <p>Restate the other contributor's position in a way they would endorse before offering critique. This builds mutual understanding.</p>
    </li>
    <li>
      <h2>3. Separate Claims from Evidence</h2>
      <p>Label assertions vs. support. Cite sources (with links where possible) and indicate when you are offering inference vs. citation.</p>
    </li>
    <li>
      <h2>4. Disclose Assumptions</h2>
      <p>Surface underlying premises (ethical frameworks, models, definitions). Unstated assumptions are a common source of friction.</p>
    </li>
    <li>
      <h2>5. Distinguish Levels of Disagreement</h2>
      <p>Identify whether you contest data, interpretation, values, scope, or practical implications. Target the correct layer.</p>
    </li>
    <li>
      <h2>6. Use Proportional Language</h2>
      <p>Avoid overstatements. Calibrate confidence (e.g., “I tentatively infer…” vs. “It is certain…”).</p>
    </li>
    <li>
      <h2>7. Engage with the Strongest Point</h2>
      <p>Do not cherry-pick weaker phrasing to rebut. Address the core logic or evidence chain.</p>
    </li>
    <li>
      <h2>8. Separate Person from Position</h2>
      <p>Avoid attributing motives. Critique reasoning, not character. Assume competence unless disproven.</p>
    </li>
    <li>
      <h2>9. Acknowledge Valid Points</h2>
      <p>Explicitly concede when the other side makes a fair correction or adds nuance. This increases credibility.</p>
    </li>
    <li>
      <h2>10. Propose Next Questions</h2>
      <p>Good debates generate better questions. Suggest concrete follow-ups, data to gather, or narrower sub-issues to explore.</p>
    </li>
  </ol>

  <section class="framework">
    <h2>A Simple Response Framework</h2>
    <pre class="snippet"><code>Steelman: &lt;their refined claim&gt;
Position: &lt;your claim&gt;
Support: &lt;evidence / reasoning&gt;
Assumptions: &lt;key premises&gt;
Counterpoints: &lt;targeted critiques, not scattershot&gt;
Open Questions: &lt;areas needing clarification or data&gt;</code></pre>
  </section>

  <section class="checklist">
    <h2>Pre-Post Checklist</h2>
    <ul>
      <li>Have I represented others' views fairly?</li>
      <li>Did I cite or qualify key factual claims?</li>
      <li>Are my assumptions explicit?</li>
      <li>Have I avoided rhetorical heat?</li>
      <li>Did I add value (clarification, synthesis, evidence)?</li>
    </ul>
  </section>

  <section class="fallacies">
    <h2>Common Logical Fallacies (Recognize & Avoid)</h2>
    <ul class="grid-list">
      <li><strong>Straw Man</strong>: Misrepresenting a position to make it easier to attack. Steelman instead.</li>
      <li><strong>Ad Hominem</strong>: Attacking the person not the argument. Address reasoning.</li>
      <li><strong>Motte-and-Bailey</strong>: Retreating to a safer vague claim when challenged on a strong one.</li>
      <li><strong>False Dichotomy</strong>: Presenting only two options when more exist.</li>
      <li><strong>Moving the Goalposts</strong>: Raising the standard after evidence is provided.</li>
      <li><strong>Whataboutism</strong>: Deflecting critique by pointing to a different issue.</li>
      <li><strong>Appeal to (Unqualified) Authority</strong>: Citing expertise irrelevant to the claim's domain.</li>
      <li><strong>Cherry Picking</strong>: Selecting only favorable data; ignore the total evidence set.</li>
      <li><strong>Slippery Slope</strong>: Claiming outcome escalation without a causal chain.</li>
      <li><strong>Tu Quoque</strong>: Dismissing an argument due to the arguer’s inconsistency.</li>
    </ul>
  </section>

  <section class="cult-language">
    <h2>Common Cultish / Manipulative Language Patterns</h2>
    <p class="section-intro">These rhetorical techniques suppress dissent, enforce conformity, or short-circuit scrutiny. Flag them early.</p>
    <ul class="grid-list">
      <li><strong>Thought-Terminating Clichés</strong>: Stock phrases that end inquiry ("It just is.")</li>
      <li><strong>Loaded Language</strong>: Emotionally charged terms replacing neutral description.</li>
      <li><strong>In-Group / Out-Group Labeling</strong>: Moralizing identity boundaries to delegitimize critique.</li>
      <li><strong>Reframing Dissent as Moral Failing</strong>: Equating disagreement with disloyalty or harm.</li>
      <li><strong>Information Gating / Jargon Flooding</strong>: Obscuring simple concepts behind proprietary terms.</li>
      <li><strong>Purity Spirals</strong>: Ever-tightening standards that render moderation suspect.</li>
      <li><strong>Love Bombing</strong>: Excessive praise to fast-track trust or compliance.</li>
      <li><strong>False Urgency / Crisis Framing</strong>: Pressuring decisions by invoking existential stakes.</li>
      <li><strong>Absolutist Binaries</strong>: Presenting nuance-heavy issues as all-or-nothing.</li>
      <li><strong>Mystification</strong>: Claiming special access to truth to evade evidence requests.</li>
    </ul>
    <p class="tip">When you notice these, ask for clarification, criteria, or evidence instead of mirroring tone.</p>
  </section>

  <section class="cta">
    <a href="/" class="btn-primary">Return to Dashboard</a>
  </section>
</div>

<style>
  .guide-container { max-width: 900px; margin: 2rem auto; padding: 2rem; }
  .back-link { display:inline-block; margin-bottom:0.75rem; color: var(--color-primary); text-decoration:none; font-size:0.875rem; }
  .back-link:hover { text-decoration:underline; }
  .guide-title { font-size:2.25rem; font-weight:700; font-family: var(--font-family-display); margin-bottom:1rem; }
  .intro { font-size:1.05rem; color: var(--color-text-secondary); margin-bottom:2rem; line-height:1.5; }
  .principles { list-style:none; padding:0; display:flex; flex-direction:column; gap:1.75rem; margin:0 0 2.5rem; }
  .principles h2 { font-size:1.1rem; font-weight:600; margin-bottom:0.4rem; }
  .principles p { margin:0; line-height:1.5; }
  .framework { margin-bottom:2.5rem; }
  .framework h2, .checklist h2, .fallacies h2, .cult-language h2 { font-size:1.25rem; font-weight:600; margin-bottom:0.75rem; }
  .snippet { background: var(--color-surface); padding:1rem; border:1px solid var(--color-border); border-radius: var(--border-radius-md); overflow-x:auto; font-size:0.85rem; line-height:1.4; }
  .checklist ul { list-style:disc; padding-left:1.25rem; display:flex; flex-direction:column; gap:0.4rem; }
  .fallacies, .cult-language { margin-top:2.5rem; }
  .grid-list { list-style:none; padding:0; display:grid; gap:0.75rem; grid-template-columns:1fr; margin:0 0 1.5rem; }
  @media (min-width: 720px) { .grid-list { grid-template-columns: 1fr 1fr; } }
  .grid-list li { background: var(--color-surface); border:1px solid var(--color-border); padding:0.75rem 0.9rem; border-radius: var(--border-radius-sm); font-size:0.85rem; line-height:1.35; }
  .section-intro { font-size:0.95rem; color: var(--color-text-secondary); margin-bottom:0.75rem; }
  .tip { font-size:0.85rem; color: var(--color-text-secondary); margin-top:-0.5rem; }
  .cta { margin-top:3rem; }
  .btn-primary { display:inline-block; background: var(--color-primary); color: var(--color-surface); border:none; padding:0.75rem 1.25rem; border-radius: var(--border-radius-md); cursor:pointer; font-weight:600; text-decoration:none; }
  .btn-primary:hover { opacity:0.9; }
  @media (max-width: 640px) { .guide-container { padding:1.25rem; } .guide-title { font-size:1.85rem; } }
</style>
